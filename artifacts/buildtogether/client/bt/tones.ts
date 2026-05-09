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
    // Tone-illustrative sample, NOT an empty-state cue. The previous
    // "connect a bank when you're ready" line stuck around even after
    // banks were synced and made the YOU page feel broken.
    sample:
      "Wednesday's the soft spot again — DoorDash twice in two weeks. Want to lock $25 ceiling for Wed nights?",
  },
  coach: {
    key: "coach",
    label: "Coach",
    voice: "warm, direct, future-focused",
    greeting: (name) => `Morning, ${name}.`,
    sample:
      "Two no-spend days in. One more puts you back in the green for the week. Coffee at home tomorrow?",
  },
  quiet: {
    key: "quiet",
    label: "Quiet",
    voice: "minimal, observational, no nudging",
    greeting: (name) => `${name},`,
    sample:
      "Three subscriptions you haven't touched in 60 days. Nothing urgent. Just wanted you to know.",
  },
};

export const BT_DEFAULT_TONE: BTToneKey = "sibling";

export type BTTimeOfDay = "morning" | "evening";
export const BT_DEFAULT_TIME: BTTimeOfDay = "morning";
