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
import { tillyScoutJobs } from "../../../shared/schema";
import { tavilySearch } from "./tavily";
import { synthesizeScout } from "./synthesize";
import { emitEventAsync } from "../event-emitter";

export interface EnqueueScoutInput {
  userId: string;
  householdId: string;
  query: string;
  location?: string | null;
}

export async function enqueueScout(input: EnqueueScoutInput): Promise<string> {
  const [row] = await db
    .insert(tillyScoutJobs)
    .values({
      userId: input.userId,
      householdId: input.householdId,
      query: input.query,
      location: input.location ?? null,
      status: "queued",
    })
    .returning();

  // Kick off the orchestrator without awaiting. Errors get caught and
  // written back to the job row by processScoutJob itself, so we don't
  // need a top-level handler here.
  void processScoutJob(row.id);

  return row.id;
}

/**
 * Build 3 query strategies from one user query. Returns the queries
 * scoped + tagged for the LLM.
 */
function buildQueryStrategies(query: string, location?: string | null): {
  query: string;
  domains?: string[];
  includeAnswer?: boolean;
}[] {
  const loc = (location ?? "Canada").trim();
  return [
    // (1) Secondhand inventory — Kijiji + Karrot scoped.
    {
      query: `${query} secondhand ${loc}`,
      domains: ["kijiji.ca", "karrot.ca", "facebook.com", "marketplace.facebook.com"],
    },
    // (2) Current sales / deals — RFD + open web.
    {
      query: `${query} sale Canada deal`,
      domains: ["redflagdeals.com", "smartcanucks.ca"],
      includeAnswer: true,
    },
    // (3) Off-brand or refurb alternatives — open web search, no domain restriction.
    {
      query: `${query} cheaper alternative refurbished`,
      includeAnswer: true,
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

    // Run the 3 search strategies in parallel.
    const strategies = buildQueryStrategies(job.query, job.location);
    const searches = await Promise.all(
      strategies.map((s) =>
        tavilySearch({
          query: s.query,
          searchDepth: "basic",
          maxResults: 6,
          includeDomains: s.domains,
          includeAnswer: s.includeAnswer,
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

    // Synthesize via cheap LLM.
    const result = await synthesizeScout({
      query: job.query,
      location: job.location,
      searches,
    });

    await db
      .update(tillyScoutJobs)
      .set({
        status: "done",
        result: result as unknown as Record<string, unknown>,
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
        optionCount: result.options.length,
        summary: result.summary,
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
