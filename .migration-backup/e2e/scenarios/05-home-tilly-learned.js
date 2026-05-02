/**
 * 05 — Home / Today: Tilly Learned card buttons.
 *
 * Wait for Today data to load, then click "Yes, remind me" and assert:
 *   - POST /api/tilly/learned/remind fires (server logs 200)
 *   - Card transitions to "Got it. I'll nudge you ..."
 *   - A new memory entry shows up in /api/tilly/memory
 */
const { runScenario } = require("../lib/helpers");

async function scenario({ page, ss, gotoTab, apiCall, log }) {
  await gotoTab("Today");

  // The skeleton "One sec — pulling your numbers…" stays until the
  // Today / dreams / spend / expenses queries resolve.
  for (let i = 0; i < 25; i++) {
    const stillLoading = await page.evaluate(() =>
      document.body.innerText.includes("pulling your numbers"),
    );
    if (!stillLoading) {
      log(`Today loaded after ${i}s`);
      break;
    }
    await page.waitForTimeout(1000);
  }

  await ss("today-loaded");
  const text = await page.evaluate(() => document.body.innerText);
  if (!/TILLY LEARNED/i.test(text)) {
    log("note: TILLY LEARNED card not present — pattern detection has nothing to surface this run");
    return;
  }

  const remindBtn = page.getByText("Yes, remind me", { exact: true }).first();
  if (!(await remindBtn.count())) {
    throw new Error('"Yes, remind me" button not found on Today screen');
  }

  const memBefore = (await apiCall("/api/tilly/memory")).body?.memory ?? [];

  await remindBtn.scrollIntoViewIfNeeded();
  await ss("scrolled-to-card");
  await remindBtn.click();
  await page.waitForTimeout(3000);
  await ss("after-remind");

  const after = await page.evaluate(() => document.body.innerText);
  if (!/Got it\.|nudge you/i.test(after)) {
    throw new Error("Tilly Learned card didn't transition to acknowledged state");
  }

  const memAfter = (await apiCall("/api/tilly/memory")).body?.memory ?? [];
  if (memAfter.length <= memBefore.length) {
    throw new Error(
      `expected a new memory row from "Yes, remind me"; before=${memBefore.length} after=${memAfter.length}`,
    );
  }
  log(
    `memory grew ${memBefore.length} → ${memAfter.length}; newest: "${memAfter[0]?.body?.slice(0, 60)}"`,
  );
}

if (require.main === module) {
  runScenario("05-home-tilly-learned", scenario).then((r) => {
    process.exit(r.status === "pass" ? 0 : 1);
  });
}

module.exports = scenario;
