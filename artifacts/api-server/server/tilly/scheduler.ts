/**
 * In-process scheduler for Tilly's nightly memory jobs.
 *
 * On Vercel we relied on `vercel.json` cron to POST the /api/cron/* endpoints.
 * On Replit there's no platform cron in the runtime, so we wake up once per
 * minute, check whether each job's daily window has been crossed, and run
 * it in-process. State is held in memory — a process restart will re-trigger
 * any job whose window opened during the downtime, which is exactly what we
 * want (idempotent: each job is a no-op if there's nothing fresh to do).
 *
 * Disabled when:
 *   - running on Vercel (VERCEL=1)
 *   - TILLY_SCHEDULER_DISABLED=1 (tests, ad-hoc scripts)
 *
 * Schedule (UTC):
 *   03:00 — distill yesterday's events into typed L2 memories
 *   03:30 — rewrite dossiers for users with new typed memories
 *   04:00 — archive stale L2a memories per user retention pref
 *
 * All times are UTC so behavior is identical across deployments.
 */
import { distillAllActiveUsers } from "./nightly-distiller";
import { rewriteDossiersForActiveUsers } from "./dossier-rewriter";
import { archiveStaleMemories } from "./memory-archiver";

interface DailyJob {
  name: string;
  hourUtc: number;
  minuteUtc: number;
  run: () => Promise<unknown>;
  lastRunDayUtc: string | null; // YYYY-MM-DD of last successful run
}

const jobs: DailyJob[] = [
  {
    name: "distill-memories",
    hourUtc: 3,
    minuteUtc: 0,
    lastRunDayUtc: null,
    async run() {
      // 26h window (not 24h) so brief downtime around the daily boundary
      // doesn't lose events. Both downstream functions are idempotent.
      const since = new Date(Date.now() - 26 * 60 * 60 * 1000);
      const r = await distillAllActiveUsers(since);
      console.log(`[scheduler] distill-memories ok:`, JSON.stringify(r));
    },
  },
  {
    name: "rewrite-dossiers",
    hourUtc: 3,
    minuteUtc: 30,
    lastRunDayUtc: null,
    async run() {
      const since = new Date(Date.now() - 26 * 60 * 60 * 1000);
      const r = await rewriteDossiersForActiveUsers(since);
      console.log(`[scheduler] rewrite-dossiers ok:`, JSON.stringify(r));
    },
  },
  {
    name: "archive-memories",
    hourUtc: 4,
    minuteUtc: 0,
    lastRunDayUtc: null,
    async run() {
      const r = await archiveStaleMemories();
      console.log(
        `[scheduler] archive-memories ok: scanned=${r.scanned} archived=${r.archived}`,
      );
    },
  },
];

let timer: NodeJS.Timeout | null = null;

function utcDayString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function tick(): Promise<void> {
  const now = new Date();
  const today = utcDayString(now);
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();

  for (const job of jobs) {
    if (job.lastRunDayUtc === today) continue;
    const due =
      hour > job.hourUtc ||
      (hour === job.hourUtc && minute >= job.minuteUtc);
    if (!due) continue;

    job.lastRunDayUtc = today; // claim the slot before awaiting to prevent double-fires
    try {
      await job.run();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[scheduler] ${job.name} failed:`, msg);
      // Do NOT clear lastRunDayUtc — better to skip a day than retry-loop a
      // failing job all day. Recovery: restart the process.
    }
  }
}

export function startTillyScheduler(): void {
  if (timer) return;
  if (process.env.VERCEL === "1" || process.env.VERCEL_ENV) {
    console.log("[scheduler] disabled (running on Vercel)");
    return;
  }
  if (process.env.TILLY_SCHEDULER_DISABLED === "1") {
    console.log("[scheduler] disabled by TILLY_SCHEDULER_DISABLED=1");
    return;
  }

  console.log(
    `[scheduler] starting — daily jobs at 03:00, 03:30, 04:00 UTC (distill → dossier → archive)`,
  );

  // Tick once on boot so a long downtime doesn't miss the day's run, and
  // then every 60s. Initial tick is delayed 30s so app boot finishes first.
  setTimeout(() => {
    void tick();
  }, 30_000);
  timer = setInterval(() => {
    void tick();
  }, 60_000);
  // Don't keep the event loop alive on shutdown.
  if (typeof timer.unref === "function") timer.unref();
}

export function stopTillyScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
