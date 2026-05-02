# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Admin login (api-server)

The admin dashboard at `/admin` is gated by credentials read from environment
variables. The server **refuses to start** if any of these are missing or
malformed:

- `ADMIN_EMAIL` — admin login email
- `ADMIN_PASSWORD_HASH` — bcrypt hash of the admin password (must start with
  `$2a$`, `$2b$`, or `$2y$`). Generate with:
  `node -e "import('bcryptjs').then(b => b.hash(process.argv[1], 10).then(console.log))" 'your-password'`
- `SESSION_SECRET` — random string, at least 32 chars, used to sign admin JWTs.
  Generate with: `openssl rand -hex 32`

There are no fallback / default credentials. Set these via the platform's
environment-secrets manager before deploying.

## Tilly LLM structured-output gotcha

`server/tilly/llm/openrouter.ts` converts Zod schemas to JSON Schema for
OpenRouter's `response_format`. **Always import `zod-to-json-schema` at the
top of the module** (ESM `import`), never `require()`. The api-server runs
under tsx as ESM, and a runtime `require()` silently fails — the catch
falls back to an empty `{ type: "object" }` schema, which causes Haiku /
Opus to return `{}` or invent field names. Symptom: reminders/memories
silently never persist even though the chat reply looks fine.

If you need to debug structured output, set `DEBUG_LLM=1` to log the raw
model text and the exact schema sent to OpenRouter. Disable in
production — it logs full conversation content.

## Running on a phone

The Build Together mobile app can be loaded on a real iOS or Android device via
Expo Go. See `artifacts/buildtogether/CONNECT_EXPO_GO.md` for the QR-code
scanning steps and end-to-end verification checklist.

## Tilly memory architecture (3 tiers)

**L1 — Raw events (`tilly_events`)**
Append-only log of every chat turn, expense, reminder, nudge. No in-app cap;
retention governed by per-user `memoryRetention` pref. Written via
`emitEvent` / `emitEventAsync` from `server/tilly/event-emitter.ts`.

**L2a — Synchronous memories (`tilly_memory`, RAG-embedded)**
Written *during* a chat turn by `extractMemories` in `memory-writer.ts`.
Kinds: observation | anxiety | value | commitment | preference. Each row
gets a 1536-dim `text-embedding-3-small` vector.
Recall via `hybridRetrieve` (`retriever.ts`): scans the **last 500 active
rows**, returns **topK=5** by default. Score = 0.7 × cosine + 0.3 × recency,
then bumped by kind (commitment 1.25×, value 1.2×). Recency uses a
**168 h half-life**.

**L2b — Distilled memories (`tilly_memory_v2`)**
Nightly batch from L1 events via `distillUser` in `nightly-distiller.ts`.
Typed kinds: decision | regret | nudge_outcome | bias_observed | …
Each row tracks the source events it was distilled from.

**L3 — Persona dossier (`tilly_dossiers`)**
Synthesized 7-section JSON (identity, money_arc, soft_spots,
nudge_response_profile, recent_decisions, trust_signals, open_loops).
Rewritten by `rewriteDossier` in `dossier-rewriter.ts` from the **most
recent 50 L2b rows**, target **<3500 chars** (it gets injected into every
chat system prompt — keep it tight).

### Scheduler + archiver (Replit runtime)

`server/tilly/scheduler.ts` is an in-process daily scheduler that wakes
once/min and fires each job exactly once per UTC day:

| UTC | Job | Effect |
|---|---|---|
| 03:00 | `distillAllActiveUsers` | L1 → L2b |
| 03:30 | `rewriteDossiersForActiveUsers` | L2b → L3 |
| 04:00 | `archiveStaleMemories` | sweep stale L2a |

The `since` window is **26 h** so brief downtime around the boundary
doesn't lose events; downstream functions are idempotent. Auto-disables
on Vercel (`VERCEL=1`) and via `TILLY_SCHEDULER_DISABLED=1` (tests).

`server/tilly/memory-archiver.ts` soft-archives stale `tilly_memory` rows
(sets `archived_at`, retriever filters on `isNull(archivedAt)`). Honors
`memoryRetention` pref (`forever` | `1y` | `90d`) and **never** archives
`commitment` or `value` kinds (anchor memories).

All three jobs also have manual triggers: `POST /api/cron/distill-memories`,
`/api/cron/rewrite-dossiers`, `/api/cron/archive-memories`.

**Multi-replica caveat:** scheduler holds state in memory. If api-server
ever scales beyond a single instance, swap `lastRunDayUtc` for a
`tilly_job_log` table with a UPSERT-claim pattern, or the daily jobs
will run N times.

## Production readiness checklist (before public sign-up)

Required env / secrets (server refuses to boot without these):
- `DATABASE_URL`, `OPENROUTER_API_KEY`, `AI_INTEGRATIONS_OPENAI_API_KEY`,
  `AI_INTEGRATIONS_OPENAI_BASE_URL`
- Admin: `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`
- Cron auth: `CRON_SECRET` (currently warns + runs open in dev)

Pre-launch hardening (open items):
- **Demo routes** (`server/routes/demo.ts`, mounted at `routes/index.ts:50`)
  — `POST /api/demo/seed` and `/api/demo/clear` are auth-gated but let any
  user wipe/seed their own data. Either remove `mountDemoRoutes` from the
  prod bundle or gate behind `NODE_ENV !== "production"`.
- **Plaid env** — defaults to `sandbox` (`server/plaid.ts:39`). Set
  `PLAID_ENV=production` and swap to production keys before real bank links.
- **CRON_SECRET** — `routes/cron.ts:33` allows open access in dev when
  unset. Set the secret in production env vars.
- **Phase-2 stubs** — several screens (`Today`, `Spend`) return
  `StubEnvelope { phase: 2, ready: false }` for features not yet wired
  (real subscription scanner is "Phase 5 TODO" in `BTHome.tsx:11`).
  Decide which are acceptable for v1.
- **Push tokens** — Expo push registration runs on boot but is best-effort.
  Confirm `EXPO_ACCESS_TOKEN` is set if you want delivery receipts.
- **RevenueCat** — `EXPO_PUBLIC_REVENUECAT_IOS_KEY` /
  `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` are read but no paywall is wired
  into the core flows yet. Skippable for v1 if launching free.
