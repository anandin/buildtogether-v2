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
import { runProtectionsForHousehold } from "../tilly/protections-engine";

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

// Word→number for spelled-out amounts. STT often turns "$8 lunch" into
// "eight dollar lunch" or even "a dollar lunch" (mishears "$8" as the
// indefinite article). Without this, "A dollar lunch at my cafeteria"
// won't fast-path and falls into a brittle LLM call that 500s when the
// schema doesn't fit.
const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
};

function categorize(text: string): ParsedExpense["category"] {
  const lc = text.toLowerCase();
  if (/coffee|latte|espresso|cafe|stumptown|starbucks|joe/.test(lc)) return "coffee";
  if (/grocer|trader joe|whole foods|safeway|aldi/.test(lc)) return "groceries";
  if (/doordash|grubhub|uber eats|takeout|halal|pizza|burger|lunch|dinner|breakfast|cafeteria|sushi|chipotle/.test(lc))
    return "eatout";
  if (/uber|lyft|subway|metro|bus|gas|citibike|train/.test(lc)) return "transit";
  if (/textbook|pearson|tuition|school|class|exam/.test(lc)) return "school";
  if (/spotify|netflix|hulu|apple tv|sub /.test(lc)) return "subs";
  return "other";
}

/**
 * Parse free-form user text ("$5 coffee at stumptown") into a structured
 * expense. Tries digit regex first, then spelled-out numbers ("eight
 * dollars"), then falls back to the LLM. NEVER throws — when nothing
 * parses, returns amount=0 so the row still saves and the user can edit
 * it on the spend tab.
 */
async function parseToExpense(raw: string): Promise<ParsedExpense> {
  const trimmed = raw.trim();
  const lc = trimmed.toLowerCase();

  // 1) Digit fast-path: "$5", "5 dollars", "5.50".
  const digitMatch = trimmed.match(/\$?\s*(\d+(?:\.\d{1,2})?)/);
  if (digitMatch && trimmed.length < 80) {
    const amount = Number(digitMatch[1]);
    const rest = trimmed.replace(digitMatch[0], "").replace(/\s+/g, " ").trim();
    const description = rest || `$${amount}`;
    return {
      amount,
      merchant: rest || null,
      description,
      category: categorize(rest || trimmed),
      isRecurring: /\bsubscription|monthly|recurring\b/i.test(trimmed),
    };
  }

  // 2) Spelled-out number fast-path: "eight dollar lunch",
  //    "a dollar lunch at my cafeteria", "five bucks coffee".
  const spelledMatch = lc.match(
    /\b(a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty)\s+(dollar|dollars|buck|bucks)\b/,
  );
  if (spelledMatch) {
    const amount = NUMBER_WORDS[spelledMatch[1]] ?? 0;
    // Remove the "<word> dollar(s)" chunk from the human description so it
    // reads cleanly: "lunch at my cafeteria" rather than "a dollar lunch
    // at my cafeteria".
    const idx = lc.indexOf(spelledMatch[0]);
    const rest = (
      trimmed.slice(0, idx) + trimmed.slice(idx + spelledMatch[0].length)
    )
      .replace(/\s+/g, " ")
      .trim();
    return {
      amount,
      merchant: rest || null,
      description: rest || `$${amount}`,
      category: categorize(rest || trimmed),
      isRecurring: /\bsubscription|monthly|recurring\b/i.test(trimmed),
    };
  }

  // 3) LLM fallback — any failure (network / schema mismatch / bad json)
  //    must not 500 the request. We log + degrade to amount=0 so the row
  //    still lands and the user can correct it.
  try {
    const llm = await getLLM();
    return await llm.structuredOutput<ParsedExpense>({
      systemPrompts: [
        "You parse a brief user note about a purchase into structured fields. Be conservative — if you can't tell, return category 'other' and amount=0. Never invent details that aren't in the note.",
      ],
      messages: [{ role: "user", content: trimmed }],
      schema: ParsedExpenseSchema,
      schemaName: "expense_parse",
    });
  } catch (err) {
    console.warn("[expenses] LLM parse fell back to stub:", err);
    return {
      amount: 0,
      merchant: null,
      description: trimmed.slice(0, 80) || "Unspecified expense",
      category: categorize(trimmed),
      isRecurring: false,
    };
  }
}

/**
 * Parse a receipt image. Two-step pattern because OpenRouter+Anthropic
 * don't reliably honour `response_format: json_schema` on multimodal
 * (image) requests. Step 1 reads the receipt as plain text. Step 2
 * normalises that into the structured ParsedExpense via a regular
 * text-only structured-output call.
 *
 * Like `parseToExpense`, NEVER throws — bad/unreadable images degrade
 * to amount=0 so the row lands and the user can correct it.
 */
async function parsePhotoToExpense(
  imageDataUrl: string,
): Promise<ParsedExpense & { _debug?: string }> {
  let visionText = "";
  try {
    const llm = await getLLM();
    // Step 1 — vision read (no schema; just plain text). Anthropic via
    // OpenRouter accepts OpenAI-shaped image_url parts.
    const read = await llm.textReply({
      systemPrompts: [
        "You read photos of receipts. Reply with: MERCHANT=<name>; TOTAL=<grand total in dollars, just the number>; ITEMS=<comma-sep items>. If you cannot read the receipt clearly, reply: TOTAL=0.",
      ],
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Read this receipt." },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ] as any,
        },
      ],
      maxTokens: 500,
    });
    visionText = read.text || "";
    // Step 2 — parse the plain text. Reuse the regex/word fast path for
    // amount extraction so we don't burn another LLM call when "TOTAL=25.40"
    // is right there.
    const totalMatch = visionText.match(/TOTAL\s*=\s*\$?\s*(\d+(?:\.\d{1,2})?)/i);
    const merchantMatch = visionText.match(/MERCHANT\s*=\s*([^;\n]+)/i);
    const itemsMatch = visionText.match(/ITEMS\s*=\s*([^;\n]+)/i);
    const amount = totalMatch ? Number(totalMatch[1]) : 0;
    const merchant = merchantMatch ? merchantMatch[1].trim() : null;
    const items = itemsMatch ? itemsMatch[1].trim() : "";
    return {
      amount,
      merchant: merchant || null,
      description: merchant
        ? items
          ? `${merchant} — ${items.slice(0, 60)}`
          : merchant
        : items.slice(0, 80) || "Receipt — needs amount",
      category: categorize(`${merchant ?? ""} ${items}`),
      isRecurring: false,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[expenses] photo parse fell back to stub:", msg);
    return {
      amount: 0,
      merchant: null,
      description: "Receipt — needs amount",
      category: "other",
      isRecurring: false,
      _debug: `vision_text=${visionText.slice(0, 200)} | err=${msg.slice(0, 200)}`,
    };
  }
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
        // needsAmount lets the client surface a "Tilly couldn't tell — tap
        // to set the amount" prompt instead of silently saving a $0 row.
        res.json({
          ok: true,
          expense: row,
          parsed,
          needsAmount: !parsed.amount || parsed.amount <= 0,
        });
      } catch (err) {
        console.error("/api/expenses/voice error:", err);
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: "voice_parse_failed", debug: msg });
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
        res.json({
          ok: true,
          expense: row,
          parsed,
          needsAmount: !parsed.amount || parsed.amount <= 0,
          _debug: (parsed as any)._debug,
        });
      } catch (err) {
        console.error("/api/expenses/photo error:", err);
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: "photo_parse_failed", debug: msg });
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
