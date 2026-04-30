/**
 * 04 — Profile (You) actions.
 *
 * - Tone change persists via PATCH /api/tilly/profile
 * - Quiet hours / Big-purchase alert rows open editors with Save buttons
 * - "+ Add someone who can help you decide" opens the trusted-people sheet
 */
const { runScenario } = require("../lib/helpers");

async function scenario({ page, ss, gotoTab, apiCall, log }) {
  await gotoTab("You");
  await ss("profile");

  // ── Tone toggle ──
  await page.getByText("Coach", { exact: true }).first().click();
  await page.waitForTimeout(1500);
  let p = await apiCall("/api/tilly/profile");
  if (p.body?.tone !== "coach") {
    throw new Error(`tone didn't switch to coach; got ${p.body?.tone}`);
  }
  log("tone → coach ✓");

  await page.getByText("Sibling", { exact: true }).first().click();
  await page.waitForTimeout(1500);
  p = await apiCall("/api/tilly/profile");
  if (p.body?.tone !== "sibling") {
    throw new Error(`tone didn't switch back to sibling; got ${p.body?.tone}`);
  }
  log("tone → sibling ✓");

  // ── Quiet hours editor ──
  await page.getByText("Quiet hours", { exact: true }).first().click();
  await page.waitForTimeout(1500);
  await ss("quiet-hours");
  const quietText = await page.evaluate(() => document.body.innerText);
  if (!/Quiet settings/i.test(quietText)) {
    throw new Error("Quiet hours editor didn't open");
  }
  if (!/I'?ll stay quiet/i.test(quietText)) {
    throw new Error("Quiet hours editor missing the explanatory copy");
  }
  await closeAnySheet(page);

  // ── Big-purchase alert editor ──
  await page.getByText("Big-purchase alert", { exact: true }).first().click();
  await page.waitForTimeout(1500);
  await ss("big-purchase");
  const bpText = await page.evaluate(() => document.body.innerText);
  if (!/Flag any purchase over/i.test(bpText)) {
    throw new Error("Big-purchase alert editor didn't open");
  }
  await closeAnySheet(page);

  // ── Trusted person invite ──
  await page
    .getByText(/Add someone who can help you decide/i)
    .first()
    .click();
  await page.waitForTimeout(1500);
  await ss("add-trusted-person");
  const tpText = await page.evaluate(() => document.body.innerText);
  if (!/Trusted People/i.test(tpText)) {
    throw new Error("Trusted People sheet didn't open");
  }
  if (!/Splits only|Credit \+ dreams|Everything/i.test(tpText)) {
    throw new Error("Trusted People scope chooser missing");
  }
  await closeAnySheet(page);
}

async function closeAnySheet(page) {
  const x = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll("*"))
      .filter((el) => el.children.length === 0)
      .filter((el) => (el.textContent || "").trim() === "×")
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
    return all[0] || null;
  });
  if (x) {
    await page.mouse.click(x.x, x.y);
    await page.waitForTimeout(600);
  }
}

if (require.main === module) {
  runScenario("04-profile", scenario).then((r) => {
    process.exit(r.status === "pass" ? 0 : 1);
  });
}

module.exports = scenario;
