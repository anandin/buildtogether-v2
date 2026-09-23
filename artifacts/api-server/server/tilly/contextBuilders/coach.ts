import { buildCoachHome } from "../coach-home";

/**
 * Today context for chat: habits, subscriptions/bills, cash, and the
 * one action Tilly already picked for Home. Lets a reply name the
 * streak or the bill instead of asking the user to restate them.
 */
export async function buildCoachSection(
  userId: string,
  householdId: string,
  name: string,
): Promise<string | null> {
  try {
    const home = await buildCoachHome({ userId, householdId, name });
    const lines: string[] = ["Today (coach home) — reference this, don't ask them to repeat it:"];
    lines.push(home.briefing);
    if (home.cash.liquid != null) {
      const owed = home.cash.creditOwed != null ? `, credit owed about $${Math.round(home.cash.creditOwed)}` : "";
      lines.push(
        `Cash: about $${Math.round(home.cash.liquid)} liquid (${home.cash.source})${owed}.`,
      );
    }
    if (home.habits.length) {
      const habitLine = home.habits
        .map((h) => {
          const rate = Math.round(h.weeklyCompletionRate * 100);
          const state = h.due ? "due" : "done";
          return `${h.title} (${h.cadence}, streak ${h.currentStreak}, week ${rate}%, ${state})`;
        })
        .join("; ");
      lines.push(`Habits: ${habitLine}.`);
    } else {
      lines.push("Habits: none yet. Offer to create one with createHabit if they want a practice.");
    }
    const bills = home.upcoming.filter((u) => u.kind === "bill");
    if (bills.length) {
      lines.push(
        `Upcoming bills: ${bills.map((b) => `${b.label} $${Math.round(b.amount)} on ${b.date}`).join("; ")}.`,
      );
    }
    const commitments = home.upcoming.filter((u) => u.kind === "commitment");
    if (commitments.length) {
      lines.push(
        `Standing commitments: ${commitments.map((c) => `${c.label} $${Math.round(c.amount)}`).join("; ")}.`,
      );
    }
    lines.push(`Primary action already on Home: ${home.primaryAction.title} — ${home.primaryAction.body}`);
    return lines.join("\n");
  } catch (err) {
    console.warn("[ctx-coach] failed:", err);
    return null;
  }
}
