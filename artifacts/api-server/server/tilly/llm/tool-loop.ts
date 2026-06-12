/**
 * runWithTools — drives the OpenAI-compatible tool_use loop.
 *
 * Single Tilly turn now:
 *   1. Call llm.toolReply(tools=[...], turns=[history+user msg]).
 *   2. If the model returns text and no tool_calls, we're done.
 *   3. If it returns tool_calls (with or without text), execute each via
 *      the dispatcher, append (assistant w/ tool_calls) + (one tool turn
 *      per result) to the conversation, call again.
 *   4. Repeat up to maxIterations (default 3). Most turns terminate after
 *      the second call (initial → tool_use → final text).
 *
 * Replaces the post-extractor pattern (Tilly text reply → second LLM call
 * to detect tool intent) with one round-trip when no tools fire and two
 * round-trips when tools do. Errors from individual tool executions
 * surface back to the model as `error: ...` results so it can apologise
 * and recover within the same conversation turn.
 */
import type {
  LLMToolCall,
  LLMToolDef,
  LLMToolReplyResult,
  LLMTurn,
} from "./types";
import type { OpenRouterLLM } from "./openrouter";
import {
  executeTool,
  isKnownToolName,
  type ToolContext,
  type ToolName,
  type ToolResult,
} from "../tools/registry";

export type RunWithToolsOpts = {
  llm: OpenRouterLLM;
  systemPrompts: string[];
  /** Conversation history including the latest user turn at the end. */
  initialTurns: LLMTurn[];
  tools: LLMToolDef[];
  ctx: ToolContext;
  /** Cap to keep runaway loops contained. */
  maxIterations?: number;
  /** Cost-tracking attribution forwarded to every llm call. */
  meta: { userId: string | null; route: string };
};

export type RunWithToolsResult = {
  /** Final assistant text shown to the user. */
  text: string;
  /** Every successful tool execution in this turn, in call order. */
  toolResults: ToolResult[];
  /** Total iterations (LLM round-trips). For diagnostics. */
  iterations: number;
};

export async function runWithTools(opts: RunWithToolsOpts): Promise<RunWithToolsResult> {
  const maxIterations = opts.maxIterations ?? 3;
  const turns: LLMTurn[] = [...opts.initialTurns];
  const toolResults: ToolResult[] = [];
  let lastText = "";
  let iter = 0;

  while (iter < maxIterations) {
    iter += 1;
    const reply: LLMToolReplyResult = await opts.llm.toolReply({
      systemPrompts: opts.systemPrompts,
      turns,
      tools: opts.tools,
      toolChoice: "auto",
      maxTokens: 2048,
      meta: opts.meta,
    });
    lastText = reply.text;
    console.log(
      `[tool-loop] iter=${iter} userId=${opts.meta.userId ?? "anon"} toolCalls=${reply.toolCalls.length} textLen=${reply.text.length}`,
    );

    if (!reply.toolCalls.length) {
      // Plain reply — done.
      return { text: reply.text, toolResults, iterations: iter };
    }
    for (const call of reply.toolCalls) {
      console.log(
        `[tool-loop] iter=${iter} firing tool=${call.name} args=${call.arguments.slice(0, 200)}`,
      );
    }

    // Append assistant turn w/ tool_calls so the next round_trip sees the
    // exact tool ids the model emitted; otherwise the model can't
    // correlate our `tool` results back to its own intent.
    turns.push({
      role: "assistant",
      content: reply.text || null,
      tool_calls: reply.toolCalls,
    });

    // Execute every tool call IN PARALLEL. Most tools are independent
    // (writes to different prefs / inserts). The scout tools are
    // particularly important to parallelize because each one blocks on
    // Tavily + Gemini synthesis (~15s). Sequential was making
    // multi-scout turns take >30s, which exceeded the mobile-side
    // patience window. Promise.all preserves order so the `tool` turns
    // we push back to the model match the tool_calls array order.
    const settled = await Promise.all(
      reply.toolCalls.map((call) => runOneToolCall(call, opts.ctx)),
    );
    for (const toolTurn of settled) {
      turns.push(toolTurn.turn);
      if (toolTurn.result) toolResults.push(toolTurn.result);
    }
    // Loop back: the model will now produce a final text reply (or, in
    // edge cases, more tool_calls — capped by maxIterations).
  }

  // Fell through the iteration cap. Return whatever the last text was so
  // the user still gets a reply rather than a 500.
  console.warn(
    `[tool-loop] hit maxIterations=${maxIterations}; returning last text reply (${toolResults.length} tools fired)`,
  );
  return { text: lastText, toolResults, iterations: iter };
}

async function runOneToolCall(
  call: LLMToolCall,
  ctx: ToolContext,
): Promise<{ turn: LLMTurn; result: ToolResult | null }> {
  // Validate name + args before dispatching. Bad tool name or bad JSON is
  // returned as an error result so the model can try again.
  if (!isKnownToolName(call.name)) {
    return {
      turn: {
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify({ error: `unknown_tool: ${call.name}` }),
      },
      result: null,
    };
  }
  let args: unknown;
  try {
    args = call.arguments ? JSON.parse(call.arguments) : {};
  } catch {
    return {
      turn: {
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify({ error: "args was not valid JSON" }),
      },
      result: null,
    };
  }
  try {
    const result = await executeTool(call.name as ToolName, args, ctx);
    if (!result) {
      return {
        turn: {
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({
            error: "validation_or_dispatch_failed",
            name: call.name,
          }),
        },
        result: null,
      };
    }
    // Trim the result body for the model — it doesn't need huge ids,
    // just the kind + a short confirmation summary.
    return {
      turn: {
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(summariseResultForModel(result)),
      },
      result,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[tool-loop] ${call.name} threw:`, msg);
    return {
      turn: {
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify({ error: msg }),
      },
      result: null,
    };
  }
}

/**
 * The model's `tool` turn just needs enough to write a confirmation in
 * the next text reply. Strip uuids etc. so the prompt-cache-friendly
 * version stays small. The full ToolResult goes back to the client
 * regardless — this strip only affects what the LLM sees.
 */
function summariseResultForModel(r: ToolResult): Record<string, unknown> {
  // `ok` reflects ACTUAL EFFECT, not just "tool ran without crashing".
  // When reclassifiedCount/restoredCount/dismissedCount/renamedCount === 0,
  // ok=false so the LLM sees the no-op explicitly and (per the persona
  // rule) won't claim "Done." 2026-05-16 fix — without this, Tilly
  // falsely confirmed "fixed all three" when the tool moved 0 rows.
  switch (r.kind) {
    case "dream_created":
      return {
        ok: true,
        kind: r.kind,
        name: r.name,
        targetAmount: r.targetAmount,
        monthlyContribution: r.monthlyContribution,
      };
    case "payment_to_card_aliased":
      return {
        ok: r.reclassifiedCount > 0,
        kind: r.kind,
        cardName: r.cardName,
        reclassifiedCount: r.reclassifiedCount,
        reclassifiedAmount: r.reclassifiedAmount,
        note:
          r.reclassifiedCount === 0
            ? "alias pref saved but NO past rows matched — those merchants may already be in transfers, or the cardName didn't fuzzy-match any current data. Tell the user honestly, don't claim 'Done'."
            : undefined,
      };
    case "payment_to_card_unaliased":
      return {
        ok: r.restoredCount > 0,
        kind: r.kind,
        cardName: r.cardName,
        restoredCount: r.restoredCount,
        restoredAmount: r.restoredAmount,
        note: r.restoredCount === 0 ? "no rows restored — likely no prior alias active." : undefined,
      };
    case "income_aliased_to_transfer":
      return {
        ok: r.reclassifiedCount > 0,
        kind: r.kind,
        sourceName: r.sourceName,
        reclassifiedCount: r.reclassifiedCount,
        reclassifiedAmount: r.reclassifiedAmount,
        note:
          r.reclassifiedCount === 0
            ? "no income rows matched the sourceName — those merchants may not currently be in 'income', or fuzzy-match found nothing."
            : undefined,
      };
    case "income_flagged":
      return {
        ok: r.reclassifiedCount > 0,
        kind: r.kind,
        sourceName: r.sourceName,
        reclassifiedCount: r.reclassifiedCount,
        reclassifiedAmount: r.reclassifiedAmount,
        note:
          r.reclassifiedCount === 0
            ? "alias saved for future syncs but NO past rows matched — fuzzy-match found nothing in current data."
            : undefined,
      };
    case "income_dismissed":
      return {
        ok: r.dismissedCount > 0,
        kind: r.kind,
        sourceName: r.sourceName,
        dismissedCount: r.dismissedCount,
        note:
          r.dismissedCount === 0
            ? "no candidates matched — either no current income-classification-gap suggestions, or sourceName didn't match any."
            : undefined,
      };
    case "deposit_confirmed_income":
      return {
        ok: r.confirmedCount > 0,
        kind: r.kind,
        sourceName: r.sourceName,
        date: r.date,
        amount: r.amount,
        confirmedCount: r.confirmedCount,
        note:
          r.confirmedCount === 0
            ? "no quarantined deposit matched — there may be none pending, or the name/date/amount didn't match. Ask the user which deposit they mean."
            : "now counted in this month's income; still excluded from paycheck cadence (one-off, not a pattern).",
      };
    case "category_cap_set":
      return {
        ok: true,
        kind: r.kind,
        category: r.category,
        monthlyCap: r.monthlyCap,
        spentSoFar: r.spentSoFar,
        note: `month-to-date spend in ${r.category} is $${r.spentSoFar} — tell the user where they stand against the new cap.`,
      };
    case "category_cap_removed":
      return {
        ok: r.removed,
        kind: r.kind,
        category: r.category,
        note: r.removed ? undefined : "no cap existed for that category.",
      };
    case "merchant_renamed":
      return {
        ok: r.renamedCount > 0,
        kind: r.kind,
        previousName: r.previousName,
        newName: r.newName,
        renamedCount: r.renamedCount,
        note:
          r.renamedCount === 0
            ? "rename rule saved for future syncs but no past rows matched the lookup."
            : undefined,
      };
    case "merchant_category_set":
      return {
        ok: true, // setting always succeeds; the rule is what matters
        kind: r.kind,
        displayName: r.displayName,
        fromCategory: r.fromCategory,
        toCategory: r.toCategory,
        reclassifiedCount: r.reclassifiedCount,
      };
    default:
      return { ok: true, ...r };
  }
}
