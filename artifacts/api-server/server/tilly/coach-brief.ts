/**
 * Deterministic Today copy — briefing + the one action worth doing.
 * Grounded in whatever the caller already loaded (dossier sentence,
 * recent spend, bills, habits). No LLM call, so Home still speaks
 * when the model is down.
 */

export type UpcomingItem = {
  kind: "bill" | "commitment";
  id: string;
  label: string;
  amount: number;
  /** YYYY-MM-DD, null for standing commitments with no calendar date. */
  date: string | null;
};

export type HabitStripItem = {
  id: string;
  title: string;
  kind: string;
  cadence: "daily" | "weekly";
  currentStreak: number;
  weeklyCompletionRate: number;
  checkedInPeriod: boolean;
  due: boolean;
};

export type PrimaryAction = {
  id: string;
  title: string;
  body: string;
  ctaLabel: string;
  route: "habits" | "spend" | "guardian" | "pending" | "dreams";
  chatSeed?: string;
};

export type CoachBriefInput = {
  name: string;
  dossierArc: string | null;
  spentThisWeek: number | null;
  topCategory: string | null;
  liquid: number | null;
  pendingCount: number;
  upcoming: UpcomingItem[];
  habits: HabitStripItem[];
};

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function firstSentence(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  const cut = trimmed.split(/(?<=[.!?])\s/)[0] ?? trimmed;
  return cut.length > 180 ? `${cut.slice(0, 177).trim()}…` : cut;
}

export function composeBriefing(input: CoachBriefInput): string {
  const parts: string[] = [];
  if (input.dossierArc) {
    parts.push(firstSentence(input.dossierArc));
  }
  if (input.spentThisWeek != null && input.spentThisWeek > 0) {
    const where = input.topCategory ? `, mostly ${input.topCategory}` : "";
    parts.push(`This week you've spent ${money(input.spentThisWeek)}${where}.`);
  } else if (!input.dossierArc) {
    parts.push(
      input.liquid != null
        ? `${input.name}, you have about ${money(input.liquid)} liquid right now.`
        : `${input.name}, I'm watching the week with you.`,
    );
  }
  const nextBill = input.upcoming.find((u) => u.kind === "bill" && u.date);
  if (nextBill && nextBill.date) {
    parts.push(`${nextBill.label} (${money(nextBill.amount)}) is coming up ${nextBill.date}.`);
  }
  const hot = input.habits.find((h) => h.currentStreak >= 3);
  if (hot) {
    parts.push(`${hot.title} is on a ${hot.currentStreak}-streak.`);
  } else if (input.habits.some((h) => h.due)) {
    const due = input.habits.find((h) => h.due)!;
    parts.push(`${due.title} is still open.`);
  }
  if (parts.length === 0) {
    return "Nothing urgent on the board. A short check-in is enough today.";
  }
  return parts.slice(0, 3).join(" ");
}

export function pickPrimaryAction(input: CoachBriefInput): PrimaryAction {
  if (input.pendingCount >= 3) {
    return {
      id: "review-pending",
      title: `Clear ${input.pendingCount} pending transactions`,
      body: "These are the ones I couldn't file confidently. A few answers teach me the rest.",
      ctaLabel: "Review",
      route: "pending",
    };
  }
  const due = input.habits.find((h) => h.due);
  if (due) {
    return {
      id: `habit-${due.id}`,
      title: due.title,
      body:
        due.currentStreak > 0
          ? `Streak is ${due.currentStreak}. Checking in keeps it.`
          : "A check-in takes a second and gives me something real to coach.",
      ctaLabel: "Check in",
      route: "habits",
    };
  }
  const soon = input.upcoming.find((u) => u.kind === "bill");
  if (soon) {
    return {
      id: `bill-${soon.id}`,
      title: `${soon.label} · ${money(soon.amount)}`,
      body: soon.date
        ? `Due ${soon.date}. Worth a look before it posts.`
        : "A recurring charge is on the books.",
      ctaLabel: "See spend",
      route: "spend",
    };
  }
  if (input.habits.length === 0) {
    return {
      id: "start-habit",
      title: "Pick one money habit",
      body: "A no-spend day or a weekly check-in is enough to start. I'll nudge when it slips.",
      ctaLabel: "Choose",
      route: "habits",
    };
  }
  return {
    id: "talk",
    title: "Talk it through",
    body: "Ask me what this week is doing, or whether a purchase fits.",
    ctaLabel: "Open Tilly",
    route: "guardian",
    chatSeed: "How is my money looking today?",
  };
}

export type HabitSuggestion = {
  kind: string;
  title: string;
  cadence: "daily" | "weekly";
  targetAmount: number | null;
  reason: string;
};

export function suggestHabitsFromSignals(input: {
  restaurantDays: number;
  subscriptionCount: number;
  pendingCount: number;
  surplus: number | null;
  existingKinds: string[];
}): HabitSuggestion[] {
  const have = new Set(input.existingKinds);
  const out: HabitSuggestion[] = [];
  if (!have.has("no_spend_day") && input.restaurantDays >= 4) {
    out.push({
      kind: "no_spend_day",
      title: "No-spend day",
      cadence: "daily",
      targetAmount: null,
      reason: `Eating out showed up on ${input.restaurantDays} days recently. One quiet day changes the week.`,
    });
  }
  if (!have.has("weekly_checkin") && (input.subscriptionCount >= 2 || input.restaurantDays >= 2)) {
    out.push({
      kind: "weekly_checkin",
      title: "Weekly money check-in",
      cadence: "weekly",
      targetAmount: null,
      reason: "A Sunday look at bills and spend keeps surprises small.",
    });
  }
  if (!have.has("review_pending") && input.pendingCount >= 3) {
    out.push({
      kind: "review_pending",
      title: "Review pending",
      cadence: "weekly",
      targetAmount: null,
      reason: `${input.pendingCount} transactions are waiting. A weekly pass stops the pile.`,
    });
  }
  if (!have.has("save_amount") && input.surplus != null && input.surplus >= 40) {
    const target = Math.max(10, Math.round(input.surplus / 8 / 5) * 5);
    out.push({
      kind: "save_amount",
      title: `Save ${money(target)}`,
      cadence: "weekly",
      targetAmount: target,
      reason: "There's room this month. A small standing save is easier than a big one later.",
    });
  }
  if (!have.has("gratitude_spend") && out.length < 3) {
    out.push({
      kind: "gratitude_spend",
      title: "Log a gratitude spend",
      cadence: "weekly",
      targetAmount: null,
      reason: "Name one purchase that was worth it. It trains what 'enough' feels like.",
    });
  }
  return out.slice(0, 3);
}
