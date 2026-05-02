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
