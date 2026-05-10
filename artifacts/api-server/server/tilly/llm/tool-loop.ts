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

    if (!reply.toolCalls.length) {
      // Plain reply — done.
      return { text: reply.text, toolResults, iterations: iter };
    }

    // Append assistant turn w/ tool_calls so the next round_trip sees the
    // exact tool ids the model emitted; otherwise the model can't
    // correlate our `tool` results back to its own intent.
    turns.push({
      role: "assistant",
      content: reply.text || null,
      tool_calls: reply.toolCalls,
    });

    // Execute every tool call sequentially. We append a `role:"tool"`
    // turn per call (success or error) so the model sees them all in the
    // same context window before its final text reply.
    for (const call of reply.toolCalls) {
      const toolTurn = await runOneToolCall(call, opts.ctx);
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
        ok: true,
        kind: r.kind,
        cardName: r.cardName,
        reclassifiedCount: r.reclassifiedCount,
        reclassifiedAmount: r.reclassifiedAmount,
      };
    case "payment_to_card_unaliased":
      return {
        ok: true,
        kind: r.kind,
        cardName: r.cardName,
        restoredCount: r.restoredCount,
        restoredAmount: r.restoredAmount,
      };
    default:
      return { ok: true, ...r };
  }
}
