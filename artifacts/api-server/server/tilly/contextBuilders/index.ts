/**
 * Chat extraSystem context builders — pulled out of routes/tilly/chat.ts
 * per audit fix #8. Each builder takes the chat-turn context
 * (userId, householdId, message, etc.) and returns a string OR null
 * to append to the system prompt for that turn.
 *
 * Three rules every builder MUST follow:
 *   1. Return null on no-data + on caught error. The chat handler
 *      assembles non-null returns into `sections[]` — a builder must
 *      never throw upward because that would block the reply.
 *   2. Log warnings on failure with a `[ctx-<builder>]` prefix so the
 *      detector-failure-counter pattern can sweep them up later.
 *   3. Keep each builder under ~80 LOC. If it grows beyond that, the
 *      builder is doing too much — split it.
 *
 * The chat handler still owns ORDERING (dossier first, state second,
 * etc.) and is the only place that knows how to assemble the final
 * extraSystem. Builders are pure pull-the-data + format-as-prompt.
 *
 * Each builder is unit-testable in isolation now — that wasn't true
 * when they lived inline in chat.ts.
 */
export { buildDossierSection } from "./dossier";
export { buildFinancialStateSection } from "./financialState";
export { buildMemorySnippetsSection, type MemorySnippet } from "./memorySnippets";
export { buildCashFlowSection } from "./cashFlow";
export { buildRecentAnalysisSection } from "./recentAnalysis";
export { buildOpenQuestionsSection } from "./openQuestions";
export { buildSkillsSection, type SkillsSectionResult } from "./skills";
export { buildScreenContextSection } from "./screenContext";
