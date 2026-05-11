# E2E Smoke Suite

Catches regressions that would otherwise wait for the user to notice
("Spend page shows $0 even though I have transactions", "categories
endpoint returns empty", "chat times out"). Runs on every push to
`main` + nightly via GitHub Actions.

## What it tests

1. **Auth** — `/api/_e2e/issue-session` mints a Bearer token
2. **Spend** — `/api/tilly/spend-pattern` returns coherent data (not the
   misleading "$0 spent" empty state we shipped earlier)
3. **Categories** — `/api/tilly/categories` has ≥1 category with month
   activity
4. **Chat** — `/api/tilly/chat` round-trips a known prompt within 30s
5. **Memory** — `/api/tilly/memory` returns array shape

## Setup (one-time)

### 1. Set Vercel env vars (production)
```
E2E_SECRET=<long random string, e.g. openssl rand -hex 32>
E2E_USER_ID=<the existing user's id from the users table>
```
`E2E_USER_ID` is whoever the suite logs in as — for a solo deployment,
this is you. The smoke suite reads your real data, so make sure the
account has at least a few accepted Plaid transactions or all checks
will warn.

### 2. Set GitHub Actions repository secrets
```
E2E_BASE_URL = https://buildtogether-v2.vercel.app  (or whatever)
E2E_SECRET   = same value as Vercel
```

### 3. Trigger first run
Either push to `main` or hit the workflow's "Run workflow" button. The
job takes ~30s including the 90s post-push deploy wait.

## Running locally

```bash
export E2E_BASE_URL=https://buildtogether-v2.vercel.app
export E2E_SECRET=<same secret>
pnpm -F @workspace/e2e smoke
```

Use a preview URL (`https://buildtogether-v2-<branch>-anand-inbasekarans-projects.vercel.app`)
when validating a PR before merge.

## Adding new checks

Each check is a `check(name, fn)` block in `smoke.ts`. Pattern:

```ts
await check("description of what this catches", async () => {
  const r = await jsonFetch("GET", "/api/something", token);
  if (r.status !== 200) throw new Error(`status=${r.status}`);
  // Assert the shape that, if wrong, would render the UI broken.
  // Return a one-line summary string for the CI log.
  return `summary detail for CI log`;
});
```

Keep checks fast (under ~2s each) and focused on **what would make the
UI render broken from the user's POV**, not internal implementation
details. The bar: if this check passes, can I trust the corresponding
screen?

## Security note

The `/api/_e2e/issue-session` endpoint mounts only when both
`E2E_SECRET` and `E2E_USER_ID` are set, and rejects every request whose
`x-e2e-secret` header doesn't match. Issued sessions expire in 30 min.
If you ever suspect the secret leaked, unset the Vercel env var — the
endpoint disappears entirely on next cold start.
