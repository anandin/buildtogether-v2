/**
 * 08 — S2 nightly distiller smoke check.
 *
 * Plan:
 *   - Pre-warm: do an affordability chat (creates several events: chat
 *     turns, possibly reminder_created) and an expense_logged.
 *   - Trigger /api/tilly/_debug/distill-now with a 1-hour lookback so
 *     it sees the events we just made.
 *   - Read /api/tilly/_debug/typed-memory and assert ≥1 memory landed
 *     with non-empty source_event_ids and a valid kind.
 *
 * Skips gracefully if the debug endpoint isn't shipped yet.
 */
const { runScenario } = require("../lib/helpers");

const VALID_KINDS = new Set([
  "decision",
  "regret",
  "nudge_outcome",
  "bias_observed",
  "preference",
  "tradeoff",
  "life_context",
]);

async function scenario({
  page,
  apiCall,
  gotoTab,
  openAddExpense,
  sendChat,
  log,
}) {
  // Probe distiller endpoint
  const probe = await apiCall("/api/tilly/_debug/distill-now", {
    method: "POST",
    body: JSON.stringify({ hours: 1 }),
  });
  if (probe.status === 404) {
    log("distiller debug endpoint not shipped — skipping");
    return;
  }

  // 1) prewarm with a meaty chat + an expense
  await gotoTab("Tilly");
  await sendChat(
    "Honestly I keep doing DoorDash on Wednesdays even though I told myself I'd cook. It's frustrating.",
  );
  await page.waitForTimeout(2500);

  await gotoTab("Spend");
  await openAddExpense();
  await page
    .locator('input[placeholder*="stumptown" i]')
    .first()
    .fill("$22 doordash dinner");
  await page.getByText(/^Log it$/i).first().click();
  await page.waitForTimeout(3000);

  // 2) trigger distiller
  log("triggering distiller (1h lookback)");
  const res = await apiCall("/api/tilly/_debug/distill-now", {
    method: "POST",
    body: JSON.stringify({ hours: 1 }),
  });
  log(`distill response: ${JSON.stringify(res.body)}`);
  if (res.status !== 200) {
    throw new Error(`distill returned ${res.status}: ${JSON.stringify(res.body)}`);
  }
  const { eventsScanned, memoriesCreated, skipped, reason } = res.body;
  if (eventsScanned < 3) {
    throw new Error(
      `distiller saw only ${eventsScanned} events — emit hooks should land >=3 from chat+expense`,
    );
  }

  if (skipped) {
    // The distiller is conservative — it can return 0 memories on a
    // well-formed run if the LLM judged nothing distillable. Report it
    // but don't fail.
    log(`distiller skipped: ${reason}`);
    return;
  }

  // 3) read typed memories and validate
  const list = await apiCall("/api/tilly/_debug/typed-memory?limit=20");
  if (list.status !== 200) {
    throw new Error(`typed-memory returned ${list.status}`);
  }
  const memories = list.body?.memories ?? [];
  log(`typed memories: ${memories.length}`);
  for (const m of memories.slice(0, 5)) {
    log(`  [${m.kind}] ${m.body.slice(0, 80)}`);
    if (m.metadata && Object.keys(m.metadata).length) {
      log(`    metadata: ${JSON.stringify(m.metadata).slice(0, 100)}`);
    }
  }

  if (memories.length === 0) {
    throw new Error("distiller reported memoriesCreated > 0 but list endpoint returned none");
  }
  if (memories.length < memoriesCreated) {
    throw new Error(
      `distiller reported ${memoriesCreated} memories but list returned ${memories.length}`,
    );
  }

  // Sanity: every memory has a valid kind and ≥1 source event
  for (const m of memories.slice(0, memoriesCreated)) {
    if (!VALID_KINDS.has(m.kind)) {
      throw new Error(`memory ${m.id} has invalid kind: ${m.kind}`);
    }
    if (!Array.isArray(m.sourceEventIds) || m.sourceEventIds.length === 0) {
      throw new Error(`memory ${m.id} has empty sourceEventIds`);
    }
  }
  log(`✓ ${memoriesCreated} typed memories with valid kinds and lineage`);
}

if (require.main === module) {
  runScenario("08-distiller", scenario).then((r) => {
    process.exit(r.status === "pass" ? 0 : 1);
  });
}

module.exports = scenario;
