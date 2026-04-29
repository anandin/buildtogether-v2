/**
 * Manual expense capture — for users who haven't connected Plaid yet, or
 * for one-off cash purchases that never hit a card.
 *
 *   POST /api/expenses           — text entry (parsed by LLM if free-form)
 *   POST /api/expenses/voice     — voice transcript → parsed expense
 *   POST /api/expenses/photo     — receipt image → vision LLM → parsed expense
 *   GET  /api/expenses?days=30   — list recent
 *   DELETE /api/expenses/:id     — soft remove (sets amount to 0 effectively)
 *
 * The voice + photo flows route the user's input through Tilly's persona
 * model (Claude Sonnet on OpenRouter, with a small structured-output
 * schema) so we extract amount/merchant/category in one round-trip.
 */
import type { Express, Request, Response } from "express";
import { eq, and, desc, gte } from "drizzle-orm";
import { z } from "zod";

import { requireAuth } from "../middleware/auth";
import { db } from "../db";
import { expenses } from "../../shared/schema";
import { getLLM } from "../tilly/llm/factory";

const ParsedExpenseSchema = z.object({
  amount: z.number().describe("Dollar amount as a positive number, no $."),
  merchant: z
    .string()
    .nullable()
    .describe("Best guess at the merchant or store, or null if unclear."),
  description: z
    .string()
    .describe("Short human-readable description, e.g. 'Coffee at Stumptown'."),
  category: z
    .enum([
      "coffee",
      "groceries",
      "eatout",
      "transit",
      "rent",
      "school",
      "subs",
      "shopping",
      "entertainment",
      "health",
      "other",
    ])
    .describe("Best-fit Tilly spend category."),
  isRecurring: z
    .boolean()
    .describe("True only if the user explicitly says it's a subscription/recurring."),
});

type ParsedExpense = z.infer<typeof ParsedExpenseSchema>;

/**
 * Parse free-form user text ("$5 coffee at stumptown") into a structured
 * expense via the persona LLM. Falls back to a simple regex extractor for
 * the common case so we don't burn an LLM call on "$5 coffee".
 */
async function parseToExpense(raw: string): Promise<ParsedExpense> {
  const trimmed = raw.trim();

  // Cheap regex fast-path: "<amount> <description>" / "<description> <amount>".
  const amountMatch = trimmed.match(/\$?\s*(\d+(?:\.\d{1,2})?)/);
  const amount = amountMatch ? Number(amountMatch[1]) : null;
  if (amount && trimmed.length < 60) {
    const rest = trimmed.replace(amountMatch![0], "").replace(/\s+/g, " ").trim();
    const lc = rest.toLowerCase();
    let category: ParsedExpense["category"] = "other";
    if (/coffee|latte|espresso|cafe|stumptown|starbucks|joe/.test(lc)) category = "coffee";
    else if (/grocer|trader joe|whole foods|safeway|aldi/.test(lc)) category = "groceries";
    else if (/doordash|grubhub|uber eats|takeout|halal|pizza|burger/.test(lc)) category = "eatout";
    else if (/uber|lyft|subway|metro|bus|gas|citibike/.test(lc)) category = "transit";
    else if (/textbook|pearson|tuition|school|class/.test(lc)) category = "school";
    else if (/spotify|netflix|hulu|apple|sub /.test(lc)) category = "subs";
    return {
      amount,
      merchant: rest || null,
      description: rest || `$${amount}`,
      category,
      isRecurring: category === "subs",
    };
  }

  const llm = await getLLM();
  return llm.structuredOutput<ParsedExpense>({
    systemPrompts: [
      "You parse a brief user note about a purchase into structured fields. Be conservative — if you can't tell, return category 'other' and amount as best guess. Never invent details that aren't in the note.",
    ],
    messages: [{ role: "user", content: trimmed }],
    schema: ParsedExpenseSchema,
    schemaName: "expense_parse",
  });
}

/**
 * Parse a receipt image. The vision call returns the same shape as text
 * parse so the downstream insert is identical.
 */
async function parsePhotoToExpense(
  imageDataUrl: string,
): Promise<ParsedExpense> {
  const llm = await getLLM();
  return llm.structuredOutput<ParsedExpense>({
    systemPrompts: [
      "You read a photo of a receipt and extract the total + merchant + best category. Read only what's on the receipt — never invent a line item. If multiple totals exist, pick the grand total (the one with tip + tax included). Return amount as a positive USD number.",
    ],
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Extract the receipt total and merchant from this photo." },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ] as any,
      },
    ],
    schema: ParsedExpenseSchema,
    schemaName: "expense_photo",
  });
}

export function mountExpensesRoutes(app: Express): void {
  app.get("/api/expenses", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const householdId = req.user.coupleId;
    if (!householdId) return res.json({ ready: false, expenses: [] });

    const days = Math.min(180, Number(req.query.days ?? 30));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const rows = await db
      .select()
      .from(expenses)
      .where(and(eq(expenses.coupleId, householdId), gte(expenses.date, since)))
      .orderBy(desc(expenses.date))
      .limit(200);
    res.json({ ready: true, expenses: rows });
  });

  app.post("/api/expenses", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const householdId = req.user.coupleId;
    if (!householdId) return res.status(400).json({ error: "no_household" });

    const body = req.body as {
      raw?: string;
      amount?: number;
      description?: string;
      merchant?: string;
      category?: string;
      date?: string;
      source?: "manual_text" | "manual_voice";
    };

    let parsed: ParsedExpense;
    try {
      // If client supplied structured fields directly (form-based entry),
      // skip the LLM. Otherwise parse the raw text.
      if (body.amount !== undefined && body.description) {
        parsed = {
          amount: body.amount,
          merchant: body.merchant ?? null,
          description: body.description,
          category: (body.category as any) ?? "other",
          isRecurring: false,
        };
      } else if (body.raw) {
        parsed = await parseToExpense(body.raw);
      } else {
        return res.status(400).json({ error: "missing_input" });
      }
    } catch (err) {
      console.error("/api/expenses parse error:", err);
      return res.status(500).json({ error: "parse_failed" });
    }

    const today = (body.date ?? new Date().toISOString().slice(0, 10));
    const [row] = await db
      .insert(expenses)
      .values({
        coupleId: householdId,
        userId: req.user.id,
        source: body.source ?? "manual_text",
        rawInput: body.raw ?? null,
        amount: parsed.amount,
        description: parsed.description,
        merchant: parsed.merchant,
        category: parsed.category,
        date: today,
        paidBy: req.user.id,
        isRecurring: parsed.isRecurring,
      })
      .returning();

    // Inline protections sweep — fast (rule-based, no LLM) so it's safe
    // to block the response on. If it errors we still return the saved
    // expense.
    try {
      const { runProtectionsForHousehold } = await import(
        "../tilly/protections-engine"
      );
      await runProtectionsForHousehold(householdId);
    } catch (err) {
      console.warn("[expenses] protections sweep failed:", err);
    }

    res.json({ ok: true, expense: row });
  });

  app.post(
    "/api/expenses/voice",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const householdId = req.user.coupleId;
      if (!householdId) return res.status(400).json({ error: "no_household" });
      const transcript = (req.body?.transcript ?? "").toString().trim();
      if (!transcript) return res.status(400).json({ error: "missing_transcript" });
      try {
        const parsed = await parseToExpense(transcript);
        const today = new Date().toISOString().slice(0, 10);
        const [row] = await db
          .insert(expenses)
          .values({
            coupleId: householdId,
            userId: req.user.id,
            source: "manual_voice",
            rawInput: transcript,
            amount: parsed.amount,
            description: parsed.description,
            merchant: parsed.merchant,
            category: parsed.category,
            date: today,
            paidBy: req.user.id,
            isRecurring: parsed.isRecurring,
          })
          .returning();
        res.json({ ok: true, expense: row, parsed });
      } catch (err) {
        console.error("/api/expenses/voice error:", err);
        res.status(500).json({ error: "voice_parse_failed" });
      }
    },
  );

  app.post(
    "/api/expenses/photo",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const householdId = req.user.coupleId;
      if (!householdId) return res.status(400).json({ error: "no_household" });
      const imageDataUrl = (req.body?.image ?? "").toString();
      if (!imageDataUrl.startsWith("data:image/"))
        return res.status(400).json({ error: "missing_image" });
      try {
        const parsed = await parsePhotoToExpense(imageDataUrl);
        const today = new Date().toISOString().slice(0, 10);
        const [row] = await db
          .insert(expenses)
          .values({
            coupleId: householdId,
            userId: req.user.id,
            source: "manual_photo",
            rawInput: null,
            amount: parsed.amount,
            description: parsed.description,
            merchant: parsed.merchant,
            category: parsed.category,
            date: today,
            paidBy: req.user.id,
            isRecurring: parsed.isRecurring,
            // Don't store the receipt image inline — it bloats the row.
            // Store only its presence as a flag so we can re-render a
            // small icon. Future: upload to blob storage and link here.
            receiptImage: "captured",
          })
          .returning();
        res.json({ ok: true, expense: row, parsed });
      } catch (err) {
        console.error("/api/expenses/photo error:", err);
        res.status(500).json({ error: "photo_parse_failed" });
      }
    },
  );

  app.delete(
    "/api/expenses/:id",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const householdId = req.user.coupleId;
      if (!householdId) return res.status(400).json({ error: "no_household" });
      const id = String(req.params.id);
      await db
        .delete(expenses)
        .where(and(eq(expenses.id, id), eq(expenses.coupleId, householdId)));
      res.json({ ok: true });
    },
  );
}
