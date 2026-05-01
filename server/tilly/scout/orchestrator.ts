/**
 * Scout orchestrator — runs Tavily queries in parallel, synthesizes
 * via Gemini Flash, persists to tilly_scout_jobs, fires push.
 *
 * Two surfaces:
 *   - enqueueScout({ userId, householdId, query, location? })
 *       → creates a tilly_scout_jobs row with status='queued'
 *       → kicks off processScoutJob() WITHOUT awaiting (Vercel keeps
 *         the function alive until the promise resolves, up to 60s)
 *       → returns the job id immediately so the caller can respond fast
 *   - processScoutJob(jobId)
 *       → does the actual work; updates status as it progresses;
 *         on completion, fires a push notification + emits an event
 *
 * UPGRADE PATH: when we add slow sources (FB Marketplace via stealth
 * browser, image OCR, multi-step price-history scrapes), swap the
 * "kick off without awaiting" pattern for an Inngest event:
 *   await inngest.send({ name: "scout/start", data: { jobId } });
 * The processScoutJob function body stays the same.
 */
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { tillyScoutJobs, users } from "../../../shared/schema";
import { tavilySearch } from "./tavily";
import { synthesizeScout } from "./synthesize";
import { synthesizeWaitAdvice } from "./synthesize-wait";
import { emitEventAsync } from "../event-emitter";

export type ScoutMode = "find" | "wait";

export interface EnqueueScoutInput {
  userId: string;
  householdId: string;
  query: string;
  location?: string | null;
  /** S11 — 'find' (default) finds substitutes; 'wait' produces seasonal advice. */
  mode?: ScoutMode;
}

export interface EnqueueScoutOptions {
  /**
   * When true (default), the function awaits processScoutJob and only
   * returns after the scout reaches a terminal state. Vercel's serverless
   * runtime does NOT reliably keep orphan promises alive after the
   * response is sent, so the previous void-kickoff pattern stranded jobs
   * in "running" forever in production. Scout completes in 6-12s — well
   * inside the 60s function budget — so blocking is safe and dependable.
   *
   * Set false ONLY when the caller can prove it has its own out-of-band
   * mechanism keeping the promise alive (e.g. an Inngest worker).
   */
  awaitCompletion?: boolean;
}

export async function enqueueScout(
  input: EnqueueScoutInput,
  opts: EnqueueScoutOptions = {},
): Promise<string> {
  // S12 — fall back to the user's persistent city when no per-job location
  // is provided. This way once the user fills in their city in the profile,
  // every scout is automatically scoped to local secondhand inventory.
  let resolvedLocation = input.location;
  if (resolvedLocation == null) {
    const u = await db.query.users.findFirst({
      where: eq(users.id, input.userId),
      columns: { city: true },
    });
    resolvedLocation = u?.city ?? null;
  }

  const [row] = await db
    .insert(tillyScoutJobs)
    .values({
      userId: input.userId,
      householdId: input.householdId,
      query: input.query,
      location: resolvedLocation,
      mode: input.mode ?? "find",
      status: "queued",
    })
    .returning();

  if (opts.awaitCompletion === false) {
    // Caller takes ownership of keeping the promise alive (e.g. Inngest).
    // processScoutJob writes its own success/failure state, so no
    // top-level handler is needed.
    void processScoutJob(row.id);
  } else {
    // Default: block until terminal. Errors are already caught inside
    // processScoutJob and written to the job row, so we deliberately
    // don't await-throw here either.
    await processScoutJob(row.id);
  }

  return row.id;
}

/**
 * Retailers we should NEVER suggest because they don't exist anymore in
 * Canada. Tavily's index still serves their old listing pages, which
 * surfaces sale prices from years ago — Tilly was caught recommending a
 * 2014 Hudson's Bay deal in mid-2026, after Hudson's Bay had liquidated
 * every Canadian store. Block at the search level so the synthesizer
 * never sees them in the first place.
 */
const DEFUNCT_CANADIAN_RETAILERS = [
  "thebay.com", // Hudson's Bay — closed all Canadian stores in 2025
  "hbc.com",
  "sears.ca", // Sears Canada — closed 2018
  "target.ca", // Target Canada — closed 2015
  "futureshop.ca", // Future Shop — closed 2015
  "zellers.com", // Zellers original — closed 2013 (modern relaunch is small)
];

type StrategyDef = {
  query: string;
  domains?: string[];
  excludeDomains?: string[];
  includeAnswer?: boolean;
  timeRange?: "day" | "week" | "month" | "year";
};

/**
 * Build query strategies for a 'find' scout — 3 parallel searches that
 * cover live secondhand inventory, current sales, and off-brand/refurb
 * alternatives.
 */
function buildFindStrategies(query: string, location?: string | null): StrategyDef[] {
  const loc = (location ?? "Canada").trim();
  return [
    // (1) Secondhand inventory — Kijiji + Karrot scoped, recent posts only.
    {
      query: `${query} secondhand ${loc}`,
      domains: ["kijiji.ca", "karrot.ca", "facebook.com", "marketplace.facebook.com"],
      timeRange: "month",
    },
    // (2) Current sales / deals — RFD + open web. Time-bound to the
    // last month so we don't surface a 2014 Hudson's Bay deal.
    {
      query: `${query} sale Canada deal`,
      domains: ["redflagdeals.com", "smartcanucks.ca"],
      excludeDomains: DEFUNCT_CANADIAN_RETAILERS,
      includeAnswer: true,
      timeRange: "month",
    },
    // (3) Off-brand or refurb alternatives — open web, but recency-bounded
    // and with the defunct-retailer blocklist so we don't link to stores
    // that don't exist anymore.
    {
      query: `${query} cheaper alternative refurbished`,
      excludeDomains: DEFUNCT_CANADIAN_RETAILERS,
      includeAnswer: true,
      timeRange: "year",
    },
  ];
}

/**
 * Build query strategies for a 'wait' / seasonal-advice scout — 3
 * parallel searches that gather sale-history evidence so the synthesizer
 * can decide whether there's a credible upcoming discount window.
 *
 * - (1) RFD/SmartCanucks recent threads: real shoppers reporting deal
 *   patterns. Time-bound to the last year so the pattern reflects the
 *   current retailer landscape (Hudson's Bay isn't around anymore).
 * - (2) Black Friday / Boxing Day / seasonal-sale calendar — open-web
 *   year-bounded to find blogger-curated sale-windowed advice.
 * - (3) Brand-specific seasonal cycle ("when does Gap go on sale" /
 *   "Levi's sale calendar") — useful for staple items.
 */
function buildWaitStrategies(query: string, location?: string | null): StrategyDef[] {
  const loc = (location ?? "Canada").trim();
  return [
    {
      query: `${query} sale history when on sale ${loc}`,
      domains: ["redflagdeals.com", "smartcanucks.ca"],
      excludeDomains: DEFUNCT_CANADIAN_RETAILERS,
      includeAnswer: true,
      timeRange: "year",
    },
    {
      query: `${query} Black Friday Boxing Day seasonal sale Canada`,
      excludeDomains: DEFUNCT_CANADIAN_RETAILERS,
      includeAnswer: true,
      timeRange: "year",
    },
    {
      query: `when does ${query} go on sale best time to buy`,
      excludeDomains: DEFUNCT_CANADIAN_RETAILERS,
      includeAnswer: true,
      timeRange: "year",
    },
  ];
}

export async function processScoutJob(jobId: string): Promise<void> {
  // Mark running
  await db
    .update(tillyScoutJobs)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(tillyScoutJobs.id, jobId));

  try {
    const job = await db.query.tillyScoutJobs.findFirst({
      where: eq(tillyScoutJobs.id, jobId),
    });
    if (!job) throw new Error("job row vanished mid-flight");

    const mode: ScoutMode = (job.mode as ScoutMode) ?? "find";
    const strategies =
      mode === "wait"
        ? buildWaitStrategies(job.query, job.location)
        : buildFindStrategies(job.query, job.location);
    const searches = await Promise.all(
      strategies.map((s) =>
        tavilySearch({
          query: s.query,
          searchDepth: "basic",
          maxResults: 6,
          includeDomains: s.domains,
          excludeDomains: s.excludeDomains,
          includeAnswer: s.includeAnswer,
          timeRange: s.timeRange,
        }),
      ),
    );

    // If every search returned zero results, fail loudly so the user
    // sees a clear "couldn't find anything" rather than a stale spinner.
    const totalResults = searches.reduce((s, r) => s + r.results.length, 0);
    if (totalResults === 0) {
      await db
        .update(tillyScoutJobs)
        .set({
          status: "failed",
          errorText: "No live results from any source.",
          completedAt: new Date(),
        })
        .where(eq(tillyScoutJobs.id, jobId));
      return;
    }

    // Synthesize via cheap LLM. Wait-mode produces a different shape
    // (shouldWait/waitUntil/expectedSaving/sources) but the persistence
    // path is the same — store the structured result blob, the chat-history
    // serializer renders the right card based on job.mode.
    let resultBlob: Record<string, unknown>;
    let summary: string;
    if (mode === "wait") {
      const advice = await synthesizeWaitAdvice({
        query: job.query,
        location: job.location,
        searches,
      });
      resultBlob = advice as unknown as Record<string, unknown>;
      summary = advice.summary;
    } else {
      const result = await synthesizeScout({
        query: job.query,
        location: job.location,
        searches,
      });
      resultBlob = result as unknown as Record<string, unknown>;
      summary = result.summary;
    }

    await db
      .update(tillyScoutJobs)
      .set({
        status: "done",
        result: resultBlob,
        completedAt: new Date(),
      })
      .where(eq(tillyScoutJobs.id, jobId));

    // S4 — emit a nudge_sent event so the bandit can later learn
    // from which scout options the user clicks. The frame is
    // "implementation_intention" (we're offering a concrete next step).
    emitEventAsync({
      userId: job.userId,
      householdId: job.householdId,
      kind: "nudge_sent",
      payload: {
        scoutJobId: jobId,
        scoutMode: mode,
        summary,
      },
      sourceTable: "tilly_scout_jobs",
      sourceId: jobId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[scout] job ${jobId} failed:`, msg);
    await db
      .update(tillyScoutJobs)
      .set({
        status: "failed",
        errorText: msg.slice(0, 500),
        completedAt: new Date(),
      })
      .where(eq(tillyScoutJobs.id, jobId));
  }
}
