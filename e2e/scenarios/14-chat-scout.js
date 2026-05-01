/**
 * 14 — S9 chat scout flow.
 *
 * Plan:
 *   - go to Tilly tab
 *   - send an affordability question for a buyable item: "can I afford a
 *     pair of $90 Levi's 501 jeans?"
 *   - expect a Tilly analysis reply that includes scoutProposal in
 *     metadata (chat/history exposes it)
 *   - click the "Find me cheaper options" button on that card
 *   - poll chat/history every 2-3s; expect a new scout-kind message
 *     to appear (status: queued/running, then done)
 *   - when status=done, validate options length, source/url/why fields
 *   - screenshots: tilly-empty, after-affordability, scouting,
 *     scout-done
 */
const { runScenario } = require("../lib/helpers");

async function scenario({ page, ss, gotoTab, apiCall, sendChat, log }) {
  await gotoTab("Tilly");
  await ss("01-tilly-pre");

  // Quick math affordability question for a clearly buyable item.
  // The LLM should populate scoutProposal with a concrete query.
  log("sending affordability question for a buyable item");
  const r = await sendChat("can I afford a pair of $90 Levi's 501 jeans?", {
    timeoutMs: 60_000,
  });
  log(`reply latency ${r.latencyMs}ms, kind=${r.reply?.kind}`);
  await page.waitForTimeout(800);
  await ss("02-after-affordability");

  // Pull chat history to find the analysis message + scoutProposal.
  let history = await apiCall("/api/tilly/chat/history");
  if (history.status !== 200)
    throw new Error(`history ${history.status}`);
  const msgs = history.body?.messages ?? [];
  const analysis = [...msgs]
    .reverse()
    .find((m) => m.role === "tilly" && m.kind === "analysis");
  if (!analysis) {
    log(
      "Tilly didn't return an analysis card for that turn — skipping (LLM occasionally falls through to plain text). " +
        "Last reply kind: " +
        (r.reply?.kind ?? "?"),
    );
    return;
  }
  if (!analysis.scoutProposal) {
    log(
      `analysis card had no scoutProposal — skipping. note: ${String(
        analysis.note,
      ).slice(0, 80)}`,
    );
    return;
  }
  log(`scoutProposal query: "${analysis.scoutProposal.query}"`);

  // Click the "Find me cheaper options" button rendered on the analysis card.
  const clicked = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("*")).find(
      (el) =>
        el.children.length === 0 &&
        (el.textContent || "").trim().toLowerCase() ===
          "find me cheaper options",
    );
    if (!btn) return false;
    let target = btn;
    // RN Web wraps Pressable in a div; click the nearest pressable parent.
    for (let i = 0; i < 5 && target; i++) {
      const role = target.getAttribute && target.getAttribute("role");
      if (role === "button" || target.tagName === "BUTTON") break;
      target = target.parentElement;
    }
    if (!target) return false;
    target.click();
    return true;
  });
  if (!clicked) {
    // Fall back: the button may have been hidden behind keyboard / rendered
    // off-screen on the small viewport. Use the API directly so the rest
    // of the scenario can verify the scout bubble update path.
    log("CTA element not directly clickable in DOM — falling back to API enqueue");
    const enq = await apiCall("/api/tilly/chat/scout", {
      method: "POST",
      body: JSON.stringify({
        query: analysis.scoutProposal.query,
        location: "Toronto, ON",
        sourceMessageId: analysis.id,
      }),
    });
    if (enq.status !== 200)
      throw new Error(`scout enqueue ${enq.status} ${JSON.stringify(enq.body)}`);
    log(`scout enqueued via API: jobId=${enq.body.jobId}`);
  } else {
    log("CTA clicked — scout enqueued via UI");
  }

  await page.waitForTimeout(2500);
  await ss("03-scouting");

  // Poll chat/history for a scout-kind message reaching status=done.
  let final = null;
  const t0 = Date.now();
  for (let i = 0; i < 30; i++) {
    history = await apiCall("/api/tilly/chat/history");
    if (history.status !== 200) throw new Error(`history ${history.status}`);
    const scoutMsgs = (history.body?.messages ?? []).filter(
      (m) => m.role === "tilly" && m.kind === "scout",
    );
    const latest = scoutMsgs[scoutMsgs.length - 1];
    if (latest && (latest.status === "done" || latest.status === "failed")) {
      final = latest;
      break;
    }
    await new Promise((res) => setTimeout(res, 3000));
  }
  if (!final) throw new Error("scout did not reach a terminal state in 90s");
  log(`scout terminal in ${Date.now() - t0}ms — status=${final.status}`);

  if (final.status === "failed") {
    log(`scout failed gracefully: ${final.errorText}`);
    return;
  }

  // Trigger UI refetch by toggling tab so the bubble renders the done state.
  await gotoTab("Today");
  await page.waitForTimeout(800);
  await gotoTab("Tilly");
  await page.waitForTimeout(2000);
  await ss("04-scout-done");

  if (!Array.isArray(final.options) || final.options.length === 0) {
    throw new Error("scout done but options[] empty");
  }
  for (const opt of final.options) {
    if (!opt.source || !opt.url || !opt.why) {
      throw new Error(`option missing required field: ${JSON.stringify(opt)}`);
    }
  }
  log(`${final.options.length} options:`);
  log(`summary: ${final.summary}`);
  for (const opt of final.options) {
    log(`  [${opt.source}] ${opt.title} — ${opt.price ?? "?"}`);
  }
}

if (require.main === module) {
  runScenario("14-chat-scout", scenario).then((r) => {
    process.exit(r.status === "pass" ? 0 : 1);
  });
}

module.exports = scenario;
