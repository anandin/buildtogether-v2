export type MemorySnippet = {
  kind: string;
  dateLabel: string;
  body: string;
};

/** What you remember about them — formatted RAG retrieval results.
 * Caller does the actual retrieval (chat handler still owns the
 * hybridRetrieve call because the retrieval rows are also written
 * to the retrieval log). This builder just formats. */
export function buildMemorySnippetsSection(
  snippets: MemorySnippet[],
): string | null {
  if (!snippets.length) return null;
  const lines = snippets.map((m) => `- [${m.kind}, ${m.dateLabel}] ${m.body}`);
  return `What you remember about them (in your voice, from RAG):\n${lines.join("\n")}`;
}
