/**
 * S3 — Dossier rewriter. Reads a user's typed memories (L2) and
 * produces a 7-section dossier JSON that Tilly's chat system prompt
 * injects on every turn. Sonnet 4.6 handles the rewrite — it's the one
 * place we want the model judging "what's still relevant" carefully.
 *
 * One row per user per rewrite (history-keeping). Caller picks the
 * latest row per user via getLatestDossier().
 *
 * Cost: ~$0.02 / user / rewrite (3-5k input tokens of memories +
 * previous dossier, ~1k output tokens).
 *
 * Skips when there are no memories to consider AND no previous dossier
 * — first-run-with-no-data is a noop.
 */
import { z } from "zod";
import { eq, desc, gte } from "drizzle-orm";

import { db } from "../db";
import { tillyMemoryV2, tillyDossiers, type TillyDossier } from "../../shared/schema";
import { OpenRouterLLM } from "./llm/openrouter";

// ─── Schema ────────────────────────────────────────────────────────────────

// nudge_response_profile is an array of frame entries (not a keyed map)
// because OpenRouter's json_schema mode rejects `additionalProperties:
// <schema>` against Anthropic providers. We convert to a keyed map at
// read time in formatDossierForPrompt() / consumers.
const FrameEntrySchema = z.object({
  frame: z.string().describe("Behavioral-econ frame name."),
  accept_rate: z.number().min(0).max(1),
  n: z.number().int().min(0),
  best_form: z.string(),
});
export type FrameEntry = z.infer<typeof FrameEntrySchema>;

export const DossierContentSchema = z.object({
  identity: z
    .string()
    .describe("1-3 sentences. Their role/situation/age range/place."),
  money_arc: z
    .string()
    .describe("2-4 sentences. Income cadence, recurring patterns, current arc."),
  soft_spots: z
    .array(z.string())
    .max(5)
    .describe("0-5 short strings. Recurring spend patterns they regret."),
  nudge_response_profile: z
    .array(FrameEntrySchema)
    .describe(
      "Array of frame entries. Each entry: {frame, accept_rate (0-1), n (int), best_form (1 sentence)}. Skip frames with n<2 — empty array is fine.",
    ),
  recent_decisions: z
    .array(z.string())
    .max(5)
    .describe("0-5 short strings. Last week's notable decisions, newest first."),
  trust_signals: z
    .array(z.string())
    .max(5)
    .describe("0-5 short strings. Cues about how much the user trusts Tilly."),
  open_loops: z
    .array(z.string())
    .max(3)
    .describe("0-3 short strings. Promises Tilly made that aren't resolved."),
});

export type DossierContent = z.infer<typeof DossierContentSchema>;

// ─── Prompt ────────────────────────────────────────────────────────────────

const SYSTEM = `You maintain a persistent dossier on a user of Tilly, a personal-finance app for students. The dossier is a 7-section JSON that Tilly reads at the start of every chat to understand who this person is and how to talk to them.

Sections:
- identity: 1-3 sentences. Role/situation/age range/place. Update only when life_context evidence is fresh; otherwise keep prior value.
- money_arc: 2-4 sentences. Income cadence, recurring patterns, current arc. Driven by decision/regret memories.
- soft_spots: array of 0-5 short strings. Recurring spend patterns they regret or are working on. From regret + bias_observed.
- nudge_response_profile: array of {frame, accept_rate, n, best_form}. Frames: loss_aversion, social_proof, default_taken, anchor, present_bias, mental_accounting, goal_gradient, implementation_intention, fresh_start, endowment, sdt_autonomy, sdt_competence, habit_loop, streak, pre_commitment. accept_rate (0-1), n (count of observations), best_form (1 sentence: when this frame works for THIS user). Skip frames with n<2 — empty array is fine if not enough evidence.
- recent_decisions: array of 0-5 short strings. Last week's notable decisions, newest first. From decision + tradeoff.
- trust_signals: array of 0-5 short strings. How much the user trusts Tilly. Examples: "asked Tilly to set a real reminder", "ignored 3 push nudges in a row".
- open_loops: array of 0-3 short strings. Promises Tilly made that aren't resolved (active reminders, "I'll check back" follow-ups).

RULES:
- Never invent. Every claim must be supportable from the previous dossier or the new memories.
- Prune stale claims if newer evidence contradicts them. Keep prior values when there's no new evidence.
- ASCII chars only. No em-dashes (use -), no smart quotes.
- Total content < 3500 chars (this becomes a system prompt block on every chat turn — keep it tight).
- If the previous dossier had a section you have no evidence for now, KEEP the prior value. Don't prune just because no new memory mentioned it.`;

// ─── Rewriter ──────────────────────────────────────────────────────────────

export interface RewriteDossierInput {
  userId: string;
  /** How many of the most-recent typed memories to feed in. Default 50. */
  memoryLimit?: number;
  modelId?: string;
}

export interface RewriteDossierResult {
  userId: string;
  memoriesConsidered: number;
  skipped: boolean;
  reason?: string;
  dossier?: DossierContent;
}

export async function rewriteDossier(
  input: RewriteDossierInput,
): Promise<RewriteDossierResult> {
  const memoryLimit = input.memoryLimit ?? 50;

  const [memories, prevRow] = await Promise.all([
    db
      .select()
      .from(tillyMemoryV2)
      .where(eq(tillyMemoryV2.userId, input.userId))
      .orderBy(desc(tillyMemoryV2.createdAt))
      .limit(memoryLimit),
    db
      .select()
      .from(tillyDossiers)
      .where(eq(tillyDossiers.userId, input.userId))
      .orderBy(desc(tillyDossiers.generatedAt))
      .limit(1),
  ]);

  if (memories.length === 0 && !prevRow[0]) {
    return {
      userId: input.userId,
      memoriesConsidered: 0,
      skipped: true,
      reason: "no memories and no prior dossier",
    };
  }

  const prevContent = prevRow[0]?.content ?? null;
  const memoriesBlock =
    memories.length === 0
      ? "(no new memories since last rewrite)"
      : memories
          .map((m) => {
            const meta = JSON.stringify(m.metadata).slice(0, 200);
            return `[${m.kind}] ${m.body} | meta: ${meta}`;
          })
          .join("\n");

  const userPrompt = `Rewrite the dossier for user ${input.userId}.

PREVIOUS DOSSIER:
${prevContent ? JSON.stringify(prevContent, null, 2) : "(none — first run)"}

NEW MEMORIES (most recent first):
${memoriesBlock}

Return the updated dossier JSON per the schema.`;

  const llm = new OpenRouterLLM(input.modelId ?? "anthropic/claude-sonnet-4.6");
  let dossier: DossierContent;
  try {
    dossier = await llm.structuredOutput<DossierContent>({
      systemPrompts: [SYSTEM],
      messages: [{ role: "user", content: userPrompt }],
      schema: DossierContentSchema,
      schemaName: "tilly_dossier",
      maxTokens: 1500,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[dossier] rewrite failed for user ${input.userId}: ${msg}`);
    return {
      userId: input.userId,
      memoriesConsidered: memories.length,
      skipped: true,
      reason: `LLM failed: ${msg.slice(0, 100)}`,
    };
  }

  await db.insert(tillyDossiers).values({
    userId: input.userId,
    content: dossier,
    memoriesConsidered: memories.length,
  });

  return {
    userId: input.userId,
    memoriesConsidered: memories.length,
    skipped: false,
    dossier,
  };
}

/**
 * Read the latest dossier for a user. Returns null if none yet exists.
 * Used by the chat system-prompt builder.
 */
export async function getLatestDossier(
  userId: string,
): Promise<TillyDossier | null> {
  const rows = await db
    .select()
    .from(tillyDossiers)
    .where(eq(tillyDossiers.userId, userId))
    .orderBy(desc(tillyDossiers.generatedAt))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Format a dossier into a system-prompt block. Empty fields are
 * skipped so the prompt stays tight.
 */
export function formatDossierForPrompt(content: DossierContent): string {
  const lines: string[] = [];
  lines.push("What you know about this student (your dossier):");
  if (content.identity) lines.push(`Identity: ${content.identity}`);
  if (content.money_arc) lines.push(`Money arc: ${content.money_arc}`);
  if (content.soft_spots.length)
    lines.push(`Soft spots: ${content.soft_spots.join(" | ")}`);
  if (content.recent_decisions.length)
    lines.push(`Recent decisions: ${content.recent_decisions.join(" | ")}`);
  if (content.trust_signals.length)
    lines.push(`Trust signals: ${content.trust_signals.join(" | ")}`);
  if (content.open_loops.length)
    lines.push(`Open loops you owe them: ${content.open_loops.join(" | ")}`);
  const frames = content.nudge_response_profile.filter((p) => p.n >= 2);
  if (frames.length) {
    const formatted = frames
      .map(
        (p) =>
          `${p.frame} (n=${p.n}, accept=${(p.accept_rate * 100).toFixed(0)}%): ${p.best_form}`,
      )
      .join(" | ");
    lines.push(`Frames that work for them: ${formatted}`);
  }
  return lines.join("\n");
}

/**
 * Rewrite dossiers for every user that had a typed-memory write in the
 * window. Capped to keep the cron run under the function timeout.
 */
export async function rewriteDossiersForActiveUsers(
  since: Date,
  maxUsers = 50,
): Promise<{
  scanned: number;
  rewritten: number;
  failures: { userId: string; reason: string }[];
}> {
  const rows = await db
    .selectDistinct({ userId: tillyMemoryV2.userId })
    .from(tillyMemoryV2)
    .where(gte(tillyMemoryV2.createdAt, since))
    .limit(maxUsers);

  const failures: { userId: string; reason: string }[] = [];
  let rewritten = 0;
  for (const row of rows) {
    const r = await rewriteDossier({ userId: row.userId });
    if (r.skipped) {
      if (r.reason && !r.reason.includes("no memories")) {
        failures.push({ userId: row.userId, reason: r.reason });
      }
    } else {
      rewritten += 1;
    }
  }
  return { scanned: rows.length, rewritten, failures };
}
