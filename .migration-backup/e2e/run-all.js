/**
 * Run every scenario in `./scenarios/` sequentially against the live
 * deploy. Writes a summary table to `<RESULTS_DIR>/summary.md` and
 * exits non-zero if any scenario fails.
 */
const fs = require("fs");
const path = require("path");
const { runScenario, RESULTS_DIR, BASE } = require("./lib/helpers");

async function main() {
  const dir = path.join(__dirname, "scenarios");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".js"))
    .sort();

  console.log(`▶ Tilly E2E suite — target ${BASE}`);
  console.log(`  results → ${RESULTS_DIR}`);
  console.log(`  ${files.length} scenarios`);

  const results = [];
  for (const file of files) {
    const id = file.replace(/\.js$/, "");
    const scenario = require(path.join(dir, file));
    const r = await runScenario(id, scenario);
    results.push(r);
  }

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const totalMs = results.reduce((s, r) => s + (r.durationMs || 0), 0);

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const lines = [];
  lines.push(`# Tilly E2E run — ${new Date().toISOString()}`);
  lines.push("");
  lines.push(`Target: ${BASE}`);
  lines.push("");
  lines.push(`**${passed} pass / ${failed} fail / ${results.length} total** in ${(totalMs / 1000).toFixed(1)}s`);
  lines.push("");
  lines.push("| Scenario | Status | Duration | Note |");
  lines.push("| --- | --- | --- | --- |");
  for (const r of results) {
    const note = r.error ? r.error.slice(0, 80) : "";
    lines.push(
      `| ${r.scenarioId} | ${r.status === "pass" ? "✓" : "✘"} ${r.status.toUpperCase()} | ${r.durationMs}ms | ${note} |`,
    );
  }
  fs.writeFileSync(path.join(RESULTS_DIR, "summary.md"), lines.join("\n"));

  console.log(`\n${passed} pass / ${failed} fail`);
  console.log(`Summary: ${path.relative(process.cwd(), path.join(RESULTS_DIR, "summary.md"))}`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(2);
});
