/**
 * 07 — S1 Event log smoke check.
 *
 * Verifies that the obvious user actions land rows in tilly_events.
 * We don't have a public read endpoint for the event log (and shouldn't
 * — it's internal). So we count rows via a small admin probe: each
 * action grows the count by ≥1.
 *
 * To make this work, the test pokes a debug endpoint that returns the
 * current event-log row count for the authenticated user. If the
 * endpoint isn't shipped yet the test skips gracefully.
 */
const { runScenario } = require("../lib/helpers");

async function scenario({ page, apiCall, gotoTab, openAddExpense, sendChat, log }) {
  const probe = await apiCall("/api/tilly/_debug/event-count");
  if (probe.status === 404) {
    log("debug endpoint not shipped yet — skipping event-log assertion");
    return;
  }
  if (probe.status !== 200 || typeof probe.body?.count !== "number") {
    throw new Error(`unexpected /event-count response: ${JSON.stringify(probe).slice(0, 200)}`);
  }
  const before = probe.body.count;
  log(`event count BEFORE: ${before}`);

  // 1) chat turn
  await gotoTab("Tilly");
  await sendChat("Quick question: what's my biggest soft spot this week?");
  await page.waitForTimeout(2000);

  // 2) expense save
  await gotoTab("Spend");
  await openAddExpense();
  await page.locator('input[placeholder*="stumptown" i]').first().fill("$4 coffee at the library");
  await page.getByText(/^Log it$/i).first().click();
  await page.waitForTimeout(3000);

  const after = (await apiCall("/api/tilly/_debug/event-count")).body.count;
  log(`event count AFTER: ${after}`);

  // Expect at least: 1 chat_user_msg + 1 chat_tilly_reply + 1 expense_logged = 3
  if (after - before < 3) {
    throw new Error(
      `expected ≥3 new events from chat+expense; before=${before} after=${after} (diff=${after - before})`,
    );
  }
  log(`✓ ${after - before} events landed`);
}

if (require.main === module) {
  runScenario("07-event-log", scenario).then((r) => {
    process.exit(r.status === "pass" ? 0 : 1);
  });
}

module.exports = scenario;
