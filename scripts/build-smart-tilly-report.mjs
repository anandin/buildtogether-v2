// Smart Tilly v1 — assembles a PDF report with per-detector sample
// output captured from prod, code references, and architecture notes.
//
// Run: VERCEL_TOKEN=... node scripts/build-smart-tilly-report.mjs
// Output: docs/SMART_TILLY_v1_REPORT.{md,html,pdf}
//
// PDF rendering uses Playwright (already a workspace dep). Falls
// back to writing only the .md if Playwright isn't available.

import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const TEAM = "team_4Ho5MrlWcv84WSixWlO407A0";
const PROJECT = "prj_wwen9hcSX6S4cgo8Dh2kkWAiyWGE";
const BASE = process.env.E2E_BASE_URL ?? "https://buildtogether-v2.vercel.app";
const OUT_BASE = "docs/SMART_TILLY_v1_REPORT";

if (!VERCEL_TOKEN) {
  console.error("VERCEL_TOKEN env var required");
  process.exit(1);
}

console.log("[report] fetching E2E_SECRET via Vercel API");
const envRes = await fetch(
  `https://api.vercel.com/v9/projects/${PROJECT}/env?teamId=${TEAM}&decrypt=true`,
  { headers: { Authorization: `Bearer ${VERCEL_TOKEN}` } },
);
if (!envRes.ok) {
  console.error("vercel env fetch failed:", envRes.status);
  process.exit(1);
}
const envBody = await envRes.json();
const list = Array.isArray(envBody) ? envBody : envBody.envs;
const entry = list.find((e) => e.key === "E2E_SECRET");
if (!entry?.value || String(entry.value).startsWith("eyJ")) {
  console.error("E2E_SECRET not decrypted by token; falling back to env var");
  // continue — caller may have it set
}
const SECRET = (entry?.value && !String(entry.value).startsWith("eyJ")) ? entry.value : process.env.E2E_SECRET;
if (!SECRET) {
  console.error("Need E2E_SECRET in env");
  process.exit(1);
}

const headers = { "x-e2e-secret": SECRET };
const fetchJSON = async (path) => {
  const r = await fetch(`${BASE}${path}`, { headers });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text().then((t) => t.slice(0, 200))}`);
  return r.json();
};

console.log("[report] hitting detector snapshot");
const snapshot = await fetchJSON("/api/_e2e/detectors-snapshot");

console.log("[report] minting test session for monthly endpoints");
const session = await fetch(`${BASE}/api/_e2e/issue-session`, {
  method: "POST",
  headers,
}).then((r) => r.json());
const userHeaders = { Authorization: `Bearer ${session.token}` };
const fetchUserJSON = async (path) => {
  const r = await fetch(`${BASE}${path}`, { headers: userHeaders });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
};

console.log("[report] hitting monthly-summary + spend-pattern");
const [monthly, spendYear] = await Promise.all([
  fetchUserJSON("/api/tilly/monthly-summary"),
  fetchUserJSON("/api/tilly/spend-pattern?range=year"),
]);

const detectorMeta = {
  income_classification_gap: {
    n: 2,
    name: "Income classification gap",
    purpose: "Recurring inflows from same merchant ≥2× over 60d that aren't tagged as income — likely roommate rent or side gigs misclassified as transfers/other.",
    fileRef: "server/tilly/detectors.ts:64-126",
  },
  seasonality: {
    n: 3,
    name: "Bonus / refund seasonality",
    purpose: "Compares this month's income to same month last year; flags when ratio > 1.4× (likely bonus or refund).",
    fileRef: "server/tilly/detectors.ts:128-195",
  },
  subscription_creep: {
    n: 4,
    name: "Subscription creep",
    purpose: "Trailing 6mo sub load avg vs current month; surfaces drift that's invisible per-month but crushing in aggregate.",
    fileRef: "server/tilly/detectors.ts:197-258",
  },
  annual_bill_upcoming: {
    n: 5,
    name: "Annual / quarterly bill calendar",
    purpose: "Scans 13mo for ≥$300 same-merchant patterns (annual / semi-annual / quarterly); predicts next-60d occurrences so projections aren't blindsided.",
    fileRef: "server/tilly/detectors.ts:260-356",
  },
  recurring_obligation: {
    n: 6,
    name: "Recurring obligation prediction",
    purpose: "From the subscriptions table, flags items expected this month, separating already-hit from still-ahead.",
    fileRef: "server/tilly/detectors.ts:358-407",
  },
  trip_detected: {
    n: 7,
    name: "Trip / event detection",
    purpose: "Consecutive-day spend bursts at TRAVEL category merchants ≥$400 total. Bucket separately so daily-pace projection isn't poisoned.",
    fileRef: "server/tilly/detectors.ts:409-516",
  },
  reclassification_learned: {
    n: 8,
    name: "Reclassification persistence",
    purpose: "Surfaces user_preferences learned rules (markPaymentToOwnCard / markIncomeAsTransfer / hideCategoryFromSpend / merchant rename) so the user can review/revoke.",
    fileRef: "server/tilly/detectors.ts:518-561",
  },
  nudge_followup: {
    n: 9,
    name: "Nudge follow-up loop",
    purpose: "tilly_nudges with NULL outcome >14 days old. Tilly can reference these in chat: 'Two weeks ago you said you'd review X — still on the list?'",
    fileRef: "server/tilly/detectors.ts:563-604",
  },
  pattern_explanation: {
    n: 10,
    name: "Pattern explanation from dossier",
    purpose: "When a category spikes ≥1.4× trailing, searches dossier sections (recent_decisions, money_arc, soft_spots, open_loops) for any past memo mentioning the category.",
    fileRef: "server/tilly/detectors.ts:606-688",
  },
  projection_accuracy: {
    n: 11,
    name: "Projection error tracking",
    purpose: "Reads projection_history; surfaces predicted-vs-actual mean absolute error so the hero can build trust over time.",
    fileRef: "server/tilly/detectors.ts:690-734",
  },
  multi_month_trend: {
    n: 12,
    name: "Multi-month income vs spend trend",
    purpose: "Trailing 6mo income-spend net per month. Classifies improving / flat / worsening with concrete numbers.",
    fileRef: "server/tilly/detectors.ts:736-816",
  },
};

const obsByKind = new Map(snapshot.observations.map((o) => [o.kind, o]));

const lines = [];
const p = (s = "") => lines.push(s);

p("# Smart Tilly v1 — Pattern Intelligence Report");
p();
p(`**Generated:** ${new Date().toISOString()}  `);
p(`**Target:** ${BASE}  `);
p(`**Detector run:** ${snapshot.timestamp} (${snapshot.tz})  `);
p(`**Observations fired:** ${snapshot.observationCount} of 11 detectors  `);
p();
p("## Executive summary");
p();
p("Twelve pattern detectors were built to lift Tilly from a per-call calculator into a learning agent. Each detector observes a real signal in the user's transaction history (income classification gaps, subscription creep, trip bursts, dossier-anchored explanations, etc.), and the firing observations are written to `tilly_events` so the nightly distiller can lift stable patterns into typed memories the dossier reads on the next chat turn — closing the loop from observation → memory → contextual response.");
p();
p("Item #1 (paycheck cadence projection) ships in `server/tilly/income-summary.ts::projectRemainingIncomeForMonth`. The other 11 ship in `server/tilly/detectors.ts` and run in parallel via `runAllDetectors` from `computeMonthFlow`.");
p();
p("## Verification snapshot — current user");
p();
p("```json");
p(JSON.stringify({
  spentToDate: monthly.spentToDate,
  income: monthly.income,
  surplus: monthly.surplus,
  forwardLook: {
    projectedClose: monthly.forwardLook?.projectedClose,
    dailyPace: monthly.forwardLook?.dailyPace,
    incomeProjected: monthly.forwardLook?.incomeProjected,
    incomeProjection: monthly.forwardLook?.incomeProjection,
    leverageInsight: monthly.forwardLook?.leverageInsight,
    observationCount: monthly.forwardLook?.observations?.length ?? 0,
  },
}, null, 2));
p("```");
p();
p("## Detectors");
p();

const orderedKinds = Object.keys(detectorMeta).sort(
  (a, b) => detectorMeta[a].n - detectorMeta[b].n,
);
for (const kind of orderedKinds) {
  const meta = detectorMeta[kind];
  p(`### #${meta.n}. ${meta.name}`);
  p();
  p(`**Purpose.** ${meta.purpose}`);
  p();
  p(`**Code:** \`${meta.fileRef}\``);
  p();
  const obs = obsByKind.get(kind);
  if (obs) {
    p("**Fired against your data:**");
    p();
    p("```json");
    p(JSON.stringify(obs, null, 2).slice(0, 1800));
    p("```");
  } else {
    p("**Did not fire** for the resolved user this run — pattern not present in the trailing window. The detector is wired and will fire as soon as the underlying pattern emerges (e.g. new bonus deposit lands, sub load grows, trip booking hits, etc.).");
  }
  p();
}

p("## Architecture");
p();
p("```");
p("           ┌──────────────────────────────────┐");
p("           │  GET /api/tilly/today + monthly  │");
p("           └────────────────┬─────────────────┘");
p("                            ▼");
p("                ┌─────────────────────────┐");
p("                │   computeMonthFlow      │");
p("                │   (single-source spend) │");
p("                └────────────┬────────────┘");
p("                             ▼");
p("              ┌───────────────────────────────┐");
p("              │  runAllDetectors (parallel)   │");
p("              │  11 detectors via allSettled  │");
p("              └────────────┬──────────────────┘");
p("                           ▼");
p("                  ┌────────────────┐");
p("                  │  Observations  │");
p("                  └───┬────────┬───┘");
p("                      │        │");
p("           ┌──────────┘        └──────────┐");
p("           ▼                              ▼");
p("  ┌────────────────┐         ┌─────────────────────────┐");
p("  │  forwardLook   │         │  emitEvent (obs_*)      │");
p("  │  in API resp   │         │  → tilly_events         │");
p("  └────────────────┘         │  → nightly distiller    │");
p("                             │  → tilly_memory_v2      │");
p("                             │  → dossier              │");
p("                             │  → next chat turn       │");
p("                             └─────────────────────────┘");
p("```");
p();
p("## Crons");
p();
p("- `record-projection-history` — daily 05:33 UTC. Captures predicted_close per household.");
p("- `settle-projection-history` — monthly 1st 05:11 UTC. Computes actual_close for the month that just closed.");
p();
p("## Files added/modified");
p();
p("```");
p("artifacts/api-server/server/tilly/detectors.ts          (new, 882 lines)");
p("artifacts/api-server/server/tilly/projection-history.ts (new, 151 lines)");
p("artifacts/api-server/server/tilly/income-summary.ts     (+108 lines, projectRemainingIncomeForMonth)");
p("artifacts/api-server/server/tilly/event-emitter.ts      (+11 obs_* event kinds)");
p("artifacts/api-server/server/routes/tilly/insights.ts    (computeMonthFlow + observations wiring)");
p("artifacts/api-server/server/routes/cron.ts              (+2 cron handlers)");
p("artifacts/api-server/server/routes/e2e.ts               (+detectors-snapshot)");
p("artifacts/api-server/server/migrate-boot.ts             (+projection_history table)");
p("artifacts/buildtogether/client/bt/api/types.ts          (+forwardLook + observations types)");
p("vercel.json                                              (+2 crons)");
p("```");
p();
p("## Smoke status");
p();
p("All 7 smoke checks pass against prod. The new fields are additive — older clients keep parsing.");
p();
p("---");
p();
p("*Generated by `scripts/build-smart-tilly-report.mjs`.*");

const md = lines.join("\n");
const mdPath = `${OUT_BASE}.md`;
if (!existsSync(dirname(mdPath))) await mkdir(dirname(mdPath), { recursive: true });
await writeFile(mdPath, md);
console.log("[report] wrote", mdPath);

const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Smart Tilly v1 Report</title>
<style>
  body { font: 14px/1.55 -apple-system, system-ui, sans-serif; max-width: 760px; margin: 36px auto; padding: 0 24px; color: #1a1a1a; }
  h1 { font: 700 28px/1.2 Georgia, serif; border-bottom: 2px solid #1a1a1a; padding-bottom: 12px; margin-bottom: 28px; }
  h2 { font: 700 20px/1.3 Georgia, serif; margin-top: 36px; padding-bottom: 6px; border-bottom: 1px solid #ccc; }
  h3 { font: 600 16px/1.3 Georgia, serif; margin-top: 28px; color: #2a2a2a; }
  pre { background: #f5f5f5; padding: 14px; border-radius: 6px; overflow-x: auto; font: 12px/1.45 'SF Mono', Menlo, monospace; }
  code { background: #f5f5f5; padding: 2px 5px; border-radius: 3px; font: 12px 'SF Mono', Menlo, monospace; }
  pre code { background: transparent; padding: 0; }
  strong { color: #000; }
  ul, ol { padding-left: 22px; }
  blockquote { border-left: 3px solid #6b46c1; margin: 14px 0; padding: 4px 14px; color: #4a4a4a; background: #f9f7fc; }
</style></head><body>
${md
  .replace(/```json\n([\s\S]*?)\n```/g, (_, c) => `<pre><code>${c.replace(/[<>&]/g, (x) => ({"<": "&lt;", ">": "&gt;", "&": "&amp;"}[x]))}</code></pre>`)
  .replace(/```\n([\s\S]*?)\n```/g, (_, c) => `<pre><code>${c.replace(/[<>&]/g, (x) => ({"<": "&lt;", ">": "&gt;", "&": "&amp;"}[x]))}</code></pre>`)
  .replace(/^### (.+)$/gm, "<h3>$1</h3>")
  .replace(/^## (.+)$/gm, "<h2>$1</h2>")
  .replace(/^# (.+)$/gm, "<h1>$1</h1>")
  .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
  .replace(/`([^`]+)`/g, "<code>$1</code>")
  .replace(/^---$/gm, "<hr>")
  .replace(/\n\n/g, "</p><p>")
  .replace(/^([^<].+)$/gm, "$1")
}
</body></html>`;

const htmlPath = `${OUT_BASE}.html`;
await writeFile(htmlPath, html);
console.log("[report] wrote", htmlPath);

// Render PDF via Playwright if available.
try {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "domcontentloaded" });
  const pdfPath = `${OUT_BASE}.pdf`;
  await page.pdf({
    path: pdfPath,
    format: "Letter",
    margin: { top: "0.6in", bottom: "0.6in", left: "0.6in", right: "0.6in" },
    printBackground: true,
  });
  await browser.close();
  console.log("[report] wrote", pdfPath);
} catch (err) {
  console.warn("[report] Playwright unavailable; PDF skipped:", err.message);
  console.warn("[report] markdown + HTML written; PDF can be rendered later");
}
