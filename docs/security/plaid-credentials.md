# Plaid Credentials — Rotation & Production Setup Runbook

This is the 5-minute runbook for rotating the Plaid `client_secret` (e.g.
after an accidental leak) and for the one-time switch of the deployed
Tilly API server from `sandbox` → `production`.

The dev workspace **stays on sandbox** so we don't burn billable
production Items every time we re-test locally.

---

## When to use this

- A Plaid secret was pasted into chat, a screenshot, a commit, a log.
- An employee with Plaid dashboard access leaves.
- The first time we wire production Plaid into the deployed app.
- Quarterly hygiene rotation.

---

## Rotation (the leak case)

1. **Plaid dashboard → Team Settings → Keys.** Click *Rotate* next to
   the production `client_secret`. Copy the new value into a password
   manager immediately — Plaid only shows it once.
2. **Update Replit Secrets** (do NOT paste the secret in chat). In the
   workspace open *Secrets* and update:
   - `PLAID_PRODUCTION_SECRET` → the new rotated value
3. Redeploy. The server boot log should show:
   ```
   [boot] feature flags: plaid=true plaidEnv=production …
   ```
4. Smoke test on the deployed app: open Tilly on a real iPhone, complete
   Face ID, run Plaid Link against any bank, confirm it succeeds.

That's it for a rotation. The steps below only apply when first wiring
production.

---

## First-time production switch

### 1. Plaid dashboard

- **API → Allowed redirect URIs**: register
  `https://<your-replit-app>.replit.app/plaid/oauth-redirect`. Required
  for OAuth banks (Chase, Wells Fargo, Capital One, Bank of America).
  Without this, those banks will refuse the link.
- **API → Webhooks**: set the webhook URL to
  `https://<your-replit-app>.replit.app/api/plaid/webhook`. The
  endpoint is already implemented in `routes.ts` and 200s immediately
  while syncing in the background.

  Signature verification is **on**: every webhook is required to carry
  a valid `Plaid-Verification` JWT (ES256) signed by Plaid's rotating
  JWK set. Requests with missing, malformed, replayed (>5 min old), or
  body-tampered signatures are rejected with 401 before any DB or
  Plaid-client work happens. Public keys are fetched on demand from
  `/webhook_verification_key/get` and cached in-memory for 5 minutes.
  Implementation lives in
  `artifacts/api-server/server/plaid-webhook-verify.ts`.

### 2. Deployment configuration

Two storage tiers, picked deliberately:

**Replit Secrets (global, not committed) — for the actual credentials:**

| Key | Value | Where it comes from |
| --- | --- | --- |
| `PLAID_PRODUCTION_CLIENT_ID` | production client_id | Plaid dashboard → Keys |
| `PLAID_PRODUCTION_SECRET` | production client_secret | Plaid dashboard → Keys (rotated) |

**Production env vars (in `.replit`, safe because non-sensitive):**

| Key | Value | Notes |
| --- | --- | --- |
| `PLAID_ENV` | `production` | literal string |
| `PLAID_REDIRECT_URI` | `https://<your-replit-app>.replit.app/plaid/oauth-redirect` | matches dashboard registration |
| `PLAID_WEBHOOK_URL` | `https://<your-replit-app>.replit.app/api/plaid/webhook` | matches dashboard registration |

Why two tiers: Replit env vars (any environment) live in `.replit` in
plaintext, which is committed to git. So real secrets MUST stay in
Replit Secrets. Replit Secrets are global (not env-scoped), so we use
the prefixed names `PLAID_PRODUCTION_*` only — the dev workspace keeps
its sandbox values under the un-prefixed `PLAID_CLIENT_ID` /
`PLAID_SECRET` globals, and the server (`plaid.ts`) prefers the
prefixed pair when `PLAID_ENV=production`.

If any of `PLAID_REDIRECT_URI` or `PLAID_WEBHOOK_URL` are missing while
`PLAID_ENV=production`, the server **refuses to boot** with a clear
error — see `artifacts/api-server/server/env-validation.ts`. This is a
guardrail against shipping a half-configured production deployment.

### 3. Redeploy and verify

After the next deploy, check the boot logs for:

```
[boot] feature flags: plaid=true plaidEnv=production …
```

Then on a real iPhone:

1. Sign in to Tilly.
2. Tap **Connect bank** → complete Face ID.
3. Pick a real OAuth bank (Chase is the easiest to verify the redirect
   wiring). Confirm the OAuth handoff returns into the app and
   transactions begin syncing.
4. Disconnect the Item from **You → Bank connections** when done so you
   don't leave a billable production Item attached.

---

## Why the dev workspace stays on sandbox

Plaid charges per-Item in production. Every hot-reload that re-runs the
exchange flow during development would create another billable Item.
Sandbox uses fake-but-realistic data and is free, so dev iteration
stays on sandbox and only the deployed app talks to real banks.

---

## Files involved

- `artifacts/api-server/server/plaid.ts` — `getPlaidEnv()`,
  `getPlaidRedirectUri()`, client init.
- `artifacts/api-server/server/routes.ts` — `linkTokenCreate` passes
  `redirect_uri`; `/api/plaid/webhook` handler.
- `artifacts/api-server/server/env-validation.ts` — production wiring
  guardrails.
- `artifacts/api-server/server/index.ts` — boot log surfaces
  `plaidEnv=…` so a future operator can sanity-check from logs.
