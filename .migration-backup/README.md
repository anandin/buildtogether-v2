# BuildTogether V2 — Agent-First Redesign

This is a migration of [Buildtogether](https://github.com/anandin/Buildtogether) from Replit to Vercel, implementing the full 4-phase agent-first redesign.

## What's different from V1

- **Guardian AI is the primary interface** (not a paywalled feature)
- Natural language expense entry: `"coffee $5 starbucks"` → auto-saved in 2 taps
- Auth middleware protects all 55+ API endpoints (was broken in V1)
- Solo users supported (V1 forced "Partner 2" name)
- Conversation memory + multi-turn Guardian (ask questions, follow-ups)
- Activity feed for partner awareness
- Budget alerts fire inline during expense entry
- Free tier gets real AI (15 conversations/month); premium unlocks unlimited + advanced

## Stack

- **Frontend**: Expo React Native (iOS + Android + web)
- **Backend**: Express on Vercel Fluid Compute
- **Database**: PostgreSQL via Neon (serverless HTTP driver)
- **AI**: OpenAI (GPT-4o for Guardian)
- **Subscriptions**: RevenueCat

## Deploying to Vercel (for user when you wake up)

### 1. Install Vercel CLI + login
```bash
npm i -g vercel
vercel login
```

### 2. Provision Neon Postgres via Vercel Marketplace
```bash
# From https://vercel.com/marketplace/neon — click Install
# Link to the project you'll create in step 3
# This auto-sets DATABASE_URL env var
```

### 3. Link this project to Vercel
```bash
cd C:/Projects/BuildtogetherV2
vercel link
# Choose or create project: buildtogether-v2
```

### 4. Set required environment variables

```bash
# OpenAI key (required for Guardian AI)
vercel env add AI_INTEGRATIONS_OPENAI_API_KEY production
# Paste your OpenAI API key

# DATABASE_URL is auto-set by the Neon Marketplace integration
# Verify it's set:
vercel env ls
```

### 5. Deploy
```bash
vercel deploy --prod
```

First deploy will:
- Run `npm install`
- Run `npm run vercel:build` which does `expo export --platform web` → `dist/`
- Run `drizzle-kit push` to apply schema to Neon DB
- Start the serverless Function at `api/index.ts`

### 6. First-run setup

After deploy, seed a test user:
```bash
# Run this locally, hitting your new deploy URL
PROD_URL=https://buildtogether-v2.vercel.app npx tsx scripts/seed-production.ts
```

Or just sign up fresh at `https://<your-deploy>.vercel.app/app`.

## Required Vercel env vars

| Name | Required | Notes |
|------|----------|-------|
| `DATABASE_URL` | Yes | Auto-set by Neon Marketplace integration |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | Yes | For Guardian AI parsing + analysis |
| `SESSION_SECRET` | Recommended | JWT secret for admin dashboard |
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY` | Optional | Only if shipping iOS native |
| `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` | Optional | Only if shipping Android native |
| `EXPO_PUBLIC_DOMAIN` | No | Auto-detected from `window.location` on web |

## Phases implemented

### Phase 1 (Pre-migration, now in V2)
- Auth middleware (`server/middleware/auth.ts`)
- `requireAuth` + `requireCoupleAccess` on all couple-scoped routes
- Guardian conversational expense entry (`POST /api/guardian/quick-add`)
- `GuardianInput`, `GuardianMessageBubble`, `useGuardianChat` hook
- Inline budget alerts
- Auto-save for small high-confidence expenses with undo
- Free tier AI call counter (15/month)
- `soft` variant of `PremiumGate`

### Phase 2 (V2)
- Solo user toggle in onboarding
- Partner 2 optional when solo
- `AddExpenseScreen` hides split UI in solo mode
- Defaults to `splitMethod: "joint"` in solo

### Phase 3 (V2)
- `activity_feed` table + `GET /api/activity/:coupleId` endpoint
- Activity records inserted on expense creation (non-blocking)
- *Polling-based* partner awareness (WebSocket intentionally skipped on serverless)

### Phase 4 (V2)
- `guardian_conversations` table
- Recent conversation passed to every Guardian prompt
- Multi-turn intent detection (expense vs question vs clarification)
- `GET /api/guardian/conversation-history/:coupleId` endpoint
- Prompt now handles follow-ups: "and that cost $30" fills in earlier context

## Architecture notes

### Why Vercel Functions (not separate backend)
Express app is wrapped by `api/index.ts` and served via Fluid Compute. All `/api/*` routes funnel through one function. 300s default timeout on all plans is enough for OpenAI calls.

### Why Neon serverless driver
node-postgres's connection pool breaks on serverless (each cold start = new pool). Neon's HTTP-based driver works without persistent connections.

### Why polling not WebSocket
Vercel Functions can't hold open WebSocket connections. For real-time partner sync, add Pusher/Ably/Upstash Redis later. For now, activity feed is polled when the Home tab is focused.

## Known gaps (things I didn't implement tonight)

- WebSocket-based real-time sync (needs Pusher/Ably — external service)
- Push notifications (needs Expo push service + scheduled job)
- StatusRail compact widget (current home already has good layout)
- Mobile native builds (requires EAS Build pipeline)

## Repository layout

```
api/
  index.ts          # Vercel serverless entry
assets/             # Images, fonts
client/             # Expo React Native app
  components/
    GuardianInput.tsx         (Phase 1)
    GuardianMessageBubble.tsx (Phase 1)
    ...
  context/
  hooks/
    useGuardianChat.ts        (Phase 1)
  screens/
    HomeScreen.tsx            (Phase 1+2 — conversation area + input bar)
    OnboardingScreen.tsx      (Phase 2 — solo mode)
    AddExpenseScreen.tsx      (Phase 2 — solo-aware)
    ...
server/
  middleware/
    auth.ts                   (Phase 1)
  routes.ts                   (Phase 1-4 endpoints)
  prompts.ts                  (Phase 1, 4 — multi-turn aware)
  index.ts                    (refactored for dual local/serverless)
  db.ts                       (refactored for Neon serverless driver)
shared/
  schema.ts                   (added activityFeed + guardianConversations)
vercel.json                   (new)
```
