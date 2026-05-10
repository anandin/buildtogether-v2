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
  // Forward tools — mutate state.
  "createDream",
  "markPaymentToOwnCard",
  "hideCategoryFromSpend",
  "pinToHome",
  "setOnboardingField",
  // Inverse tools — reverse a prior mutation. Tilly chooses these when
  // the user says "Don't / Stop / Bring back / Undo / Reverse / Remove
  // X" referring to something she previously did.
  "unhideCategory",
  "removePaymentToOwnCardAlias",
  "unpinFromHome",
  "unsetOnboardingField",
  "deleteDream",
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
    }
  // ─── Inverse tool results ─────────────────────────────────────────────
  | {
      kind: "category_unhidden";
      category: string;
    }
  | {
      kind: "payment_to_card_unaliased";
      cardName: string;
      restoredCount: number;
      restoredAmount: number;
    }
  | {
      kind: "home_tile_unpinned";
      tileKind: string;
      label: string;
    }
  | {
      kind: "onboarding_field_unset";
      field: string;
    }
  | {
      kind: "dream_deleted";
      name: string;
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

// ─── Inverse-tool schemas ──────────────────────────────────────────────
const unhideCategorySchema = z.object({
  category: z.string().min(1),
});
const removePaymentToOwnCardAliasSchema = z.object({
  cardName: z.string().min(1),
});
const unpinFromHomeSchema = z.object({
  tileKind: z.string().min(1),
});
const unsetOnboardingFieldSchema = z.object({
  field: z.enum([
    "employmentType",
    "ageBand",
    "city",
    "dependents",
    "supportNote",
    "schoolName",
  ]),
});
const deleteDreamSchema = z.object({
  name: z.string().min(1),
});

const TOOL_SCHEMAS: Record<ToolName, z.ZodType> = {
  createDream: createDreamSchema,
  markPaymentToOwnCard: markPaymentToOwnCardSchema,
  hideCategoryFromSpend: hideCategoryFromSpendSchema,
  pinToHome: pinToHomeSchema,
  setOnboardingField: setOnboardingFieldSchema,
  unhideCategory: unhideCategorySchema,
  removePaymentToOwnCardAlias: removePaymentToOwnCardAliasSchema,
  unpinFromHome: unpinFromHomeSchema,
  unsetOnboardingField: unsetOnboardingFieldSchema,
  deleteDream: deleteDreamSchema,
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
    case "unhideCategory":
      return await runUnhideCategory(parsed.data as z.infer<typeof unhideCategorySchema>, ctx);
    case "removePaymentToOwnCardAlias":
      return await runRemovePaymentToOwnCardAlias(
        parsed.data as z.infer<typeof removePaymentToOwnCardAliasSchema>,
        ctx,
      );
    case "unpinFromHome":
      return await runUnpinFromHome(parsed.data as z.infer<typeof unpinFromHomeSchema>, ctx);
    case "unsetOnboardingField":
      return await runUnsetOnboardingField(
        parsed.data as z.infer<typeof unsetOnboardingFieldSchema>,
        ctx,
      );
    case "deleteDream":
      return await runDeleteDream(parsed.data as z.infer<typeof deleteDreamSchema>, ctx);
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
  // Tilly's extraction frequently grabs wording from her OWN reply
  // (e.g. "TD→Scotia VISA" with the arrow) rather than the actual
  // merchant string from the user's plaid_transactions ("Scotialn Vsa").
  // Strict signature equality misses these cases. We need fuzzy
  // matching: find the actual merchants in the user's data whose names
  // overlap with the cardName keywords, derive their canonical
  // signatures, and write an alias pref for each one.
  const explicitSig = merchantSignature({
    merchantName: args.merchantSignature,
    name: args.merchantSignature,
    amount: 0,
  });
  const cardKeywords = args.cardName
    .toLowerCase()
    .split(/[\s\-_]+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ""))
    .filter((w) => w.length >= 3 && !["the", "and", "card", "visa", "vsa"].includes(w));
  // Note: 'visa' and 'vsa' are excluded from required keywords because they
  // appear on too many merchants; we need at least one distinctive name
  // (Scotia, Diners, Amex, etc.) AND optionally a card descriptor.

  // Scan plaid_transactions to find candidate matches.
  const txs = await db
    .select()
    .from(plaidTransactions)
    .where(eq(plaidTransactions.coupleId, ctx.householdId))
    .limit(500);
  const candidateSigs = new Set<string>();
  if (explicitSig) candidateSigs.add(explicitSig);
  for (const tx of txs) {
    const sig = merchantSignature(tx);
    const haystack = `${tx.merchantName ?? ""} ${tx.name ?? ""}`.toLowerCase();
    // Match if every cardKeyword appears in the merchant name. With
    // cardName="Scotia VISA" → keywords=["scotia"] (visa/vsa excluded
    // above). "Scotialn Vsa" haystack contains "scotialn" — does that
    // contain "scotia"? Yes (substring). Match.
    if (cardKeywords.length === 0) continue;
    const allMatch = cardKeywords.every((kw) => haystack.includes(kw));
    if (allMatch) candidateSigs.add(sig);
  }

  // Persist alias prefs for every candidate signature so future syncs
  // route them all to "transfers".
  for (const sig of candidateSigs) {
    await db
      .insert(userPreferences)
      .values({
        userId: ctx.userId,
        scope: "plaid",
        key: `alias_payment_to_card:${sig}`,
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
  }

  // Retroactive fix: any tx whose signature is in the candidate set OR
  // whose merchant name matches the cardKeywords gets flipped to
  // transfers. This catches both the "explicit signature" path and
  // future-stranger-named rows that nonetheless are clearly CC payments.
  let reclassifiedCount = 0;
  let reclassifiedAmount = 0;
  for (const tx of txs) {
    if (tx.ourCategory === "transfers") continue;
    const sig = merchantSignature(tx);
    const haystack = `${tx.merchantName ?? ""} ${tx.name ?? ""}`.toLowerCase();
    const sigMatch = candidateSigs.has(sig);
    const nameMatch =
      cardKeywords.length > 0 &&
      cardKeywords.every((kw) => haystack.includes(kw));
    if (!sigMatch && !nameMatch) continue;
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
    merchantSignature: [...candidateSigs].join(", ") || explicitSig,
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

// ─── Inverse handlers ──────────────────────────────────────────────────

async function runUnhideCategory(
  args: z.infer<typeof unhideCategorySchema>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const cat = args.category.trim().toLowerCase();
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
  const next = current.filter((c) => c.toLowerCase() !== cat);
  if (next.length === 0) {
    // Delete the row entirely so the prefs response stops carrying an
    // empty array. Keeps MemoryInspector tidy.
    await db
      .delete(userPreferences)
      .where(
        and(
          eq(userPreferences.userId, ctx.userId),
          eq(userPreferences.scope, "spend"),
          eq(userPreferences.key, "hide_categories"),
        ),
      );
  } else {
    await db
      .update(userPreferences)
      .set({ value: next, updatedAt: new Date() })
      .where(
        and(
          eq(userPreferences.userId, ctx.userId),
          eq(userPreferences.scope, "spend"),
          eq(userPreferences.key, "hide_categories"),
        ),
      );
  }
  return { kind: "category_unhidden", category: cat };
}

async function runRemovePaymentToOwnCardAlias(
  args: z.infer<typeof removePaymentToOwnCardAliasSchema>,
  ctx: ToolContext,
): Promise<ToolResult> {
  // Mirror markPaymentToOwnCard's matching logic so undo finds the same
  // rows. cardKeywords identifies WHICH alias prefs apply, then we
  // delete those prefs AND retroactively flip plaid_transactions back
  // to the freshly-derived mapPlaidCategory result.
  const cardKeywords = args.cardName
    .toLowerCase()
    .split(/[\s\-_]+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ""))
    .filter((w) => w.length >= 3 && !["the", "and", "card", "visa", "vsa"].includes(w));

  // Find aliased signatures where the cardName matches the stored value.
  const allPlaidPrefs = await db
    .select()
    .from(userPreferences)
    .where(
      and(
        eq(userPreferences.userId, ctx.userId),
        eq(userPreferences.scope, "plaid"),
      ),
    );
  const aliasPrefs = allPlaidPrefs.filter((p) =>
    p.key.startsWith("alias_payment_to_card:"),
  );
  const matchedKeys = aliasPrefs.filter((p) => {
    const storedCard = String(
      ((p.value as any) ?? {}).cardName ?? "",
    ).toLowerCase();
    return cardKeywords.length === 0
      ? false
      : cardKeywords.every((kw) => storedCard.includes(kw));
  });
  const unaliasedSignatures = new Set(
    matchedKeys.map((p) => p.key.slice("alias_payment_to_card:".length)),
  );

  // Delete the matched prefs.
  for (const p of matchedKeys) {
    await db
      .delete(userPreferences)
      .where(
        and(
          eq(userPreferences.userId, ctx.userId),
          eq(userPreferences.scope, "plaid"),
          eq(userPreferences.key, p.key),
        ),
      );
  }

  // Retroactive: any plaid_transaction currently sitting in "transfers"
  // whose live signature is in unaliasedSignatures gets re-classified
  // back through mapPlaidCategory with the merchant hints.
  const txs = await db
    .select()
    .from(plaidTransactions)
    .where(eq(plaidTransactions.coupleId, ctx.householdId))
    .limit(500);
  let restoredCount = 0;
  let restoredAmount = 0;
  // Lazy import mapPlaidCategory to avoid a circular hot-path import.
  const { mapPlaidCategory } = await import("../../plaid");
  for (const tx of txs) {
    const sig = merchantSignature(tx);
    if (!unaliasedSignatures.has(sig)) continue;
    if (tx.ourCategory !== "transfers") continue;
    const restoredCat = mapPlaidCategory(
      tx.plaidCategory as string[] | null,
      tx.personalFinanceCategory as { primary?: string; detailed?: string } | null,
      { name: tx.name, merchantName: tx.merchantName },
    );
    await db.transaction(async (txn) => {
      await txn
        .update(plaidTransactions)
        .set({ ourCategory: restoredCat })
        .where(eq(plaidTransactions.id, tx.id));
      if (tx.expenseId) {
        await txn
          .update(expenses)
          .set({ category: restoredCat })
          .where(eq(expenses.id, tx.expenseId));
      }
    });
    restoredCount++;
    restoredAmount += tx.amount;
  }

  return {
    kind: "payment_to_card_unaliased",
    cardName: args.cardName,
    restoredCount,
    restoredAmount,
  };
}

async function runUnpinFromHome(
  args: z.infer<typeof unpinFromHomeSchema>,
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
  const next = current.filter((c) => c.toLowerCase() !== tileKind);
  if (next.length === 0) {
    await db
      .delete(userPreferences)
      .where(
        and(
          eq(userPreferences.userId, ctx.userId),
          eq(userPreferences.scope, "today"),
          eq(userPreferences.key, "pinned_tiles"),
        ),
      );
  } else {
    await db
      .update(userPreferences)
      .set({ value: next, updatedAt: new Date() })
      .where(
        and(
          eq(userPreferences.userId, ctx.userId),
          eq(userPreferences.scope, "today"),
          eq(userPreferences.key, "pinned_tiles"),
        ),
      );
  }
  const labels: Record<string, string> = {
    subscriptions_overview: "Subscriptions overview",
    credit_health: "Credit health",
    spending_vs_avg: "Spending vs your average",
    upcoming_bills: "Upcoming bills",
    debt_breakdown: "Debt breakdown",
  };
  return {
    kind: "home_tile_unpinned",
    tileKind,
    label: labels[tileKind] ?? tileKind.replace(/_/g, " "),
  };
}

async function runUnsetOnboardingField(
  args: z.infer<typeof unsetOnboardingFieldSchema>,
  ctx: ToolContext,
): Promise<ToolResult> {
  await db
    .delete(userPreferences)
    .where(
      and(
        eq(userPreferences.userId, ctx.userId),
        eq(userPreferences.scope, "onboarding"),
        eq(userPreferences.key, args.field),
      ),
    );
  return { kind: "onboarding_field_unset", field: args.field };
}

async function runDeleteDream(
  args: z.infer<typeof deleteDreamSchema>,
  ctx: ToolContext,
): Promise<ToolResult | null> {
  const normalized = args.name.trim().toLowerCase();
  const matches = await db
    .select()
    .from(goals)
    .where(eq(goals.coupleId, ctx.householdId))
    .limit(50);
  const target = matches.find(
    (g) => g.name.trim().toLowerCase() === normalized,
  );
  if (!target) return null; // nothing to delete; tool is a no-op
  await db.delete(goals).where(eq(goals.id, target.id));
  return { kind: "dream_deleted", name: target.name };
}
