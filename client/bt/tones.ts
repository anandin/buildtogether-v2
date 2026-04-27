/**
 * Tilly's tone system — spec §5.5.
 *
 * Three selectable tones share the same underlying analysis; only surface
 * phrasing changes. Each defines a greeting fn, a voice descriptor, and a
 * sample line that powers the live preview on Profile.
 */
export type BTToneKey = "sibling" | "coach" | "quiet";

export type BTTone = {
  key: BTToneKey;
  label: string;
  voice: string;
  greeting: (name: string) => string;
  sample: string;
};

export const BT_TONES: Record<BTToneKey, BTTone> = {
  sibling: {
    key: "sibling",
    label: "Sibling",
    voice: "calm, wise, plainspoken",
    greeting: (name) => `Hey ${name}.`,
    sample:
      "Hey. Rent's covered. You've got $312 of breathing room — doable, just tight if takeout twice this week.",
  },
  coach: {
    key: "coach",
    label: "Coach",
    voice: "warm, direct, future-focused",
    greeting: (name) => `Morning, ${name}.`,
    sample:
      "Two no-spend days down. Let's make it three. Coffee at home tomorrow puts you back in the green.",
  },
  quiet: {
    key: "quiet",
    label: "Quiet",
    voice: "minimal, observational, no nudging",
    greeting: (name) => `${name},`,
    sample:
      "Three subscriptions you haven't touched in 60 days. Nothing urgent. Just want you to know.",
  },
};

export const BT_DEFAULT_TONE: BTToneKey = "sibling";

export type BTTimeOfDay = "morning" | "evening";
export const BT_DEFAULT_TIME: BTTimeOfDay = "morning";
