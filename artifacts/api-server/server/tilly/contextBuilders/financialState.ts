import { buildFinancialStateSummary } from "../state-summary";

/** Current financial state block — total balance, recurring + last
 * paycheck. Tilly should reference this when the user asks about
 * money rather than saying "I can't see your balance". */
export async function buildFinancialStateSection(
  householdId: string,
  userId: string,
): Promise<string | null> {
  try {
    const state = await buildFinancialStateSummary(householdId, userId);
    if (!state.hasData) return null;
    return (
      `Their current state — use this when they ask about money:\n${state.text}\n\nDO NOT say you can't see their balance or that you need them to connect; the data above is your access. If a specific thing isn't listed (e.g. credit utilization), say you don't see THAT specific thing yet.`
    );
  } catch (err) {
    console.warn("[ctx-financial-state] failed:", err);
    return null;
  }
}
