/**
 * Wait/seasonal advisor — S11.
 *
 * Different head on the same Tavily search base. Where the find-mode
 * synthesizer picks 3 cheaper options now, this one looks at the same
 * raw search snippets through a different lens: "is there a known
 * upcoming sale window or seasonal cycle that would save the student
 * money if they wait?"
 *
 * Output is small + structured: shouldWait + (optional) waitUntil
 * date label + expected saving range + 1-3 sources Tilly trusts.
 *
 * Cheap model (Gemini Flash 2.0) like find-mode — same cost profile.
 */
import { z } from "zod";
import { OpenRouterLLM } from "../llm/openrouter";
import type { TavilySearchResponse } from "./tavily";

// ─── Output schema ─────────────────────────────────────────────────────────

const WaitSourceSchema = z.object({
  source: z.string().describe("Display name of the source. e.g. 'RedFlagDeals', 'Bay Adelaide blog'."),
  url: z.string().describe("URL Tilly would link to."),
  evidence: z
    .string()
    .describe(
      "One short quote or paraphrase from the snippet that supports the wait advice (e.g. 'Levi's Canada is reliably 50% off the week of Black Friday — last 4 years').",
    ),
});

export const WaitAdviceSchema = z.object({
  shouldWait: z
    .boolean()
    .describe(
      "True only if there's a credible, dated, sale window or pattern in the snippets. False if the savings story is speculative — be conservative.",
    ),
  waitUntil: z
    .string()
    .nullable()
    .describe(
      "Absolute or relative date label like 'Black Friday (last week of Nov)', 'Boxing Week', 'late January (post-holiday)', 'next Gap sale (~Feb)'. Use today's calendar to pick the next occurrence. null if shouldWait is false.",
    ),
  expectedSaving: z
    .string()
    .nullable()
    .describe(
      "Plain-English saving estimate, e.g. '~30-50% off', '~$25 off list', 'about half'. null if shouldWait is false.",
    ),
  confidence: z
    .enum(["low", "medium", "high"])
    .describe(
      "How sure Tilly should sound. 'high' only when the same retailer pattern appears across multiple recent snippets.",
    ),
  sources: z
    .array(WaitSourceSchema)
    .describe(
      "1-3 supporting sources. Required when shouldWait=true; empty array when shouldWait=false is fine.",
    ),
  summary: z
    .string()
    .describe(
      "One sentence Tilly will say to the user. ASCII chars only. Lead with the verdict ('Yes — wait until X for ~Y' or 'Not really — buy now is fine'). No emoji.",
    ),
});

export type WaitAdvice = z.infer<typeof WaitAdviceSchema>;

// ─── Synthesizer ──────────────────────────────────────────────────────────

const SYSTEM = `You are advising a student on whether to wait for a sale or buy "{QUERY}" now. Their location (if known): {LOCATION}. Today's date: {TODAY}.

You'll get raw search snippets from multiple Tavily queries focused on sale history, seasonal patterns, and known discount windows for this kind of item.

Rules:
- Only say shouldWait=true if a snippet shows a credible, recurring, dated sale pattern. e.g. "Levi's Canada has a 30-50% off promo every Black Friday for the last 4 years" → high confidence wait. e.g. "Some users report Gap discounts are best in February" → medium confidence wait.
- If the savings story is hand-wavy ("usually goes on sale eventually"), say shouldWait=false. Underclaim. The student should never wait based on a Tilly hallucination.
- waitUntil must reference a real upcoming date. Compute from today's date — do not name a window that's already passed.
- expectedSaving is a range or rough number based on what the snippets actually report. Don't invent percentages.
- 1-3 sources, each with a real URL from the snippets.
- ASCII only — no em-dashes, smart quotes, unicode currency.
- summary: one sentence in Tilly's voice. Confident when shouldWait=true with high confidence; honest when low.
- NEVER cite a Canadian retailer that's defunct: thebay.com / hbc.com (Hudson's Bay closed all Canadian stores 2025), sears.ca (closed 2018), target.ca (closed 2015), futureshop.ca (closed 2015). Drop those snippets.`;

export async function synthesizeWaitAdvice(opts: {
  query: string;
  location?: string | null;
  searches: TavilySearchResponse[];
  modelId?: string;
}): Promise<WaitAdvice> {
  const lines: string[] = [];
  for (const s of opts.searches) {
    lines.push(`[Search: "${s.query}"]`);
    if (s.answer) lines.push(`Tavily summary: ${s.answer}`);
    for (const r of s.results) {
      const snippet = (r.content || "").slice(0, 400).replace(/\s+/g, " ");
      lines.push(`- ${r.title}\n  url: ${r.url}\n  snippet: ${snippet}`);
    }
    lines.push("");
  }
  const userPrompt = `Raw search results (across ${opts.searches.length} Tavily queries):\n\n${lines.join("\n")}\n\nDecide whether the student should wait for a known sale window. Be honest about confidence.`;

  const today = new Date().toISOString().slice(0, 10);
  const llm = new OpenRouterLLM(opts.modelId ?? "google/gemini-2.0-flash-001");
  return llm.structuredOutput<WaitAdvice>({
    systemPrompts: [
      SYSTEM
        .replace("{QUERY}", opts.query)
        .replace("{LOCATION}", opts.location ?? "unknown")
        .replace("{TODAY}", today),
    ],
    messages: [{ role: "user", content: userPrompt }],
    schema: WaitAdviceSchema,
    schemaName: "wait_advice",
    maxTokens: 1500,
  });
}
