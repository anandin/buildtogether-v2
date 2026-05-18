import { formatSkillsForPrompt, retrieveSkillsForMessage } from "../skills";

export type SkillsSectionResult = {
  /** Section string to append to extraSystem, OR null when no matches. */
  section: string | null;
  /** Names of skills that fired — used for the chat-handler log line. */
  matchedNames: string[];
};

/** Self-learned skill library retrieval (Hermes/Voyager). Embeds the
 * user's message + finds top-K active skills above similarity
 * threshold; their instructions get injected into the system prompt
 * for this turn. */
export async function buildSkillsSection(
  message: string,
  options: { topK?: number; minSimilarity?: number } = {},
): Promise<SkillsSectionResult> {
  try {
    const matched = await retrieveSkillsForMessage(message, {
      topK: options.topK ?? 3,
      minSimilarity: options.minSimilarity ?? 0.35,
    });
    if (matched.length === 0) return { section: null, matchedNames: [] };
    return {
      section: formatSkillsForPrompt(matched),
      matchedNames: matched.map((m) => m.name),
    };
  } catch (err) {
    console.warn("[ctx-skills] failed:", err);
    return { section: null, matchedNames: [] };
  }
}
