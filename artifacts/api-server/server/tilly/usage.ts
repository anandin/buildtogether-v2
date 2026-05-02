/**
 * Per-user daily token usage tracking + cap enforcement.
 *
 * Every chat / structured-output call routes through the LLM client; the
 * client increments `usage` here on success. If a user crosses the daily
 * cap, the next call returns a soft 429 with a message Tilly says in her
 * own voice — never an opaque server error.
 *
 * The numbers are conservative for a free beta: 200K input + 80K output
 * tokens/day = roughly $5/day at Opus 4.7 prices. We log a warning at
 * 50K/20K so we can intervene before the cap hits.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";

export type UsageWindow = {
  date: string; // YYYY-MM-DD UTC
  inputTokens: number;
  outputTokens: number;
};

const DAILY_INPUT_CAP = 200_000;
const DAILY_OUTPUT_CAP = 80_000;
const SOFT_WARN_INPUT = 50_000;
const SOFT_WARN_OUTPUT = 20_000;

let _ensured = false;

async function ensureUsageTable(): Promise<void> {
  if (_ensured) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "tilly_usage" (
      "user_id" varchar NOT NULL,
      "date" text NOT NULL,
      "input_tokens" integer NOT NULL DEFAULT 0,
      "output_tokens" integer NOT NULL DEFAULT 0,
      "request_count" integer NOT NULL DEFAULT 0,
      "updated_at" timestamp DEFAULT now() NOT NULL,
      PRIMARY KEY ("user_id", "date")
    )
  `);
  _ensured = true;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Returns the user's usage for today. `0/0` if the row doesn't exist yet.
 */
export async function getTodayUsage(userId: string): Promise<UsageWindow> {
  await ensureUsageTable();
  const today = todayUtc();
  const r = await db.execute<{ input_tokens: number; output_tokens: number }>(sql`
    SELECT input_tokens, output_tokens
      FROM "tilly_usage"
     WHERE user_id = ${userId} AND date = ${today}
     LIMIT 1
  `);
  const row = (r as any).rows?.[0] ?? (r as any)[0];
  return {
    date: today,
    inputTokens: row?.input_tokens ?? 0,
    outputTokens: row?.output_tokens ?? 0,
  };
}

/**
 * Throws CapExceeded if the user is over their daily cap. Call before each
 * chargeable LLM round-trip. Cheaper than checking after — we'd rather
 * 429 the user than burn one more $0.50 round-trip.
 */
export class CapExceeded extends Error {
  constructor(public readonly window: UsageWindow) {
    super("daily LLM cap exceeded");
    this.name = "CapExceeded";
  }
}

export async function assertUnderCap(userId: string): Promise<UsageWindow> {
  const u = await getTodayUsage(userId);
  if (u.inputTokens >= DAILY_INPUT_CAP || u.outputTokens >= DAILY_OUTPUT_CAP) {
    throw new CapExceeded(u);
  }
  if (u.inputTokens >= SOFT_WARN_INPUT || u.outputTokens >= SOFT_WARN_OUTPUT) {
    console.warn(
      `[usage] ${userId} approaching daily cap: ${u.inputTokens} in / ${u.outputTokens} out`,
    );
  }
  return u;
}

/** Add to the user's daily counters after a successful LLM call. */
export async function recordUsage(
  userId: string,
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  await ensureUsageTable();
  const today = todayUtc();
  await db.execute(sql`
    INSERT INTO "tilly_usage" (user_id, date, input_tokens, output_tokens, request_count)
    VALUES (${userId}, ${today}, ${inputTokens}, ${outputTokens}, 1)
    ON CONFLICT (user_id, date) DO UPDATE
      SET input_tokens = "tilly_usage".input_tokens + ${inputTokens},
          output_tokens = "tilly_usage".output_tokens + ${outputTokens},
          request_count = "tilly_usage".request_count + 1,
          updated_at = now()
  `);
}

export const DAILY_CAPS = {
  input: DAILY_INPUT_CAP,
  output: DAILY_OUTPUT_CAP,
} as const;
