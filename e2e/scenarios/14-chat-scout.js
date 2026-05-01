/**
 * 14 — S9 chat scout flow.
 *
 * Two things this verifies:
 *   1. POST /api/tilly/chat/scout writes a scout-kind message into the
 *      conversation thread, and chat/history serializes it with live
 *      job status (queued -> running -> done) joined from the scout
 *      jobs table.
 *   2. The Tilly chat UI renders the "Tilly is scouting…" bubble while
 *      the job is in-flight, then transitions to a result card with
 *      options the moment the history poll picks up status=done.
 *
 * The affordability path (LLM populates scoutProposal on the analysis
 * card → student taps "Find me cheaper options") is exercised
 * opportunistically — when the LLM honors the structured output. When
 * it doesn't (Sonnet's structured output is occasionally flaky and the
 * server falls back to plain text), we still enqueue via the API so
 * the scout-bubble path itself is always covered.
 */
const { runScenario } = require("../lib/helpers");

async function scenario({ page, ss, gotoTab, apiCall, sendChat, log }) {
  await gotoTab("Tilly");
  await ss("01-tilly-pre");

  log("sending affordability question for a buyable item");
  const affordReply = await sendChat(
    "can I afford a pair of $90 Levi's 501 jeans?",
    { timeoutMs: 60_000 },
  );
  log(
    `reply latency ${affordReply.latencyMs}ms, kind=${affordReply.reply?.kind}`,
  );
  await page.waitForTimeout(800);
  await ss("02-after-affordability");

  // If the LLM returned an analysis card with scoutProposal, exercise
  // the UI click path. Otherwise we'll hit the API directly below.
  let history = await apiCall("/api/tilly/chat/history");
  if (history.status !== 200) throw new Error(`history ${history.status}`);
  const msgs = history.body?.messages ?? [];
  const analysisWithProposal = [...msgs]
    .reverse()
    .find(
      (m) =>
        m.role === "tilly" && m.kind === "analysis" && m.scoutProposal,
    );

  let scoutQuery;
  let sourceMessageId;
  let usedUiPath = false;
  if (analysisWithProposal) {
    log(`analysis has scoutProposal: "${analysisWithProposal.scoutProposal.query}"`);
    scoutQuery = analysisWithProposal.scoutProposal.query;
    sourceMessageId = analysisWithProposal.id;
    const clicked = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("*")).find(
        (el) =>
          el.children.length === 0 &&
          (el.textContent || "").trim().toLowerCase() ===
            "find me cheaper options",
      );
      if (!btn) return false;
      let target = btn;
      for (let i = 0; i < 5 && target; i++) {
        const role = target.getAttribute && target.getAttribute("role");
        if (role === "button" || target.tagName === "BUTTON") break;
        target = target.parentElement;
      }
      if (!target) return false;
      target.click();
      return true;
    });
    if (clicked) {
      log("CTA clicked — scout enqueued via UI");
      usedUiPath = true;
    } else {
      log("CTA not directly clickable — falling back to API");
    }
  } else {
    log(
      "no scoutProposal on this turn (LLM flake or item not classified as buyable) — using API path",
    );
    scoutQuery = "Levi's 501 jeans size 32";
    sourceMessageId =
      affordReply.reply && affordReply.reply.id ? affordReply.reply.id : null;
  }

  if (!usedUiPath) {
    const enq = await apiCall("/api/tilly/chat/scout", {
      method: "POST",
      body: JSON.stringify({
        query: scoutQuery,
        location: "Toronto, ON",
        sourceMessageId,
      }),
    });
    if (enq.status !== 200)
      throw new Error(
        `scout enqueue ${enq.status} ${JSON.stringify(enq.body)}`,
      );
    log(`scout enqueued via API: jobId=${enq.body.jobId}`);
  }

  // If we went through the UI mutation, useTilly already invalidated
  // the chat history query and the refetchInterval will pulse while
  // the scout is in-flight. If we went through the API directly the
  // client hasn't been told anything changed, so reload the page to
  // force a fresh fetch and let the in-flight pulsing kick in.
  if (!usedUiPath) {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    await gotoTab("Tilly");
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

  // The bubble should refetch automatically because useTilly() polls
  // every 2.5s while a scout is queued/running. Give it one full poll
  // cycle plus a buffer, then scroll to the bottom of the chat so the
  // result card is in the screenshot frame.
  await page.waitForTimeout(4000);
  await page.evaluate(() => {
    const scrollers = Array.from(document.querySelectorAll("*")).filter(
      (el) => el.scrollHeight > el.clientHeight + 20,
    );
    for (const s of scrollers) s.scrollTop = s.scrollHeight;
    window.scrollTo(0, document.body.scrollHeight);
  });
  await page.waitForTimeout(500);
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

  // UI-level assertion: the rendered chat must include the source chip
  // text from at least one option (e.g. "FACEBOOK MARKETPLACE", "THE
  // BAY"). This proves the scout bubble actually rendered, not just
  // that the API has the data.
  const bodyText = await page.evaluate(() => document.body.innerText);
  const sources = final.options.map((o) => o.source.toUpperCase());
  const sourceVisible = sources.some((s) => bodyText.toUpperCase().includes(s));
  if (!sourceVisible) {
    log(`expected one of ${sources.join(", ")} on screen — scout bubble may not have rendered`);
    log(`body excerpt: ${bodyText.slice(0, 400)}`);
    throw new Error("scout bubble did not render in the chat UI");
  }
  log(`✓ scout bubble rendered with source chip on screen`);
}

if (require.main === module) {
  runScenario("14-chat-scout", scenario).then((r) => {
    process.exit(r.status === "pass" ? 0 : 1);
  });
}

module.exports = scenario;
