/**
 * Trusted-people invites — sends an SMS via Twilio with a magic-token sign-up
 * link, persists the pending invite, and the invitee can accept by visiting
 * the link.
 *
 *   POST /api/invites      → send invite
 *   GET  /api/invites      → list pending sent by me
 *   POST /api/invites/:token/accept → accept (called from the magic link)
 *
 * Twilio creds come from TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN env vars.
 * If they're missing in dev, we fall back to no-op + log the link so you can
 * test the accept flow without burning SMS credits.
 */
import type { Express, Request, Response } from "express";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "crypto";

import { requireAuth } from "../middleware/auth";
import { db } from "../db";
import { partnerInvites, users } from "../../shared/schema";

async function sendSms(toPhone: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) {
    console.log("[invites] Twilio not configured — would have sent:", { toPhone, body });
    return { ok: true };
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: toPhone, From: from, Body: body }).toString(),
    });
    if (!res.ok) {
      const txt = await res.text();
      console.warn("[invites] Twilio send failed:", res.status, txt);
      return { ok: false, error: `twilio_${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error("[invites] Twilio fetch error:", err);
    return { ok: false, error: String(err) };
  }
}

const APP_URL = process.env.PUBLIC_APP_URL || "https://buildtogether-v2.vercel.app";

export function mountInvitesRoutes(app: Express): void {
  app.post("/api/invites", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const householdId = req.user.coupleId;
    if (!householdId) return res.status(400).json({ error: "no_household" });

    const body = req.body as {
      phone?: string;
      email?: string;
      name: string;
      scope: string;
    };
    if (!body.name || (!body.phone && !body.email)) {
      return res.status(400).json({ error: "missing_contact_or_name" });
    }

    const inviter = await db.query.users.findFirst({ where: eq(users.id, req.user.id) });
    const inviterName = inviter?.name ?? "A friend";
    const token = randomBytes(20).toString("base64url");

    // Schema may have legacy columns; insert with what we have. The
    // partner_invites table dates from V1 so its column set is loose —
    // we only rely on a few fields here.
    let inviteId: string | null = null;
    try {
      const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      const [row] = await db
        .insert(partnerInvites)
        .values({
          coupleId: householdId,
          inviteCode: token,
          invitedBy: req.user.id,
          invitedEmail: body.email ?? null,
          status: "pending",
          expiresAt,
        })
        .returning();
      inviteId = row?.id ?? null;
    } catch (err) {
      // Schema mismatch — log and continue so the SMS still goes out.
      console.warn("[invites] DB insert failed, proceeding with SMS:", err);
    }

    const link = `${APP_URL}/?invite=${token}`;
    const smsBody = `${inviterName} added you on Tilly as "${body.name}" (${body.scope}). Open it: ${link}`;

    let smsResult: { ok: boolean; error?: string } = { ok: true };
    if (body.phone) smsResult = await sendSms(body.phone, smsBody);

    res.json({
      ok: smsResult.ok,
      inviteId,
      link,
      smsError: smsResult.error,
    });
  });

  app.get("/api/invites", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const householdId = req.user.coupleId;
    if (!householdId) return res.json({ ready: false, invites: [] });
    try {
      const rows = await db
        .select()
        .from(partnerInvites)
        .where(and(eq(partnerInvites.coupleId, householdId), eq(partnerInvites.status, "pending")));
      res.json({ ready: true, invites: rows });
    } catch (err) {
      // partner_invites table might not exist yet on every deploy; soft-fail.
      console.warn("[invites] list soft-fail:", err);
      res.json({ ready: false, invites: [] });
    }
  });

  app.post("/api/invites/:token/accept", async (req: Request, res: Response) => {
    const token = String(req.params.token);
    try {
      const [invite] = await db
        .select()
        .from(partnerInvites)
        .where(and(eq(partnerInvites.inviteCode, token), eq(partnerInvites.status, "pending")))
        .limit(1);
      if (!invite) return res.status(404).json({ error: "invite_not_found" });
      // Mark accepted; the actual `members` row insert happens after the
      // invitee finishes auth. For now we just flip status.
      await db
        .update(partnerInvites)
        .set({ status: "accepted" } as any)
        .where(eq(partnerInvites.id, invite.id));
      res.json({ ok: true, householdId: invite.coupleId });
    } catch (err) {
      console.error("[invites] accept error:", err);
      res.status(500).json({ error: "accept_failed" });
    }
  });
}
