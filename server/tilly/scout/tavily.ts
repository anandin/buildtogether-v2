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
  /** Set when 0 results / non-200 — first 500 chars of raw response. */
  debugRaw?: string;
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
    // Tavily migrated `tvly-prod-*` keys to Bearer-header auth; the
    // legacy api_key-in-body form returns 200 with an Unauthorized
    // message in the JSON, which is silent failure mode for callers
    // that only check status. Always use the header.
    const body = {
      query: opts.query,
      search_depth: opts.searchDepth ?? "basic",
      max_results: opts.maxResults ?? 5,
      include_domains: opts.includeDomains ?? undefined,
      exclude_domains: opts.excludeDomains ?? undefined,
      include_answer: opts.includeAnswer ?? false,
    };
    const res = await fetch(TAVILY_BASE + "/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getApiKey()}`,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      console.warn(
        `[tavily] ${res.status} ${text.slice(0, 300)} for query="${opts.query}"`,
      );
      return { query: opts.query, results: [], responseTimeMs: Date.now() - t0, debugRaw: text.slice(0, 500) };
    }
    let json: { query: string; answer?: string; results: TavilyResult[] };
    try {
      json = JSON.parse(text);
    } catch (e) {
      console.warn(`[tavily] non-json body: ${text.slice(0, 300)}`);
      return { query: opts.query, results: [], responseTimeMs: Date.now() - t0, debugRaw: text.slice(0, 500) };
    }
    const results = json.results ?? [];
    if (results.length === 0) {
      console.warn(
        `[tavily] 200 but 0 results. body keys=${Object.keys(json).join(",")} sample=${text.slice(0, 300)}`,
      );
    }
    return {
      query: opts.query,
      answer: json.answer,
      results,
      responseTimeMs: Date.now() - t0,
      debugRaw: results.length === 0 ? text.slice(0, 500) : undefined,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[tavily] threw: ${msg}`);
    return { query: opts.query, results: [], responseTimeMs: Date.now() - t0 };
  }
}
