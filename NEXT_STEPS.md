# Tilly — next steps from your laptop

Branch: `claude/fix-plaid-faceid-F3WiC` — Plaid backfill bug, Tilly anomaly
surface, LLM categorizer, dev-client config, prod cutover scripts. Open the
PR when you want a review thread:
<https://github.com/anandin/buildtogether-v2/pull/new/claude/fix-plaid-faceid-F3WiC>

You can't run any of the steps below remotely — they need credentials only
you have (Expo account, Apple Developer, Google Play service account, prod
DATABASE_URL, hosting env vars).

---

## 1. One-time: dev-client builds

```bash
git pull
cd artifacts/buildtogether
pnpm install                                   # picks up expo-dev-client + expo-updates

npx eas-cli@latest login                       # your Expo account
npx eas-cli@latest init                        # generates projectId, writes app.json
# COPY the projectId that printed — paste into the Claude session so I can
# replace the REPLACE_WITH_EAS_PROJECT_ID placeholder in app.json updates.url

npx eas-cli@latest credentials                 # iOS → production → set up dist cert
npx eas-cli@latest build --profile development --platform ios
npx eas-cli@latest build --profile development --platform android
```

When the cloud builds finish (~15-25 min, you'll get an email):

- iOS: install via the TestFlight ad-hoc link in the email.
- Android: download the `.apk`, tap to install (allow "Install unknown apps"
  in your browser settings once).

You now have a **Tilly Dev Client** app icon, separate from production
Tilly. After this, daily iteration is:

```bash
# Local Metro
pnpm --filter @workspace/buildtogether run dev
# scan QR from the Dev Client app

# OR push JS-only changes OTA
npx eas-cli@latest update --branch development --message "<short msg>"
```

You only rebuild the dev client when you add a native dep or change
`app.json` plugins. See `artifacts/buildtogether/CONNECT_DEV_CLIENT.md`.

---

## 2. Backend env vars (in your deployed-env secrets UI)

Set in production (Replit / Vercel / wherever):

| Var | Value | Notes |
|---|---|---|
| `PLAID_ENV` | `production` | switches `server/plaid.ts` to prod |
| `PLAID_PRODUCTION_CLIENT_ID` | from Plaid dashboard | |
| `PLAID_PRODUCTION_SECRET` | from Plaid dashboard | |
| `PLAID_REDIRECT_URI` | `https://<your-prod-domain>/plaid/oauth-redirect` | must be registered in Plaid dashboard for OAuth banks (Chase/BoA/Wells) |
| `PLAID_WEBHOOK_SECRET` | from Plaid dashboard | for webhook signature verification |
| `OPENROUTER_API_KEY` | from openrouter.ai | needed for the new Tilly category classifier |

Existing prod vars to confirm are still present: `DATABASE_URL`,
`SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`.

Plaid dashboard side:

- Webhook URL → `POST https://<your-prod-domain>/api/plaid/webhook`
- OAuth redirect URI matches `PLAID_REDIRECT_URI` above.

Deploy the api-server. The schema migration runs automatically via
`migrate-boot.ts` on first request — confirm in logs:

```
[migrate-boot] applied N, failed 0
```

---

## 3. Cutover scripts (run once, in order)

After the env vars are set and the api-server is redeployed:

```bash
# from your laptop, with DATABASE_URL pointing at PROD
cd artifacts/api-server

# Disconnect any sandbox/development items so users get a "reconnect" prompt
# with prod tokens. Skips if PLAID_ENV != production (safety check).
pnpm run scripts:invalidate-non-prod

# Auto-accept any pending_review rows that are now classifiable as
# transfers / fees / CC payments now that PFC is wired through.
pnpm run scripts:reclassify-pending
```

Both are idempotent. Output tells you how many rows were touched.

---

## 4. End-to-end verification (real device, real bank)

On the dev client, signed in as a real user:

1. **Reconnect bank** — Plaid Link sheet opens, Face ID prompts say "Tilly"
   (not "Expo Go"), connection succeeds.
2. **Open Pending** — should be 0 to ≤3 rows + Tilly's question panel at
   top. NOT the firehose. If it's still a firehose, run
   `scripts:reclassify-pending` again and check `OPENROUTER_API_KEY` is set.
3. **Confirm an AI suggestion** — pick a row that shows "Tilly thinks: …",
   tap Accept → expense lands in Spend with that category.
4. **Override an AI suggestion** — tap Add note, change category, Accept.
   Then check the DB:
   ```sql
   SELECT * FROM ai_corrections ORDER BY created_at DESC LIMIT 5;
   ```
   You should see your override.
5. **Trigger a Tilly anomaly question** — sandbox-test by re-running sync
   3+ times so the same merchant accumulates ≥3 pending rows. The
   question panel should surface "I'm seeing X 3 times this month — what
   is it?" Answer it → check `merchant_rules` got a new row.
6. **Reconcile stale pending** — if you suspect rows are stuck pending,
   `POST /api/plaid/reconcile/:coupleId` (Bearer token in headers) and
   re-open Pending; the auto-accept backfill should now claim them.

---

## 5. TestFlight + Play internal beta

Once verification passes:

```bash
cd artifacts/buildtogether
npx eas-cli@latest build --profile production --platform ios
npx eas-cli@latest submit --profile production --platform ios --latest

npx eas-cli@latest build --profile production --platform android
npx eas-cli@latest submit --profile production --platform android --latest
# requires play-service-account.json — see EAS docs for generating it
```

Add internal testers in App Store Connect → TestFlight and Play Console →
Internal testing.

---

## 6. Things to send back to Claude

Once you have them, paste these in the next session and Claude can finish
the placeholder cleanup + open the PR:

- [ ] **EAS project ID** (printed by `eas init`)
- [ ] **App Store Connect App ID** (the numeric one in App Store Connect URL)
- [ ] **Play service-account JSON path** (default we used:
  `./play-service-account.json`)
- [ ] **Want a CI workflow?** (`.github/workflows/eas-build.yml` that builds
  on push using `EXPO_TOKEN` — you'd add the token as a repo secret once.)
- [ ] **Open the PR for review?**

---

## What's already done on this branch

Server (`artifacts/api-server/`):

- `shared/schema.ts` — added `personal_finance_category`,
  `ai_suggested_category`, `ai_suggested_tags`, `ai_suggested_confidence`
  to `plaid_transactions`.
- `server/migrate-boot.ts` — matching `ALTER TABLE` so the columns appear
  on next deploy.
- `server/tilly/category-classifier.ts` — Haiku-via-OpenRouter classifier,
  cached per signature.
- `server/routes.ts` — sync handler calls classifier when no rule + Plaid
  said "other"; backfill loop reads PFC from the column instead of null;
  accept handler logs to `ai_corrections` when user disagrees with
  Tilly; new `POST /api/plaid/reconcile/:coupleId`.
- `scripts/reclassify-pending.ts`, `scripts/invalidate-non-prod-items.ts`.
- `package.json` — `scripts:reclassify-pending`, `scripts:invalidate-non-prod`.

Mobile (`artifacts/buildtogether/`):

- `eas.json` — Android in development+preview profiles, channels named,
  Android internal-track submit.
- `app.json` — `runtimeVersion` + `updates.url` for OTA.
- `package.json` — `expo-dev-client`, `expo-updates`.
- `client/bt/api/types.ts` — `aiSuggestedCategory/Tags/Confidence` on
  `PlaidPendingTransaction`.
- `client/bt/screens/plaid/PendingTransactionsScreen.tsx` — Tilly questions
  panel + AI-suggestion chip on rows.
- `CONNECT_DEV_CLIENT.md` — replaces the Expo-Go-centric workflow.
