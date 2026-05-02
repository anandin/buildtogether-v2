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
