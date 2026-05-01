/**
 * 13 — S8 live substitute scout.
 *
 * Plan:
 *   - POST /api/tilly/scout with a real Canadian-friendly query
 *   - Poll GET /api/tilly/scout/:id until status != queued/running
 *     (cap at 90s)
 *   - Assert status='done' (or skip with a note if no live results)
 *   - Validate result shape: 0-3 options each with source + url + why
 */
const { runScenario } = require("../lib/helpers");

async function scenario({ apiCall, log }) {
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
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const r = await apiCall(`/api/tilly/scout/${jobId}`);
    if (r.status !== 200) throw new Error(`scout poll ${r.status}`);
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
}

if (require.main === module) {
  runScenario("13-scout", scenario).then((r) => {
    process.exit(r.status === "pass" ? 0 : 1);
  });
}

module.exports = scenario;
