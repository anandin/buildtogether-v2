#!/bin/bash
# Runs automatically after a task agent's branch is merged into main.
# Keep this script idempotent and fail-fast: any non-zero exit will surface
# as a post-merge error in the workspace UI, which is what we want — a
# silently-aborted DB push wiped the `users` table once already.
set -euo pipefail

pnpm install --frozen-lockfile

# Sync the live Postgres schema to whatever schema.ts is on main.
# --force skips the interactive "you're about to drop X" prompt that would
# otherwise hang the post-merge script (it has no TTY) and time out without
# applying any changes. Safe pre-beta; revisit before we have real users.
pnpm --filter @workspace/api-server exec drizzle-kit push --force
