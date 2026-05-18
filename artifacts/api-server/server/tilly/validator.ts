/**
 * Reply validator — cheap critic that runs after Tilly's main text
 * reply to catch the single-agent blind spot (per Arize's field
 * analysis: "the agent that executes a task is the same one that
 * reports the result, with no cross-check"). Per audit fix #4.
 *
 * The validator reads (the user's message, the structured tool
 * results, Tilly's draft text) and returns:
 *   ok:    boolean — pass / fail
 *   issue: string  — when not ok, what's wrong
 *
 * Failures we explicitly check for (each shipped a bug fix already):
 *   1. "Done" / "Fixed" / "Reclassified" without any tool firing with
 *      count > 0  → false success claim
 *   2. Specific dollar amount in the reply that doesn't appear in any
 *      tool result → fabricated number
 *   3. Reply references a merchant name not present in the user
 *      message AND not in the tool results → hallucinated entity
 *   4. Reply says "I can't" / "I don't have access" when the tools
 *      array clearly contains the relevant capability → false
 *      limit claim
 *
 * Current behavior: log + emit observation event when not-ok. Future:
 * regenerate the reply or surface the issue in-line to the user with
 * "I noticed I might have got that wrong — let me redo it."
 *
 * Cost: ~1 cheap Haiku call per chat turn (~$0.0005). Worth every
 * fraction of a cent — the false-Done bug surfaced this week ate way
 * more of the user's trust than that.
 */
import { z } from "zod";

import { getLLM } from "./llm/factory";
import { emitEvent } from "./event-emitter";

const ValidatorOutSchema = z.object({
  ok: z.boolean().describe("True when the draft reply is honest about what the tools did."),
  issue: z
    .string()
    .describe(
      "Empty when ok=true. When ok=false, a one-line description of the specific issue (false success claim, fabricated number, hallucinated entity, false limit claim, etc.)",
    ),
});

export type ValidatorOutput = z.infer<typeof ValidatorOutSchema>;

export type ValidatorInput = {
  userMessage: string;
  toolResults: Array<{ kind: string; [k: string]: unknown }>;
  draftReply: string;
  /** Optional: pass for telemetry attribution. */
  userId?: string | null;
  householdId?: string | null;
};

/** Run the critic. Returns ok:true when the reply doesn't trigger any
 * red flag. Failures are logged + emitted as observation events but
 * the reply is NOT auto-rewritten yet (Phase 1 of the validator —
 * see comment above for rollout plan). Callers can read the returned
 * issue and decide whether to regenerate. */
export async function validateReply(input: ValidatorInput): Promise<ValidatorOutput> {
  const llm = await getLLM();

  // Surface the tool results compactly so the critic can see counts +
  // notes (the same structure the main LLM saw in tool turns).
  const toolSummary =
    input.toolResults.length === 0
      ? "(no tools fired this turn)"
      : input.toolResults
          .map((t) => {
            const count =
              (typeof t.reclassifiedCount === "number" ? `reclassified=${t.reclassifiedCount}` : "") ||
              (typeof t.dismissedCount === "number" ? `dismissed=${t.dismissedCount}` : "") ||
              (typeof t.restoredCount === "number" ? `restored=${t.restoredCount}` : "") ||
              (typeof t.renamedCount === "number" ? `renamed=${t.renamedCount}` : "") ||
              "";
            const note = typeof t.note === "string" ? ` note="${t.note}"` : "";
            return `- ${t.kind}${count ? ` (${count})` : ""}${note}`;
          })
          .join("\n");

  const systemPrompt = `You audit financial-agent reply drafts BEFORE they ship to the user. Be strict and concrete — your job is to catch lies and hallucinations, not to evaluate tone.

Common failure modes that are NEVER ok:
1. Draft says "Done" / "Fixed" / "Reclassified" / "Updated" but no tool returned a non-zero count.
2. Draft cites a specific dollar amount or count that doesn't appear in the tool results AND wasn't in the user message.
3. Draft references a merchant name not present in either the user message or the tool results.
4. Draft says "I can't" / "I don't have access" / "I'm unable" when the system clearly handled the request via a tool fire.

Failure modes that are ok:
- Saying "no rows matched" or "I couldn't find" when tools returned count=0 (this is the honest report).
- Asking the user a clarifying question when the request was ambiguous.
- Citing numbers from the user's screen context (any number they referenced).

Return {ok: true, issue: ""} when the reply is honest, or {ok: false, issue: "<one-line specific problem>"} when it's not.`;

  const userPrompt = `User message:
"${input.userMessage}"

Tool results (count = effect size; note = honest hint from tool):
${toolSummary}

Tilly's draft reply:
"${input.draftReply}"

Is this reply honest about what happened?`;

  try {
    const out = await llm.structuredOutput<ValidatorOutput>({
      systemPrompts: [systemPrompt],
      messages: [{ role: "user", content: userPrompt }],
      schema: ValidatorOutSchema,
      schemaName: "validator_out",
      meta: { userId: input.userId ?? null, route: "validator" },
    });
    return out;
  } catch (err) {
    // Validator itself broke — log + return ok=true so the user still
    // gets their reply. The critic is advisory; it shouldn't ever
    // block the response.
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[validator] check itself failed (passing through):", msg);
    return { ok: true, issue: "" };
  }
}

/** Convenience: run validator + emit an observation event when it
 * flags an issue. Returns the validator output so the caller can
 * decide whether to act on it. Fire-and-forget for the event emit. */
export async function validateAndEmit(input: ValidatorInput): Promise<ValidatorOutput> {
  const out = await validateReply(input);
  if (!out.ok && input.userId && input.householdId) {
    // Don't await — emit is fire-and-forget.
    emitEvent({
      userId: input.userId,
      householdId: input.householdId,
      kind: "validator_flagged" as never, // not in the EventKind union yet — see below
      payload: {
        issue: out.issue,
        userMessagePreview: input.userMessage.slice(0, 200),
        draftReplyPreview: input.draftReply.slice(0, 300),
        toolCount: input.toolResults.length,
      },
    }).catch(() => {
      /* fire-and-forget */
    });
    console.warn(`[validator] flagged reply (user=${input.userId}): ${out.issue}`);
  }
  return out;
}
