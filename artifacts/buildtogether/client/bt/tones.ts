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
    // Tone-illustrative samples are intentionally generic. Earlier
    // versions used hyper-specific phrasing ("DoorDash twice in two
    // weeks · lock $25 ceiling on Wed nights?") which read as real
    // observations the user hadn't actually been given. They're
    // labeled "Sample voice" in the UI so it's clear this is HOW
    // Tilly would talk, not WHAT she's saying right now.
    sample:
      "Spot a soft-spot day this week? We could set a small ceiling — just for that one.",
  },
  coach: {
    key: "coach",
    label: "Coach",
    voice: "warm, direct, future-focused",
    greeting: (name) => `Morning, ${name}.`,
    sample:
      "Two good days in a row. One more locks the week green — coffee at home tomorrow?",
  },
  quiet: {
    key: "quiet",
    label: "Quiet",
    voice: "minimal, observational, no nudging",
    greeting: (name) => `${name},`,
    sample:
      "A few subscriptions sitting untouched. Nothing urgent. Just wanted you to know.",
  },
};

export const BT_DEFAULT_TONE: BTToneKey = "sibling";

export type BTTimeOfDay = "morning" | "evening";
export const BT_DEFAULT_TIME: BTTimeOfDay = "morning";
