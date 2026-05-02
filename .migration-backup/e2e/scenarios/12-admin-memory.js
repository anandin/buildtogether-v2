/**
 * 12 — S7 admin memory inspector at /admin/memory.
 *
 * Plan:
 *   - Login as QA (which is admin via the boot migration)
 *   - Navigate to /admin/memory
 *   - Wait for the user list to load + click ourselves
 *   - Assert all 4 layer cards rendered with non-empty content:
 *       L4 dossier (>=1 section visible)
 *       L5 bandit (15 rows)
 *       L2 typed memories (>=1 row)
 *       L1 events (>=1 row)
 *       S4 nudges (>=1 row)
 *   - Click a lineage link in L2 → assert the matching L1 event got the
 *     'highlighted' class
 */
const { runScenario } = require("../lib/helpers");

const BASE = process.env.BT_BASE || "https://buildtogether-v2.vercel.app";

async function scenario({ page, ss, log }) {
  // Token is in localStorage from login() helper.
  // Navigate to /admin/memory directly — same origin so the token persists.
  await page.goto(BASE + "/admin/memory", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2000);
  await ss("admin-loaded");

  // The page auto-loads the token from localStorage. Wait for the user list.
  let userListPopulated = false;
  for (let i = 0; i < 25; i++) {
    const count = await page.evaluate(() =>
      document.querySelectorAll("#user-list .user-row").length,
    );
    if (count > 0) {
      userListPopulated = true;
      log(`user list populated (${count} users)`);
      break;
    }
    await page.waitForTimeout(500);
  }
  if (!userListPopulated) {
    const fallback = await page.evaluate(() =>
      document.querySelector("#user-list").textContent,
    );
    throw new Error(`/admin/memory user list never populated. Body: ${fallback.slice(0, 200)}`);
  }

  // Click the first user row (QA account is the active one)
  const firstRow = await page.locator("#user-list .user-row").first();
  await firstRow.click();
  // Loading 5 endpoints in parallel — give it time
  await page.waitForTimeout(5500);
  await ss("user-selected");

  // L4 dossier should have at least one section
  const dossierSections = await page.evaluate(() =>
    document.querySelectorAll("#dossier-body .dossier-section").length,
  );
  log(`L4 dossier sections: ${dossierSections}`);
  if (dossierSections < 2) {
    throw new Error(`expected >=2 dossier sections, got ${dossierSections}`);
  }

  // L5 bandit: 15 frame rows
  const banditRows = await page.evaluate(() =>
    document.querySelectorAll("#bandit-body tbody tr").length,
  );
  log(`L5 bandit rows: ${banditRows}`);
  if (banditRows !== 15) {
    throw new Error(`expected 15 bandit rows, got ${banditRows}`);
  }

  // L2 memories
  const memRows = await page.evaluate(() =>
    document.querySelectorAll("#mem-body .mem-row").length,
  );
  log(`L2 mem rows: ${memRows}`);
  if (memRows < 1) {
    throw new Error("expected >=1 typed-memory row");
  }

  // L1 events
  const eventRows = await page.evaluate(() =>
    document.querySelectorAll("#event-body .event-row").length,
  );
  log(`L1 events: ${eventRows}`);
  if (eventRows < 3) {
    throw new Error(`expected >=3 events (we've made many), got ${eventRows}`);
  }

  // S4 nudges
  const nudgeRows = await page.evaluate(() =>
    document.querySelectorAll("#nudge-body .nudge-row").length,
  );
  log(`S4 nudges: ${nudgeRows}`);
  if (nudgeRows < 1) {
    throw new Error("expected >=1 nudge row (scenario 10 + 11 created several)");
  }

  // Click the first memory row to expand metadata
  await page.locator("#mem-body .mem-row").first().click();
  await page.waitForTimeout(300);
  const metaVisible = await page.evaluate(() =>
    document
      .querySelector("#mem-body .mem-row")
      .querySelector(".mem-meta")
      .getAttribute("style"),
  );
  if (!metaVisible || !metaVisible.includes("block")) {
    throw new Error("memory metadata didn't expand on click");
  }
  log("✓ memory expand works");

  // Click a lineage link if any are present
  const lineageCount = await page.locator(".lineage-link").count();
  log(`lineage links: ${lineageCount}`);
  if (lineageCount > 0) {
    await page.locator(".lineage-link").first().click();
    await page.waitForTimeout(800);
    const highlighted = await page.evaluate(() =>
      document.querySelectorAll(".event-row.highlighted").length,
    );
    if (highlighted < 1) {
      throw new Error("lineage click didn't highlight an event");
    }
    log("✓ lineage drill-down works");
  } else {
    log("note: no lineage links visible (memories may have empty source_event_ids)");
  }

  await ss("layers-rendered");
}

if (require.main === module) {
  runScenario("12-admin-memory", scenario).then((r) => {
    process.exit(r.status === "pass" ? 0 : 1);
  });
}

module.exports = scenario;
