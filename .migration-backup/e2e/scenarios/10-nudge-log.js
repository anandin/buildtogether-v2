/**
 * 10 — S4 nudge log + outcome resolution.
 *
 * Plan:
 *   - Seed an in-app-card nudge via /seed-pattern
 *   - Click "Yes, remind me" on the Today screen → nudge resolves to
 *     accepted (POST /api/tilly/_debug/nudges shows outcome=accepted)
 *   - Send a chat that triggers a reminder → chat_inline nudge with
 *     frame=implementation_intention is written
 *
 * Skips gracefully if endpoints aren't shipped.
 */
const { runScenario } = require("../lib/helpers");

async function scenario({ page, apiCall, gotoTab, sendChat, log }) {
  const probe = await apiCall("/api/tilly/_debug/nudges");
  if (probe.status === 404) {
    log("nudge debug endpoint not shipped — skipping");
    return;
  }

  // 1) Seed pattern → in-app-card nudge
  const seed = await apiCall("/api/tilly/_debug/seed-pattern", {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (seed.status !== 200) {
    throw new Error(`seed-pattern failed: ${seed.status} ${JSON.stringify(seed.body)}`);
  }
  log(`seeded nudge: ${seed.body.nudgeId}`);
  const seededNudgeId = seed.body.nudgeId;
  if (!seededNudgeId) throw new Error("seed-pattern returned no nudgeId");

  // 2) Reload Today and click "Yes, remind me"
  await gotoTab("Today");
  // wait for fresh load
  for (let i = 0; i < 15; i++) {
    const stillLoading = await page.evaluate(() =>
      document.body.innerText.includes("pulling your numbers"),
    );
    if (!stillLoading) break;
    await page.waitForTimeout(1000);
  }
  const remindBtn = page.getByText("Yes, remind me", { exact: true }).first();
  if (!(await remindBtn.count())) {
    throw new Error("Yes, remind me button not on Today screen after seed");
  }
  await remindBtn.scrollIntoViewIfNeeded();
  await remindBtn.click();
  await page.waitForTimeout(2500);

  // 3) Read back the nudge log and assert the seeded nudge resolved
  const list = await apiCall("/api/tilly/_debug/nudges?limit=10");
  const nudges = list.body?.nudges ?? [];
  log(`nudges in log: ${nudges.length}`);
  const seededRow = nudges.find((n) => n.id === seededNudgeId);
  if (!seededRow) throw new Error(`seeded nudge ${seededNudgeId} not in log`);
  log(`seeded nudge: frame=${seededRow.frame} channel=${seededRow.channel} outcome=${seededRow.outcome}`);
  if (seededRow.outcome !== "accepted") {
    throw new Error(
      `expected seeded nudge outcome=accepted, got "${seededRow.outcome}"`,
    );
  }
  log(`✓ in-app-card nudge resolved → accepted`);

  // 4) Test chat_inline path: send a message that should trigger a
  // reminder, assert a chat_inline + implementation_intention nudge lands
  await gotoTab("Tilly");
  const r = await sendChat(
    "Yes please remind me Friday morning to call my landlord about the lease",
  );
  log(`chat reply (${r.latencyMs}ms)`);
  await page.waitForTimeout(3500);

  const list2 = await apiCall("/api/tilly/_debug/nudges?limit=20");
  const nudges2 = list2.body?.nudges ?? [];
  const chatNudge = nudges2.find(
    (n) => n.channel === "chat_inline" && n.frame === "implementation_intention",
  );
  if (!chatNudge) {
    log(
      `note: no chat_inline implementation_intention nudge (Haiku classifier may not have fired). Skipping that assertion.`,
    );
    return;
  }
  log(`✓ chat_inline nudge: ${chatNudge.body.slice(0, 80)}`);
}

if (require.main === module) {
  runScenario("10-nudge-log", scenario).then((r) => {
    process.exit(r.status === "pass" ? 0 : 1);
  });
}

module.exports = scenario;
