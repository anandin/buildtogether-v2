# Tilly — roadmap

Living doc. Updated as items land. Re-read at the start of any work
session. The numbered IDs are stable so old commits / chats can
reference "C13" and we still know what that means.

---

## Where we stand (2026-04-28)

What's wired and live on https://buildtogether-v2.vercel.app:

- Auth (email/Apple/Google) + onboarding (5 cards w/ step indicator)
- 5-tab nav (Today / Spend / Tilly / Dreams / You) per design
- Sky portrait + week strip on Today
- Dark-wine owl Tilly mascot (per design spec, not the preschool egg)
- 4 themes aligned to design (Bloom purple-default, Dusk, Citrus, Neon)
- Tilly chat (Opus on OpenRouter, hybrid RAG, memory inspector)
- Manual expense capture: text + voice + photo (LLM parses each)
- Dreams CRUD + contribute flow
- Tilly Learned card on Home (when patterns exist)
- Splits with **Interac e-Transfer (Canada-first)** + Venmo (US)
- Trusted-people invite via Twilio SMS
- Cost guardrail: per-user daily LLM token cap → 429 with Tilly voice
- Protections engine (rule-based, deduped 24h)

What's stubbed:

- Plaid is sandbox-only, prod approval pending. No daily sync cron yet.
- "Tilly Learned" only fires when patterns exist (4+ weeks of data).
- Push notify cron is a stub — protections rows write but don't push.
- Trusted-people scope isn't enforced on read endpoints yet.
- No magic-link landing page for invite acceptance.

---

## Active phase: build out the proactive + social + agentic layers

User decisions (2026-04-28):

| Track | Decision | What it means |
|---|---|---|
| A. Real data | **Plaid sandbox demo account first.** Production access later. | Spin up a sandbox-connected demo so the user can play with the full data-driven experience without needing prod approval. |
| B. Tilly proactive | **All except B11 (phishing watch).** | B11 → backlog (iOS restricts background SMS scan; defer to a v2 "user-flagged messages" feature). |
| C. Social | **All.** | Trusted-people scope, invite accept landing page, splits list, settle-up reminders. |
| D. Agentic | **All.** | Auto-save, auto-pay credit, round-up, sub pause links. |
| E. Onboarding polish | **All.** | Bank-connect tile redesign, dedupe name ask, closing card. |

---

## Track A — make the data layer real

| ID | Item | Status | Note |
|---|---|---|---|
| A1 | Plaid sandbox **demo account** with seeded transactions | doing now | So you can test the full data-on path without prod approval. |
| A2 | Plaid daily transactions sync cron | TODO | `/api/cron/plaid-sync` — pulls new tx for every connected item. |
| A3 | Plaid recurring-transactions parser → subscriptions | TODO | Populates `subscriptions` table from Plaid. Today empty → protections engine has nothing to flag. |
| A4 | Real `today` numbers (breathing room, after-rent, paycheck) | TODO | Currently zeros until Plaid lands. |
| A5 | Plaid Liabilities → credit utilization | TODO | Drives `/api/tilly/credit-snapshot`. |
| A6 | Plaid native SDK swap-in | TODO | Currently web-only via lazy import. |
| A7 | Plaid production approval | **on user** | 5-15 day review. Privacy policy + ToS required (see G27). |

---

## Track B — Tilly proactive

| ID | Item | Status | Note |
|---|---|---|---|
| B7 | Pattern detection cron (Mon 4am) | TODO | Scans 4+ weeks of transactions, writes `tilly_observations` rows, picks strongest for Tilly Learned card. |
| B8 | Notify cron `/api/cron/notify` | TODO | Fans `act_today` protections via Expo push. Respects quiet hours, 24h dedupe per kind. |
| B9 | Push opt-in modal at first meaningful trigger | TODO | "Medium" timing per user decision. Not at onboarding, not delayed forever. |
| B10 | Native push token registration at app launch | TODO | Calls `/api/push/register`. Needs EAS dev build to test. |
| ~~B11~~ | ~~Phishing watch~~ | **backlog** | iOS restricts background SMS scan. Defer to v2 user-flagged messages. |

---

## Track C — social

| ID | Item | Status | Note |
|---|---|---|---|
| C12 | Trusted-people scope enforcement | TODO | Currently scope is stored but no read-side filter. Mom shouldn't see splits with Priya. |
| C13 | Magic-link invite acceptance landing page | TODO | `/api/invites/:token/accept` exists; route handler at `/?invite=<token>` missing. |
| C14 | Splits list view on Spend ("Pending splits" section) | TODO | Modal drafts work; no list of outstanding/settled. |
| C15 | Settle-up reminders | TODO | Protections rule: split older than 7 days still pending → flag. |

---

## Track D — agentic (Tilly does things)

| ID | Item | Status | Note |
|---|---|---|---|
| D16 | Auto-save to dreams after paycheck | TODO | Cron exists (`/api/cron/auto-save`). Needs Plaid Transfer or manual nudge fallback. |
| D17 | Auto-pay credit card to keep utilization < 30% | TODO | Same pattern as D16. |
| D18 | Round-up to dreams | TODO | Per-tx round-up, accumulates into a buffer, drops weekly. |
| D19 | Subscription pause via deep-link | TODO | Curated cancel-page URLs per merchant + inline steps fallback. |

---

## Track E — onboarding polish

| ID | Item | Status | Note |
|---|---|---|---|
| E20 | Bank-connect tile redesign in BT editorial | TODO | Currently old purple/lavender PlaidConnectButton from V1. |
| E21 | Don't ask for the user's name twice | TODO | Signup collects it; onboarding card 2 asks again. Prefill. |
| E22 | "You're set up" closing card | TODO | Currently lands on Home with no transition. |

---

## Track F — mobile (Sprint 5 follow-through)

| ID | Item | Status | Note |
|---|---|---|---|
| F23a | EAS Android preview build | **building** | https://expo.dev/accounts/anandin/projects/build-together/builds/946ba8ca-fa75-4135-92de-4be6eda7ff0b — APK arrives via email. |
| F23b | EAS iOS dev build | TODO | Needs Apple Dev account ($99/yr) for physical install. Use Expo Go meantime. |
| F24 | Native Plaid Link | TODO | SDK in deps, lazy-imported web-only. Wire native with proper Platform gates. |
| F25 | Universal Links / App Links | TODO | For invite + split deep links. `apple-app-site-association` + `assetlinks.json`. |
| F26 | EAS Update OTA | TODO | Once in TestFlight/Play Internal — ship JS-only fixes in 30s. |

---

## Track G — compliance + production

| ID | Item | Status | Note |
|---|---|---|---|
| G27 | Privacy policy + ToS | **on user** | Plaid prod approval requires privacy policy URL. |
| G28 | Data flow diagram for Plaid | TODO | Plaid → DB → OpenRouter → user phone. Required for prod. |
| G29 | Vendor data agreements | TODO | OpenRouter, Sentry, Twilio, Neon — confirm OK with student PII. |
| G30 | Sentry full integration | TODO | `npm i @sentry/node @sentry/react-native` + set `SENTRY_DSN`. Wrapper at `server/observability.ts` ready. |
| G31 | PostHog analytics | TODO | Privacy-respecting events (track flows, not PII). |

---

## Track H — beta launch

| ID | Item | Status | Note |
|---|---|---|---|
| H32 | Recruit 10 beta users | **on user** | Different schools, different income levels. |
| H33 | In-app feedback widget | TODO | ✦ button → modal → POST to Slack webhook. |
| H34 | Daily metrics dashboard at `/admin` | TODO | DAU, chat msgs/user, Plaid-connected %, push delivery, top errors. |
| H35 | Activation funnel | TODO | sign-up → onboarding → bank-or-first-expense → first chat → 7-day return. |

---

## Recently fixed bugs

- **Expo Go "EXPO_PUBLIC_DOMAIN not set" crash** — `getApiUrl()` now
  falls through to the production Vercel domain on native, so a fresh
  install of the app on a phone works without any env config.
- **`npm run expo:dev` fails on Windows** — that script is Replit-only
  (uses `$REPLIT_DEV_DOMAIN` + bash env var assignment). Added
  cross-platform `npm start`, `npm run start:tunnel`, `npm run ios`,
  `npm run android`, `npm run web`. Use `npm start` going forward.

---

## Decisions locked

- **Mobile-first** — web is dev/test only.
- **Plaid Transfer** — backlog. Use redirect-to-issuer until prod approved.
- **Push opt-in timing** — medium (first meaningful trigger).
- **Beta cohort size** — 10.
- **Pricing** — free during beta. Decide tiers after.
- **Region default** — Canada (Interac). User can flip to US (Venmo).

---

## What changes a sprint plan into reality

After each sprint:
1. Mark items done in this file with the commit SHA.
2. Take live screenshots into `test-results/qa-pass-<date>/`.
3. Update "Where we stand" at the top.

If something here turns out to be wrong (a feature isn't worth it, a
spec assumption breaks), strike it out with `~~item~~` and add a
**why removed** note. Don't delete — someone in three months will
wonder why we never built it.
