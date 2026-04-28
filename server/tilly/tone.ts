/**
 * Tone keys — kept in sync with the client's `client/bt/tones.ts`.
 *
 * Three tones share the same persona (`server/tilly/persona.ts`). Switching
 * tones updates the user's `tilly_tone_pref` row; older Tilly messages keep
 * their original tone (preserving history per spec §5.5).
 */
export type BTToneKey = "sibling" | "coach" | "quiet";

export const DEFAULT_TONE: BTToneKey = "sibling";

export function isValidTone(value: unknown): value is BTToneKey {
  return value === "sibling" || value === "coach" || value === "quiet";
}
