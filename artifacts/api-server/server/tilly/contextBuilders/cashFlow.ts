import { buildCashFlowSummary } from "../cash-flow-summary";

/** Cash-flow timing block — the timeline of money in + out so Tilly
 * references upcoming paychecks and recurring bills BEFORE answering
 * "can I afford X" rather than only looking at the headline. */
export async function buildCashFlowSection(
  userId: string,
  householdId: string,
): Promise<string | null> {
  try {
    const cashFlow = await buildCashFlowSummary(userId, householdId);
    if (!cashFlow.hasData) return null;
    return cashFlow.text;
  } catch (err) {
    console.warn("[ctx-cashflow] failed:", err);
    return null;
  }
}
