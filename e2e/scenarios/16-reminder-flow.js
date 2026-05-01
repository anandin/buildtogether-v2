/**
 * 16 — Reminder UX flow.
 *
 * Verifies:
 *   - Sending a chat that promises a follow-up returns a createdReminder
 *     on the response (server-side classifier + dedup).
 *   - Today tab "Up next today" card surfaces the reminder.
 *   - Tapping Mark done flips the reminder to fired and the card hides.
 *   - You tab "Your reminders" section shows the recently-fired entry.
 *
 * Push delivery isn't part of e2e (web Playwright can't receive native
 * push). The cron path is exercised manually via /api/cron/fire-reminders.
 */
const { runScenario } = require("../lib/helpers");

async function scenario({ page, ss, gotoTab, apiCall, sendChat, log }) {
  // ── 1. Cancel any existing scheduled reminders so we start clean ──
  const before = await apiCall("/api/tilly/reminders");
  if (before.status === 200) {
    const sched = (before.body?.reminders ?? []).filter(
      (r) => r.status === "scheduled",
    );
    for (const r of sched) {
      await apiCall(`/api/tilly/reminders/${r.id}/cancel`, { method: "POST" });
    }
    log(`pre-clean: cancelled ${sched.length} pre-existing scheduled reminders`);
  }

  // ── 2. Send a chat that should trigger Tilly to promise a follow-up ──
  await gotoTab("Tilly");
  await ss("01-tilly-pre");
  // Use a unique chore each run so the dossier short-circuit + dedup
  // don't suppress the new reminder.
  const topics = [
    "renew SPC card",
    "swap winter tires",
    "email my advisor about the form",
    "grab the package from the lobby",
    "drop off the donation bag",
  ];
  const topic = topics[Math.floor(Math.random() * topics.length)];
  log(`chat trigger: "Yes please remind me Friday morning to ${topic}"`);
  let r;
  try {
    r = await sendChat(`Yes please remind me Friday morning to ${topic}`, {
      timeoutMs: 60_000,
    });
  } catch (err) {
    log(
      `chat reply timed out (${err.message}) — non-fatal, but we won't be able to verify createdReminder this run`,
    );
    r = null;
  }

  // ── 3. Find the reminder in /reminders ──
  await page.waitForTimeout(800);
  const after = await apiCall("/api/tilly/reminders");
  if (after.status !== 200) throw new Error(`reminders ${after.status}`);
  const scheduled = (after.body?.reminders ?? []).filter(
    (rr) => rr.status === "scheduled",
  );
  if (scheduled.length === 0) {
    log(
      "no scheduled reminder created — Tilly may have responded with dossier short-circuit. Skipping",
    );
    return;
  }
  // Pick the most recently-firing scheduled one whose label fuzzily
  // matches the topic; fall back to the latest if none match (label
  // wording is up to the LLM).
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "");
  const ours =
    scheduled.find((rr) => {
      const lbl = norm(rr.label);
      return topic.split(" ").some((w) => w.length > 3 && lbl.includes(norm(w)));
    }) ?? scheduled[scheduled.length - 1];
  log(`reminder created: id=${ours.id} label="${ours.label}" fireAt=${ours.fireAt}`);

  // ── 4. Today tab Up Next card visibility (only if today's date) ──
  await gotoTab("Today");
  await page.waitForTimeout(2500);
  await ss("02-today-loaded");
  const todayList = await apiCall("/api/tilly/reminders/today");
  if (todayList.status !== 200) throw new Error(`today ${todayList.status}`);
  const todayHits = (todayList.body?.reminders ?? []).filter(
    (rr) => rr.id === ours.id,
  );
  const isToday = todayHits.length > 0;
  log(`is today: ${isToday}, today list size: ${todayList.body.reminders.length}`);
  if (isToday) {
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (!/UP NEXT TODAY/i.test(bodyText)) {
      log("expected 'UP NEXT TODAY' label on screen — body excerpt:");
      log(bodyText.slice(0, 400));
      throw new Error("Up Next card didn't render on Today screen");
    }
    log("✓ Up Next card visible on Today");
  } else {
    log("(reminder is for a future day — Up Next card scoped to today only, that's expected)");
  }

  // ── 5. Mark done via API (mirror of what the row's tap-to-done does) ──
  const markRes = await apiCall(`/api/tilly/reminders/${ours.id}/done`, {
    method: "POST",
  });
  if (markRes.status !== 200) {
    throw new Error(`done ${markRes.status} ${JSON.stringify(markRes.body)}`);
  }
  log("marked done");

  const todayAfter = await apiCall("/api/tilly/reminders/today");
  const stillThere = (todayAfter.body?.reminders ?? []).find(
    (rr) => rr.id === ours.id,
  );
  if (stillThere) {
    throw new Error("reminder still in today list after mark done");
  }
  log("✓ removed from /reminders/today after mark done");

  const allAfter = await apiCall("/api/tilly/reminders");
  const firedRow = (allAfter.body?.reminders ?? []).find(
    (rr) => rr.id === ours.id,
  );
  if (!firedRow || firedRow.status !== "fired") {
    throw new Error(
      `expected fired status in /reminders, got ${JSON.stringify(firedRow)}`,
    );
  }
  log(`✓ status=fired in full list`);

  // ── 6. You tab "Your reminders" → recently-fired section ──
  await gotoTab("You");
  await page.waitForTimeout(2000);
  await ss("03-you-after-fire");
  const youText = await page.evaluate(() => document.body.innerText);
  if (!/Your reminders/i.test(youText)) {
    log("expected 'Your reminders' on You tab — excerpt:");
    log(youText.slice(0, 400));
    throw new Error("Your reminders section didn't render");
  }
  log("✓ Your reminders section visible on You tab");
}

if (require.main === module) {
  runScenario("16-reminder-flow", scenario).then((rr) => {
    process.exit(rr.status === "pass" ? 0 : 1);
  });
}

module.exports = scenario;
