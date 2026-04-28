# Deployment guide — BuildTogether V2 (Tilly)

## Architecture summary

- **Frontend**: Expo (React Native) → web build at `/app`
- **Admin**: Server-rendered HTML at `/admin/tilly`
- **Backend**: Express on Vercel Functions, all under `/api/*`
- **Database**: Neon Postgres (provisioned via Vercel Marketplace)
- **LLM**: OpenRouter (default `anthropic/claude-opus-4`)
- **Embeddings**: OpenRouter (`openai/text-embedding-3-small`)
- **Bank**: Plaid (sandbox by default; production requires Plaid review)
- **Push**: Expo Notifications (Phase 5 wired, needs APNs/FCM creds)

## Required environment variables

Set on Vercel via `vercel env add NAME production`:

| Var | Purpose | Required |
| --- | --- | --- |
| `DATABASE_URL` | Postgres connection (set by Neon integration) | ✅ |
| `OPENROUTER_API_KEY` | Tilly LLM + embeddings | ✅ |
| `CRON_SECRET` | Vercel Cron auth bearer | recommended |
| `JWT_SECRET` | Session token signing | ✅ |
| `PLAID_CLIENT_ID` | Plaid API client | when ready |
| `PLAID_SECRET` | Plaid API secret | when ready |
| `PLAID_ENV` | `sandbox` / `development` / `production` | defaults `sandbox` |
| `EXPO_PUBLIC_DOMAIN` | Public URL for OAuth redirects | for full prod |

## First-time deploy

```sh
# 1. Link the project (only once per machine)
vercel link --yes --token=$VERCEL_TOKEN

# 2. Push env vars (one per command; CLI prompts for value via stdin)
echo "$OPENROUTER_API_KEY"  | vercel env add OPENROUTER_API_KEY production --token=$VERCEL_TOKEN
echo "$CRON_SECRET"         | vercel env add CRON_SECRET production --token=$VERCEL_TOKEN

# 3. Trigger a deploy via empty commit
git commit --allow-empty -m "trigger redeploy"
git push
```

## Subsequent deploys

Push to `main`. Vercel auto-deploys. The build runs:
1. `npx expo export --platform web --output-dir dist` (web bundle)
2. `drizzle-kit push --force` (schema sync — best-effort, with hand-written
   migrations in `migrations/` as the source of truth)

On cold start, `server/migrate-boot.ts` runs idempotent `ALTER TABLE IF NOT
EXISTS` statements to self-heal any schema drift.

## Verifying a deploy

```sh
curl https://buildtogether-v2.vercel.app/api/health
```

Expected:
```json
{
  "status": "ok",
  "version": "<commit-sha>",
  "db": { "ok": true, "latencyMs": <n> },
  "ai": { "provider": "openrouter", "configured": true }
}
```

## Cron jobs (vercel.json)

| Path | Schedule | Action |
| --- | --- | --- |
| `/api/cron/auto-save` | `0 14 * * 5` (Friday 9am EST) | Process weekly dream auto-saves |
| `/api/cron/protections` | `0 17 * * *` (daily noon EST) | Refresh protections feed (Phase 4) |
| `/api/cron/notify` | `0 17 * * *` (daily noon EST) | Push act-today notifications (Phase 5) |

## Mobile builds (EAS)

```sh
# install eas CLI once
npm install -g eas-cli

# log in (uses Apple Developer / Google Play credentials)
eas login

# preview build (TestFlight + Play Internal Testing)
eas build --profile preview --platform ios
eas build --profile preview --platform android

# production submission
eas build --profile production --platform ios
eas submit --platform ios
```

`eas.json` is committed. Replace `REPLACE_WITH_APP_STORE_CONNECT_APP_ID` in
the `submit.production.ios` block when the App Store Connect record exists.

## Admin access

The first user with email `anand.inbasekaran@gmail.com` is auto-promoted
to admin via the boot migration. Sign in normally, then visit
`/admin/tilly`. To grant admin to other users:

```sql
UPDATE users SET is_admin = true WHERE email = 'someone@example.com';
```

(Or build an admin-management UI — `/api/admin/tilly/whoami` is the start.)

## Rolling back

Vercel keeps the last N deploys. To roll back:

```sh
vercel ls --token=$VERCEL_TOKEN
vercel promote <previous-deployment-url> --token=$VERCEL_TOKEN
```

The `migrate-boot` runner uses `IF NOT EXISTS` so rolling code back works
even if newer schema changes have been applied.

## Troubleshooting

| Symptom | Diagnosis | Fix |
| --- | --- | --- |
| Chat returns `chat failed` | Likely missing `OPENROUTER_API_KEY` | `vercel env add OPENROUTER_API_KEY production` |
| Health endpoint says `ai.configured: false` | API keys not in env | See above |
| `column "is_admin" does not exist` | Migration didn't apply | Trigger a redeploy; `migrate-boot` runs on cold start |
| Web app loads to blank screen | Native-only module imported eagerly | Wrap in `await import()` inside `Platform.OS === "web"` guard |
| `/admin/tilly` shows auth modal forever | Bearer token invalid or admin flag missing | Sign in via `/app`, copy `localStorage.build_together_auth_token`, paste into admin page; verify your email is admin |
