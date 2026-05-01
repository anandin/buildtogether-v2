/**
 * Tavily live web-search client.
 *
 * Tavily's API is built for LLM consumption: returns cleaned text +
 * URLs without the noise of raw HTML. Used by the scout orchestrator
 * for general web coverage (current sales, reviews, alternative
 * stores, etc.) — alongside the platform-specific scrapers (Kijiji,
 * Karrot).
 *
 * Free tier is 1k searches/month. Paid is $30/mo for 4k. We use
 * `search_depth=basic` (cheaper, fewer results) by default; bump to
 * 'advanced' only when synthesis quality matters.
 *
 * Docs: https://docs.tavily.com/docs/rest-api/api-reference
 */

const TAVILY_BASE = "https://api.tavily.com";

export interface TavilyResult {
  title: string;
  url: string;
  content: string; // cleaned text snippet
  score: number;
  /** raw_content present only when include_raw_content=true */
  raw_content?: string;
}

export interface TavilySearchOptions {
  query: string;
  /** "basic" (free) | "advanced" (1 credit) */
  searchDepth?: "basic" | "advanced";
  /** Limit results — Tavily defaults to 5. */
  maxResults?: number;
  /** Restrict to a domain list, e.g. ["kijiji.ca", "redflagdeals.com"]. */
  includeDomains?: string[];
  /** Skip a domain list. */
  excludeDomains?: string[];
  /** Include AI-generated 1-line answer summary. */
  includeAnswer?: boolean;
}

export interface TavilySearchResponse {
  query: string;
  /** Tavily's own LLM summary if includeAnswer=true */
  answer?: string;
  results: TavilyResult[];
  responseTimeMs: number;
}

function getApiKey(): string {
  const key = process.env.TAVILY_API_KEY;
  if (!key) {
    throw new Error("TAVILY_API_KEY env var not set");
  }
  return key;
}

/**
 * Fire one Tavily search. Returns cleaned + ranked results. Never
 * throws on transport failures — returns an empty result list with
 * the error logged. Caller can decide whether to fail the whole scout
 * or continue with other sources.
 */
export async function tavilySearch(
  opts: TavilySearchOptions,
): Promise<TavilySearchResponse> {
  const t0 = Date.now();
  try {
    const body = {
      api_key: getApiKey(),
      query: opts.query,
      search_depth: opts.searchDepth ?? "basic",
      max_results: opts.maxResults ?? 5,
      include_domains: opts.includeDomains ?? undefined,
      exclude_domains: opts.excludeDomains ?? undefined,
      include_answer: opts.includeAnswer ?? false,
    };
    const res = await fetch(TAVILY_BASE + "/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn(
        `[tavily] ${res.status} ${text.slice(0, 200)} for query="${opts.query}"`,
      );
      return { query: opts.query, results: [], responseTimeMs: Date.now() - t0 };
    }
    const json = (await res.json()) as {
      query: string;
      answer?: string;
      results: TavilyResult[];
    };
    return {
      query: opts.query,
      answer: json.answer,
      results: json.results ?? [],
      responseTimeMs: Date.now() - t0,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[tavily] threw: ${msg}`);
    return { query: opts.query, results: [], responseTimeMs: Date.now() - t0 };
  }
}
