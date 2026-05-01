/**
 * Scout synthesizer — turns raw search results into 3 ranked options.
 *
 * Uses a CHEAP model (Gemini Flash 2.0) over OpenRouter, not Sonnet/
 * Haiku. The synthesis job is "read 15 search snippets and pick 3
 * good ones with structured fields" — Flash is overqualified for that.
 * ~$0.0005 per synthesis call vs ~$0.02 for Sonnet.
 *
 * Output options carry: source, title, price (parsed if possible),
 * location, url, condition (new/used/refurb), one-line "why this is a
 * good fit" gloss.
 */
import { z } from "zod";
import { OpenRouterLLM } from "../llm/openrouter";
import type { TavilySearchResponse } from "./tavily";

// ─── Output schema ─────────────────────────────────────────────────────────

const ScoutOptionSchema = z.object({
  source: z.string().describe("Display name of the source. e.g. 'Kijiji', 'Plato's Closet', 'BackMarket', 'Gap'."),
  title: z.string().describe("What the listing/page is selling. Concise."),
  price: z
    .string()
    .describe("Price as displayed. Use '$' format like '$25'. Use 'see listing' if not parseable."),
  location: z
    .string()
    .nullable()
    .describe("City or neighborhood if visible in the snippet, e.g. 'Toronto - Annex'. null if not."),
  url: z.string().describe("Direct link to the listing or product page."),
  condition: z
    .enum(["new", "used", "refurb", "unknown"])
    .describe("Best guess from the snippet."),
  why: z
    .string()
    .describe("One sentence why this is a useful option (vs the user's original target). Tilly's voice — concrete, not generic."),
});

export const ScoutResultSchema = z.object({
  options: z
    .array(ScoutOptionSchema)
    .describe("Top 3 options. Order most-recommended first. Skip duplicates and obvious junk."),
  summary: z
    .string()
    .describe("One short sentence Tilly will say to the user when delivering the result. Lead with the cheapest viable option's price + source. ASCII chars only."),
});

export type ScoutOption = z.infer<typeof ScoutOptionSchema>;
export type ScoutResult = z.infer<typeof ScoutResultSchema>;

// ─── Synthesizer ──────────────────────────────────────────────────────────

const SYSTEM = `You are picking the 3 best alternative options for a student who wants to buy something. They asked: "{QUERY}".${"\n"}Their location (if known): {LOCATION}.

You'll get raw search snippets from multiple Tavily queries. Pick options that span the spectrum: a near-current sale, a secondhand/marketplace listing, an off-brand or refurb option. Skip obvious junk (broken links, off-topic results, sketchy listings without prices).

Rules:
- Only include real options visible in the snippets. Never invent prices or stores.
- 3 options total. Less is OK if there's nothing good. Empty options array if nothing decent surfaced.
- Order most-recommended first.
- "why" sentence must be specific to the listing — not generic ("good price", "convenient"). e.g. "Same wash + size, ~70% off retail, picked up locally."
- ASCII only — no em-dashes, smart quotes, or unicode currency.
- summary is one sentence that makes Tilly sound like she scouted, not generated.`;

export async function synthesizeScout(opts: {
  query: string;
  location?: string | null;
  searches: TavilySearchResponse[];
  modelId?: string;
}): Promise<ScoutResult> {
  // Compact serialization of all results so the LLM has the full set.
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
  const userPrompt = `Raw search results (across ${opts.searches.length} Tavily queries):\n\n${lines.join("\n")}\n\nPick the top 3 options per the rules. Return the structured JSON.`;

  // Gemini Flash 2.0 over OpenRouter — cheap, 1M context, takes
  // structured output cleanly. Override possible via opts.modelId.
  const llm = new OpenRouterLLM(opts.modelId ?? "google/gemini-2.0-flash-001");
  return llm.structuredOutput<ScoutResult>({
    systemPrompts: [
      SYSTEM
        .replace("{QUERY}", opts.query)
        .replace("{LOCATION}", opts.location ?? "unknown"),
    ],
    messages: [{ role: "user", content: userPrompt }],
    schema: ScoutResultSchema,
    schemaName: "scout_result",
    maxTokens: 1500,
  });
}
