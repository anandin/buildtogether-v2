/**
 * Splits — spec §5b. Don't compete with Splitwise.
 *
 * When the user wants to split, Tilly drafts a Venmo deeplink. On phone
 * tap, Venmo opens with the amount + recipient + label prefilled. We
 * record the intent so the chat history shows "you split $14 with Priya"
 * even if the user changes the amount in Venmo.
 *
 *   POST /api/splits/draft  { recipient: "@priya", amount, label }
 *     → { venmoUrl, deeplinks: { ios, android }, message }
 *   GET  /api/splits         — recent split intents
 */
import type { Express, Request, Response } from "express";
import { eq } from "drizzle-orm";

import { requireAuth } from "../middleware/auth";
import { db } from "../db";
import { activityFeed } from "../../shared/schema";

function venmoUrl(opts: {
  recipient: string; // username, with or without leading @
  amount: number;
  label: string;
  charge: boolean; // true = charge (request), false = pay
}): string {
  const recipient = opts.recipient.replace(/^@/, "");
  const params = new URLSearchParams({
    txn: opts.charge ? "charge" : "pay",
    audience: "private",
    recipients: recipient,
    amount: opts.amount.toFixed(2),
    note: opts.label,
  });
  return `venmo://paycharge?${params.toString()}`;
}

function venmoWebFallback(opts: {
  recipient: string;
  amount: number;
  label: string;
  charge: boolean;
}): string {
  const recipient = opts.recipient.replace(/^@/, "");
  const action = opts.charge ? "charge" : "pay";
  return `https://venmo.com/${recipient}?txn=${action}&amount=${opts.amount.toFixed(2)}&note=${encodeURIComponent(opts.label)}`;
}

export function mountSplitsRoutes(app: Express): void {
  app.post("/api/splits/draft", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const householdId = req.user.coupleId;
    if (!householdId) return res.status(400).json({ error: "no household" });

    const { recipient, amount, label, charge } = req.body ?? {};
    if (typeof recipient !== "string" || !recipient.trim()) {
      return res.status(400).json({ error: "recipient required" });
    }
    if (typeof amount !== "number" || amount <= 0) {
      return res.status(400).json({ error: "amount must be positive" });
    }
    const cleanLabel =
      typeof label === "string" && label.trim() ? label.trim().slice(0, 64) : "Split";
    const isCharge = charge !== false; // default = charge (request) since that's the common case

    const opts = { recipient, amount, label: cleanLabel, charge: isCharge };
    const deepLink = venmoUrl(opts);
    const webLink = venmoWebFallback(opts);

    // Record the split intent in activityFeed so the chat history can
    // surface it later ("you drafted a $14 charge to @priya").
    try {
      await db.insert(activityFeed).values({
        coupleId: householdId,
        userId: req.user.id,
        activityType: "split_drafted",
        summary: `${isCharge ? "Charge" : "Pay"} ${recipient} $${amount.toFixed(2)} — ${cleanLabel}`,
        metadata: { recipient, amount, label: cleanLabel, charge: isCharge, deepLink },
      });
    } catch (err) {
      // Activity feed is auxiliary; don't fail the split request on insert error.
      console.error("splits/draft activity insert failed:", err);
    }

    res.json({
      venmoUrl: deepLink,
      deeplinks: { ios: deepLink, android: deepLink },
      webFallback: webLink,
      message: `${isCharge ? "Asking" : "Sending"} @${recipient.replace(/^@/, "")} $${amount.toFixed(2)} for "${cleanLabel}".`,
    });
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
}
