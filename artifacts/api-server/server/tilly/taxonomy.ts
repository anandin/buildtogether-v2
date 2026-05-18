/**
 * Tilly taxonomy — the SINGLE source of truth for category buckets,
 * merchant signatures, and per-user overrides.
 *
 * Why this file exists (audit finding #1, 2026-05-17): seven of the
 * thirteen bugs shipped in the last week root-caused to the SAME
 * structural problem — RECURRING_CATS / ONE_OFF_CATS / ADJUSTMENT_CATS
 * + the "what merchant is this?" function were duplicated across
 * detectors.ts, spend-pattern.ts, insights.ts, registry.ts,
 * projection-history.ts. Each copy drifted independently, producing
 * lookup-key mismatches between writers (tools) and readers
 * (detectors / home compute). The fix is structural: every consumer
 * imports from here, no exceptions. Adding a new category constant
 * anywhere else in the codebase is a code-review red flag.
 *
 * Anything in this module is intended to be:
 *   1. Pure (no side effects, no DB writes — except `loadUserOverrides`
 *      which only reads user_preferences).
 *   2. Synchronous where possible (cosine, bucket math).
 *   3. Unit-testable in isolation (vitest in #2 covers these directly).
 *   4. The ONLY definition of these concepts anywhere in the codebase.
 *
 * Re-exports merchantSignature from merchant-rules.ts so every caller
 * can `import { merchantSignature } from "../taxonomy"` with the
 * shared imports group — semantically these belong together even
 * though merchantSignature stays in merchant-rules.ts for git history
 * continuity.
 */
import { and, eq } from "drizzle-orm";

import { db } from "../db";
import { userPreferences } from "../../shared/schema";
import { merchantSignature } from "./merchant-rules";

export { merchantSignature };

// ────────────────────────────────────────────────────────────────────
// Bucket definitions — the home decomposition + projection math
// ────────────────────────────────────────────────────────────────────

/**
 * Bucket = how a category gets treated in computeMonthFlow's
 * decomposition. Each transaction lands in exactly one bucket based
 * on its `ourCategory` lookup against the maps below + the user's
 * per-category overrides.
 *
 *   recurring   — predictable monthly costs (mortgage, subs, insurance,
 *                 utilities, rent). Don't extrapolate daily-pace.
 *   one_off     — real outflows but NOT monthly (tax instalments,
 *                 occasional loan paydowns, one-time fees).
 *   variable    — discretionary day-to-day spend (groceries, restaurants,
 *                 coffee, transit). THESE scale by daily pace in the
 *                 projection.
 *   income      — inflows the user counts as real take-home.
 *   adjustment  — wash transactions (transfers, cashback, CC payments).
 *                 Excluded from both spend AND income totals because
 *                 they net to zero against the wallet.
 */
export type Bucket = "recurring" | "one_off" | "variable" | "income" | "adjustment";

/** Categories that are recurring by default (every month, predictable
 * amount). User can override per-category via setCategoryBucket. */
export const DEFAULT_RECURRING_CATS: ReadonlySet<string> = new Set([
  "subscriptions",
  "insurance",
  "rent",
  "mortgage",
  "utilities",
]);

/** Categories that are one-off by default (real outflow, not monthly).
 * Splitting this from recurring is what stopped the home from
 * mislabeling a tax instalment as a recurring pattern. */
export const DEFAULT_ONE_OFF_CATS: ReadonlySet<string> = new Set([
  "taxes",
  "fees",
  "loans",
]);

/** Wash / net-zero categories. Always excluded from spend totals so
 * a CC bill payment doesn't double-count the original purchases. */
export const DEFAULT_ADJUSTMENT_CATS: ReadonlySet<string> = new Set([
  "transfers",
  "cashback",
  "credit_adjustment",
]);

/** Default "fixed obligation" set used by spend-pattern.ts for the
 * soft-spot detection. Includes both recurring + one-off + adjustment
 * because none of these should fire the "Wednesdays are your soft
 * spot" pattern detector. Kept as a derived constant so adding a
 * default to one of the input sets above propagates here automatically. */
export const DEFAULT_FIXED_OBLIGATION_CATS: ReadonlySet<string> = new Set([
  ...DEFAULT_RECURRING_CATS,
  ...DEFAULT_ONE_OFF_CATS,
  ...DEFAULT_ADJUSTMENT_CATS,
]);

// ────────────────────────────────────────────────────────────────────
// Bucket resolution with overrides
// ────────────────────────────────────────────────────────────────────

/**
 * Per-user taxonomy overrides loaded from user_preferences
 * scope='taxonomy'. setCategoryBucket and setMerchantCadence both
 * write here; every consumer reads via this struct.
 */
export type TaxonomyOverrides = {
  /** category (lowercased) → bucket. */
  bucketOverrides: Map<string, Bucket>;
  /** merchant signature → cadence override (string from the cadence
   * enum: monthly | biweekly | weekly | quarterly | semiannual |
   * annual | never). */
  cadenceOverrides: Map<string, string>;
  /** merchant signatures the user has dismissed as not-income. The
   * income_classification_gap detector reads this to skip
   * candidates the user has already said no to. */
  dismissedIncomeSigs: Set<string>;
};

/** Empty overrides — useful for tests and unauthenticated paths. */
export function emptyOverrides(): TaxonomyOverrides {
  return {
    bucketOverrides: new Map(),
    cadenceOverrides: new Map(),
    dismissedIncomeSigs: new Set(),
  };
}

/** Load all taxonomy overrides for a user. One DB round-trip;
 * downstream consumers should pass the result through rather than
 * each making their own query. */
export async function loadUserOverrides(
  userId: string,
): Promise<TaxonomyOverrides> {
  const out = emptyOverrides();
  try {
    const rows = await db
      .select({ key: userPreferences.key, value: userPreferences.value })
      .from(userPreferences)
      .where(
        and(
          eq(userPreferences.userId, userId),
          eq(userPreferences.scope, "taxonomy"),
        ),
      );
    for (const r of rows) {
      if (r.key.startsWith("bucket_override.")) {
        const cat = r.key.slice("bucket_override.".length);
        const v = r.value as { bucket?: Bucket } | null;
        if (v?.bucket) out.bucketOverrides.set(cat, v.bucket);
      } else if (r.key.startsWith("cadence_override.")) {
        const sig = r.key.slice("cadence_override.".length);
        const v = r.value as { cadence?: string } | null;
        if (v?.cadence) out.cadenceOverrides.set(sig, v.cadence);
      } else if (r.key.startsWith("dismissed_as_income.")) {
        const sig = r.key.slice("dismissed_as_income.".length);
        out.dismissedIncomeSigs.add(sig);
      }
    }
  } catch (err) {
    // Non-fatal — overrides are advisory. Log + continue with defaults.
    console.warn("[taxonomy] loadUserOverrides failed:", err);
  }
  return out;
}

/**
 * Resolve a category to its bucket given the user's overrides.
 * Override beats default; default lookup chain is income → adjustment
 * → recurring → one_off → variable (everything else). The category
 * string is lowercased before matching.
 */
export function bucketFor(
  category: string | null | undefined,
  overrides: TaxonomyOverrides = emptyOverrides(),
): Bucket {
  const cat = (category ?? "").trim().toLowerCase();
  const override = overrides.bucketOverrides.get(cat);
  if (override) return override;
  if (cat === "income") return "income";
  if (DEFAULT_ADJUSTMENT_CATS.has(cat)) return "adjustment";
  if (DEFAULT_RECURRING_CATS.has(cat)) return "recurring";
  if (DEFAULT_ONE_OFF_CATS.has(cat)) return "one_off";
  return "variable";
}

/**
 * Returns the effective "fixed obligation" set for soft-spot detection
 * — every category in recurring, one_off, OR adjustment buckets given
 * the user's overrides. The old `resolveFixedObligationSet` lived in
 * spend-pattern.ts and used a different override pref (scope='spend'
 * key='include_in_spend.<cat>'). That alternate pref is still
 * supported below for back-compat — both override surfaces converge
 * into one set.
 */
export async function resolveFixedObligationSet(
  userId: string | null,
): Promise<Set<string>> {
  const base = new Set(DEFAULT_FIXED_OBLIGATION_CATS);
  if (!userId) return base;

  try {
    // Legacy: scope='spend' key='include_in_spend.<cat>' boolean.
    // includeInSpend=true on a default-fixed cat REMOVES it from the
    // fixed set (now counts toward headline). includeInSpend=false on
    // a default-variable cat ADDS it. Preserved for back-compat.
    const legacyRows = await db
      .select({ key: userPreferences.key, value: userPreferences.value })
      .from(userPreferences)
      .where(
        and(
          eq(userPreferences.userId, userId),
          eq(userPreferences.scope, "spend"),
        ),
      );
    for (const r of legacyRows) {
      if (!r.key.startsWith("include_in_spend.")) continue;
      const cat = r.key.slice("include_in_spend.".length).toLowerCase();
      const v = r.value as { includeInSpend?: unknown } | null;
      if (typeof v?.includeInSpend !== "boolean") continue;
      if (v.includeInSpend) base.delete(cat);
      else base.add(cat);
    }

    // New: scope='taxonomy' key='bucket_override.<cat>' carries the
    // user's bucket choice. variable bucket = include in soft-spot
    // scope (remove from fixed set); anything else = exclude.
    const overrides = await loadUserOverrides(userId);
    for (const [cat, bucket] of overrides.bucketOverrides) {
      if (bucket === "variable") base.delete(cat);
      else if (bucket === "recurring" || bucket === "one_off" || bucket === "adjustment") {
        base.add(cat);
      }
    }
  } catch (err) {
    console.warn("[taxonomy] resolveFixedObligationSet override read failed:", err);
  }

  return base;
}
