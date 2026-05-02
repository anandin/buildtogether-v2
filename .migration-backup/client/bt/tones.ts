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
      "Glad you're here. Connect a bank when you're ready and I'll start showing you the patterns — until then, ask me anything.",
  },
  coach: {
    key: "coach",
    label: "Coach",
    voice: "warm, direct, future-focused",
    greeting: (name) => `Morning, ${name}.`,
    sample:
      "Good first move. Once your bank's connected I'll spot the small wins; for now, tell me one money thing on your mind.",
  },
  quiet: {
    key: "quiet",
    label: "Quiet",
    voice: "minimal, observational, no nudging",
    greeting: (name) => `${name},`,
    sample:
      "I'm here. I'll watch quietly once your bank's connected. No nudges unless you ask.",
  },
};

export const BT_DEFAULT_TONE: BTToneKey = "sibling";

export type BTTimeOfDay = "morning" | "evening";
export const BT_DEFAULT_TIME: BTTimeOfDay = "morning";
