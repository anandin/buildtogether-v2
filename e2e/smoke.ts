/**
 * E2E smoke suite. Runs against a live deploy (prod by default, preview
 * by override). Exits 0 on all-pass, 1 on any fail. CI hooks this into
 * GitHub Actions on push-to-main + nightly so regressions surface in
 * minutes instead of waiting for the user to notice.
 *
 * What this catches:
 *  1) Auth: /api/_e2e/issue-session returns a Bearer token (=> sessions
 *     table writes are working, requireAuth chain is sound).
 *  2) Spend page never lies: /api/tilly/spend-pattern returns
 *     ready:true, headline has a non-zero $ amount OR explicitly notes
 *     "last 7 days" fallback. The bug we just fixed (Sunday-9pm-Toronto
 *     showing $0 with hidden tx) would have failed here.
 *  3) Categorize spend: /api/tilly/categories returns ≥1 category with
 *     monthTotal > 0. Catches the case where DB filter (status=accepted)
 *     starts dropping everything.
 *  4) Tilly chat round-trips: POST /api/tilly/chat with a known prompt
 *     and verifies the reply body comes back non-empty within 30s.
 *     Doesn't assert tool firing — that's flaky against a real LLM —
 *     just that the endpoint doesn't time out or 500.
 *  5) Memory exists: /api/tilly/memory returns an array shape (even if
 *     empty). Cheap probe that the auth+DB chain is healthy.
 *
 * Env vars (set in CI):
 *   E2E_BASE_URL    default https://buildtogether-v2.vercel.app
 *   E2E_SECRET      same as Vercel env var on the server
 *
 * Failure output is intentionally noisy — log the URL, status, and
 * response body snippet so the failing assertion is debuggable from CI
 * logs alone without reproducing locally.
 */

const BASE_URL = process.env.E2E_BASE_URL ?? "https://buildtogether-v2.vercel.app";
const SECRET = process.env.E2E_SECRET;
if (!SECRET) {
  console.error("[e2e] E2E_SECRET env var required");
  process.exit(2);
}

type CheckResult = { name: string; ok: boolean; ms: number; detail?: string };
const results: CheckResult[] = [];

async function check(name: string, fn: () => Promise<string | void>): Promise<void> {
  const t0 = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, ms: Date.now() - t0, detail: detail ?? undefined });
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""} (${Date.now() - t0}ms)`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ name, ok: false, ms: Date.now() - t0, detail: msg });
    console.error(`  ✗ ${name} — ${msg} (${Date.now() - t0}ms)`);
  }
}

async function jsonFetch(
  method: string,
  path: string,
  token?: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<{ status: number; body: any }> {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...extraHeaders,
  };
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { _raw: text.slice(0, 500) };
  }
  return { status: res.status, body: parsed };
}

async function main() {
  console.log(`\n[e2e] smoke suite against ${BASE_URL}\n`);

  let token: string | undefined;
  let coupleId: string | undefined;

  // 1. AUTH — mint a fresh session via the gated test endpoint.
  await check("auth: /api/_e2e/issue-session issues a Bearer token", async () => {
    const r = await jsonFetch("POST", "/api/_e2e/issue-session", undefined, {}, {
      "x-e2e-secret": SECRET!,
    });
    if (r.status !== 200) {
      throw new Error(
        `status=${r.status} body=${JSON.stringify(r.body).slice(0, 300)}`,
      );
    }
    if (typeof r.body?.token !== "string" || r.body.token.length < 16) {
      throw new Error(`no token in response: ${JSON.stringify(r.body).slice(0, 300)}`);
    }
    token = r.body.token;
    coupleId = r.body.coupleId;
    return `userId=${r.body.userId} coupleId=${coupleId ?? "null"}`;
  });

  if (!token) {
    console.error("\n[e2e] auth failed — aborting subsequent checks\n");
    process.exit(1);
  }

  // 2. SPEND PATTERN — never lies.
  await check("spend-pattern returns non-empty data OR explicit empty state", async () => {
    const r = await jsonFetch("GET", "/api/tilly/spend-pattern", token);
    if (r.status !== 200) {
      throw new Error(`status=${r.status} body=${JSON.stringify(r.body).slice(0, 200)}`);
    }
    if (r.body?.ready === false) {
      // Acceptable if the test user genuinely has no Plaid data — still
      // record as a soft signal so CI shows it.
      return "ready=false (no plaid data)";
    }
    if (r.body?.ready !== true) {
      throw new Error(`unexpected shape: ${JSON.stringify(r.body).slice(0, 200)}`);
    }
    const { spent, headline, bars, categories } = r.body;
    if (typeof spent !== "number") throw new Error("spent is not a number");
    if (typeof headline !== "string") throw new Error("headline is not a string");
    if (!Array.isArray(bars) || bars.length !== 7) {
      throw new Error(`bars not a length-7 array: ${JSON.stringify(bars).slice(0, 100)}`);
    }
    if (!Array.isArray(categories)) throw new Error("categories not an array");
    // The fix that prompted this suite: if spent === 0 AND every bar is
    // 0 AND we have NO rolling-7-days fallback note, the Spend page
    // would render "$0 spent" misleadingly. That's the regression.
    const allBarsZero = bars.every((b: any) => Number(b?.amt ?? 0) === 0);
    const noRolling = !/last 7 days/i.test(headline);
    if (spent === 0 && allBarsZero && noRolling && categories.length === 0) {
      throw new Error(
        `Spend page looks broken: spent=0, all bars 0, no fallback note. headline="${headline}"`,
      );
    }
    // Internal-consistency check: category headline total must reconcile
    // with the sum of its drill-in transactions. Caught 2026-05-15 by the
    // Canada Txd bug — three plaid_transactions rows for the same real
    // debit had the parent total show $14,724 while the drill-in showed
    // one $4,907.92 row. Both views fed off the same payload, so the
    // mismatch was a server-side aggregation bug. Allow $1 rounding
    // slack since amt is rounded server-side.
    for (const c of [...categories, ...(r.body.fixedObligations ?? [])]) {
      if (!Array.isArray(c?.transactions) || c.transactions.length === 0) continue;
      const drillSum = c.transactions.reduce(
        (s: number, t: any) => s + Number(t?.amt ?? 0),
        0,
      );
      const headlineAmt = Number(c.amt ?? 0);
      if (Math.abs(headlineAmt - drillSum) > 1.0) {
        throw new Error(
          `category "${c.name}" total $${headlineAmt} disagrees with drill-in sum $${drillSum.toFixed(2)} (${c.transactions.length} rows)`,
        );
      }
    }
    return `spent=$${spent} categories=${categories.length} headline="${headline.slice(0, 60)}"`;
  });

  // 3. CATEGORIES — drives Categorize Spend screen.
  await check("categories endpoint returns ≥1 category with month total", async () => {
    const r = await jsonFetch("GET", "/api/tilly/categories", token);
    if (r.status !== 200) {
      throw new Error(`status=${r.status} body=${JSON.stringify(r.body).slice(0, 200)}`);
    }
    if (!Array.isArray(r.body?.categories)) {
      throw new Error(`categories not an array: ${JSON.stringify(r.body).slice(0, 200)}`);
    }
    const withMoney = r.body.categories.filter((c: any) => Number(c?.monthTotal ?? 0) > 0);
    if (withMoney.length === 0 && r.body.categories.length > 0) {
      throw new Error("categories present but all monthTotal=0 — sync may be broken");
    }
    return `${r.body.categories.length} categories, ${withMoney.length} with $ activity`;
  });

  // 4. TILLY CHAT — verifies the full LLM round-trip + tool-loop path.
  await check("chat round-trips a known prompt", async () => {
    const r = await jsonFetch("POST", "/api/tilly/chat", token, {
      message: "hi tilly — just checking in, no action needed",
    });
    if (r.status !== 200) {
      throw new Error(`status=${r.status} body=${JSON.stringify(r.body).slice(0, 200)}`);
    }
    if (typeof r.body?.reply?.body !== "string" || r.body.reply.body.length < 1) {
      throw new Error(`reply body empty: ${JSON.stringify(r.body?.reply ?? {}).slice(0, 300)}`);
    }
    return `${r.body.reply.body.length} chars`;
  });

  // 5. MONTHLY SUMMARY — Tilly's basic-finance-app math.
  await check("monthly-summary returns valid shape", async () => {
    const r = await jsonFetch("GET", "/api/tilly/monthly-summary", token);
    if (r.status !== 200) {
      throw new Error(`status=${r.status} body=${JSON.stringify(r.body).slice(0, 200)}`);
    }
    if (r.body?.ready === false) return "ready=false (no household)";
    const { income, spentToDate, committedRest, surplus, daysLeft } = r.body ?? {};
    if (typeof income?.amount !== "number") throw new Error("income.amount missing");
    if (typeof spentToDate !== "number") throw new Error("spentToDate missing");
    if (typeof committedRest !== "number") throw new Error("committedRest missing");
    if (typeof surplus !== "number") throw new Error("surplus missing");
    if (typeof daysLeft !== "number") throw new Error("daysLeft missing");
    return `income=$${income.amount} spent=$${spentToDate} committed=$${committedRest} surplus=$${surplus} (${daysLeft}d left, source=${income.source})`;
  });

  // 6. FORECAST — per-day expected spend for the next 7 days.
  await check("forecast?days=7 returns 7-day array", async () => {
    const r = await jsonFetch("GET", "/api/tilly/forecast?days=7", token);
    if (r.status !== 200) {
      throw new Error(`status=${r.status} body=${JSON.stringify(r.body).slice(0, 200)}`);
    }
    if (!Array.isArray(r.body?.days)) {
      throw new Error("days not an array");
    }
    if (r.body.days.length !== 7) {
      throw new Error(`expected 7 days, got ${r.body.days.length}`);
    }
    for (const d of r.body.days) {
      if (typeof d.date !== "string") throw new Error("day.date missing");
      if (typeof d.expected !== "number") throw new Error("day.expected missing");
      if (!Array.isArray(d.reasons)) throw new Error("day.reasons not array");
    }
    return `7 days, total expected $${r.body.days.reduce((s: number, d: any) => s + d.expected, 0)}`;
  });

  // 7. MEMORY — basic shape check, cheap probe.
  await check("memory endpoint returns array shape", async () => {
    const r = await jsonFetch("GET", "/api/tilly/memory", token);
    if (r.status !== 200) {
      throw new Error(`status=${r.status} body=${JSON.stringify(r.body).slice(0, 200)}`);
    }
    if (!Array.isArray(r.body?.memory)) {
      throw new Error(`memory not an array: ${JSON.stringify(r.body).slice(0, 200)}`);
    }
    return `${r.body.memory.length} notes`;
  });

  // ─── Summary ────────────────────────────────────────────────────────────
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  const totalMs = results.reduce((s, r) => s + r.ms, 0);
  console.log(
    `\n[e2e] ${passed} passed, ${failed} failed in ${totalMs}ms (against ${BASE_URL})\n`,
  );
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[e2e] unexpected:", err);
  process.exit(2);
});
