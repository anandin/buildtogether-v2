# routes.ts Map + Refactor Plan (audit fix #9)

`artifacts/api-server/server/routes.ts` is 6,227 LOC with 95 endpoint handlers. This is the god-object the audit flagged. Splitting it cleanly is multi-hour work because the Plaid sync + expense handlers carry the most-used user paths and have no unit tests, so the safest extraction is one cohesive group at a time, in their own PR, with a manual smoke verification after each.

This doc is the contract for how the split should happen.

## Current endpoints (by URL prefix)

| Prefix | Count | Lines (approx) | Cut priority |
|---|---|---|---|
| `/api/auth/*` | 7 | 650–1000 | **HIGH** — well-bounded, no Plaid coupling |
| `/api/invite/*` | 3 | 1054–1180 | HIGH — small + isolated, already mostly self-contained |
| `/api/expenses/*` | 7 | 2016–2660 | MEDIUM — overlaps with the existing `routes/expenses.ts`; merge target |
| `/api/goals/*` | 5 | 2166–2270 | MEDIUM — goals = dreams in the schema; reconcile naming |
| `/api/budgets/*` | 3 | 2269–2465 | LOW — feature being deprecated in favor of taxonomy buckets |
| `/api/categories/*` | 3 | 2465–2515 | LOW |
| `/api/settlements/*` | 2 | 2513–2555 | LOW |
| `/api/sync/*` | 1 | 2553–2625 | LOW |
| `/api/family/*` | 1 | 2626–2645 | LOW |
| `/api/plaid/*` | 11 | 4926–5600 | **HIGH RISK / HIGH VALUE** — sync engine + accept/ignore lives here |
| `/api/scan-receipt`, `/api/ai-insights`, `/api/parse-expense`, `/api/detect-ego-spends`, `/api/guardian/quick-add` | 5 | 1180–2000 | LOW — legacy V1-era handlers, may delete vs migrate |

## Pattern (established by existing splits)

Use `mount*Routes(app)` pattern, same shape as `routes/admin-skills.ts` / `routes/admin-memory.ts` / `routes/cron.ts` etc:

```ts
// routes/plaid.ts
import type { Express } from "express";
export function mountPlaidRoutes(app: Express): void {
  app.post("/api/plaid/webhook", ...);
  app.get("/api/plaid/status", ...);
  // ...
}
```

Then in `routes.ts` (or wherever the mounter lives), replace the inline handler with `mountPlaidRoutes(app)`.

## Suggested order (lowest blast-radius first)

1. **`/api/invite/*`** → `routes/invites.ts` *(file already exists with related routes; just move the 3 handlers in)*. Smallest, simplest, no Plaid touch. Pattern check.
2. **`/api/auth/*`** → `routes/auth.ts` *(new)*. Self-contained; tested manually via SignIn flow.
3. **`/api/goals/*`** → `routes/dreams.ts` *(file already exists)*. Reconcile goals/dreams naming while at it.
4. **`/api/expenses/*`** → merge into `routes/expenses.ts` *(file already exists)*. Audit for endpoint overlap first.
5. **`/api/plaid/*`** → `routes/plaid.ts` *(new)*. **DO LAST.** Pair with: full e2e smoke pass + manual flow check of (a) linking new account, (b) accepting pending tx, (c) ignoring pending tx, (d) reconcile delete-all. The sync engine touches every other system; a regression here breaks the home, the Spend page, and skill detection.

## What this commit ships

Establishing the **routing map** is the deliverable for this round. The actual handler moves are deferred to focused follow-up PRs (one per row in the suggested order above) where:

1. Each PR moves ONE prefix's handlers.
2. Each PR is verified by hitting every moved endpoint via the existing e2e smoke suite + at least one manual flow.
3. PRs are NOT bundled — easier rollback if one breaks.

The architectural improvements in audit fixes #1-8 (taxonomy single-source, eval harness, validator, persona-from-registry, namespacing, contextBuilders) all landed in this run. Together they reduce the bug rate; the routes.ts cleanup is the last piece and is sequenced carefully because of how many user paths it touches.

## Risk budget

Doing the Plaid split in the same session as 8 other refactors is the kind of decision that breaks Tilly tomorrow. The audit's "1-2 weeks of foundation work" line covers the whole list; doing 8 of 9 properly + 1 deferred-with-plan is better than doing 9 of 9 sloppily.
