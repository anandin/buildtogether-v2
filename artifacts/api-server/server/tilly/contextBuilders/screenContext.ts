/** Truncate giant arrays before serialization so the snapshot stays
 * under the prompt budget (~1800 chars). The home's observations
 * array can easily blow past that without trimming. */
function stripGiantArrays(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (Array.isArray(v) && v.length > 8) {
      out[k] = `[${v.length} items truncated]`;
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Screen perception — what the user is currently looking at on their
 * phone. Without this, Tilly used to say "I can't see your home
 * screen right now" — exactly the gap the user surfaced 2026-05-16. */
export function buildScreenContextSection(
  screenContext: Record<string, unknown> | null,
): string | null {
  if (!screenContext) return null;
  const stripped = stripGiantArrays(screenContext);
  const snapshot = JSON.stringify(stripped, null, 2).slice(0, 1800);
  return (
    `What the user is looking at RIGHT NOW (their screen state):\n${snapshot}\n\nUse this to answer screen-specific questions. If the user asks "why does my home say X" or "the spend page is showing Y", you have access to exactly what's rendered — don't tell them you can't see it. If you spot something miscategorized or misleading in this snapshot, name it and offer to fix it via a tool.`
  );
}
