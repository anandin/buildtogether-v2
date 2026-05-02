/**
 * 02 — AddExpenseModal flows.
 *
 * - TEXT: "$13 ramen at home" → POST /api/expenses 200, modal closes,
 *   pattern total increases by $13.
 * - VOICE tab renders mic SVG + "Hold to talk" + "Save what I said".
 * - PHOTO tab renders camera + image tiles + "Save from receipt".
 */
const { runScenario } = require("../lib/helpers");

async function scenario({
  page,
  ss,
  gotoTab,
  apiCall,
  openAddExpense,
  clickModalTab,
  log,
}) {
  await gotoTab("Spend");
  await ss("spend-pre");

  // Capture before-totals from the live API
  const before = await apiCall("/api/tilly/spend-pattern");
  const totalBefore = before.body?.weekly?.total ?? before.body?.total ?? null;
  log(`pattern total before: $${totalBefore}`);

  // ── TEXT save ──
  await openAddExpense();
  await ss("modal-open");
  await page
    .locator('input[placeholder*="stumptown" i]')
    .first()
    .fill("$13 ramen at home");
  await ss("text-filled");

  const t0 = Date.now();
  await page.getByText(/^Log it$/i).first().click();
  log(`clicked "Log it"`);
  // Wait for the modal to vanish — that's how the app signals success.
  await page.waitForTimeout(3500);
  await ss("after-text-save");
  const modalGone = await page.evaluate(
    () => !document.body.innerText.toLowerCase().includes("what did you just spend"),
  );
  if (!modalGone) throw new Error("modal did not close after Log it");
  log(`modal closed in ${Date.now() - t0}ms`);

  // Pattern total should increase
  const after = await apiCall("/api/tilly/spend-pattern");
  const totalAfter = after.body?.weekly?.total ?? after.body?.total ?? null;
  log(`pattern total after: $${totalAfter}`);
  if (
    totalBefore != null &&
    totalAfter != null &&
    Number(totalAfter) - Number(totalBefore) < 12.5
  ) {
    throw new Error(
      `pattern total didn't grow by ~$13 — before=$${totalBefore} after=$${totalAfter}`,
    );
  }

  // ── VOICE tab ──
  await openAddExpense();
  await clickModalTab("voice");
  await ss("voice-tab");
  const voiceText = await page.evaluate(() => document.body.innerText);
  if (!/Hold to talk/i.test(voiceText)) {
    throw new Error('voice tab missing "Hold to talk"');
  }
  if (!/Save what I said/i.test(voiceText)) {
    throw new Error('voice tab missing "Save what I said"');
  }

  // ── PHOTO tab ──
  await clickModalTab("photo");
  await ss("photo-tab");
  const photoText = await page.evaluate(() => document.body.innerText);
  if (!/Take a photo/i.test(photoText)) {
    throw new Error('photo tab missing "Take a photo"');
  }
  if (!/Upload from photos/i.test(photoText)) {
    throw new Error('photo tab missing "Upload from photos"');
  }
  if (!/Save from receipt/i.test(photoText)) {
    throw new Error('photo tab missing "Save from receipt"');
  }
}

if (require.main === module) {
  runScenario("02-add-expense", scenario).then((r) => {
    process.exit(r.status === "pass" ? 0 : 1);
  });
}

module.exports = scenario;
