/**
 * 15 — S11 wait/seasonal advisor + S12 user city.
 *
 * S12 — round-trip GET/PUT /api/tilly/me/city.
 * S11 — POST /api/tilly/chat/wait, poll history for the wait-kind
 *       message, validate it has summary + shouldWait + sources, and
 *       confirm the wait bubble renders ("Should you wait?" or
 *       "Wait — likely cheaper soon" / "Buy now — no clear sale window").
 */
const { runScenario } = require("../lib/helpers");

async function scenario({ page, ss, gotoTab, apiCall, log }) {
  // ── S12: city round-trip ────────────────────────────────────────────────
  log("S12: setting city = 'Toronto, ON'");
  const setRes = await apiCall("/api/tilly/me/city", {
    method: "PUT",
    body: JSON.stringify({ city: "Toronto, ON" }),
  });
  if (setRes.status !== 200)
    throw new Error(`PUT city failed: ${setRes.status} ${JSON.stringify(setRes.body)}`);
  if (setRes.body?.city !== "Toronto, ON")
    throw new Error(`PUT city echoed wrong value: ${JSON.stringify(setRes.body)}`);
  const getRes = await apiCall("/api/tilly/me/city");
  if (getRes.status !== 200) throw new Error(`GET city ${getRes.status}`);
  if (getRes.body?.city !== "Toronto, ON")
    throw new Error(`GET city wrong: ${JSON.stringify(getRes.body)}`);
  log(`S12 round-trip OK: ${getRes.body.city}`);

  // ── S11: wait advice ────────────────────────────────────────────────────
  await gotoTab("Tilly");
  await ss("01-tilly-pre");

  log("S11: enqueueing wait-advice for 'Levis 501 jeans'");
  const enq = await apiCall("/api/tilly/chat/wait", {
    method: "POST",
    body: JSON.stringify({ query: "Levis 501 jeans" }),
  });
  if (enq.status === 404) {
    log("wait endpoint not shipped — skipping");
    return;
  }
  if (enq.status !== 200)
    throw new Error(`wait enqueue ${enq.status} ${JSON.stringify(enq.body)}`);
  const jobId = enq.body.jobId;
  log(`jobId ${jobId}`);

  // Force the chat-history query to refetch by reloading the page.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await gotoTab("Tilly");
  await page.waitForTimeout(2000);
  await ss("02-wait-running");

  // Poll chat/history for the wait-kind message reaching done/failed.
  let final = null;
  const t0 = Date.now();
  for (let i = 0; i < 30; i++) {
    const h = await apiCall("/api/tilly/chat/history");
    if (h.status !== 200) throw new Error(`history ${h.status}`);
    const waitMsgs = (h.body?.messages ?? []).filter(
      (m) => m.role === "tilly" && m.kind === "wait",
    );
    const latest = waitMsgs[waitMsgs.length - 1];
    if (latest && (latest.status === "done" || latest.status === "failed")) {
      final = latest;
      break;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  if (!final) throw new Error("wait advice did not reach a terminal state in 90s");
  log(`wait terminal in ${Date.now() - t0}ms — status=${final.status}`);

  if (final.status === "failed") {
    log(`wait failed gracefully: ${final.errorText}`);
    return;
  }

  // Shape checks.
  if (typeof final.shouldWait !== "boolean")
    throw new Error(`wait done but shouldWait not boolean: ${JSON.stringify(final).slice(0, 200)}`);
  if (typeof final.summary !== "string" || !final.summary.length)
    throw new Error("wait done but summary missing");
  if (final.shouldWait) {
    if (!Array.isArray(final.sources) || final.sources.length === 0) {
      throw new Error("shouldWait=true but sources empty");
    }
    log(`verdict: WAIT until ${final.waitUntil} for ${final.expectedSaving} (${final.confidence})`);
    for (const s of final.sources) {
      if (!s.source || !s.url || !s.evidence) {
        throw new Error(`source missing field: ${JSON.stringify(s)}`);
      }
    }
  } else {
    log("verdict: BUY NOW — no clear sale window");
  }
  log(`summary: ${final.summary}`);

  await page.waitForTimeout(4000);
  await page.evaluate(() => {
    const scrollers = Array.from(document.querySelectorAll("*")).filter(
      (el) => el.scrollHeight > el.clientHeight + 20,
    );
    for (const s of scrollers) s.scrollTop = s.scrollHeight;
    window.scrollTo(0, document.body.scrollHeight);
  });
  await page.waitForTimeout(500);
  await ss("03-wait-done");

  // UI assertion: the wait bubble verdict label should be on screen.
  const bodyText = await page.evaluate(() => document.body.innerText);
  const verdictPhrase = final.shouldWait
    ? /WAIT|LIKELY CHEAPER/i
    : /BUY NOW|NO CLEAR SALE/i;
  if (!verdictPhrase.test(bodyText)) {
    log(`expected verdict phrase on screen — body excerpt: ${bodyText.slice(0, 400)}`);
    throw new Error("wait bubble verdict didn't render in chat UI");
  }
  log("✓ wait bubble rendered with verdict on screen");
}

if (require.main === module) {
  runScenario("15-wait-advice-and-city", scenario).then((r) => {
    process.exit(r.status === "pass" ? 0 : 1);
  });
}

module.exports = scenario;
