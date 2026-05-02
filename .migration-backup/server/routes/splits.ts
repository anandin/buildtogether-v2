/**
 * Splits — spec §5b. Don't compete with Splitwise.
 *
 * Region-aware: US users get Venmo deeplinks (which auto-fill amount + note
 * inside the Venmo app). Canada users get Interac e-Transfer handoff —
 * Interac has no third-party deeplink, so we package a tap-to-text SMS and
 * a copy-able recipient block that drops into the user's bank app.
 *
 *   POST /api/splits/draft
 *     body: {
 *       region: "CA" | "US",                      // optional, auto from locale
 *       direction: "owed_to_me" | "i_owe",        // who's paying whom
 *       recipient: { name, handle?, email?, phone? },
 *       amount: number,
 *       label: string,
 *     }
 *     → for US: Venmo deeplink + web fallback
 *     → for CA: Interac handoff with prefilled SMS + auto-deposit message
 *   GET  /api/splits         — recent split intents
 *   POST /api/splits/:id/settle — mark as paid (manual)
 */
import type { Express, Request, Response } from "express";
import { eq, and } from "drizzle-orm";

import { requireAuth } from "../middleware/auth";
import { db } from "../db";
import { activityFeed } from "../../shared/schema";

type Region = "CA" | "US";
type Direction = "owed_to_me" | "i_owe";

function venmoUrl(recipient: string, amount: number, label: string, charge: boolean): string {
  const handle = recipient.replace(/^@/, "");
  const params = new URLSearchParams({
    txn: charge ? "charge" : "pay",
    audience: "private",
    recipients: handle,
    amount: amount.toFixed(2),
    note: label,
  });
  return `venmo://paycharge?${params.toString()}`;
}

function venmoWebFallback(recipient: string, amount: number, label: string, charge: boolean): string {
  const handle = recipient.replace(/^@/, "");
  const action = charge ? "charge" : "pay";
  return `https://venmo.com/${handle}?txn=${action}&amount=${amount.toFixed(2)}&note=${encodeURIComponent(label)}`;
}

/**
 * Build the Interac e-Transfer handoff. Canada doesn't have a deeplink
 * scheme, so we instead:
 *   1. Pre-fill an SMS body the requester can fire (or whisper-receive).
 *      Tapping it on iOS/Android opens the SMS composer with the body.
 *   2. Return a copy-able "to: <email/phone>; amount: $X; message: <label>"
 *      block the user pastes into their bank app's e-Transfer form.
 *
 * For "i_owe", the user pays via their bank app, and the SMS is just a
 * heads-up to the recipient. For "owed_to_me", the SMS is a request to
 * the other person.
 */
function interacHandoff(opts: {
  direction: Direction;
  recipient: { name: string; email?: string; phone?: string };
  amount: number;
  label: string;
  myName: string;
  myEmail?: string;
}): {
  flow: "interac";
  smsTo?: string;
  smsBody: string;
  bankInstructions: {
    to: string;
    amount: string;
    message: string;
  };
} {
  const amt = opts.amount.toFixed(2);
  const recipientContact = opts.recipient.email ?? opts.recipient.phone ?? "";

  if (opts.direction === "i_owe") {
    // Riley owes Priya. Riley opens their bank app, sends e-Transfer to
    // Priya. Optional courtesy SMS to Priya: "Sent you $X via Interac."
    const smsBody = `Sent you $${amt} via Interac for ${opts.label}. Should land any minute.`;
    return {
      flow: "interac",
      smsTo: opts.recipient.phone,
      smsBody,
      bankInstructions: {
        to: recipientContact || `${opts.recipient.name} (add their email/phone)`,
        amount: `$${amt} CAD`,
        message: opts.label,
      },
    };
  }

  // Owed_to_me — Priya owes Riley. SMS to Priya asking her to e-Transfer
  // to Riley's email.
  const smsBody = opts.myEmail
    ? `Hey ${opts.recipient.name}, ${opts.label} was $${amt}. Could you Interac e-Transfer it to ${opts.myEmail} when you get a sec? Thanks 🙏`
    : `Hey ${opts.recipient.name}, ${opts.label} was $${amt}. Could you Interac e-Transfer it to me? Thanks 🙏`;
  return {
    flow: "interac",
    smsTo: opts.recipient.phone,
    smsBody,
    bankInstructions: {
      to: opts.myEmail ?? "(your email — add it to Profile)",
      amount: `$${amt} CAD`,
      message: opts.label,
    },
  };
}

function detectRegion(req: Request): Region {
  const header = req.get("accept-language") ?? "";
  if (/en-CA|fr-CA|\bCA\b/i.test(header)) return "CA";
  return "US";
}

export function mountSplitsRoutes(app: Express): void {
  app.post("/api/splits/draft", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const householdId = req.user.coupleId;
    if (!householdId) return res.status(400).json({ error: "no household" });

    const body = req.body ?? {};
    const region: Region = body.region === "CA" || body.region === "US" ? body.region : detectRegion(req);
    const direction: Direction =
      body.direction === "i_owe" ? "i_owe" : "owed_to_me";

    // Recipient may be supplied two ways: legacy `{ recipient: "@priya" }`
    // for Venmo handles, OR the structured form `{ recipient: { name, email, phone } }`.
    let recipient: { name: string; handle?: string; email?: string; phone?: string };
    if (typeof body.recipient === "string") {
      recipient = { name: body.recipient.replace(/^@/, ""), handle: body.recipient };
    } else if (body.recipient && typeof body.recipient === "object") {
      recipient = body.recipient;
    } else {
      return res.status(400).json({ error: "recipient required" });
    }

    if (typeof body.amount !== "number" || body.amount <= 0) {
      return res.status(400).json({ error: "amount must be positive" });
    }
    const cleanLabel =
      typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 64) : "Split";

    let payload: Record<string, unknown>;
    if (region === "US") {
      const handle = recipient.handle ?? recipient.name;
      const charge = direction === "owed_to_me";
      const deepLink = venmoUrl(handle, body.amount, cleanLabel, charge);
      const webLink = venmoWebFallback(handle, body.amount, cleanLabel, charge);
      payload = {
        flow: "venmo",
        venmoUrl: deepLink,
        deeplinks: { ios: deepLink, android: deepLink },
        webFallback: webLink,
        message: `${charge ? "Asking" : "Sending"} @${handle.replace(/^@/, "")} $${body.amount.toFixed(2)} for "${cleanLabel}".`,
      };
    } else {
      // Canada — Interac. Look up the requester's email if available.
      const myEmail = req.user.email ?? undefined;
      const myName = req.user.name ?? "A friend";
      const handoff = interacHandoff({
        direction,
        recipient,
        amount: body.amount,
        label: cleanLabel,
        myName,
        myEmail,
      });
      // Build a sms: URL the client can route to the device's SMS app.
      const smsHref =
        handoff.smsTo
          ? `sms:${handoff.smsTo}?&body=${encodeURIComponent(handoff.smsBody)}`
          : `sms:?&body=${encodeURIComponent(handoff.smsBody)}`;
      payload = {
        ...handoff,
        smsHref,
        message:
          direction === "i_owe"
            ? `Open your bank's Interac e-Transfer to ${recipient.name}: ${handoff.bankInstructions.amount}, message "${handoff.bankInstructions.message}".`
            : `Asking ${recipient.name} for $${body.amount.toFixed(2)} via Interac.`,
      };
    }

    // Persist intent.
    let activityId: string | null = null;
    try {
      const [row] = await db
        .insert(activityFeed)
        .values({
          coupleId: householdId,
          userId: req.user.id,
          activityType: "split_drafted",
          summary: `Split $${body.amount.toFixed(2)} with ${recipient.name} — ${cleanLabel}`,
          metadata: {
            region,
            direction,
            recipient,
            amount: body.amount,
            label: cleanLabel,
            payload,
            settled: false,
          },
        })
        .returning();
      activityId = row?.id ?? null;
    } catch (err) {
      console.error("splits/draft activity insert failed:", err);
    }

    res.json({ id: activityId, ...payload });
  });

  app.get("/api/splits", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const householdId = req.user.coupleId;
    if (!householdId) return res.json({ splits: [] });

    try {
      const rows = await db
        .select()
        .from(activityFeed)
        .where(eq(activityFeed.coupleId, householdId))
        .limit(50);
      const splits = rows
        .filter((r) => r.activityType === "split_drafted")
        .map((r) => ({
          id: r.id,
          summary: r.summary,
          metadata: r.metadata,
          createdAt: r.createdAt.toISOString(),
        }));
      res.json({ splits });
    } catch (err) {
      console.error("/api/splits error:", err);
      res.status(500).json({ error: "list failed" });
    }
  });

  app.post("/api/splits/:id/settle", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const householdId = req.user.coupleId;
    if (!householdId) return res.status(400).json({ error: "no household" });
    const id = String(req.params.id);
    try {
      const [row] = await db
        .select()
        .from(activityFeed)
        .where(and(eq(activityFeed.id, id), eq(activityFeed.coupleId, householdId)))
        .limit(1);
      if (!row) return res.status(404).json({ error: "not_found" });
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      meta.settled = true;
      meta.settledAt = new Date().toISOString();
      await db
        .update(activityFeed)
        .set({ metadata: meta })
        .where(eq(activityFeed.id, id));
      res.json({ ok: true });
    } catch (err) {
      console.error("/api/splits/settle error:", err);
      res.status(500).json({ error: "settle failed" });
    }
  });
}
