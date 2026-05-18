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
import { zodToJsonSchema } from "zod-to-json-schema";

import { db } from "../../db";
import {
  goals,
  plaidTransactions,
  expenses,
  userPreferences,
  merchantRules,
  guardianConversations,
  watchlistItems,
} from "../../../shared/schema";
import { enqueueScout } from "../scout/orchestrator";
import { and, eq, sql, inArray } from "drizzle-orm";
import {
  DEFAULT_FIXED_OBLIGATION_CATS,
  merchantSignature,
} from "../taxonomy";
import type { LLMToolDef } from "../llm/types";

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
  // Per-category headline override. Lets the user say "include loans"
  // (Lincoln car loan = real spending) or "exclude transfers" (Scotia
  // VISA payment = paying my own card). Has its own tool — not folded
  // into hide/unhide — because hide removes the category from the page
  // entirely; this just toggles whether it counts in the spend total.
  "setCategoryInclusion",
  // Per-merchant category override. "Move all my Lincoln transactions
  // from loans to subscriptions" — writes a merchant_rules row so
  // future syncs land in the new category, and (when retroactive=true)
  // updates every existing tx + linked expense in one batch.
  "setMerchantCategory",
  // Per-merchant display-name override. "Rename LOAN PYMT to Mortgage"
  // — replaces Plaid's cryptic descriptor with a human-readable name
  // across Spend, Categories, Pending, etc. Persists on merchant_rules
  // so future syncs of the same merchant pick up the new name.
  "renameMerchant",
  // Scout / wait — Tilly's only path to live retailer data. Without
  // these she hits her knowledge ceiling on "when does X go on sale?"
  // and "find me cheaper Y" and incorrectly says "I can't see that."
  // findOptions enqueues a find-mode scout (cheaper alternatives,
  // secondhand inventory). predictSalePrice enqueues a wait-mode scout
  // (sale history + should-I-wait verdict). Both insert their own
  // guardian_conversations row so the mobile chat history renders a
  // scout/wait card without Tilly having to write one in her reply.
  "findOptions",
  "predictSalePrice",
  // Sprint A — habit hook. The user says "I'm thinking of buying X" or
  // "I've been eyeing the Switch 2" and Tilly saves it to a watchlist
  // she follows up on. Defends against the impulse-checkout failure
  // mode where desire fires → user buys before pausing.
  "addToWatchlist",
  // Mirror of markPaymentToOwnCard for the INCOME side. The user gets
  // a deposit (employer reimbursement, business expense float, parent's
  // transfer to cover rent, etc.) that Plaid sees as income, but it's
  // a wash — they immediately transfer it back out to pay a card or
  // forward it on. Flipping it from "income" → "transfers" stops it
  // inflating the savings rate + breathing-room math.
  "markIncomeAsTransfer",
  // Smart Tilly v2 audit fix (2026-05-16). User-driven taxonomy: lets
  // the user say "taxes aren't recurring, move them to one-off" and
  // Tilly actually does it. Writes a bucket override to
  // user_preferences; computeMonthFlow reads the override before
  // falling back to the hardcoded RECURRING_CATS / ONE_OFF_CATS sets.
  "setCategoryBucket",
  // Inverse: detector found a Plaid inflow that's miscategorized
  // (CSA Group MSP showing as 'credit_adjustment'). Tilly fires this
  // when the user confirms — writes the alias prefand retroactively
  // moves matching plaid_transactions to ourCategory='income'. Boosts
  // the income side of every cashflow calc immediately.
  "flagAsIncome",
  // Override the cadence the annual_bill_upcoming detector inferred.
  // TD Visa Preauth Pymt got flagged 'semiannual' from sparse 13mo
  // history when it's really a monthly CC payment. User says "that's
  // monthly not semiannual" → Tilly writes the override so the
  // calendar stops surfacing it as an upcoming surprise.
  "setMerchantCadence",
  // 2026-05-16 follow-up fix. The income_classification_gap detector
  // kept flagging recurring inflows that were ALREADY correctly
  // bucketed as transfers (TD Trust Toronto, Preauthorized Payment,
  // Thank You TD Canada Trust — all CC payment wash transactions).
  // User said "those are credit card payments" → Tilly fired
  // markPaymentToOwnCard which correctly did nothing (rows already
  // transfers) but then falsely claimed success. The right answer is
  // to mark them as DISMISSED so the detector stops surfacing them.
  "dismissAsNotIncome",
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
      kind: "income_aliased_to_transfer";
      merchantSignature: string;
      sourceName: string;
      // How many existing income rows flipped to "transfers"
      reclassifiedCount: number;
      // Approx $ that no longer counts as income.
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
    }
  | {
      kind: "category_inclusion_set";
      category: string;
      includeInSpend: boolean;
      // What changed — defaults are loans/taxes/transfers/fees=excluded,
      // everything else=included. We surface the override so the UI can
      // show "now counted toward your spend total" / "now treated as
      // money flow only" without re-deriving.
      previouslyIncluded: boolean;
    }
  | {
      kind: "merchant_category_set";
      merchantSignature: string;
      displayName: string;
      fromCategory: string;
      toCategory: string;
      // How many existing rows the retroactive flag updated. 0 when the
      // user opted out of retroactive or there were no past matches.
      reclassifiedCount: number;
    }
  | {
      kind: "merchant_renamed";
      merchantSignature: string;
      previousName: string;
      newName: string;
      // How many plaid_transactions + linked expenses were updated
      // retroactively. 0 when no past rows matched the signature/keyword
      // search (the override is still written to merchant_rules so future
      // syncs pick it up).
      renamedCount: number;
    }
  | {
      kind: "scout_started";
      mode: "find";
      jobId: string;
      query: string;
      location: string | null;
    }
  | {
      kind: "wait_started";
      mode: "wait";
      jobId: string;
      query: string;
      location: string | null;
    }
  | {
      kind: "watchlist_item_added";
      itemId: string;
      name: string;
      estimatedPrice: number | null;
    }
  | {
      kind: "category_bucket_set";
      category: string;
      previousBucket:
        | "recurring"
        | "one_off"
        | "variable"
        | "income"
        | "adjustment";
      newBucket:
        | "recurring"
        | "one_off"
        | "variable"
        | "income"
        | "adjustment";
    }
  | {
      kind: "income_flagged";
      merchantSignature: string;
      sourceName: string;
      reclassifiedCount: number;
      reclassifiedAmount: number;
    }
  | {
      kind: "merchant_cadence_set";
      merchantSignature: string;
      sourceName: string;
      previousCadence: string | null;
      newCadence:
        | "monthly"
        | "biweekly"
        | "weekly"
        | "quarterly"
        | "semiannual"
        | "annual"
        | "never";
    }
  | {
      kind: "income_dismissed";
      merchantSignature: string;
      sourceName: string;
      /** How many candidate merchants got dismissed in this call (1
       * usually, but if the user names a fuzzy term we may match
       * multiple recurring inflows). */
      dismissedCount: number;
      reason: string | null;
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
const setCategoryInclusionSchema = z.object({
  category: z.string().min(1),
  includeInSpend: z.boolean(),
});

const setMerchantCategorySchema = z.object({
  merchantSignature: z.string().min(1),
  category: z.string().min(1),
  /** Default true — past transactions for this merchant get moved too.
   * When false, only the merchant_rules override is written and future
   * syncs apply it; existing rows stay where they are. */
  retroactive: z.boolean().optional(),
});

const renameMerchantSchema = z.object({
  /** Lowercased simplified merchant key OR a fuzzy match string from the
   * user's message. Tilly extracts what the user pointed at ("LOAN PYMT",
   * "scotialn vsa"); the handler resolves to actual signatures in this
   * household via signature equality + name keyword fallback, same shape
   * as markPaymentToOwnCard. */
  merchantSignature: z.string().min(1),
  /** New display name as the user wants to see it. Preserved verbatim
   * (with leading/trailing whitespace trimmed) — no title-casing, no
   * canonicalization. "Mortgage", "Spotify (Family)", "Mom — rent share". */
  displayName: z.string().min(1),
  reason: z.string().optional(),
});

const findOptionsSchema = z.object({
  query: z.string().min(1),
  /** Optional city to scope local secondhand inventory (Marketplace,
   * Kijiji). Falls back to the user's saved profile city if omitted. */
  location: z.string().optional(),
});

const predictSalePriceSchema = z.object({
  query: z.string().min(1),
  /** Optional city to scope regional pricing/availability. */
  location: z.string().optional(),
});

const addToWatchlistSchema = z.object({
  name: z.string().min(1),
  estimatedPrice: z.number().positive().optional(),
});

const BUCKET_ENUM = z.enum([
  "recurring",
  "one_off",
  "variable",
  "income",
  "adjustment",
]);

const CADENCE_ENUM = z.enum([
  "monthly",
  "biweekly",
  "weekly",
  "quarterly",
  "semiannual",
  "annual",
  "never",
]);

const setCategoryBucketSchema = z.object({
  /** Lowercase category as seen in plaid_transactions.ourCategory. */
  category: z.string().min(1),
  /** Where it should live in the home decomposition + projection math. */
  bucket: BUCKET_ENUM,
  reason: z.string().optional(),
});

const flagAsIncomeSchema = z.object({
  /** Same shape as markIncomeAsTransfer.sourceName — fuzzy-matched
   * against merchantName / name on plaid_transactions. */
  sourceName: z.string().min(1),
  merchantSignature: z.string().optional(),
  reason: z.string().optional(),
});

const dismissAsNotIncomeSchema = z.object({
  /** User's description of the merchant — e.g. "TD Trust Toronto",
   * "preauthorized payment", "Thank You TD Canada Trust", or "all of
   * them" when the detector surfaced a batch. Fuzzy-matched against
   * the income_classification_gap candidates. */
  sourceName: z.string().min(1),
  reason: z.string().optional(),
});

const setMerchantCadenceSchema = z.object({
  /** Fuzzy match against merchantName / name (same as the other
   * merchant-targeting tools). */
  sourceName: z.string().min(1),
  cadence: CADENCE_ENUM,
  reason: z.string().optional(),
});

const markIncomeAsTransferSchema = z.object({
  /** The user-described source of the deposit ("TD reimbursement",
   * "Acme expense reimbursement", "Mom") — keywords get extracted and
   * fuzzy-matched against income rows in plaid_transactions, same as
   * markPaymentToOwnCard does for card payments. */
  sourceName: z.string().min(1),
  /** Optional explicit merchant signature when the user has already
   * referenced a specific tx (rare; sourceName usually carries it). */
  merchantSignature: z.string().optional(),
  reason: z.string().optional(),
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
  setCategoryInclusion: setCategoryInclusionSchema,
  setMerchantCategory: setMerchantCategorySchema,
  renameMerchant: renameMerchantSchema,
  findOptions: findOptionsSchema,
  predictSalePrice: predictSalePriceSchema,
  addToWatchlist: addToWatchlistSchema,
  markIncomeAsTransfer: markIncomeAsTransferSchema,
  setCategoryBucket: setCategoryBucketSchema,
  flagAsIncome: flagAsIncomeSchema,
  setMerchantCadence: setMerchantCadenceSchema,
  dismissAsNotIncome: dismissAsNotIncomeSchema,
};

// ─── Tool descriptions for the LLM ──────────────────────────────────────
// These ride along to the model in the `tools` parameter. Treat them as
// the SOURCE OF TRUTH for "when should Tilly call this tool" — the
// persona prompt no longer enumerates tool semantics, the model reads
// them from here. Be specific about cue phrases and surgical-vs-nuclear
// guidance.

const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  createDream:
    "Create a savings goal / 'dream' for the user. Trigger when they ask you to set up / track / save for something. " +
    "If the user gave only a name (e.g. 'Switch 2'), estimate targetAmount from real-world prices " +
    "(Switch 2 ≈ 650, MacBook ≈ 1500, Barcelona trip ≈ 2000). Always confirm in plain language: " +
    "'Done. I added a Switch 2 dream — $650 target.'",
  markPaymentToOwnCard:
    "SURGICAL FIX. Use when the user clarifies that a transaction Tilly was treating as a 'loan' or " +
    "expense is actually them paying off their own credit card balance (which they've also synced as " +
    "a separate account, so the real spending is being tracked twice). Triggers: 'scotia under loans " +
    "is my credit card bill', 'that visa payment is my own card', 'stop counting these as spending'. " +
    "merchantSignature: lowercased simplified merchant key (e.g. 'scotialn vsa'). cardName: the " +
    "card description ('Scotia VISA'). Retroactively reclassifies every matching past transaction.",
  hideCategoryFromSpend:
    "DESTRUCTIVE — USE SPARINGLY. Hides an entire category from the user's Spend page. ONLY fire when " +
    "the user explicitly says 'hide X / never show me X / I don't want to see Y in my breakdown'. " +
    "NEVER use this as a workaround for a categorization problem (e.g. 'this Scotia loan shouldn't " +
    "be there' is a job for markPaymentToOwnCard, not this tool). When you do fire it, mention the " +
    "user can ask you to bring it back any time.",
  pinToHome:
    "Pin a tile to the user's Today (home) screen. Triggers: 'show my subscriptions on home', " +
    "'pin credit health to today', 'add upcoming bills to the front page'. Available tileKind " +
    "values: subscriptions_overview, credit_health, spending_vs_avg, upcoming_bills, debt_breakdown.",
  setOnboardingField:
    "Capture a fact about the user that maps to a known onboarding field. Triggers: 'I'm 38' " +
    "(ageBand=18-24/25-34/35-44/45+), 'I support 4 people' (dependents=4), 'I live in Toronto' " +
    "(city=Toronto), 'I'm salaried' (employmentType=salaried/student/self-employed/freelance/etc), " +
    "'I go to Laurier' (schoolName=Laurier). Fire MULTIPLE setOnboardingField calls if the user " +
    "mentions multiple fields in one message. Acknowledge: 'Noted — 4 people, Toronto, salaried.'",
  unhideCategory:
    "INVERSE of hideCategoryFromSpend. Bring a hidden category back onto the Spend page. Triggers: " +
    "'bring loans back', 'stop hiding loans', 'show loans on Spend again', 'unhide X', 'don't hide X anymore'. " +
    "category: the name they want visible (lowercased; 'loan' / 'loans' → 'loans').",
  removePaymentToOwnCardAlias:
    "INVERSE of markPaymentToOwnCard. Stop treating a card's payments as transfers — count them as " +
    "spending again. Triggers: 'stop treating Scotia as a credit-card payment', 'bring back Scotia VSA " +
    "as spending', 'undo the Scotia alias', 'count my Visa payments again'. cardName: same description " +
    "used originally ('Scotia VISA', 'TD Visa').",
  unpinFromHome:
    "INVERSE of pinToHome. Triggers: 'unpin subscriptions overview', 'remove credit health from Today', " +
    "'don't show the X tile anymore'. Same tileKind values as pinToHome.",
  unsetOnboardingField:
    "INVERSE of setOnboardingField. Clear a previously-captured fact. Triggers: 'forget I'm 38', " +
    "'I'm not in Toronto anymore — clear that', 'unset my dependents', 'reset my employment type'. " +
    "field: same enum as setOnboardingField.",
  deleteDream:
    "Delete a savings goal the user no longer wants to track. Triggers: 'delete the Switch 2 dream', " +
    "'remove my AirPods goal', 'I don't want to track that anymore', 'cancel the Barcelona dream'. " +
    "name: dream name as the user references it (case-insensitive match server-side).",
  setCategoryInclusion:
    "Toggle whether a category counts toward the headline spend total + bars. " +
    "Defaults: loans, taxes, transfers, fees are EXCLUDED (treated as money flow). " +
    "Use this when the user wants to override the default — e.g. 'my Lincoln car " +
    "loan should count as monthly spending' (loans → includeInSpend=true), or " +
    "'don't count subscriptions in my spend' (subscriptions → includeInSpend=false). " +
    "DIFFERENT from hideCategoryFromSpend: this keeps the category visible but " +
    "moves it between the WHERE IT GOES section (true) and MONEY FLOW section " +
    "(false). category: the category name (loans, taxes, transfers, fees, " +
    "subscriptions, restaurants, etc., lowercased). includeInSpend: true to add " +
    "to spend, false to treat as money flow.",
  setMerchantCategory:
    "Move a specific merchant's transactions from one category to another. Use " +
    "for surgical fixes when ONE merchant is mis-categorized but the rest of the " +
    "category is fine. Triggers: 'move my Lincoln transactions to subscriptions', " +
    "'recategorize Doordash as restaurants', 'put Spotify under entertainment'. " +
    "merchantSignature: lowercased simplified merchant key (e.g. 'lincoln afs ca apy', " +
    "'doordash', 'spotify'). category: the destination category name. retroactive: " +
    "default true — past transactions for this merchant get moved too.",
  renameMerchant:
    "Rename a merchant from Plaid's cryptic descriptor to something readable. " +
    "Use whenever the user points at a transaction label and tells you what it " +
    "actually is — even if the user doesn't say the word 'rename'. Triggers: " +
    "'rename LOAN PYMT to Mortgage', 'call SCOTIALN VSA Scotia Visa', 'that's " +
    "really my mortgage', 'LOAN PYMT is around 2900 every month, it's my " +
    "mortgage', 'call it Rogers internet', 'name that one Mom rent'. The " +
    "user identifying what a transaction IS = a rename request — fire this " +
    "tool, don't tell them to do it on the Transactions screen. " +
    "merchantSignature: the merchant string the user pointed at (lowercased; " +
    "the handler fuzzy-matches against the user's actual transactions, same as " +
    "markPaymentToOwnCard). displayName: the new readable name preserved " +
    "verbatim ('Mortgage', 'Spotify Family', 'Mom — rent share'). " +
    "Retroactively updates every existing tx + linked expense, and future " +
    "syncs of the same merchant pick up the new name automatically. NOTE: " +
    "rename is about the LABEL only — if the category is also wrong, fire " +
    "renameMerchant AND setMerchantCategory in the same turn (e.g. 'this is " +
    "my mortgage, around 2900/month' → rename to Mortgage + move to housing).",
  findOptions:
    "Live web search for ALTERNATIVES — cheaper versions, secondhand " +
    "inventory, similar products. Use whenever the user is shopping for a " +
    "thing and your reply would otherwise be 'I can't see retailer data.' " +
    "Triggers: 'find me a cheaper version of X', 'is there a used Y near " +
    "me', 'where can I get Z under $N'. query: a short search phrase the " +
    "scout will run ('Switch 2 used Waterloo $400', 'AirPods Pro 2 " +
    "refurbished'). location: optional city — defaults to the user's " +
    "saved city. NEVER respond 'I don't have retailer data' on a shopping " +
    "question — call this tool instead.",
  predictSalePrice:
    "Live web search for SALE HISTORY + a should-I-wait verdict. Use when " +
    "the user asks about future or seasonal pricing. Triggers: 'when will X " +
    "go on sale', 'should I wait for Black Friday on Y', 'is this a good " +
    "price for Z right now'. query: short phrase including the product " +
    "('Aura ring sale history', 'Aritzia winter coat $200'). The scout " +
    "returns a structured verdict (waitUntil / expectedSaving / sources). " +
    "Same rule: NEVER say 'I can't see retailer pricing' — call this tool.",
  addToWatchlist:
    "Save something the user is THINKING about buying so Tilly can " +
    "follow up later. This is the core habit-building tool: the user " +
    "says 'I've been eyeing X' / 'thinking about Y' / 'I want a Z' / " +
    "'might get the new ___' — fire this even if no purchase is imminent. " +
    "name: short item name as the user says it ('Switch 2', 'Aritzia " +
    "coat', 'Doc Martens'). estimatedPrice: include if the user mentioned " +
    "a price or you have a strong well-known estimate (Switch 2 ≈ 650, " +
    "MacBook ≈ 1500). Confirm in plain language: 'Got it. Switch 2 on " +
    "your watchlist — I'll check in.' DO NOT call this for items the " +
    "user is asking about for someone else, or items they've already " +
    "purchased.",
  markIncomeAsTransfer:
    "SURGICAL FIX. INCOME-SIDE INVERSE of markPaymentToOwnCard. Use when " +
    "the user clarifies that a deposit Tilly is treating as income is " +
    "actually a wash — money they immediately forward on (employer expense " +
    "reimbursement that they transfer to pay a corporate card, a parent's " +
    "rent contribution that passes through, a tax refund they're not " +
    "spending). Triggers: 'that $4000 deposit isn't real income, I move it " +
    "to my company card', 'the TD reimbursement isn't pay, stop counting " +
    "it', 'my employer's expense float should be a transfer, not income'. " +
    "sourceName: the user's description of the source ('TD reimbursement', " +
    "'Acme expense float', 'parents'). Tilly will fuzzy-match this against " +
    "the income merchants in their data and flip every match from 'income' " +
    "to 'transfers' retroactively + alias them for future syncs. NEVER " +
    "fire this for actual paychecks the user is happy to count.",
  setCategoryBucket:
    "TAXONOMY OVERRIDE. The home decomposes spend into recurring (subs, " +
    "mortgage, insurance, utilities), one-off (taxes, fees, loans), and " +
    "variable. When the user disputes a placement — 'taxes aren't " +
    "recurring, they're one-off', 'put loans under recurring because " +
    "they hit every month', 'subscriptions should be variable' — fire " +
    "this. category: lowercased ourCategory ('taxes', 'loans', etc.). " +
    "bucket: where it should live. Confirm: 'Done — taxes now show under " +
    "one-off on Today.'",
  flagAsIncome:
    "INCOME GAP FIX. When the home or you notice a recurring inflow " +
    "currently bucketed as transfer / credit_adjustment / other that " +
    "the user confirms IS real income (paycheck variant, side gig, " +
    "regular gift), fire this. Triggers: 'CSA Group MSP is my paycheck', " +
    "'the $5k from TD is a payroll deposit, not a transfer', 'preauth " +
    "payment is my salary'. sourceName: the user's description of the " +
    "deposit source. Retroactively flips matching plaid_transactions to " +
    "ourCategory='income' and aliases the merchant for future syncs. " +
    "Real income shows up immediately in monthly take-home + projection.",
  setMerchantCadence:
    "CADENCE OVERRIDE. The annual bill calendar guesses cadence from " +
    "trailing 13mo of high-value charges. With sparse data it sometimes " +
    "miscalls a monthly CC payment as semiannual, or vice versa. When " +
    "the user says 'TD Visa Preauth Pymt is monthly not semiannual', " +
    "'the Scotialine $750 hits every month', or 'taxes are quarterly " +
    "not semiannual', fire this. sourceName: the merchant the user " +
    "named. cadence: their correction. Detector reads the override " +
    "first on next call.",
  dismissAsNotIncome:
    "DISMISS A FALSE INCOME SUGGESTION. The income_classification_gap " +
    "detector surfaces recurring inflows that LOOK like income but might " +
    "not be (often CC payment wash transactions, paying yourself back, " +
    "Plaid mirroring the same transaction across linked accounts). When " +
    "the user confirms the suggestion is wrong — 'those are credit card " +
    "payments', 'that's me paying my Visa', 'no, that's not income', " +
    "'stop flagging Preauthorized Payment', 'dismiss those' — fire this. " +
    "sourceName: the merchant they named, or 'all' / 'all of them' when " +
    "they want to dismiss every current candidate. Writes a pref the " +
    "detector reads to suppress future suggestions. DO NOT use this for " +
    "fixing categorization — use flagAsIncome (real income) or " +
    "markIncomeAsTransfer (income → wash) for those.",
};

/**
 * Build the LLMToolDef[] payload for the OpenAI-compatible `tools`
 * parameter. JSON Schema is derived from each tool's zod schema, then
 * stripped of provider-incompatible keywords (same shaping as
 * structuredOutput uses for response_format). Re-derived on each call;
 * the cost is tiny vs. the tradeoff of letting prompts go stale.
 */
export function getToolDefs(): LLMToolDef[] {
  return TOOL_NAMES.map((name) => {
    const json = zodToJsonSchema(TOOL_SCHEMAS[name], { name, $refStrategy: "none" }) as any;
    let body: Record<string, unknown> = json;
    if (json.definitions && json.definitions[name]) {
      body = json.definitions[name];
    } else if (json.$ref && json.definitions) {
      body = json.definitions[name] ?? json;
    }
    stripUnsupportedToolKeys(body);
    return {
      name,
      description: TOOL_DESCRIPTIONS[name],
      parameters: body,
    };
  });
}

const TOOL_UNSUPPORTED_KEYS = [
  "$schema",
  "default",
  "minItems",
  "maxItems",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "minLength",
  "maxLength",
  "multipleOf",
  "format",
  "pattern",
];

function stripUnsupportedToolKeys(s: Record<string, unknown>) {
  if (!s || typeof s !== "object") return;
  for (const k of TOOL_UNSUPPORTED_KEYS) delete (s as any)[k];
  if ((s as any).additionalProperties && typeof (s as any).additionalProperties !== "boolean") {
    delete (s as any).additionalProperties;
  }
  if ((s as any).properties) {
    for (const k of Object.keys((s as any).properties)) {
      stripUnsupportedToolKeys((s as any).properties[k]);
    }
  }
  if ((s as any).items) stripUnsupportedToolKeys((s as any).items);
  for (const v of ["anyOf", "oneOf", "allOf"]) {
    const arr = (s as any)[v];
    if (Array.isArray(arr)) for (const sub of arr) stripUnsupportedToolKeys(sub);
  }
}

export function isKnownToolName(n: string): n is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(n);
}

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
    case "setCategoryInclusion":
      return await runSetCategoryInclusion(
        parsed.data as z.infer<typeof setCategoryInclusionSchema>,
        ctx,
      );
    case "setMerchantCategory":
      return await runSetMerchantCategory(
        parsed.data as z.infer<typeof setMerchantCategorySchema>,
        ctx,
      );
    case "renameMerchant":
      return await runRenameMerchant(
        parsed.data as z.infer<typeof renameMerchantSchema>,
        ctx,
      );
    case "findOptions":
      return await runFindOptions(
        parsed.data as z.infer<typeof findOptionsSchema>,
        ctx,
      );
    case "predictSalePrice":
      return await runPredictSalePrice(
        parsed.data as z.infer<typeof predictSalePriceSchema>,
        ctx,
      );
    case "addToWatchlist":
      return await runAddToWatchlist(
        parsed.data as z.infer<typeof addToWatchlistSchema>,
        ctx,
      );
    case "markIncomeAsTransfer":
      return await runMarkIncomeAsTransfer(
        parsed.data as z.infer<typeof markIncomeAsTransferSchema>,
        ctx,
      );
    case "setCategoryBucket":
      return await runSetCategoryBucket(
        parsed.data as z.infer<typeof setCategoryBucketSchema>,
        ctx,
      );
    case "flagAsIncome":
      return await runFlagAsIncome(
        parsed.data as z.infer<typeof flagAsIncomeSchema>,
        ctx,
      );
    case "setMerchantCadence":
      return await runSetMerchantCadence(
        parsed.data as z.infer<typeof setMerchantCadenceSchema>,
        ctx,
      );
    case "dismissAsNotIncome":
      return await runDismissAsNotIncome(
        parsed.data as z.infer<typeof dismissAsNotIncomeSchema>,
        ctx,
      );
  }
}

/**
 * Income → transfers alias. Mirrors runMarkPaymentToOwnCard but
 * targets `ourCategory === 'income'` rows instead of card-payment
 * outflows. Persists `alias_income_to_transfer:<sig>` prefs so future
 * syncs route the same merchant to transfers, and retroactively
 * flips matching existing rows.
 *
 * NOTE: income rows don't have linked expenses (the sync handler
 * explicitly skips the mirror for ourCategory='income'), so we only
 * update plaid_transactions — no expenses table cascade needed.
 */
async function runMarkIncomeAsTransfer(
  args: z.infer<typeof markIncomeAsTransferSchema>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const explicitSig = args.merchantSignature
    ? merchantSignature({
        merchantName: args.merchantSignature,
        name: args.merchantSignature,
        amount: 0,
      })
    : "";
  const sourceKeywords = args.sourceName
    .toLowerCase()
    .split(/[\s\-_]+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ""))
    // Drop noise words that match too many merchants; we need at
    // least one distinctive token (employer name, bank, "td", "rbc").
    .filter(
      (w) =>
        w.length >= 3 &&
        !["the", "and", "for", "from", "deposit", "income", "payment"].includes(w),
    );

  // Scan plaid_transactions for INCOME rows whose merchant name overlaps
  // with the sourceKeywords. We constrain to ourCategory='income' so a
  // typo like "td" doesn't accidentally flip every TD outflow too.
  const incomeTx = await db
    .select()
    .from(plaidTransactions)
    .where(
      and(
        eq(plaidTransactions.coupleId, ctx.householdId),
        eq(plaidTransactions.ourCategory, "income"),
      ),
    )
    .limit(500);
  const candidateSigs = new Set<string>();
  if (explicitSig) candidateSigs.add(explicitSig);
  for (const tx of incomeTx) {
    const sig = merchantSignature(tx);
    const haystack = `${tx.merchantName ?? ""} ${tx.name ?? ""}`.toLowerCase();
    if (sourceKeywords.length === 0) continue;
    const allMatch = sourceKeywords.every((kw) => haystack.includes(kw));
    if (allMatch) candidateSigs.add(sig);
  }

  // Persist alias prefs for each candidate signature.
  for (const sig of candidateSigs) {
    await db
      .insert(userPreferences)
      .values({
        userId: ctx.userId,
        scope: "plaid",
        key: `alias_income_to_transfer:${sig}`,
        value: {
          sourceName: args.sourceName,
          reason: args.reason ?? "user-confirmed wash deposit",
          since: new Date().toISOString(),
        },
      })
      .onConflictDoUpdate({
        target: [userPreferences.userId, userPreferences.scope, userPreferences.key],
        set: {
          value: {
            sourceName: args.sourceName,
            reason: args.reason ?? "user-confirmed wash deposit",
            since: new Date().toISOString(),
          },
          updatedAt: new Date(),
        },
      });
  }

  // Retroactively flip matching income rows. Two match-conditions: the
  // explicit signature path OR a name-keyword match (catches future
  // stranger-named rows that ARE the same source). We re-query the
  // full income tx set because the keyword path needs the same name
  // search we ran above.
  let reclassifiedCount = 0;
  let reclassifiedAmount = 0;
  for (const tx of incomeTx) {
    const sig = merchantSignature(tx);
    const haystack = `${tx.merchantName ?? ""} ${tx.name ?? ""}`.toLowerCase();
    const sigMatch = candidateSigs.has(sig);
    const nameMatch =
      sourceKeywords.length > 0 &&
      sourceKeywords.every((kw) => haystack.includes(kw));
    if (!sigMatch && !nameMatch) continue;
    await db
      .update(plaidTransactions)
      .set({ ourCategory: "transfers" })
      .where(eq(plaidTransactions.id, tx.id));
    reclassifiedCount++;
    reclassifiedAmount += Math.abs(tx.amount);
  }

  return {
    kind: "income_aliased_to_transfer",
    merchantSignature: [...candidateSigs].join(", ") || explicitSig,
    sourceName: args.sourceName,
    reclassifiedCount,
    reclassifiedAmount: Math.round(reclassifiedAmount),
  };
}

async function runAddToWatchlist(
  args: z.infer<typeof addToWatchlistSchema>,
  ctx: ToolContext,
): Promise<ToolResult | null> {
  const name = args.name.trim();
  if (!name) return null;
  // De-dupe — if the same name (case-insensitive) is already active,
  // just return that row instead of stacking duplicates. The user
  // saying "thinking about Switch 2" three times shouldn't produce
  // three rows.
  const existing = await db
    .select()
    .from(watchlistItems)
    .where(
      and(
        eq(watchlistItems.householdId, ctx.householdId),
        eq(watchlistItems.status, "active"),
      ),
    )
    .limit(50);
  const matched = existing.find(
    (r) => r.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (matched) {
    // Optionally bump estimatedPrice if the new call had it and the
    // stored row didn't.
    if (
      args.estimatedPrice != null &&
      matched.estimatedPrice == null
    ) {
      await db
        .update(watchlistItems)
        .set({ estimatedPrice: args.estimatedPrice })
        .where(eq(watchlistItems.id, matched.id));
    }
    return {
      kind: "watchlist_item_added",
      itemId: matched.id,
      name: matched.name,
      estimatedPrice: matched.estimatedPrice ?? args.estimatedPrice ?? null,
    };
  }
  const [row] = await db
    .insert(watchlistItems)
    .values({
      userId: ctx.userId,
      householdId: ctx.householdId,
      name,
      estimatedPrice: args.estimatedPrice ?? null,
    })
    .returning();
  return {
    kind: "watchlist_item_added",
    itemId: row.id,
    name: row.name,
    estimatedPrice: row.estimatedPrice ?? null,
  };
}

async function runScoutLike(
  args: { query: string; location?: string | undefined },
  ctx: ToolContext,
  mode: "find" | "wait",
): Promise<ToolResult> {
  const location = args.location?.trim() || null;
  console.log(
    `[tool:${mode === "wait" ? "predictSalePrice" : "findOptions"}] enqueue userId=${ctx.userId} query="${args.query.trim().slice(0, 80)}" location=${location ?? "null"}`,
  );
  // Block until the scout finishes. Earlier attempt used
  // awaitCompletion=false (fire-and-forget) but Vercel shut down the
  // function instance the moment the HTTP response returned — the
  // processScoutJob promise never ran. Default true matches the
  // existing user-tap scout endpoint (mountChatScoutLike). Chat reply
  // takes 10-25s now but the scout card lands populated, and the
  // assistant's final text reply references real results.
  const jobId = await enqueueScout({
    userId: ctx.userId,
    householdId: ctx.householdId,
    query: args.query.trim(),
    location,
    mode,
  });
  console.log(
    `[tool:${mode === "wait" ? "predictSalePrice" : "findOptions"}] jobId=${jobId} (awaited)`,
  );
  // Insert the conversation row that the mobile history renderer turns
  // into a scout/wait card. Same shape as the user-initiated POST
  // /api/tilly/chat/scout endpoint produces — keeps client rendering
  // identical whether the user tapped a button or Tilly fired the tool.
  const placeholder =
    mode === "wait"
      ? `Looking up sale history for ${args.query.trim()}. One sec.`
      : `On it — I'll check ${args.query.trim()}. Give me a minute.`;
  await db.insert(guardianConversations).values({
    coupleId: ctx.householdId,
    userId: ctx.userId,
    role: "guardian",
    content: placeholder,
    intent: mode === "wait" ? "wait" : "scout",
    metadata: { jobId, query: args.query.trim(), location, sourceMessageId: null },
  });
  return mode === "wait"
    ? {
        kind: "wait_started",
        mode: "wait",
        jobId,
        query: args.query.trim(),
        location,
      }
    : {
        kind: "scout_started",
        mode: "find",
        jobId,
        query: args.query.trim(),
        location,
      };
}

async function runFindOptions(
  args: z.infer<typeof findOptionsSchema>,
  ctx: ToolContext,
): Promise<ToolResult> {
  return runScoutLike(args, ctx, "find");
}

async function runPredictSalePrice(
  args: z.infer<typeof predictSalePriceSchema>,
  ctx: ToolContext,
): Promise<ToolResult> {
  return runScoutLike(args, ctx, "wait");
}

async function runSetMerchantCategory(
  args: z.infer<typeof setMerchantCategorySchema>,
  ctx: ToolContext,
): Promise<ToolResult | null> {
  const sig = args.merchantSignature.trim().toLowerCase();
  const newCat = args.category.trim().toLowerCase();
  const retroactive = args.retroactive !== false;

  // 1. Snapshot what's currently under this signature so we can report
  // {fromCategory, displayName, reclassifiedCount} accurately.
  const matches = await db
    .select()
    .from(plaidTransactions)
    .where(
      and(
        eq(plaidTransactions.coupleId, ctx.householdId),
        eq(plaidTransactions.signature, sig),
      ),
    )
    .limit(500);
  const fromCategory =
    matches.find((m) => m.ourCategory)?.ourCategory?.toLowerCase() || "other";
  const displayName =
    matches.find((m) => m.merchantName)?.merchantName ||
    matches[0]?.name ||
    sig;

  // 2. Upsert merchant_rules so future syncs land in the new category
  // via the existing tag_only branch. Don't flip autoAccept — a user
  // recategorising one merchant shouldn't auto-accept all future
  // charges from them.
  const existing = await db
    .select()
    .from(merchantRules)
    .where(
      and(
        eq(merchantRules.coupleId, ctx.householdId),
        eq(merchantRules.signature, sig),
      ),
    )
    .limit(1);
  if (existing[0]) {
    await db
      .update(merchantRules)
      .set({
        category: newCat,
        lastMerchant: displayName,
        source: "user_moved",
        updatedAt: new Date(),
      })
      .where(eq(merchantRules.id, existing[0].id));
  } else {
    await db.insert(merchantRules).values({
      coupleId: ctx.householdId,
      signature: sig,
      lastMerchant: displayName,
      category: newCat,
      autoAccept: false,
      autoIgnore: false,
      hitCount: 0,
      ignoreCount: 0,
      source: "user_moved",
    });
  }

  // 3. Retroactive update — move every existing plaid_tx + linked
  // expense for this signature into the new category. The user almost
  // always wants this (no point in moving Lincoln "from now on" if last
  // month's Lincoln still says loans).
  let reclassifiedCount = 0;
  if (retroactive && matches.length > 0) {
    const ids = matches.map((m) => m.id);
    await db
      .update(plaidTransactions)
      .set({ ourCategory: newCat })
      .where(inArray(plaidTransactions.id, ids));
    const expenseIds = matches.map((m) => m.expenseId).filter(Boolean) as string[];
    if (expenseIds.length) {
      await db
        .update(expenses)
        .set({ category: newCat })
        .where(inArray(expenses.id, expenseIds));
    }
    reclassifiedCount = matches.length;
  }

  return {
    kind: "merchant_category_set",
    merchantSignature: sig,
    displayName,
    fromCategory,
    toCategory: newCat,
    reclassifiedCount,
  };
}

/**
 * Per-merchant display-name override. Resolves the merchant the user
 * pointed at via the same fuzzy-match shape as markPaymentToOwnCard:
 * (1) the user's string lowercased+normalized into a signature, plus
 * (2) every transaction in this household whose merchantName/name
 * contains the same distinctive tokens. Writes the override to
 * merchant_rules.displayNameOverride for each matched signature, then
 * propagates the new name into plaid_transactions.merchantName and the
 * linked expenses.merchant column so every existing surface (Spend,
 * Categories drill-in, Pending) shows the new label without a re-sync.
 */
async function runRenameMerchant(
  args: z.infer<typeof renameMerchantSchema>,
  ctx: ToolContext,
): Promise<ToolResult | null> {
  const newName = args.displayName.trim();
  if (!newName) return null;

  const explicitSig = merchantSignature({
    merchantName: args.merchantSignature,
    name: args.merchantSignature,
    amount: 0,
  });
  const keywords = args.merchantSignature
    .toLowerCase()
    .split(/[\s\-_]+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ""))
    .filter(
      (w) =>
        w.length >= 3 &&
        !["the", "and", "for", "from", "pmt", "pymt", "payment"].includes(w),
    );

  // Pull a broad slice of this household's transactions so we can match
  // either by exact signature or by name-keyword overlap. Mirrors the
  // 500-row cap used by markPaymentToOwnCard.
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
    if (keywords.length === 0) continue;
    const allMatch = keywords.every((kw) => haystack.includes(kw));
    if (allMatch) candidateSigs.add(sig);
  }

  // Snapshot the previous display name for the confirmation card.
  // Prefer the most-frequent merchantName across matched rows, falling
  // back to the explicit signature itself.
  let previousName = explicitSig || args.merchantSignature;
  for (const tx of txs) {
    const sig = merchantSignature(tx);
    if (!candidateSigs.has(sig)) continue;
    const candidate = (tx.merchantName ?? tx.name ?? "").trim();
    if (candidate) {
      previousName = candidate;
      break;
    }
  }

  // Persist the override on merchant_rules for each candidate signature.
  // Upsert: a row may already exist (auto-learned from prior accepts)
  // OR be missing. Either way we set displayNameOverride without
  // disturbing category/autoAccept/autoIgnore.
  for (const sig of candidateSigs) {
    const existing = await db
      .select()
      .from(merchantRules)
      .where(
        and(
          eq(merchantRules.coupleId, ctx.householdId),
          eq(merchantRules.signature, sig),
        ),
      )
      .limit(1);
    if (existing[0]) {
      await db
        .update(merchantRules)
        .set({
          displayNameOverride: newName,
          // Keep lastMerchant fresh so the drill-in row label stays
          // sensible if a future migration ever ignores the override.
          lastMerchant: newName,
          updatedAt: new Date(),
        })
        .where(eq(merchantRules.id, existing[0].id));
    } else {
      await db.insert(merchantRules).values({
        coupleId: ctx.householdId,
        signature: sig,
        lastMerchant: newName,
        displayNameOverride: newName,
        autoAccept: false,
        autoIgnore: false,
        hitCount: 0,
        ignoreCount: 0,
        source: "user_moved",
      });
    }
  }

  // Retroactive write-through: update every existing matching plaid_tx
  // (and its linked expense) so Spend / Categories / Pending render the
  // new label immediately. Match-conditions mirror the markPayment helper:
  // signature equality OR keyword overlap.
  let renamedCount = 0;
  for (const tx of txs) {
    const sig = merchantSignature(tx);
    const haystack = `${tx.merchantName ?? ""} ${tx.name ?? ""}`.toLowerCase();
    const sigMatch = candidateSigs.has(sig);
    const nameMatch =
      keywords.length > 0 && keywords.every((kw) => haystack.includes(kw));
    if (!sigMatch && !nameMatch) continue;
    if ((tx.merchantName ?? "").trim() === newName) continue;
    await db.transaction(async (txn) => {
      await txn
        .update(plaidTransactions)
        .set({ merchantName: newName })
        .where(eq(plaidTransactions.id, tx.id));
      if (tx.expenseId) {
        await txn
          .update(expenses)
          .set({ merchant: newName, description: newName })
          .where(eq(expenses.id, tx.expenseId));
      }
    });
    renamedCount++;
  }

  return {
    kind: "merchant_renamed",
    merchantSignature: [...candidateSigs].join(", ") || explicitSig,
    previousName,
    newName,
    renamedCount,
  };
}

// DEFAULT_FIXED_OBLIGATION_CATS now lives in ../taxonomy.ts (audit fix
// #1) — single source of truth. Imported below.

async function runSetCategoryInclusion(
  args: z.infer<typeof setCategoryInclusionSchema>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const cat = args.category.trim().toLowerCase();
  const wasExcluded = DEFAULT_FIXED_OBLIGATION_CATS.has(cat);
  // Idempotent upsert. If the user is restoring the default state we
  // delete the override row instead of writing a redundant one — keeps
  // the Settings tab honest about what's actually overridden.
  const restoresDefault =
    (wasExcluded && args.includeInSpend === false) ||
    (!wasExcluded && args.includeInSpend === true);
  if (restoresDefault) {
    await db
      .delete(userPreferences)
      .where(
        and(
          eq(userPreferences.userId, ctx.userId),
          eq(userPreferences.scope, "spend"),
          eq(userPreferences.key, `include_in_spend.${cat}`),
        ),
      );
  } else {
    await db
      .insert(userPreferences)
      .values({
        userId: ctx.userId,
        scope: "spend",
        key: `include_in_spend.${cat}`,
        value: { includeInSpend: args.includeInSpend, since: new Date().toISOString() },
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [userPreferences.userId, userPreferences.scope, userPreferences.key],
        set: {
          value: { includeInSpend: args.includeInSpend, since: new Date().toISOString() },
          updatedAt: new Date(),
        },
      });
  }
  return {
    kind: "category_inclusion_set",
    category: cat,
    includeInSpend: args.includeInSpend,
    previouslyIncluded: !wasExcluded,
  };
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

// ─── Smart Tilly v2 audit fixes (2026-05-16) ────────────────────────────
// Each of these handlers gives Tilly direct control over a thing that
// was previously hardcoded server-side, closing the "I can't change that"
// gap the user surfaced after the perception audit.

async function runSetCategoryBucket(
  args: z.infer<typeof setCategoryBucketSchema>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const cat = args.category.trim().toLowerCase();
  const newBucket = args.bucket;

  // Default bucket per the hardcoded taxonomy — what computeMonthFlow
  // would have assigned without an override. Lets the result card show
  // "previousBucket → newBucket" cleanly.
  const RECURRING = new Set(["subscriptions", "insurance", "rent", "mortgage", "utilities"]);
  const ONE_OFF = new Set(["taxes", "fees", "loans"]);
  const ADJUSTMENT = new Set(["transfers", "cashback", "credit_adjustment"]);
  const defaultBucket: ToolResult extends { previousBucket: infer B } ? B : never =
    (cat === "income"
      ? "income"
      : ADJUSTMENT.has(cat)
        ? "adjustment"
        : RECURRING.has(cat)
          ? "recurring"
          : ONE_OFF.has(cat)
            ? "one_off"
            : "variable") as never;

  await db
    .insert(userPreferences)
    .values({
      userId: ctx.userId,
      scope: "taxonomy",
      key: `bucket_override.${cat}`,
      value: { bucket: newBucket, setAt: new Date().toISOString() },
    })
    .onConflictDoUpdate({
      target: [userPreferences.userId, userPreferences.scope, userPreferences.key],
      set: {
        value: { bucket: newBucket, setAt: new Date().toISOString() },
        updatedAt: new Date(),
      },
    });
  return {
    kind: "category_bucket_set",
    category: cat,
    previousBucket: defaultBucket,
    newBucket,
  };
}

async function runFlagAsIncome(
  args: z.infer<typeof flagAsIncomeSchema>,
  ctx: ToolContext,
): Promise<ToolResult> {
  // Same keyword-match strategy as markIncomeAsTransfer / markPaymentTo-
  // OwnCard. Find every plaid_transactions row whose merchantName / name
  // contains all the distinctive tokens, flip ourCategory to 'income'.
  const sourceKeywords = args.sourceName
    .toLowerCase()
    .split(/[\s\-_]+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ""))
    .filter(
      (w) =>
        w.length >= 3 &&
        !["the", "and", "for", "from", "deposit", "income", "payment", "transfer"].includes(w),
    );

  const explicitSig = args.merchantSignature
    ? merchantSignature({
        merchantName: args.merchantSignature,
        name: args.merchantSignature,
        amount: 0,
      })
    : "";

  // Scan ALL plaid_transactions for this household — the misclassified
  // income is currently bucketed as transfer/credit_adjustment/other,
  // so we can't pre-filter by ourCategory.
  const allTx = await db
    .select()
    .from(plaidTransactions)
    .where(eq(plaidTransactions.coupleId, ctx.householdId))
    .limit(1000);

  const candidateSigs = new Set<string>();
  if (explicitSig) candidateSigs.add(explicitSig);
  for (const tx of allTx) {
    const sig = merchantSignature(tx);
    const haystack = `${tx.merchantName ?? ""} ${tx.name ?? ""}`.toLowerCase();
    if (sourceKeywords.length === 0) continue;
    const allMatch = sourceKeywords.every((kw) => haystack.includes(kw));
    if (allMatch) candidateSigs.add(sig);
  }
  if (candidateSigs.size === 0) {
    // No match — still write the alias so future syncs can apply it,
    // but report 0 retroactive count.
    await db
      .insert(userPreferences)
      .values({
        userId: ctx.userId,
        scope: "plaid",
        key: `alias_to_income:${args.sourceName.toLowerCase().slice(0, 80)}`,
        value: {
          sourceName: args.sourceName,
          since: new Date().toISOString(),
          reason: args.reason ?? null,
        },
      })
      .onConflictDoUpdate({
        target: [userPreferences.userId, userPreferences.scope, userPreferences.key],
        set: { value: { sourceName: args.sourceName, since: new Date().toISOString() } },
      });
    return {
      kind: "income_flagged",
      merchantSignature: explicitSig || args.sourceName,
      sourceName: args.sourceName,
      reclassifiedCount: 0,
      reclassifiedAmount: 0,
    };
  }

  // Retroactively reclassify matching rows to income.
  const sigArr = [...candidateSigs];
  const matching = allTx.filter((t) => candidateSigs.has(merchantSignature(t)));
  const reclassifiedAmount = matching.reduce((s, t) => s + Math.abs(t.amount), 0);
  await db
    .update(plaidTransactions)
    .set({ ourCategory: "income" })
    .where(
      and(
        eq(plaidTransactions.coupleId, ctx.householdId),
        inArray(
          plaidTransactions.id,
          matching.map((t) => t.id),
        ),
      ),
    );

  // Write the alias pref so the sync handler routes future occurrences.
  for (const sig of sigArr.slice(0, 5)) {
    await db
      .insert(userPreferences)
      .values({
        userId: ctx.userId,
        scope: "plaid",
        key: `alias_to_income:${sig}`,
        value: {
          sourceName: args.sourceName,
          since: new Date().toISOString(),
          reason: args.reason ?? null,
        },
      })
      .onConflictDoUpdate({
        target: [userPreferences.userId, userPreferences.scope, userPreferences.key],
        set: { value: { sourceName: args.sourceName, since: new Date().toISOString() } },
      });
  }
  return {
    kind: "income_flagged",
    merchantSignature: sigArr[0],
    sourceName: args.sourceName,
    reclassifiedCount: matching.length,
    reclassifiedAmount: Math.round(reclassifiedAmount * 100) / 100,
  };
}

async function runSetMerchantCadence(
  args: z.infer<typeof setMerchantCadenceSchema>,
  ctx: ToolContext,
): Promise<ToolResult> {
  // Resolve the user's described merchant to a signature, same fuzzy
  // pattern as flagAsIncome / markPaymentToOwnCard. Stored override
  // is read by the annual_bill_upcoming detector before falling back
  // to its date-history-based inference.
  const sourceKeywords = args.sourceName
    .toLowerCase()
    .split(/[\s\-_]+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ""))
    .filter((w) => w.length >= 3);

  const allTx = await db
    .select()
    .from(plaidTransactions)
    .where(eq(plaidTransactions.coupleId, ctx.householdId))
    .limit(1000);
  let chosenSig = "";
  let priorCadence: string | null = null;
  for (const tx of allTx) {
    const sig = merchantSignature(tx);
    const haystack = `${tx.merchantName ?? ""} ${tx.name ?? ""}`.toLowerCase();
    if (sourceKeywords.length && sourceKeywords.every((kw) => haystack.includes(kw))) {
      chosenSig = sig;
      break;
    }
  }
  if (!chosenSig) {
    // Fall back to the sourceName itself as the key — future syncs
    // can match on it even though we couldn't find a current row.
    chosenSig = args.sourceName.toLowerCase().slice(0, 80);
  }

  // Read prior override if any (so the result card shows what changed).
  const existing = await db
    .select()
    .from(userPreferences)
    .where(
      and(
        eq(userPreferences.userId, ctx.userId),
        eq(userPreferences.scope, "taxonomy"),
        eq(userPreferences.key, `cadence_override.${chosenSig}`),
      ),
    )
    .limit(1);
  if (existing[0]?.value && typeof existing[0].value === "object") {
    const v = existing[0].value as { cadence?: string };
    priorCadence = v.cadence ?? null;
  }

  await db
    .insert(userPreferences)
    .values({
      userId: ctx.userId,
      scope: "taxonomy",
      key: `cadence_override.${chosenSig}`,
      value: {
        cadence: args.cadence,
        sourceName: args.sourceName,
        setAt: new Date().toISOString(),
      },
    })
    .onConflictDoUpdate({
      target: [userPreferences.userId, userPreferences.scope, userPreferences.key],
      set: {
        value: {
          cadence: args.cadence,
          sourceName: args.sourceName,
          setAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      },
    });
  return {
    kind: "merchant_cadence_set",
    merchantSignature: chosenSig,
    sourceName: args.sourceName,
    previousCadence: priorCadence,
    newCadence: args.cadence,
  };
}

async function runDismissAsNotIncome(
  args: z.infer<typeof dismissAsNotIncomeSchema>,
  ctx: ToolContext,
): Promise<ToolResult> {
  // Match the user's named merchant against the income_gap candidates.
  // Special-case "all" / "all of them" / "all three" → dismiss every
  // current candidate the detector would surface. Otherwise fuzzy-match
  // against recent inflow merchants.
  const lower = args.sourceName.toLowerCase().trim();
  const dismissAll = /^all(\s|$)|all of them|all three|all of these|all the (one|three|four)s?/i.test(
    lower,
  );

  // Scan recent inflows (Plaid signs income negative).
  const since = new Date(Date.now() - 90 * 24 * 3600 * 1000);
  const sinceIso = since.toISOString().slice(0, 10);
  const inflows = await db
    .select()
    .from(plaidTransactions)
    .where(
      and(
        eq(plaidTransactions.coupleId, ctx.householdId),
        sql`${plaidTransactions.date} >= ${sinceIso}`,
        sql`${plaidTransactions.amount} < 0`,
      ),
    )
    .limit(1000);

  // Group by merchant signature, like the detector does.
  const byMerchant = new Map<string, { sig: string; count: number; sum: number; merch: string }>();
  for (const r of inflows) {
    const cat = (r.ourCategory ?? "").toLowerCase();
    if (cat === "income") continue;
    const sig = merchantSignature(r);
    const merch = (r.merchantName ?? r.name ?? "").trim();
    if (!merch) continue;
    const e = byMerchant.get(sig) ?? { sig, count: 0, sum: 0, merch };
    e.count += 1;
    e.sum += Math.abs(r.amount);
    byMerchant.set(sig, e);
  }

  const sourceKeywords = lower
    .split(/[\s\-_]+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ""))
    .filter((w) => w.length >= 3 && !["the", "and", "all", "those", "these", "them"].includes(w));

  const toDismiss: Array<{ sig: string; merch: string }> = [];
  for (const e of byMerchant.values()) {
    if (e.count < 2) continue; // detector requires ≥2 hits to flag
    if (e.sum / e.count < 100) continue; // detector min $100/avg
    if (dismissAll) {
      toDismiss.push({ sig: e.sig, merch: e.merch });
      continue;
    }
    const haystack = e.merch.toLowerCase();
    if (sourceKeywords.length && sourceKeywords.every((kw) => haystack.includes(kw))) {
      toDismiss.push({ sig: e.sig, merch: e.merch });
    }
  }

  // Persist a dismissal pref for each. Detector reads scope='taxonomy'
  // key='dismissed_as_income.<sig>' and skips matching candidates.
  for (const d of toDismiss) {
    await db
      .insert(userPreferences)
      .values({
        userId: ctx.userId,
        scope: "taxonomy",
        key: `dismissed_as_income.${d.sig}`,
        value: {
          merchant: d.merch,
          reason: args.reason ?? null,
          dismissedAt: new Date().toISOString(),
        },
      })
      .onConflictDoUpdate({
        target: [userPreferences.userId, userPreferences.scope, userPreferences.key],
        set: {
          value: {
            merchant: d.merch,
            reason: args.reason ?? null,
            dismissedAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        },
      });
  }

  return {
    kind: "income_dismissed",
    merchantSignature: toDismiss[0]?.sig ?? args.sourceName,
    sourceName: toDismiss[0]?.merch ?? args.sourceName,
    dismissedCount: toDismiss.length,
    reason: args.reason ?? null,
  };
}
