/**
 * Tilly skill library — self-learning agent skills (Hermes/Voyager
 * pattern). Closes the loop from observation → generalization → reuse.
 *
 * Three responsibilities in this module, intentionally co-located so
 * the contract between them is one read:
 *
 *  1. induceSkillsFromTrajectories — periodic worker that scans
 *     recent successful tool sequences, asks the LLM "what's the
 *     generalizable pattern here?", and inserts new proposed skills.
 *     De-duplicates against existing skills via embedding similarity.
 *
 *  2. retrieveSkillsForMessage — chat-turn helper that embeds the
 *     user's message and returns the top-K active skills' instructions
 *     so the chat handler can inject them into the system prompt.
 *
 *  3. curateSkills — periodic worker that promotes high-success
 *     proposed skills to active, archives low-success active ones,
 *     and consolidates near-duplicates. Hermes runs its curator on a
 *     7-day cycle; we match that cadence.
 *
 * Per Anthropic's Agent SDK terminology: skills = "what agents know"
 * (vs tools = "what agents can do"). A skill is a small, domain-
 * specific instruction block with trigger phrases that the retriever
 * matches against incoming chat messages. When matched, the skill's
 * instructions get injected into the system prompt for that turn —
 * not stored permanently, just for that one reply.
 *
 * Sources:
 *  - Hermes Agent (Nous Research) skill catalog + 7-day curator
 *  - Voyager (Wang et al. 2023) skill library for embodied agents
 *  - MIND-Skill 2026 — induction + deduction loss for skill quality
 *  - Claude Agent SDK Skills (staged loading)
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../db";
import { tillySkills, tillyEvents, type TillySkill } from "../../shared/schema";
import { embed } from "./embeddings";
import { getLLM } from "./llm/factory";

// ────────────────────────────────────────────────────────────────────
// Retrieval
// ────────────────────────────────────────────────────────────────────

/** Cosine similarity between two equal-length vectors. */
function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

export type RetrievedSkill = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  similarity: number;
};

/**
 * Retrieve top-K active skills relevant to the given user message.
 * Caller injects the returned skills' instructions into extraSystem
 * for that chat turn. Returns [] when no skills clear the threshold.
 *
 * Side effect: increments used_count + last_used_at for the returned
 * skills so the curator has data to act on. Done in the same pass to
 * avoid a second round-trip per chat turn.
 */
export async function retrieveSkillsForMessage(
  message: string,
  options: { topK?: number; minSimilarity?: number } = {},
): Promise<RetrievedSkill[]> {
  const topK = options.topK ?? 3;
  const minSim = options.minSimilarity ?? 0.35;

  const queryEmbedding = await embed(message, { route: "skill-retrieval" });
  if (!queryEmbedding) return []; // embed failed; degrade gracefully

  const allActive = await db
    .select()
    .from(tillySkills)
    .where(eq(tillySkills.status, "active"))
    .limit(200);

  const scored = allActive
    .map((s) => ({
      skill: s,
      sim: s.triggerEmbedding && s.triggerEmbedding.length > 0
        ? cosine(queryEmbedding, s.triggerEmbedding)
        : 0,
    }))
    .filter((r) => r.sim >= minSim)
    .sort((a, b) => b.sim - a.sim)
    .slice(0, topK);

  if (scored.length === 0) return [];

  // Bump usage counters in one batch update so the curator has signal.
  const ids = scored.map((r) => r.skill.id);
  await db
    .update(tillySkills)
    .set({ usedCount: sql`${tillySkills.usedCount} + 1`, lastUsedAt: new Date() })
    .where(sql`${tillySkills.id} = ANY(${ids})`);

  return scored.map((r) => ({
    id: r.skill.id,
    name: r.skill.name,
    description: r.skill.description,
    instructions: r.skill.instructions,
    similarity: Math.round(r.sim * 1000) / 1000,
  }));
}

/** Format retrieved skills as a system-prompt block ready for
 * concatenation into extraSystem. Empty string when no skills. */
export function formatSkillsForPrompt(skills: RetrievedSkill[]): string {
  if (skills.length === 0) return "";
  return [
    "Learned skills you can apply to this turn (auto-retrieved by similarity to the user's message — use only if genuinely relevant; do not name them out loud to the user):",
    "",
    ...skills.map(
      (s) =>
        `### ${s.name} (sim ${s.similarity})\n${s.description}\n\n${s.instructions}`,
    ),
    "",
    "If a skill matches the user's intent, follow its instructions. If not, ignore it and respond normally.",
  ].join("\n");
}

// ────────────────────────────────────────────────────────────────────
// Outcome recording
// ────────────────────────────────────────────────────────────────────

/** Record whether the skill's application succeeded. Called from the
 * chat handler after the user's NEXT turn (if positive feedback) or
 * 24h cron (if no further messages = passive accept). */
export async function recordSkillOutcome(
  skillId: string,
  outcome: "success" | "fail",
): Promise<void> {
  await db
    .update(tillySkills)
    .set({
      successCount: outcome === "success" ? sql`${tillySkills.successCount} + 1` : tillySkills.successCount,
      failCount: outcome === "fail" ? sql`${tillySkills.failCount} + 1` : tillySkills.failCount,
      updatedAt: new Date(),
    })
    .where(eq(tillySkills.id, skillId));
}

// ────────────────────────────────────────────────────────────────────
// Induction
// ────────────────────────────────────────────────────────────────────

const InducedSkillSchema = z.object({
  name: z.string().describe(
    "Kebab-case identifier, ≤40 chars. Example: 'cc-payment-wash-dismiss'.",
  ),
  description: z.string().describe(
    "One sentence explaining what this skill does and when it applies. Plain English, no jargon.",
  ),
  triggerPhrases: z.array(z.string()).describe(
    "3-6 natural-language phrases a user might say that should trigger this skill. Cover synonyms and paraphrases.",
  ),
  instructions: z.string().describe(
    "Markdown instructions Tilly reads at retrieval time. State: (1) when to apply, (2) which tools to fire and with what args, (3) what to say to the user after. ≤1500 chars. Generalize beyond the specific user/merchant — use placeholders like <merchant> not literal names.",
  ),
  confidence: z.number().describe(
    "0-1 score for how confidently this generalizes beyond the source trajectory. 0.8+ for clear universal patterns, 0.4-0.7 for plausible-but-niche, <0.4 means probably don't induce.",
  ),
});

export type InducedSkill = z.infer<typeof InducedSkillSchema>;

/** One trajectory the inducer LLM looks at — a user message followed
 * by a tool sequence that produced a positive outcome. */
type Trajectory = {
  userMessage: string;
  toolSequence: Array<{ tool: string; argsPreview: string; resultKind: string; resultPreview: string }>;
  tillyReply: string;
  sourceEventIds: string[];
};

/**
 * Periodic skill induction — scans recent successful trajectories,
 * groups them by similarity, and asks the LLM to extract a reusable
 * skill from each group. New skills land as 'proposed' for admin
 * review (or auto-promotion via the curator).
 *
 * Returns the count of skills inserted. Failures are logged + skipped;
 * one bad trajectory doesn't break the batch.
 */
export async function induceSkillsFromTrajectories(): Promise<{
  trajectoriesScanned: number;
  skillsProposed: number;
  errors: number;
}> {
  // Pull recent chat-with-tool events (last 7 days) where the user
  // didn't push back. We use the chat_user_msg + chat_tilly_reply
  // event kinds as our trajectory unit.
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const events = await db
    .select()
    .from(tillyEvents)
    .where(
      and(
        sql`${tillyEvents.kind} IN ('chat_user_msg', 'chat_tilly_reply')`,
        sql`${tillyEvents.ts} >= ${since.toISOString()}`,
      ),
    )
    .orderBy(tillyEvents.ts);

  // Pair consecutive (user, tilly) events from the same household
  // into trajectories. Only keep trajectories where the tilly reply
  // payload includes toolResults with reclassifiedCount > 0 or
  // similar success signal — those are the "things worked" trails.
  type RawEvent = (typeof events)[number];
  const trajectories: Trajectory[] = [];
  for (let i = 0; i < events.length - 1; i++) {
    const a = events[i];
    const b = events[i + 1];
    if (a.kind !== "chat_user_msg" || b.kind !== "chat_tilly_reply") continue;
    if (a.householdId !== b.householdId) continue;
    const tillyPayload = b.payload as Record<string, unknown>;
    const toolResults = (tillyPayload.toolResults as Array<Record<string, unknown>>) ?? [];
    if (toolResults.length === 0) continue;
    const succeededTools = toolResults.filter(
      (t) => Number(t.reclassifiedCount ?? t.restoredCount ?? t.dismissedCount ?? t.renamedCount ?? 1) > 0,
    );
    if (succeededTools.length === 0) continue;
    trajectories.push({
      userMessage: String((a.payload as Record<string, unknown>).content ?? ""),
      toolSequence: succeededTools.map((t) => ({
        tool: String(t.kind ?? "unknown"),
        argsPreview: "",
        resultKind: String(t.kind ?? "unknown"),
        resultPreview: JSON.stringify(t).slice(0, 200),
      })),
      tillyReply: String(tillyPayload.replyBody ?? ""),
      sourceEventIds: [a.id, b.id],
    });
  }

  if (trajectories.length === 0) {
    return { trajectoriesScanned: 0, skillsProposed: 0, errors: 0 };
  }

  // Pre-load existing skills for de-dup.
  const existing = await db.select().from(tillySkills).limit(500);

  let skillsProposed = 0;
  let errors = 0;
  for (const traj of trajectories) {
    try {
      const induced = await induceOne(traj);
      if (!induced || induced.confidence < 0.4) continue;

      // Embedding for dedup + future retrieval.
      const triggerText = [induced.description, ...induced.triggerPhrases].join(" — ");
      const embedding = await embed(triggerText, { route: "skill-induction" });
      if (!embedding) continue;

      // De-dup: if an existing skill has cosine > 0.85 with this
      // induced one, merge instead of insert (bump usage on the
      // existing one + extend its source_event_ids).
      const dupe = existing.find(
        (s) =>
          s.triggerEmbedding &&
          s.triggerEmbedding.length === embedding.length &&
          cosine(s.triggerEmbedding, embedding) > 0.85,
      );
      if (dupe) {
        const merged = Array.from(
          new Set([...(dupe.sourceEventIds ?? []), ...traj.sourceEventIds]),
        );
        await db
          .update(tillySkills)
          .set({ sourceEventIds: merged, updatedAt: new Date() })
          .where(eq(tillySkills.id, dupe.id));
        continue;
      }

      // Insert new proposed skill.
      await db.insert(tillySkills).values({
        name: induced.name.slice(0, 60),
        description: induced.description.slice(0, 200),
        instructions: induced.instructions.slice(0, 2000),
        triggerPhrases: induced.triggerPhrases,
        triggerEmbedding: embedding,
        appliesWhen: {},
        sourceEventIds: traj.sourceEventIds,
        confidence: Math.max(0, Math.min(1, induced.confidence)),
        status: "proposed",
      });
      skillsProposed += 1;
    } catch (err) {
      console.warn("[skill-induction] one trajectory failed:", err);
      errors += 1;
    }
  }

  return { trajectoriesScanned: trajectories.length, skillsProposed, errors };
}

async function induceOne(traj: Trajectory): Promise<InducedSkill | null> {
  const llm = await getLLM();
  const toolSummary = traj.toolSequence
    .map((t) => `- ${t.tool}: ${t.resultPreview}`)
    .join("\n");
  const messages = [
    {
      role: "user" as const,
      content: `You are extracting a REUSABLE SKILL from one user's successful agent trajectory. Generalize beyond this specific user/merchant — the goal is a skill that helps ANY user with a similar intent.

User message:
"${traj.userMessage}"

Tools Tilly fired successfully:
${toolSummary}

Tilly's reply (truncated):
"${traj.tillyReply.slice(0, 500)}"

Extract the underlying generalizable skill. Use placeholders like <merchant> / <category> / <amount> in the instructions — never bake in literal names from this trajectory. If the pattern is too narrow or one-off to generalize, return confidence < 0.4 and we'll skip it.`,
    },
  ];

  try {
    const result = await llm.structuredOutput<InducedSkill>({
      systemPrompts: [
        "You induce reusable agent skills from successful task trajectories. You're conservative — only propose skills that clearly generalize. Use placeholders, not literal names from the source.",
      ],
      messages,
      schema: InducedSkillSchema,
      schemaName: "induced_skill",
      meta: { route: "skill-induction" },
    });
    return result;
  } catch (err) {
    console.warn("[skill-induction] LLM failed:", err);
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────
// Curator
// ────────────────────────────────────────────────────────────────────

/**
 * Periodic curator — promotes proposed skills with positive usage,
 * archives active skills that are underperforming. Runs weekly per
 * Hermes' 7-day cadence.
 */
export async function curateSkills(): Promise<{
  promoted: number;
  archived: number;
  unchanged: number;
}> {
  const all = await db.select().from(tillySkills);
  let promoted = 0;
  let archived = 0;
  let unchanged = 0;

  for (const s of all) {
    const total = s.successCount + s.failCount;
    if (s.status === "proposed") {
      // Promote when used ≥3 times AND success rate ≥ 0.6
      if (total >= 3 && s.successCount / total >= 0.6) {
        await db
          .update(tillySkills)
          .set({ status: "active", updatedAt: new Date() })
          .where(eq(tillySkills.id, s.id));
        promoted += 1;
        continue;
      }
    }
    if (s.status === "active") {
      // Archive when used ≥5 times AND success rate < 0.3
      if (total >= 5 && s.successCount / total < 0.3) {
        await db
          .update(tillySkills)
          .set({ status: "archived", updatedAt: new Date() })
          .where(eq(tillySkills.id, s.id));
        archived += 1;
        continue;
      }
    }
    unchanged += 1;
  }

  return { promoted, archived, unchanged };
}

// ────────────────────────────────────────────────────────────────────
// Manual seed — for backfilling skills from this week's actual learnings
// ────────────────────────────────────────────────────────────────────

export type SkillSeed = {
  name: string;
  description: string;
  instructions: string;
  triggerPhrases: string[];
  confidence: number;
  status?: "proposed" | "active";
};

/** Insert seed skills with computed embeddings. Used by the seeder
 * script to backfill skills induced from manual inspection of
 * this-week's trajectories. Skips duplicates by name. */
export async function seedSkills(seeds: SkillSeed[]): Promise<{
  inserted: number;
  skipped: number;
}> {
  let inserted = 0;
  let skipped = 0;
  for (const seed of seeds) {
    const existing = await db
      .select({ id: tillySkills.id })
      .from(tillySkills)
      .where(eq(tillySkills.name, seed.name))
      .limit(1);
    if (existing.length > 0) {
      skipped += 1;
      continue;
    }
    const triggerText = [seed.description, ...seed.triggerPhrases].join(" — ");
    const embedding = await embed(triggerText, { route: "skill-seed" });
    if (!embedding) {
      skipped += 1;
      continue;
    }
    await db.insert(tillySkills).values({
      name: seed.name,
      description: seed.description,
      instructions: seed.instructions,
      triggerPhrases: seed.triggerPhrases,
      triggerEmbedding: embedding,
      appliesWhen: {},
      sourceEventIds: [],
      confidence: seed.confidence,
      status: seed.status ?? "active",
    });
    inserted += 1;
  }
  return { inserted, skipped };
}

// ────────────────────────────────────────────────────────────────────
// Admin helpers
// ────────────────────────────────────────────────────────────────────

export async function listAllSkills(): Promise<TillySkill[]> {
  return db
    .select()
    .from(tillySkills)
    .orderBy(desc(tillySkills.updatedAt))
    .limit(500);
}

export async function setSkillStatus(
  id: string,
  status: "proposed" | "active" | "archived",
): Promise<void> {
  await db
    .update(tillySkills)
    .set({ status, updatedAt: new Date() })
    .where(eq(tillySkills.id, id));
}

export async function updateSkillInstructions(
  id: string,
  instructions: string,
): Promise<void> {
  await db
    .update(tillySkills)
    .set({ instructions, updatedAt: new Date() })
    .where(eq(tillySkills.id, id));
}
