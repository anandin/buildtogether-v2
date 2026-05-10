/**
 * Tilly tool registry.
 *
 * Each tool is a typed action Tilly can take during a chat turn. The
 * unified extractor (extractor.ts) detects which tools the user just
 * asked for via a single Haiku call returning an array of intents; the
 * dispatcher (this file's `executeTool` function) then runs the actual
 * server-side side effect for each detected intent.
 *
 * Adding a tool:
 *   1. Add a TOOL_NAMES entry + zod schema for args
 *   2. Implement the handler in `handlers/<name>.ts`
 *   3. Map TOOL_HANDLERS[name]
 *   4. Add the corresponding ToolResult variant + UI confirmation card
 *
 * No DB schema migration required for new tools (state lives in
 * user_preferences for layout/filtering tools; tool-specific tables for
 * domain ones like goals).
 */
import { z } from "zod";

import { db } from "../../db";
import { goals, plaidTransactions, expenses, userPreferences } from "../../../shared/schema";
import { and, eq, sql, inArray } from "drizzle-orm";
import { merchantSignature } from "../merchant-rules";

export const TOOL_NAMES = [
  "createDream",
  "markPaymentToOwnCard",
  "hideCategoryFromSpend",
  "pinToHome",
  "setOnboardingField",
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

// ─── Tool result types ─────────────────────────────────────────────────────
// Discriminated by `kind`. Mobile renders an inline preview card per kind.

export type ToolResult =
  | {
      kind: "dream_created";
      dreamId: string;
      name: string;
      targetAmount: number;
      monthlyContribution: number;
      emoji: string;
    }
  | {
      kind: "payment_to_card_aliased";
      merchantSignature: string;
      cardName: string;
      // How many existing transactions got reclassified out of "loans"
      reclassifiedCount: number;
      // Approx $ that no longer counts as loan-spend.
      reclassifiedAmount: number;
    }
  | {
      kind: "category_hidden";
      category: string;
      reason: string;
    }
  | {
      kind: "home_tile_pinned";
      tileKind: string;
      label: string;
    }
  | {
      kind: "onboarding_field_set";
      field: string;
      value: string;
    };

// ─── Tool context (passed to every handler) ────────────────────────────────

export type ToolContext = {
  userId: string;
  householdId: string;
};

// ─── Per-tool zod schemas (validated server-side after Haiku extraction) ──

const createDreamSchema = z.object({
  name: z.string().min(1),
  targetAmount: z.number().positive(),
  monthlyContribution: z.number().nonnegative().optional(),
  emoji: z.string().optional(),
});

const markPaymentToOwnCardSchema = z.object({
  merchantSignature: z.string().min(1),
  cardName: z.string().min(1),
  reason: z.string().optional(),
});

const hideCategoryFromSpendSchema = z.object({
  category: z.string().min(1),
  reason: z.string().optional(),
});

const pinToHomeSchema = z.object({
  tileKind: z.string().min(1),
});

const setOnboardingFieldSchema = z.object({
  field: z.enum([
    "employmentType",
    "ageBand",
    "city",
    "dependents",
    "supportNote",
    "schoolName",
  ]),
  value: z.union([z.string(), z.number()]),
});

const TOOL_SCHEMAS: Record<ToolName, z.ZodType> = {
  createDream: createDreamSchema,
  markPaymentToOwnCard: markPaymentToOwnCardSchema,
  hideCategoryFromSpend: hideCategoryFromSpendSchema,
  pinToHome: pinToHomeSchema,
  setOnboardingField: setOnboardingFieldSchema,
};

// ─── Dispatcher ────────────────────────────────────────────────────────────

export async function executeTool(
  name: ToolName,
  args: unknown,
  ctx: ToolContext,
): Promise<ToolResult | null> {
  const schema = TOOL_SCHEMAS[name];
  const parsed = schema.safeParse(args);
  if (!parsed.success) {
    console.warn(
      `[tools] ${name} args validation failed:`,
      parsed.error.flatten(),
    );
    return null;
  }

  switch (name) {
    case "createDream":
      return await runCreateDream(parsed.data as z.infer<typeof createDreamSchema>, ctx);
    case "markPaymentToOwnCard":
      return await runMarkPaymentToOwnCard(
        parsed.data as z.infer<typeof markPaymentToOwnCardSchema>,
        ctx,
      );
    case "hideCategoryFromSpend":
      return await runHideCategory(
        parsed.data as z.infer<typeof hideCategoryFromSpendSchema>,
        ctx,
      );
    case "pinToHome":
      return await runPinToHome(parsed.data as z.infer<typeof pinToHomeSchema>, ctx);
    case "setOnboardingField":
      return await runSetOnboardingField(
        parsed.data as z.infer<typeof setOnboardingFieldSchema>,
        ctx,
      );
  }
}

// ─── Handlers ──────────────────────────────────────────────────────────────

async function runCreateDream(
  args: z.infer<typeof createDreamSchema>,
  ctx: ToolContext,
): Promise<ToolResult> {
  // Idempotency: if a goal with same lowercased name already exists for
  // this couple, return that one rather than creating a duplicate.
  const existing = await db
    .select()
    .from(goals)
    .where(eq(goals.coupleId, ctx.householdId))
    .limit(50);
  const normalized = args.name.trim().toLowerCase();
  const matched = existing.find((g) => g.name.trim().toLowerCase() === normalized);
  const goalRow =
    matched ??
    (
      await db
        .insert(goals)
        .values({
          coupleId: ctx.householdId,
          name: args.name,
          targetAmount: args.targetAmount,
          savedAmount: 0,
          emoji: args.emoji ?? "✺",
          color: "#7C3AED",
          weeklyAuto: args.monthlyContribution
            ? Math.round((args.monthlyContribution / 4.33) * 100) / 100
            : null,
        })
        .returning()
    )[0];
  return {
    kind: "dream_created",
    dreamId: goalRow.id,
    name: goalRow.name,
    targetAmount: goalRow.targetAmount,
    monthlyContribution: args.monthlyContribution ?? 0,
    emoji: goalRow.emoji,
  };
}

async function runMarkPaymentToOwnCard(
  args: z.infer<typeof markPaymentToOwnCardSchema>,
  ctx: ToolContext,
): Promise<ToolResult> {
  // Tilly may pass a partially-normalized signature OR the raw display
  // name ("Scotialn Vsa"). Run it through merchantSignature to land on
  // the same canonical form the sync handler uses, so retroactive +
  // prospective matches agree.
  const targetSig = merchantSignature({
    merchantName: args.merchantSignature,
    name: args.merchantSignature,
    amount: 0,
  });

  // 1. Persist the alias preference. Future sync handler reads this and
  //    auto-classifies matching transactions as "transfers" before they
  //    even hit the pending queue.
  await db
    .insert(userPreferences)
    .values({
      userId: ctx.userId,
      scope: "plaid",
      key: `alias_payment_to_card:${targetSig}`,
      value: {
        cardName: args.cardName,
        reason: args.reason ?? "user-confirmed CC payment",
        since: new Date().toISOString(),
      },
    })
    .onConflictDoUpdate({
      target: [userPreferences.userId, userPreferences.scope, userPreferences.key],
      set: {
        value: {
          cardName: args.cardName,
          reason: args.reason ?? "user-confirmed CC payment",
          since: new Date().toISOString(),
        },
        updatedAt: new Date(),
      },
    });

  // 2. Retroactive fix: scan all plaid_transactions for this couple,
  //    find any whose live signature matches, flip ourCategory to
  //    "transfers", and (when linked to an expense) update the
  //    expense category too.
  const txs = await db
    .select()
    .from(plaidTransactions)
    .where(eq(plaidTransactions.coupleId, ctx.householdId))
    .limit(500);
  let reclassifiedCount = 0;
  let reclassifiedAmount = 0;
  for (const tx of txs) {
    const sig = merchantSignature(tx);
    if (sig !== targetSig) continue;
    if (tx.ourCategory === "transfers") continue; // already done
    await db.transaction(async (txn) => {
      await txn
        .update(plaidTransactions)
        .set({ ourCategory: "transfers" })
        .where(eq(plaidTransactions.id, tx.id));
      if (tx.expenseId) {
        await txn
          .update(expenses)
          .set({ category: "transfers" })
          .where(eq(expenses.id, tx.expenseId));
      }
    });
    reclassifiedCount++;
    reclassifiedAmount += tx.amount;
  }

  return {
    kind: "payment_to_card_aliased",
    merchantSignature: targetSig,
    cardName: args.cardName,
    reclassifiedCount,
    reclassifiedAmount,
  };
}

async function runHideCategory(
  args: z.infer<typeof hideCategoryFromSpendSchema>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const cat = args.category.trim().toLowerCase();
  // Read existing, append, dedupe, write back.
  const existing = await db
    .select()
    .from(userPreferences)
    .where(
      and(
        eq(userPreferences.userId, ctx.userId),
        eq(userPreferences.scope, "spend"),
        eq(userPreferences.key, "hide_categories"),
      ),
    )
    .limit(1);
  const current = Array.isArray(existing[0]?.value)
    ? (existing[0]!.value as string[])
    : [];
  const next = Array.from(new Set([...current, cat]));
  await db
    .insert(userPreferences)
    .values({
      userId: ctx.userId,
      scope: "spend",
      key: "hide_categories",
      value: next,
    })
    .onConflictDoUpdate({
      target: [userPreferences.userId, userPreferences.scope, userPreferences.key],
      set: { value: next, updatedAt: new Date() },
    });
  return { kind: "category_hidden", category: cat, reason: args.reason ?? "" };
}

async function runPinToHome(
  args: z.infer<typeof pinToHomeSchema>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const tileKind = args.tileKind.trim().toLowerCase();
  const existing = await db
    .select()
    .from(userPreferences)
    .where(
      and(
        eq(userPreferences.userId, ctx.userId),
        eq(userPreferences.scope, "today"),
        eq(userPreferences.key, "pinned_tiles"),
      ),
    )
    .limit(1);
  const current = Array.isArray(existing[0]?.value)
    ? (existing[0]!.value as string[])
    : [];
  const next = Array.from(new Set([...current, tileKind]));
  await db
    .insert(userPreferences)
    .values({
      userId: ctx.userId,
      scope: "today",
      key: "pinned_tiles",
      value: next,
    })
    .onConflictDoUpdate({
      target: [userPreferences.userId, userPreferences.scope, userPreferences.key],
      set: { value: next, updatedAt: new Date() },
    });
  // Friendly label for the confirmation card.
  const labels: Record<string, string> = {
    subscriptions_overview: "Subscriptions overview",
    credit_health: "Credit health",
    spending_vs_avg: "Spending vs your average",
    upcoming_bills: "Upcoming bills",
    debt_breakdown: "Debt breakdown",
  };
  return {
    kind: "home_tile_pinned",
    tileKind,
    label: labels[tileKind] ?? tileKind.replace(/_/g, " "),
  };
}

async function runSetOnboardingField(
  args: z.infer<typeof setOnboardingFieldSchema>,
  ctx: ToolContext,
): Promise<ToolResult> {
  // Onboarding values live in tilly_life_context (or equivalent). For this
  // pass we write to user_preferences so the Today + chat layers can read
  // immediately, AND post to /api/tilly/me/* if the route exists. The
  // App Settings screen reads from the same source on next mount.
  const field = args.field;
  const value = String(args.value);
  await db
    .insert(userPreferences)
    .values({
      userId: ctx.userId,
      scope: "onboarding",
      key: field,
      value,
    })
    .onConflictDoUpdate({
      target: [userPreferences.userId, userPreferences.scope, userPreferences.key],
      set: { value, updatedAt: new Date() },
    });
  return { kind: "onboarding_field_set", field, value };
}
