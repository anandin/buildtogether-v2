/**
 * Protective surface — spec §5.7.
 *
 * Continuously runs detection passes and emits rows into the `protections`
 * table. The Home subscription tile + Credit "Tilly protected you · 24h"
 * card both read from `protections` with different filters.
 *
 * Detectors:
 *   - `unusedSubscriptionDetector` — sub.lastUsedAt > 60d → fyi/decision_needed
 *   - `freeTrialDetector` — Plaid recurring stream just started + intro charge
 *   - `phishingTextDetector` — user-forwarded SMS analyzed via Claude (Phase 5)
 *   - `unusualChargeDetector` — Plaid tx that breaks the user's pattern (Phase 5)
 *   - `overdraftRiskDetector` — spending velocity vs upcoming bills (Phase 5)
 *
 * Each detector returns `Protection[]` rows that are upserted. Tilly's
 * initiative model (persona system prompt) controls whether to push to the
 * student or wait for them to come to chat.
 */
import type { Protection } from "../../shared/schema";

export type DetectorContext = {
  userId: string;
  householdId: string;
  /** ISO timestamp. */
  now: string;
};

export type ProtectionDraft = Omit<Protection, "id" | "flaggedAt" | "createdAt"> & {
  /** dedupe key — detector skips emit if a row with this exists in last 24h */
  dedupeKey: string;
};

export type Detector = (ctx: DetectorContext) => Promise<ProtectionDraft[]>;

/**
 * Phase 4 implements `unusedSubscriptionDetector` first. Phase 5 lights up
 * phishing + free-trial + unusual + overdraft.
 */
export const detectors: Detector[] = [
  // Stubs replaced in Phase 4/5.
];

export async function runProtectionScan(_ctx: DetectorContext): Promise<{
  flagged: number;
  byDetector: Record<string, number>;
}> {
  throw new Error("Phase 4: runProtectionScan not yet implemented");
}
