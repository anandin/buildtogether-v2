/**
 * S2 — Nightly distiller. Pulls last-N hours of L1 events for one user
 * and produces typed L2 memories (decision/regret/nudge_outcome/
 * bias_observed/preference/tradeoff/life_context) with structured
 * metadata + lineage back to source events.
 *
 * Cheap. Uses Haiku 4.5 with structured output. Skips the LLM call when
 * no behaviorally-interesting events landed in the window.
 *
 * Never throws — failures are logged and the user is skipped, so one
 * bad user can't poison the whole nightly batch.
 */
import { z } from "zod";
import { eq, and, gte, sql } from "drizzle-orm";

import { db } from "../db";
import { tillyEvents, tillyMemoryV2 } from "../../shared/schema";
import { OpenRouterLLM } from "./llm/openrouter";

// ─── Schema ────────────────────────────────────────────────────────────────

const MemoryItemSchema = z.object({
  kind: z
    .enum([
      "decision",
      "regret",
      "nudge_outcome",
      "bias_observed",
      "preference",
      "tradeoff",
      "life_context",
    ])
    .describe("Best-fit kind for this memory."),
  body: z
    .string()
    .describe(
      "1-2 sentence English fact, third-person about the user. Specific, evidenced, never speculative.",
    ),
  metadata: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .describe(
      "Typed key-value object. Only flat string/number/bool/null values. Pick keys that match the kind.",
    ),
  source_event_ids: z
    .array(z.string())
    .describe("IDs of the input events that fed this conclusion."),
});

const DistillSchema = z.object({
  memories: z.array(MemoryItemSchema).describe(
    "0-8 distilled memories. Empty array if nothing in this window is durable.",
  ),
});

type DistillResult = z.infer<typeof DistillSchema>;

// ─── Prompt ────────────────────────────────────────────────────────────────

const SYSTEM = `You're the nightly memory distiller for Tilly, a personal finance agent for students. You turn the last day's raw events for one user into a small set of typed memories Tilly will reference in future chats and use to personalize nudges.

Output kinds and the typed metadata each one should carry:

- decision: user made a money decision (spent or chose not to spend)
  metadata fields: amount (number), alternative_amount? (number), alternative_label? (string), rationale_quote? (string), frame_used? (string)

- regret: user expressed regret about a past spend, OR the data shows a soft-spot they keep hitting
  metadata: spend_amount? (number), expressed_at? (ISO date string), trigger? (string), intensity? ("mild"|"moderate"|"strong")

- nudge_outcome: a Tilly nudge / reminder / Tilly Learned card landed (or didn't)
  metadata: frame (string), accepted (boolean), latency_to_action_min? (number)

- bias_observed: user demonstrated responsiveness to a specific behavioral econ frame
  Frames to choose from: loss_aversion, social_proof, default_taken, anchor, present_bias, mental_accounting, goal_gradient, implementation_intention, fresh_start, endowment, sdt_autonomy, sdt_competence, habit_loop, streak, pre_commitment
  metadata: frame (one of the above), evidence_quote (string)

- preference: stable preference Tilly should remember in future chat
  metadata: topic (string), value (string)

- tradeoff: user explicitly traded one thing for another
  metadata: chose (string), rejected (string), reasoning_quote? (string)

- life_context: identity / situation that shapes their money decisions (school, roommate, job, health, etc.)
  metadata: topic (string), value (string)

RULES:
- Only output what's actually evidenced by the events. NO speculation. If nothing is distillable, return an empty list.
- 1-2 sentence body, third-person, specific. Not "user spent money" — "Riley chose the $90 show over the $200 one, citing Tokyo savings."
- ASCII only. No em-dashes (use -), no smart quotes.
- source_event_ids must reference event IDs that actually appear in the input.
- Skip generic noise (greetings, small talk, technical errors).
- Prefer 1 memory that captures the through-line over 3 memories that all say similar things.`;

// ─── Distiller ─────────────────────────────────────────────────────────────

export interface DistillUserInput {
  userId: string;
  householdId: string;
  /** Inclusive lower bound for events to read. Defaults to now()-24h. */
  since?: Date;
  /** Override LLM model (default: haiku 4.5). */
  modelId?: string;
}

export interface DistillUserResult {
  userId: string;
  eventsScanned: number;
  memoriesCreated: number;
  skipped: boolean;
  reason?: string;
}

export async function distillUser(
  input: DistillUserInput,
): Promise<DistillUserResult> {
  const since = input.since ?? new Date(Date.now() - 24 * 60 * 60 * 1000);

  const events = await db
    .select()
    .from(tillyEvents)
    .where(
      and(eq(tillyEvents.userId, input.userId), gte(tillyEvents.ts, since)),
    )
    .orderBy(tillyEvents.ts);

  if (events.length === 0) {
    return {
      userId: input.userId,
      eventsScanned: 0,
      memoriesCreated: 0,
      skipped: true,
      reason: "no events in window",
    };
  }

  // Skip if nothing behaviorally interesting happened — pure tech events
  // (just chat replies with no user msg, or just tone changes) aren't
  // worth distilling. Heuristic: need at least one of the meaty kinds.
  const meaty = events.some((e) =>
    [
      "expense_logged",
      "reminder_created",
      "reminder_cancelled",
      "learned_remind_accepted",
      "learned_dismissed",
      "dream_contributed",
      "nudge_acted_on",
      "nudge_ignored",
    ].includes(e.kind),
  );
  const hasChat = events.some((e) => e.kind === "chat_user_msg");
  if (!meaty && !hasChat) {
    return {
      userId: input.userId,
      eventsScanned: events.length,
      memoriesCreated: 0,
      skipped: true,
      reason: "no meaty events",
    };
  }

  // Serialize events as compact lines the LLM can scan quickly.
  const eventsBlock = events
    .map((e) => {
      const ts = e.ts.toISOString();
      const payload = JSON.stringify(e.payload).slice(0, 300);
      return `${e.id} | ${ts} | ${e.kind} | ${payload}`;
    })
    .join("\n");

  const userPrompt = `Distill the following events for user ${input.userId}. Return memories per the rules.\n\nEVENTS (id | ts | kind | payload):\n${eventsBlock}`;

  const llm = new OpenRouterLLM(input.modelId ?? "anthropic/claude-haiku-4.5");
  let result: DistillResult;
  try {
    result = await llm.structuredOutput<DistillResult>({
      systemPrompts: [SYSTEM],
      messages: [{ role: "user", content: userPrompt }],
      schema: DistillSchema,
      schemaName: "memory_distill",
      maxTokens: 1500,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[distiller] LLM failed for user ${input.userId}: ${msg}`);
    return {
      userId: input.userId,
      eventsScanned: events.length,
      memoriesCreated: 0,
      skipped: true,
      reason: `LLM failed: ${msg.slice(0, 100)}`,
    };
  }

  if (result.memories.length === 0) {
    return {
      userId: input.userId,
      eventsScanned: events.length,
      memoriesCreated: 0,
      skipped: true,
      reason: "LLM produced no memories",
    };
  }

  // Filter to event IDs that actually exist (LLM occasionally invents).
  const validIds = new Set(events.map((e) => e.id));

  const rows = result.memories.map((m) => ({
    userId: input.userId,
    householdId: input.householdId,
    kind: m.kind,
    body: m.body,
    metadata: m.metadata as Record<string, unknown>,
    sourceEventIds: m.source_event_ids.filter((id) => validIds.has(id)),
  }));

  await db.insert(tillyMemoryV2).values(rows);

  return {
    userId: input.userId,
    eventsScanned: events.length,
    memoriesCreated: rows.length,
    skipped: false,
  };
}

/**
 * Distill all users with at least one new event since `since`. Caps at
 * `maxUsers` per run to keep one cron invocation under Vercel's 60s
 * function timeout. Returns aggregate stats.
 */
export async function distillAllActiveUsers(
  since: Date,
  maxUsers = 50,
): Promise<{
  scanned: number;
  distilled: number;
  totalMemories: number;
  failures: { userId: string; reason: string }[];
}> {
  // Find users with events since `since`. We pull (user_id, household_id)
  // tuples directly from the event log.
  const activeRows = await db
    .selectDistinct({
      userId: tillyEvents.userId,
      householdId: tillyEvents.householdId,
    })
    .from(tillyEvents)
    .where(gte(tillyEvents.ts, since))
    .limit(maxUsers);

  let totalMemories = 0;
  const failures: { userId: string; reason: string }[] = [];

  for (const row of activeRows) {
    const r = await distillUser({
      userId: row.userId,
      householdId: row.householdId,
      since,
    });
    totalMemories += r.memoriesCreated;
    if (r.skipped && r.reason && !r.reason.includes("no events")) {
      failures.push({ userId: row.userId, reason: r.reason });
    }
  }

  return {
    scanned: activeRows.length,
    distilled: activeRows.length - failures.length,
    totalMemories,
    failures,
  };
}
