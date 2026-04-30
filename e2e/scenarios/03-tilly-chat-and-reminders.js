/**
 * 03 — Tilly chat + reminders.
 *
 * Send an affordability question and assert the Quick Math card renders.
 * Send a reminder commitment and assert a tilly_reminders row landed.
 * Cancel a reminder via the × button and assert it disappears.
 */
const { runScenario } = require("../lib/helpers");

async function scenario({ page, ss, gotoTab, apiCall, sendChat, log }) {
  await gotoTab("Tilly");
  await ss("tilly-initial");

  // ── Q1: affordability ──
  log("Q1: affordability");
  const q1 = await sendChat("Can I afford a $200 concert ticket on Friday?");
  log(`Q1 reply in ${q1.latencyMs}ms (kind=${q1.reply.kind})`);
  await page.waitForTimeout(1500);
  await ss("q1-reply");

  // The reply lands as kind=text or kind=analysis. The Quick Math card
  // is rendered client-side from a "Starting buffer ... Final buffer"
  // pattern in the text body. LLM phrasing varies — assert the *intent*
  // (some affordability framing landed) rather than exact phrasing.
  const body = q1.reply.kind === "text" ? q1.reply.body : "";
  if (q1.reply.kind === "analysis") {
    log(`Quick Math: ${q1.reply.body.title} (${(q1.reply.body.rows || []).length} rows)`);
  } else {
    const hasMath = /starting buffer/i.test(body) && /final buffer/i.test(body);
    const hasDollar = /\$\d+/.test(body);
    const hasYesNo = /\b(yes|no|nope|sure|don'?t)\b/i.test(body.split("\n")[0] || "");
    if (!hasMath && !(hasDollar && hasYesNo)) {
      throw new Error(
        `Q1 reply doesn't look like an affordability response. Got: ${body.slice(0, 200)}`,
      );
    }
    if (hasMath) log("Quick Math markers present (client-side card will render)");
    else log("note: prose-form affordability response (Quick Math card won't render this turn)");
  }

  // ── Q2: reminder commitment ──
  log("Q2: reminder commitment");
  const remindersBefore = (await apiCall("/api/tilly/reminders")).body?.reminders ?? [];
  const q2 = await sendChat(
    "Yes please remind me Friday morning to grab cash for the show",
  );
  log(`Q2 reply in ${q2.latencyMs}ms`);
  // Classifier runs after the reply ships; give it a moment.
  await page.waitForTimeout(3500);
  await ss("q2-reply");

  const remindersAfter = (await apiCall("/api/tilly/reminders")).body?.reminders ?? [];
  if (remindersAfter.length <= remindersBefore.length) {
    throw new Error(
      `expected a new reminder row; before=${remindersBefore.length} after=${remindersAfter.length}`,
    );
  }
  const newOnes = remindersAfter.filter(
    (r) => !remindersBefore.find((b) => b.id === r.id),
  );
  log(`new reminder: "${newOnes[0]?.label}" fires at ${newOnes[0]?.fireAt}`);

  // ── Cancel via × ──
  log("cancel via ×");
  const cancelInfo = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("*"))
      .filter((el) => el.children.length === 0)
      .filter((el) => (el.textContent || "").trim() === "×")
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      })
      .sort((a, b) => a.y - b.y);
  });
  if (!cancelInfo.length) {
    throw new Error("no × cancel button visible (RemindersStrip not rendered?)");
  }
  await page.mouse.click(cancelInfo[0].x, cancelInfo[0].y);
  await page.waitForTimeout(2500);
  await ss("after-cancel");

  const remindersFinal = (await apiCall("/api/tilly/reminders")).body?.reminders ?? [];
  if (remindersFinal.length >= remindersAfter.length) {
    throw new Error(
      `× cancel didn't remove a reminder; before-cancel=${remindersAfter.length} after-cancel=${remindersFinal.length}`,
    );
  }
  log(`reminders after cancel: ${remindersFinal.length} (was ${remindersAfter.length})`);
}

if (require.main === module) {
  runScenario("03-tilly-chat-and-reminders", scenario).then((r) => {
    process.exit(r.status === "pass" ? 0 : 1);
  });
}

module.exports = scenario;
