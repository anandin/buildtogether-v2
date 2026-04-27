/**
 * Tilly's tone system — translated from `bt-system.jsx`.
 *
 * Three selectable tones share the same underlying analysis; only surface
 * phrasing changes. Each defines:
 *   - `name` (display string, e.g. "Older sibling")
 *   - `greeting(name)` for screen headers
 *   - `voice` descriptor for the chat header
 *   - `sample` line driving the Profile live preview
 *
 * NOTE: the third tone is **protective**, not "quiet" — earlier drafts had
 * the wrong key.
 */
export type BTToneKey = "sibling" | "coach" | "protective";

export type BTTone = {
  key: BTToneKey;
  name: string;
  voice: string;
  greeting: (name: string) => string;
  sample: string;
};

export const BT_TONES: Record<BTToneKey, BTTone> = {
  sibling: {
    key: "sibling",
    name: "Older sibling",
    voice: "calm, wise, plainspoken",
    greeting: (name) => `Hey ${name}.`,
    sample:
      "You've got rent due Thursday and $312 of breathing room. Doable, but tight if you order out twice this week.",
  },
  coach: {
    key: "coach",
    name: "Coach",
    voice: "direct, gently nudgy",
    greeting: (name) => `Morning, ${name}.`,
    sample:
      "Two no-spend days this week — let's make it three. Coffee at home tomorrow puts you back in the green.",
  },
  protective: {
    key: "protective",
    name: "Protective",
    voice: "quiet, only when needed",
    greeting: (name) => `${name},`,
    sample:
      "I'm watching three subscriptions you haven't used in 60 days. Nothing urgent — just want you to know.",
  },
};

export const BT_DEFAULT_TONE: BTToneKey = "sibling";

export type BTTimeOfDay = "morning" | "evening";
/** Source defaults to evening, per `TWEAK_DEFAULTS` in BuildTogether.html. */
export const BT_DEFAULT_TIME: BTTimeOfDay = "evening";

/** Time stamps used in chat header + screen mastheads (BT_TIMES in source). */
export const BT_TIMES: Record<BTTimeOfDay, { name: string; stamp: string; label: string }> = {
  morning: { name: "Morning", stamp: "Tue · 7:42 AM", label: "Morning briefing" },
  evening: { name: "Evening", stamp: "Tue · 9:18 PM", label: "Night check-in" },
};
