/**
 * 06 — Dreams.
 *
 * - "+ Move money to <dream>" opens the contribute sheet with an Amount input
 * - "+ Name a new dream" placeholder is visible
 */
const { runScenario } = require("../lib/helpers");

async function scenario({ page, ss, gotoTab, log }) {
  await gotoTab("Dreams");
  await page.waitForTimeout(1500);
  await ss("dreams-initial");

  const moveMoney = page.getByText(/Move money to/i).first();
  if (!(await moveMoney.count())) {
    throw new Error('No "Move money to <dream>" button — Dreams empty?');
  }
  await moveMoney.click();
  await page.waitForTimeout(1500);
  await ss("contribute-sheet");

  const text = await page.evaluate(() => document.body.innerText);
  if (!/Add to|How much can you set aside|set aside/i.test(text)) {
    throw new Error("Contribute sheet didn't open");
  }
  if (!/AMOUNT/i.test(text)) {
    throw new Error("Contribute sheet missing AMOUNT input");
  }
  log('contribute sheet has AMOUNT input ✓');

  // Close the sheet
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
  if (x) await page.mouse.click(x.x, x.y);
  await page.waitForTimeout(800);

  // "Name a new dream"
  const newDreamText = await page.evaluate(() => document.body.innerText);
  if (!/Name a new dream/i.test(newDreamText)) {
    throw new Error('"Name a new dream" placeholder missing');
  }
  log('"Name a new dream" placeholder present ✓');
}

if (require.main === module) {
  runScenario("06-dreams", scenario).then((r) => {
    process.exit(r.status === "pass" ? 0 : 1);
  });
}

module.exports = scenario;
