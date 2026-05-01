/**
 * 13 — S8 live substitute scout.
 *
 * UI today: scout has no first-class card on screen yet (S9 will add the
 * chat trigger + result card). So this scenario:
 *   - lands on the Tilly tab and snapshots the screen so a future S9
 *     change is visually obvious in the diff
 *   - enqueues a scout via POST /api/tilly/scout from inside the page
 *     context (so it uses the live bearer token)
 *   - polls GET /api/tilly/scout/:id until done (cap 90s)
 *   - validates option shape: source + url + why required
 *   - validates the job appears in GET /api/tilly/scout/recent
 *   - snapshots Tilly + Today screens at the end so we can see whether
 *     anything has surfaced in the UI yet
 */
const { runScenario } = require("../lib/helpers");

async function scenario({ apiCall, page, ss, gotoTab, log }) {
  await gotoTab("Tilly");
  await ss("tilly-before-scout");

  log("enqueueing a scout for 'Levi's 501 jeans size 32'");
  const enq = await apiCall("/api/tilly/scout", {
    method: "POST",
    body: JSON.stringify({
      query: "Levi's 501 jeans size 32",
      location: "Toronto, ON",
    }),
  });
  if (enq.status === 404) {
    log("scout endpoint not shipped — skipping");
    return;
  }
  if (enq.status !== 200) {
    throw new Error(`scout enqueue failed: ${enq.status} ${JSON.stringify(enq.body)}`);
  }
  const jobId = enq.body.jobId;
  if (!jobId) throw new Error("no jobId returned");
  log(`job ${jobId} status=${enq.body.status}`);

  const t0 = Date.now();
  let final = null;
  let polledOnce = false;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const r = await apiCall(`/api/tilly/scout/${jobId}`);
    if (r.status !== 200) throw new Error(`scout poll ${r.status}`);
    if (!polledOnce) {
      await ss("tilly-during-scout");
      polledOnce = true;
    }
    if (r.body.status === "done" || r.body.status === "failed") {
      final = r.body;
      log(`job done in ${Date.now() - t0}ms — status=${r.body.status}`);
      break;
    }
  }
  if (!final) throw new Error("scout did not finish within 90s");

  if (final.status === "failed") {
    log(`scout failed gracefully: ${final.errorText}`);
    log("note: this is a non-blocking failure (no live results from any source)");
    await ss("tilly-after-scout-failed");
    return;
  }

  const result = final.result;
  if (!result || !Array.isArray(result.options)) {
    throw new Error(`scout done but no result.options: ${JSON.stringify(result).slice(0, 200)}`);
  }
  log(`scout result: ${result.options.length} options`);
  log(`summary: ${result.summary}`);
  for (const opt of result.options) {
    log(`  [${opt.source}] ${opt.title} — ${opt.price} (${opt.condition})`);
    log(`    why: ${opt.why}`);
    if (!opt.source || !opt.url || !opt.why) {
      throw new Error(`option missing required field: ${JSON.stringify(opt)}`);
    }
  }

  // Recent-scouts endpoint should now show this job at the top.
  const recent = await apiCall("/api/tilly/scout/recent");
  if (recent.status !== 200) {
    throw new Error(`recent endpoint ${recent.status}`);
  }
  const jobs = recent.body?.jobs ?? [];
  const found = jobs.find((j) => j.id === jobId);
  if (!found) {
    throw new Error(`new scout job ${jobId} not in recent list (got ${jobs.length} jobs)`);
  }
  if (found.status !== "done") {
    throw new Error(`recent shows job status=${found.status}, expected done`);
  }
  log(`recent endpoint: ${jobs.length} jobs total, our job at position ${jobs.indexOf(found)}`);

  await ss("tilly-after-scout");
  await gotoTab("Today");
  await ss("today-after-scout");
}

if (require.main === module) {
  runScenario("13-scout", scenario).then((r) => {
    process.exit(r.status === "pass" ? 0 : 1);
  });
}

module.exports = scenario;
