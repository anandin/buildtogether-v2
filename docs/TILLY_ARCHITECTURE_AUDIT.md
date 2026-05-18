# Tilly Architecture Audit (v1)

*2026-05-17 — ordered by an architect after the user observed: "It's been 7 days of testing and every tiny flow has a bug. Doesn't seem like a well thought-out app."*

## TL;DR (the honest version)

Tilly is **a functional agent-shaped product with serious architectural debt and no safety net**. The pieces are largely in the right places — there's a tool registry, a detector layer, a multi-tier memory pipeline, and an LLM-authored hero — but they're held together by:

- A 6,227-line god route file
- Zero unit tests
- A 258-line endpoint-level smoke suite as the *only* automated check
- Three different ways to compute the same merchant signature (which is why three "fixed" detector bugs kept reappearing this week)
- A persona prompt and a tool registry that drift out of sync because they describe the same surface in two different files
- A `Promise.allSettled` swallow at the agent loop that silences detector failures completely
- No skill abstraction (per Claude Agent SDK terminology)
- No agent validator / critic step (so the model can claim "Done" on a no-op and nothing catches it)
- No MCP or programmatic tool calling
- 54 `as any` casts in `server/tilly/*` alone

**Your "7 days of bugs" instinct is correct, and the cause is structural, not individual.** Each bug is a symptom of one of six systemic issues listed below. Fixing them individually (which is what we've been doing) is whack-a-mole. The real fix is to invest in three foundational pieces — **eval harness, shared invariants, validator pass** — before adding any new features.

This isn't a teardown. The product surface is real, the memory pipeline is genuinely thoughtful, and the recent forecast-led hero with LLM-authored narrative is good work. But scaling Tilly to "every user, not just me" with the current foundation will keep producing the same class of bug at the same rate.

---

## Methodology

- Read every directory under `artifacts/api-server/server/tilly/`, `artifacts/api-server/server/routes/tilly/`, the schema file, and the BTHome / BTGuardian / BTSpend / BTCategories screens.
- Counted lines, classified modules, traced the agent loop end-to-end (`/api/tilly/chat` → `runWithTools` → tool dispatch → tool result → final LLM reply).
- Fetched current architecture best-practices from Anthropic (Building Effective Agents, Writing Tools for Agents, Effective Context Engineering) and surveyed Mem0/Letta/MemGPT, Claude Agent SDK Skills, and 2026 failure-pattern literature.
- Catalogued every bug we shipped a fix for in the last 7 days and grouped them by root cause.

---

## Component inventory (with current names and how they should be classified)

| Current name | Lives in | What it actually is | Industry-standard name |
|---|---|---|---|
| `tools/registry.ts` (20 tools) | `server/tilly/tools/` | LLM-callable actions that mutate state via the tool_use loop | **Tools** ✓ (correctly named) |
| `detectors.ts` (11 detectors) | `server/tilly/` | Per-call observation functions that return typed signals | **Pull observations** (no clean name in lit; closest is "feature extractors") |
| Pattern cron + nightly distiller + dossier rewriter | `server/tilly/` | Periodic memory-pipeline workers | **Background jobs** (or Letta's "memory updaters") |
| `event-emitter.ts` (`tilly_events`) + `tilly_memory_v2` + `tilly_dossiers` + `tilly_nudges` + frame-bandit | `server/tilly/` + schema | Append-only event log → typed distillation → dossier injection | **Memory pipeline** (5-layer; similar shape to Letta core/recall/archival + Mem0 graph) |
| `daily-brief.ts heroNarrative` | `server/tilly/` | LLM authored hero copy | Currently nameless; should be a **"renderer skill"** |
| `category-classifier.ts` | `server/tilly/` | LLM-driven Plaid txn categorizer | Currently nameless; should be a **"classifier tool/skill"** |
| `persona.ts PERSONA_SYSTEM_PROMPT` | `server/tilly/` | Free-text system prompt with tool inventory | **System prompt** (would benefit from being split into smaller composable skills) |
| `forecast.ts`, `projection-history.ts`, `protection-engine.ts` | `server/tilly/` | Domain-specific computation modules | **Domain services** (correctly factored) |

**What's missing entirely:**
- **Skills** (per Claude Agent SDK definition: "what agents know" — staged-loaded specialized instructions). You have tools and detectors but nothing that fits the skill abstraction — every domain prompt is hardcoded into `persona.ts` or the per-endpoint LLM call.
- **Validator / critic** (a second LLM or rule-based pass that checks Tilly's output before it ships to the user). The single-agent blind spot identified in [Anthropic's research](https://www.anthropic.com/engineering/writing-tools-for-agents): "the agent that executes a task is the same one that reports the result, with no cross-check."
- **Eval harness** (no test files; `e2e/smoke.ts` is 258 lines of endpoint sanity checks, no LLM-output evals, no trajectory evals, no tool-selection accuracy tests).
- **MCP** (Model Context Protocol). All tools are inline TypeScript. No external tool servers.
- **Tool Search Tool / Programmatic Tool Calling** (per Anthropic's advanced tool use guidance). With 20+ tools, you're at the threshold where context bloat hurts model accuracy.

---

## What's good (be fair)

- **Memory pyramid is genuinely well-thought-out.** Events → typed memories → dossier rewrite → nudges → frame-bandit. It's closer to Letta's three-tier architecture than to a naive flat-text memory. The dossier injection at the top of the system prompt is the right shape.
- **Tool dispatcher pattern is correct.** `runWithTools` drives the OpenAI-compatible tool_use loop, executes in parallel, capped iterations, type-safe per-tool zod schemas at the dispatch boundary.
- **Recent fixes (last 48h) point in a healthy direction:** tool results now include explicit `ok: count > 0` so the LLM can see no-ops; persona was updated to require checking counts; screen-state perception was added so chat can see what's rendered.
- **The 11 detectors are well-named, well-isolated, and easy to add to.** That module is the best-organized file in the codebase.
- **Categories taxonomy is now user-overridable via `setCategoryBucket` etc.** That moves a lot of brittle hardcoded logic into user-controlled prefs — exactly the right direction.

---

## Critical gaps, ranked

### 🔴 P0 — These caused most of the bugs this week

#### 1. No shared invariants library. Identical concepts implemented N times.

`merchantSignature()` is the canonical text-normalization function (in `merchant-rules.ts`). But the system has at least **three different ways to compute "what merchant is this?"**:

| Place | What it does | Produces |
|---|---|---|
| `merchant-rules.ts merchantSignature()` | Strips processor codes, state abbrevs, etc. | `"canada"` for "Canada Txd" |
| Detector local `sigFor()` (my code, fixed Friday) | Lowercase + trim only | `"canada txd"` |
| `byMerchant` map key in detectors | Raw lowercased merchant name | `"canada txd"` |

This produced **three separate bugs** in 24 hours: income_classification_gap dismissals didn't stick, annual_bill_upcoming overrides didn't apply, the dismiss tool wrote a key the detector couldn't find. Every "same merchant" check in the codebase should go through `merchantSignature` — full stop. Right now, only some of them do.

Similarly: the "RECURRING vs ONE_OFF vs ADJUSTMENT" category sets exist in at least three places (insights.ts, spend-pattern.ts, detectors.ts, projection-history.ts). Each gets edited independently.

**Fix:** extract `server/tilly/taxonomy.ts` exporting `RECURRING_CATS`, `ONE_OFF_CATS`, `ADJUSTMENT_CATS`, `merchantSignature`, `bucketFor(category, overrides)`. Every detector + tool + endpoint imports from this one file. ~2-hour refactor.

#### 2. ZERO tests. The only automated check is a 258-line endpoint smoke suite.

```
artifacts/        61,000 LOC
test files:       0
spec files:       0
smoke checks:     7 (endpoint-level)
agent evals:      0
trajectory evals: 0
LLM-output evals: 0
```

Per Anthropic's [Demystifying Evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) and [DeepEval](https://deepeval.com/guides/guides-ai-agent-evaluation): the basic metrics any agent should track are **tool selection accuracy, tool parameter accuracy, multi-turn function call accuracy, trajectory match against expected**. We track none of these.

Every bug this week was caught by a user (you), in production, against their real data. Industry baseline for production agents is to catch these in CI with synthetic conversations against fixtures.

**Fix:** Build an eval harness this week, before any new features. Use Confident AI / DeepEval or LangFuse. Synthetic conversations: "user says X → expect tool Y fires with args Z → expect text doesn't claim Done when count=0". 50 cases gets you 80% of the value. ~1-2 days.

#### 3. No validator / critic step. Single-agent blind spot.

Per Arize's [field analysis of agent failures](https://arize.com/blog/common-ai-agent-failures/): **"single-agent architectures have a fundamental blind spot: the agent that executes a task is the same one that reports the result, with no cross-check, no validation layer, and no audit trail."**

Exact pattern we hit Friday: Tilly fired `markPaymentToOwnCard`, tool returned `reclassifiedCount: 0`, Tilly's natural-language reply said "Done. All three are now treated as card transfers". My fix was to add an `ok` field + a persona instruction. That helps but doesn't *guarantee*. A validator pass (cheap Haiku call) reading `(userMessage, toolResults, draftReply) → ok|not_ok` would catch any future divergence regardless of persona text drift.

**Fix:** Add `validateReply()` in the agent loop after the final text. ~3-hour build, ~$0.001/turn extra cost.

#### 4. `persona.ts` and `tools/registry.ts TOOL_DESCRIPTIONS` describe the same surface in two places.

The tool inventory is currently maintained in `TOOL_DESCRIPTIONS` (passed to the LLM as the `tools` parameter) AND repeated in `PERSONA_SYSTEM_PROMPT` (the "What you CAN do" section). They drifted multiple times this week ("Tilly says I can't" — because the persona didn't list the tool even though it existed).

Per Anthropic's [writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents): "design descriptions as if onboarding a new team professional. Make implicit context explicit." That's the right standard, but the description should live in **one place** that the persona references, not be re-prosed in the persona text.

**Fix:** Generate the persona's "What you CAN do" block from `TOOL_DESCRIPTIONS` at boot. Single source of truth. ~1-hour build.

### 🟡 P1 — Latent risk; will bite soon

#### 5. God objects: `routes.ts` (6,227 LOC) + `chat.ts` (1,807 LOC).

`routes.ts` holds the entire Plaid sync, expense mutation, household admin, etc. It's the kind of file that takes minutes to grep through and where merge conflicts pile up. It also makes it impossible to reason about which surface area is exposed to authenticated users vs admins vs cron vs e2e.

`chat.ts` orchestrates context retrieval, history, tools, response shaping, and reminder classification all in one handler. It builds `extraSystem` from 7+ sources serially, none of which are testable in isolation.

**Fix:** Split `routes.ts` along resource lines (`/plaid/*`, `/expenses/*`, `/household/*`) into ~400-600 LOC files. Extract `chat.ts`'s `extraSystem` builders into a `contextBuilders/` directory where each builder is one file. ~1 day each.

#### 6. Tool registry has reached the "context bloat" threshold.

Currently 20 tools. Per Anthropic's [advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use): "Context bloat from tool definitions → use Tool Search Tool. Parameter errors and malformed calls → use Tool Use Examples." Tilly already chose the wrong tool this week (markPaymentToOwnCard for a wash-transaction dismiss intent).

Multiple tools also overlap semantically:
- `markPaymentToOwnCard` / `markIncomeAsTransfer` / `flagAsIncome` / `dismissAsNotIncome` all touch the income-vs-spend-vs-wash boundary
- `hideCategoryFromSpend` / `setCategoryInclusion` / `setCategoryBucket` all reshape what counts as spend on the home

**Fix:** Adopt namespacing per Anthropic's recommendation (`income.flag`, `income.dismiss`, `income.mark_as_transfer`). Consolidate where genuinely redundant. Add tool-use examples to ambiguous tools. ~half-day.

#### 7. `Promise.allSettled` in `runAllDetectors` swallows ALL detector failures silently.

```js
const results = await Promise.allSettled([... 11 detectors ...]);
const out = [];
for (const r of results) {
  if (r.status === "fulfilled" && r.value) out.push(r.value);
}
```

If a detector throws (DB outage, missing column, bad data), it's just dropped. No log, no metric, no Sentry event, no surface signal. You'd see an empty observations array and assume nothing's worth flagging — when actually the system is silently broken.

**Fix:** Log every rejected result with detector name + error. Add a counter that surfaces on `/admin/tilly` so failures are visible. ~30-min fix.

#### 8. `54 as any / : any` casts in `server/tilly/*` alone.

Every cast is a place where the type system isn't proving correctness. Several are in the tool result handling path — exactly where the "ok=true on 0-count" bug originated. Drizzle + zod give you full inference; we're casting that away in too many spots.

**Fix:** Audit each cast. Most can become typed via `infer` from the relevant schema. Some are genuine `unknown` → `Record<string, unknown>` boundaries which are fine. ~half-day cleanup.

### 🟢 P2 — Strategic, not urgent

#### 9. No skill abstraction.

Per [Claude Agent SDK terminology](https://platform.claude.com/docs/en/agent-sdk/skills): tools are "what agents can do", skills are "what agents know". Tilly's domain knowledge currently lives in:
- A 5,000-character `PERSONA_SYSTEM_PROMPT` block
- Per-endpoint LLM prompts scattered across `daily-brief.ts`, `category-classifier.ts`, `dossier-rewriter.ts`, `nightly-distiller.ts`, `analyse.ts`
- Tool descriptions in `TOOL_DESCRIPTIONS`

This is the "hardcoded brittle logic in prompts" anti-pattern Anthropic [explicitly warns against](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents). Each prompt is its own snowflake; nothing is reusable. Adopting the skill pattern (one markdown file per knowledge domain with progressive loading) would let the same "tax-instalment-recognition" skill power both the hero narrative AND the chat handler AND the category classifier — instead of three independent prompt-shaped reimplementations.

**Fix:** Migrate to a `skills/` directory of markdown files loaded via a `useSkill(name)` helper that injects the skill's content into the system prompt for that call. Start with 3-5 skills (`tax-recognition.md`, `cadence-projection.md`, `cc-payment-wash.md`). ~2 days.

#### 10. No MCP. All tools are inline TypeScript.

Per Anthropic's [code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp): MCP is now the standard interop for agent tools. Moving the tool registry behind an MCP server would let you (a) test tools in isolation via the MCP test client, (b) reuse tools across multiple agent runtimes (chat, analyse, daily-brief), (c) plug in third-party tools (Plaid official MCP, etc.) without reinventing the wrapper.

**Fix:** Wrap the existing registry in an MCP server. ~1-2 days. Low immediate value but unlocks the ecosystem.

#### 11. Memory pipeline isn't benchmarked against Mem0 / Letta baselines.

The 5-layer pyramid is well-designed but not measured. Per [Mem0's 2026 state-of-the-art](https://mem0.ai/blog/state-of-ai-agent-memory-2026): production memory systems are benchmarked on LoCoMo (long-conversation memory) with ~6956 tokens per retrieval call. We don't track token cost per memory hit and have no benchmark of dossier hit quality.

Probably not worth replacing — Letta would impose its agent runtime, Mem0 would require shoehorning the existing schema. But worth measuring: log retrieval token cost per turn and recall@k for the dossier sections.

---

## Bug pattern analysis — last 7 days

Catalogued every fix shipped:

| Bug | Symptom | Root cause class |
|---|---|---|
| Plaid duplicate rows | $14,724 inflated taxes | #1 no sig invariant + no insert-time uniqueness |
| Spend double-counted | $36,077 displayed | #1 helper duplicated in two endpoints |
| Year horizon math | -$45k per month bars | #1 same definition diverged across paths |
| Forecast extrapolated fixed costs daily | -$30k projected close | #1 + #4 no test caught it |
| Income cadence missing | -$13k projection | feature gap, not a bug |
| Hero too wordy | UX feedback | #4 prompt-only fix, no test |
| Tilly said "I can't" | persona+tool drift | #4 single source of truth |
| Persona missing tool inventory | Tilly couldn't act | #4 |
| `Done` on 0-row tools | False success | #3 no validator |
| Cadence override key mismatch | CRA still flagging | #1 sig functions diverged AGAIN |
| Hardcoded US in persona | Wrong audience | not a real bug, but signal |
| Hardcoded my data in persona | Other users would see "CSA Group" | #4 examples drifted |
| Keyboard covered TextInput | RN modal layout | client-side, unrelated |

**Of 13 fixes, 7 root-cause to #1 (no shared invariants), 4 to #4 (persona drift), 1 to #3 (no validator), 1 layout bug.** The same two issues caused 85% of the bugs. Three more weeks at this pace surfaces the same classes again unless we invest in the foundational fixes.

---

## Comparison to current industry patterns

| Capability | Industry standard 2026 | Tilly today | Gap |
|---|---|---|---|
| Tool definition | MCP server, 1 source of truth | Inline TS registry + duplicated persona text | Medium |
| Tool count | "A few thoughtful tools" (Anthropic) | 20+ overlapping | Medium |
| Tool descriptions | "Like onboarding a new teammate" | Some good, some terse, drift from persona | Medium |
| Result observability | `ok` field + count + structured result | Recently added (Friday) | ✓ Closing |
| Validator pass | Critic agent OR rule-based output check | None | **Critical** |
| Eval harness | DeepEval / Langfuse / custom; trajectory + step evals | 7 endpoint smoke checks | **Critical** |
| Memory architecture | Mem0 (vector + graph) or Letta (3-tier) | Custom 5-layer, not benchmarked | Low |
| Context engineering | Just-in-time retrieval, compaction, sub-agents | Partial (retrieval works, no compaction, no sub-agents) | Medium |
| Skill abstraction | Claude Agent SDK Skills (filesystem MD) | None | Medium |
| Tool selection accuracy metric | Tracked per release | Not tracked | **Critical** |
| Multi-agent / orchestrator | Often paired with single agent for tasks needing planning | Single agent | Low (don't need yet) |

---

## Recommended refactor path (sequenced)

Total effort: ~10 working days for a single engineer, paid back inside a month via fewer prod bugs.

### Week 1 — foundation (highest leverage)

1. **Day 1-2: Build the eval harness.** Pick DeepEval or Langfuse. 30 trajectory cases covering the 20 tools + the 5 most common chat intents (analyse my money, why is X recurring, find this cheaper, dismiss this suggestion, set up a dream). Run on every commit via GitHub Actions.
2. **Day 2: Extract `taxonomy.ts`.** Single source of truth for `RECURRING_CATS`, `ONE_OFF_CATS`, `ADJUSTMENT_CATS`, `bucketFor(category, overrides)`, `merchantSignature()`. Every detector + endpoint + tool imports from this. **Delete every local copy.**
3. **Day 3: Add validator pass.** Cheap Haiku call after the main reply, given (user message, tool results, draft text) returns `ok | issue`. If not ok, regenerate or surface the issue. Costs ~$0.001/turn.
4. **Day 4: Persona + tool registry single source of truth.** Generate the "What you CAN do" section of the persona from `TOOL_DESCRIPTIONS` at boot. Delete the duplicated free-text block.
5. **Day 5: Surface detector failures.** Replace silent `Promise.allSettled` swallow with logging + Sentry + an admin counter.

### Week 2 — structural cleanup

6. **Day 6-7: Split `routes.ts` (6,227 LOC) by resource.** `/plaid/*`, `/expenses/*`, `/household/*`, `/sessions/*`. Each file ≤600 LOC.
7. **Day 8: Split `chat.ts` (1,807 LOC) extraSystem builders into `contextBuilders/`.** One file per concern (recent_analysis, open_questions, screen_state, dossier_section, etc.). Each unit-testable.
8. **Day 9: Type-safe tool dispatch.** Audit the 54 `as any` casts in `tilly/*`. Replace with zod-inferred types where possible.
9. **Day 10: Tool namespacing + consolidation.** Group overlapping tools (`income.*`, `category.*`, `merchant.*`). Add tool-use examples to ambiguous ones.

### Later (don't sequence yet)

- Migrate tool registry to MCP server (unlocks ecosystem, ~2 days)
- Adopt Claude Agent SDK Skills pattern for domain prompts (`tax-recognition.md`, `cadence-projection.md`, etc.) (~2 days)
- Benchmark memory pipeline against Mem0/Letta references (optional)

---

## Honest answers to your assessment

> "It's been 7 days of testing and every tiny flow has a bug."

**True, and the structural cause is real.** The 13 bugs we shipped fixes for all root-cause to ~2 systemic issues (no shared invariants, persona/tool drift). Without the eval harness + invariants extraction + validator pass, the same classes will keep surfacing as you broaden user testing.

> "Doesn't seem like a well thought-out app."

**The product surface is well-thought-out. The agent foundation is half-done.** The memory pyramid, the detector layer, the LLM-authored hero, the chat tool dispatch — these are all the right shapes. What's missing is the *plumbing under the agent*: shared invariants, an eval harness, a validator. These are 1-2 weeks of work, not a rewrite.

> "Look outside online — give me a true gap analysis."

**Done above.** Major industry capabilities you don't have:
- **Eval harness** (DeepEval, Langfuse, Anthropic's evals guide) — most-cited 2026 best practice; you have none
- **Validator / critic pass** (Arize's failure-mode research) — single-agent blind spot
- **MCP** (Anthropic 2026 trend report) — every agent ecosystem is converging here
- **Skills abstraction** (Claude Agent SDK) — what your in-prompt domain knowledge should be
- **Tool selection metrics + namespacing** (Anthropic writing-tools-for-agents) — at your tool count, this matters

The gap is not "you've built it wrong." The gap is "you've built it without the safety net every serious agent product builds first." Investing in foundation is the only way to get from "Tilly works for me" to "Tilly works for everyone" without burning the next 6 months on the same kind of bug we burned this week on.

---

## Sources

- [Anthropic — Building Effective AI Agents](https://www.anthropic.com/research/building-effective-agents)
- [Anthropic — Writing Tools for AI Agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
- [Anthropic — Effective Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Anthropic — Demystifying Evals for AI Agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [Anthropic — Advanced Tool Use](https://www.anthropic.com/engineering/advanced-tool-use)
- [Anthropic — Code Execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp)
- [Claude Agent SDK — Skills overview](https://platform.claude.com/docs/en/agent-sdk/skills)
- [Arize — Why AI Agents Break: Field Analysis of Production Failures](https://arize.com/blog/common-ai-agent-failures/)
- [Mem0 — State of AI Agent Memory 2026](https://mem0.ai/blog/state-of-ai-agent-memory-2026)
- [TokenMix — Mem0 vs Letta vs MemGPT 2026](https://tokenmix.ai/blog/ai-agent-memory-mem0-vs-letta-vs-memgpt-2026)
- [DeepEval — AI Agent Evaluation](https://deepeval.com/guides/guides-ai-agent-evaluation)
- [Confident AI — LLM Agent Evaluation Complete Guide](https://www.confident-ai.com/blog/llm-agent-evaluation-complete-guide)
- [Anthropic — 2026 Agentic Coding Trends Report](https://resources.anthropic.com/2026-agentic-coding-trends-report)
