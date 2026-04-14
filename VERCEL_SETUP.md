# Vercel Setup — When You Wake Up

Hey! Here's where we landed and what's left.

## What I did while you slept

1. ✅ Cloned repo to `C:/Projects/BuildtogetherV2` (source repo at `C:/Projects/Buildtogether` untouched)
2. ✅ Refactored `server/index.ts` for dual local/serverless operation
3. ✅ Refactored `server/db.ts` to use Neon serverless driver when on Vercel
4. ✅ Created `vercel.json` + `api/index.ts` (Express wrapper for Vercel Fluid Compute)
5. ✅ Implemented Phase 2 (solo mode in onboarding + AddExpenseScreen)
6. ✅ Implemented Phase 3 (activity_feed table + /api/activity endpoint)
7. ✅ Implemented Phase 4 (guardian_conversations table + multi-turn prompts)
8. ✅ Committed everything (commit `b5bf383`)
9. ✅ **Deployed to Vercel** — preview URL exists

**Deployment:** `https://buildtogether-v2-hz1nhsmjs-anand-inbasekarans-projects.vercel.app`

## What you need to do (5 minutes)

### 1. Provision a Postgres DB (Neon via Vercel Marketplace)

```bash
# Option A: Via Vercel Dashboard (easiest)
# 1. Go to https://vercel.com/anand-inbasekarans-projects/buildtogether-v2
# 2. Storage tab → Connect Database → Neon → Create (Free tier: 0.5GB)
# 3. Vercel auto-adds DATABASE_URL env var

# Option B: CLI
vercel storage create --type=neon
```

### 2. Add your OpenAI API key

```bash
cd C:/Projects/BuildtogetherV2
vercel env add AI_INTEGRATIONS_OPENAI_API_KEY production
# Paste your OpenAI key when prompted
vercel env add AI_INTEGRATIONS_OPENAI_API_KEY preview
# Same key
```

### 3. Redeploy to pick up the env vars

```bash
cd C:/Projects/BuildtogetherV2
vercel deploy --prod
```

First deploy after env vars will:
- Re-run `npm run vercel:build`
- `drizzle-kit push` creates all tables in Neon
- Serverless function starts with DATABASE_URL available

### 4. Disable Vercel deployment protection (optional)

By default, preview URLs require Vercel login. For public testing:

Dashboard → Settings → Deployment Protection → Set to "Only Preview Deployments" or "Off".

### 5. Test it

Open in incognito:
```
https://buildtogether-v2.vercel.app/app
```

Sign up, try the Guardian chat:
- "coffee $5 starbucks" → auto-saved
- "Jordan paid $120 dinner" → confirmation card
- "how much did we spend this month?" → Guardian queries and answers (Phase 4)

## Free tier limits

- Vercel Hobby: fine for testing. 100GB bandwidth, 300s function timeout.
- Neon Free: 0.5GB storage, ~100 concurrent connections — plenty.
- OpenAI: you pay per GPT-4o call (~$0.01 per Guardian parse).

## If anything goes wrong

**Build fails at `db:push`:**
That's expected on first deploy before DATABASE_URL is set. The build script now tolerates this. Once DB is provisioned, redeploy.

**Functions return 500 on AI endpoints:**
Check `AI_INTEGRATIONS_OPENAI_API_KEY` is set in both `production` and `preview` environments.

**Can't access the deploy URL (401):**
Vercel deployment protection is on. Either:
- Add yourself (already logged in) so protection passes
- Go to Settings → Deployment Protection → disable for preview
- Use the `x-vercel-protection-bypass` token method

**Still on old UI:**
Browser cache. Open in incognito.

## Live URLs to bookmark

- **Preview deploy:** https://buildtogether-v2-hz1nhsmjs-anand-inbasekarans-projects.vercel.app
- **Dashboard:** https://vercel.com/anand-inbasekarans-projects/buildtogether-v2
- **Original repo (untouched):** https://github.com/anandin/Buildtogether
- **V2 repo (local):** `C:/Projects/BuildtogetherV2` (not yet pushed to GitHub — up to you)

## To push V2 to a new GitHub repo

```bash
cd C:/Projects/BuildtogetherV2
gh auth login  # one-time
gh repo create anandin/buildtogether-v2 --public --source=. --push
# Vercel dashboard → Settings → Git → connect the new repo for auto-deploy
```

## What phases are LIVE vs CODE-ONLY

| Feature | Status |
|---------|--------|
| Auth middleware (P1) | Code live; Activates once DATABASE_URL set |
| Guardian Quick-Add (P1) | Code live; needs OpenAI key |
| Free tier AI counter (P1) | Code live, works immediately |
| Solo onboarding (P2) | Code live, works immediately |
| Activity feed (P3) | Code live; tables need migration (auto by db:push) |
| Conversation memory (P4) | Code live; tables need migration |
| Multi-turn Guardian (P4) | Code live; needs OpenAI key + conversation table |

Good night — when you wake up, 5 minutes of env var setup and it's all yours. 🦉
