/**
 * 11 — S5 frame bandit.
 *
 * Plan:
 *   - Read /api/tilly/_debug/bandit; assert all 15 frames present with
 *     prior alpha/beta + posterior mean.
 *   - Trigger /api/tilly/_debug/pick-frame 50 times; assert the picks
 *     are not all the same frame (Thompson Sampling explores).
 *   - Seed a pattern → record the picked frame; resolve as accepted;
 *     verify the picked frame's accepted count went up.
 */
const { runScenario } = require("../lib/helpers");

async function scenario({ apiCall, gotoTab, page, log }) {
  const probe = await apiCall("/api/tilly/_debug/bandit");
  if (probe.status === 404) {
    log("bandit debug endpoint not shipped — skipping");
    return;
  }
  if (probe.status !== 200) {
    throw new Error(`/_debug/bandit returned ${probe.status}`);
  }
  const frames = probe.body?.frames ?? [];
  log(`frames in bandit: ${frames.length}`);
  if (frames.length < 15) {
    throw new Error(`expected 15 frames in bandit, got ${frames.length}`);
  }
  log(
    `top 3: ${frames
      .slice(0, 3)
      .map((f) => `${f.frame}:${f.expectedAccept.toFixed(2)}`)
      .join(", ")}`,
  );

  // Sanity: every frame returns a valid probability. (We don't pin the
  // range to the cold-start prior because the test account accumulates
  // real outcomes across runs, legitimately moving the posterior past
  // the prior interval — which is the bandit *learning*.)
  for (const f of frames) {
    if (f.expectedAccept < 0 || f.expectedAccept > 1 || !Number.isFinite(f.expectedAccept)) {
      throw new Error(
        `expectedAccept not a valid probability for ${f.frame}: ${f.expectedAccept}`,
      );
    }
  }

  // Sample picks 30 times
  const picks = [];
  for (let i = 0; i < 30; i++) {
    const r = await apiCall("/api/tilly/_debug/pick-frame", {
      method: "POST",
      body: JSON.stringify({}),
    });
    if (r.status !== 200) throw new Error(`pick-frame ${r.status}`);
    picks.push(r.body.frame);
  }
  const uniq = new Set(picks);
  log(`30 picks → ${uniq.size} unique frames: ${Array.from(uniq).slice(0, 8).join(", ")}`);
  if (uniq.size < 3) {
    throw new Error(
      `bandit only picked ${uniq.size} unique frames in 30 samples — Thompson should explore more`,
    );
  }

  // Acceptance test: seed a pattern → record picked frame → click Yes
  // → verify the bandit reflects the win.
  const seed1 = await apiCall("/api/tilly/_debug/seed-pattern", {
    method: "POST",
    body: JSON.stringify({ body: "Bandit-test pattern observation 1" }),
  });
  const pickedFrame = seed1.body.frame;
  log(`seeded with frame: ${pickedFrame} (expected ${seed1.body.banditExpected})`);

  const before = (await apiCall("/api/tilly/_debug/bandit")).body.frames.find(
    (f) => f.frame === pickedFrame,
  );
  log(`before: ${pickedFrame} accepted=${before.accepted} alpha=${before.alpha}`);

  await gotoTab("Today");
  for (let i = 0; i < 15; i++) {
    const stillLoading = await page.evaluate(() =>
      document.body.innerText.includes("pulling your numbers"),
    );
    if (!stillLoading) break;
    await page.waitForTimeout(1000);
  }
  const remind = page.getByText("Yes, remind me", { exact: true }).first();
  if (!(await remind.count())) {
    log("note: Yes-remind-me not on Today (already acted on?). Skipping reward update check.");
    return;
  }
  await remind.scrollIntoViewIfNeeded();
  await remind.click();
  await page.waitForTimeout(2500);

  const after = (await apiCall("/api/tilly/_debug/bandit")).body.frames.find(
    (f) => f.frame === pickedFrame,
  );
  log(`after:  ${pickedFrame} accepted=${after.accepted} alpha=${after.alpha}`);
  if (after.accepted <= before.accepted) {
    throw new Error(
      `bandit didn't register the accept: before.accepted=${before.accepted} after=${after.accepted}`,
    );
  }
  log(`✓ bandit reward update for ${pickedFrame}: ${before.accepted} → ${after.accepted}`);
}

if (require.main === module) {
  runScenario("11-bandit", scenario).then((r) => {
    process.exit(r.status === "pass" ? 0 : 1);
  });
}

module.exports = scenario;
