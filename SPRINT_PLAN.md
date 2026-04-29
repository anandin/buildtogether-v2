# Tilly — sprint plan to a real, shippable product

Drafted 2026-04-28. This is a planning doc, not a contract — sequencing
shifts as we learn. Re-read at the start of each sprint and adjust.

---

## Where we are today

What actually works, end-to-end:

| Surface | Status |
|---|---|
| Auth (email/password, Apple, Google) | ✅ Real |
| Onboarding (5 cards, household + first dream) | ✅ Real |
| Dreams CRUD + contribute flow | ✅ Real (Postgres) |
| Tilly chat (OpenRouter Opus, multi-turn, history persisted) | ✅ Real |
| Memory inspector (write, read, forget, export markdown) | ✅ Real |
| Hybrid RAG (semantic + recency over memory) | ✅ Real |
| Theme/tone/time-of-day switching | ✅ Real |
| Bottom nav, sky portrait, design-aligned palette | ✅ Real |
| Admin tuning page (`/admin/tilly`) | ✅ Real |

What's stubbed or empty-stated:

| Surface | What's missing |
|---|---|
| Today hero numbers | Returns `ready:true` with `breathing=0`, `afterRent=0` until Plaid connects |
| Spend pattern | `/api/tilly/spend-pattern` returns `ready:false` — no transactions to analyze |
| Credit snapshot | Same — `ready:false` without a Plaid credit card |
| Subscription tile on home | No subscription detection wired |
| "Tilly Learned" card | Pattern detection backend doesn't exist |
| Home week strip | Same data dependency |
| Plaid Link | Sandbox-only — production app not approved |
| Push notifications | Token table exists, send service not wired |
| Trusted people invites | Schema exists, invite flow doesn't |
| Splits (Venmo) | Same |
| Mobile build | EAS scaffold exists, no signed binary |

The shell is ready. Everything that's missing falls into one of three
buckets: Plaid data, pattern intelligence, or platform polish.

---

## The bar for "real app"

A new student signs up, connects their bank in 60 seconds, and within
their first week:

1. Sees real numbers on Today (breathing room, paycheck, after-rent)
2. Gets one pattern observation from Tilly that's actually true about
   their spend (not generic)
3. Has at least one auto-save run silently in the background
4. Gets a push notification when something matters (subscription
   converting, utilization climbing, paycheck landing)
5. Splits one expense with a roommate without leaving the app

If those five things work for ten beta users, we have a real product.
Below is the path to get there.

---

## Sprint plan — 6 sprints over ~8 calendar weeks

Buffered for solo-dev pace with Claude Code as a force multiplier.
Each sprint ends in a deployable increment that you can hand to a beta
user and watch them try.

### Sprint 1 — "Light up the numbers" (1 week)

**Goal:** A user who connects their bank in onboarding sees real
breathing room, real after-rent balance, real today ledger by end of
that session. No more `ready:false` empty states for connected users.

**Deliverables:**
- [ ] Plaid production application submitted (compliance docs, privacy
      policy, data flow diagram). Plaid review takes 5–15 days; this
      runs **in parallel** as a separate track.
- [ ] Plaid sandbox proven for the full transactions sync flow (we
      probably already have this — verify).
- [ ] `/api/tilly/today` reads from `transactions` table when present:
      computes after-rent, breathing-room, next paycheck date.
- [ ] Recurring transaction parser (`server/tilly/recurring.ts`) — runs
      on Plaid webhook, identifies subscriptions by merchant + cadence.
- [ ] Today's mini-ledger on Spend pulls from real transactions.
- [ ] Plaid webhook handler wired (`/api/plaid/webhook`), gated by
      Plaid signing secret.
- [ ] Cron: nightly transactions sync (`server/cron/sync.ts`).

**Risk:** Plaid production approval can be the long pole. Have
sandbox-keyed builds for beta users while approval is pending.

**Acceptance:** Sandbox account with seeded transactions, sign in →
onboarding → Plaid connect → Today shows accurate numbers within 30s.

---

### Sprint 2 — "Tilly notices" (1 week)

**Goal:** Tilly observes patterns and surfaces them. The first time a
user opens Today after sprint 2 ships, the "Tilly Learned" card has
something specific to say about their actual spend.

**Deliverables:**
- [ ] Weekly spend pattern (`server/tilly/spend-pattern.ts`) computes
      day-of-week soft spots, top categories, week-over-week deltas.
- [ ] Pattern detection cron (runs Mon 4am): looks for repeating
      behaviors over 4+ weeks, writes "Tilly observation" rows to a new
      `tilly_observations` table.
- [ ] "Tilly Learned" card on Home — pulls top observation, with two
      response buttons that write back ("Yes, remind me" → schedule a
      future nudge / "Don't worry about it" → archive observation).
- [ ] Home week strip — 5-day horizontal scroll cards with mood colors,
      pulled from real upcoming bills + paycheck + transactions.
- [ ] Subscription tile on Home + dedicated Subscriptions screen
      (reuses existing `subscriptions` schema + protections engine).
- [ ] Pause subscription flow (deeplinks where possible, manual
      reminder fallback).

**Acceptance:** Spin up a beta account with 6 weeks of seeded
transaction data, see a Tilly Learned card that names a real pattern
(e.g., "You spend 2× more on Wednesdays").

---

### Sprint 3 — "Tilly protects" (1 week)

**Goal:** Tilly tells the user about things before they hurt. Push
notifications work. Protections card on Credit has real entries.

**Deliverables:**
- [ ] Protections engine (`server/tilly/protections.ts`): rules for
      free-trial conversions, unused subscriptions, unusual charges,
      overdraft risk.
- [ ] Push notification send service (Expo push, server-side). Token
      table already exists; wire the send pipeline.
- [ ] Notification preference UI on Profile (Quiet Settings → tappable
      rows that toggle).
- [ ] Phishing watch — basic SMS-pattern dictionary, runs against
      manually-flagged messages (full SMS scan is iOS-restricted; defer).
- [ ] Credit snapshot wires to real Plaid liabilities for users with
      a connected credit card.
- [ ] Pay-now CTA on Credit triggers a Plaid Transfer init (or copies
      a payment confirmation if Transfer isn't approved yet).

**Acceptance:** Run the protections cron on a sandbox account with a
near-converting free trial → user receives a push within an hour →
tapping it deep-links to the protection in the Credit screen.

---

### Sprint 4 — "Tilly connects you" (1 week)

**Goal:** Trusted people work. Roommate splits work. The social layer
ships.

**Deliverables:**
- [ ] Invite flow (email + SMS via Twilio): generate invite link,
      magic-token sign-up.
- [ ] Trusted-people scope: per-person visibility (sees credit only,
      sees splits only, sees everything).
- [ ] Splits screen + flow: create a split, deep-link Venmo for
      payment, manual mark-as-paid, status tracking.
- [ ] Profile trusted-people section becomes interactive (tap a person
      → see what they can see / change scope / remove).
- [ ] Tilly suggested splits — when she sees a transaction that looks
      shared (Trader Joe's > $40 with a frequent split partner),
      proactively offers to split it.

**Acceptance:** User A invites user B → user B signs up via the link →
user A creates a $40 grocery split → user B gets a push, opens the
deep link to Venmo, pays, marks complete → user A sees status update.

---

### Sprint 5 — "Make it mobile" (1.5 weeks)

**Goal:** Real iOS + Android binaries in TestFlight + Play Internal
Track. The web app stays as the dev surface; mobile is what beta users
actually use.

**Deliverables:**
- [ ] EAS build profile for iOS + Android.
- [ ] App icons, splash screens, store screenshots (5 each per
      platform), store copy.
- [ ] TestFlight internal cohort + Play Internal track set up.
- [ ] Native Plaid Link SDK swap-in for iOS/Android (currently web-only
      via lazy import).
- [ ] iOS Universal Links + Android App Links for invite + split deep
      links.
- [ ] Fix all RN-web-isms that don't translate to native (any web-only
      `outlineStyle: none`, any `boxShadow` strings, etc.). Audit.
- [ ] Onboarding bank-connect tile redesigned in BT editorial style
      (replaces old purple/lavender PlaidConnectButton component).

**Acceptance:** A signed iOS build runs on a real iPhone, completes
the full onboarding through Plaid, and matches the design.

---

### Sprint 6 — "Beta + observability" (1.5 weeks)

**Goal:** 10 beta users actually use it for a week. We can see what
they do, where they get stuck, what costs us money.

**Deliverables:**
- [ ] Sentry (errors) + PostHog or Mixpanel (events) wired client +
      server. Privacy-respecting — no PII in event payloads.
- [ ] OpenRouter cost guardrails: per-user daily token cap, alarm if
      a single user crosses $5/day, model fallback to Sonnet on cost
      spike.
- [ ] Rate limiting on chat + insights endpoints (Upstash or Vercel
      KV based).
- [ ] In-app feedback widget (📝 button → modal → POST to Slack).
- [ ] Beta cohort recruited (5-10 students you know, intentional
      diversity — different schools, different income levels).
- [ ] Daily metrics dashboard on `/admin` — DAU, chat messages/user,
      Plaid-connected %, push delivery rate, top errors.

**Acceptance:** 7 of 10 beta users complete onboarding. 5 of 10 send
a Tilly chat message in week one. Zero critical Sentry events
unaddressed > 24 hours.

---

## Tracks running in parallel (not sprint-bound)

These don't fit cleanly into a single sprint but need to start early.

### Compliance & legal (kicks off Sprint 1, ongoing)

- Plaid production approval (5-15 day Plaid review cycle)
- Privacy policy + Terms of Service (lawyer review — 1-2 weeks)
- Data flow diagram (required for Plaid)
- Vendor data agreements (OpenRouter, Plaid, Postgres, Sentry,
  PostHog) — confirm each is contractually OK with student PII.
- Incident response runbook (who do we tell if Plaid items leak)

### Brand & marketing (Sprint 4 onward)

- Landing page (one screen, "join the beta" form)
- Demo video (60-second loom of the full onboarding + first chat)
- App Store / Play Store store listing copy + screenshots

### Pricing & monetization (post-beta)

- Free tier: connect 1 bank, basic patterns, basic Tilly
- Plus tier: multi-bank, advanced agents (auto-pay credit, auto-move
  to dreams), unlimited Tilly chat
- Decision point post-beta: how price-sensitive is the student
  segment? RevenueCat is already integrated (V1) — IAP is wired.

---

## Decision points (let me know)

Things I won't decide unilaterally:

1. **Web vs mobile primary.** Right now we're web-only. The spec is
   mobile-first. Plan above assumes mobile is the eventual primary
   surface. Confirm or push back.
2. **Plaid Transfer for the "Pay $50 now" flow.** Transfer is a
   separate Plaid product with its own approval. We can ship without
   it (use Plaid's "redirect to issuer" pattern) for sprint 3 and add
   Transfer later.
3. **Notification opt-in default.** Push permission requested at
   onboarding (high install→permission rate, more aggressive) vs first
   time we'd actually send something (calmer, lower opt-in rate).
4. **Beta cohort size & timing.** 5? 10? 25? Tighter cohort means
   faster feedback iteration but more chance of confirmation bias.
5. **Pricing plan during beta.** Free for everyone OR free during
   beta + pre-announce paid tier? Affects retention math we'll see.

---

## What I'd need from you to start Sprint 1 tomorrow

- [ ] Plaid production credentials (or kick off the application)
- [ ] Confirm: web-first OR mobile-first for sprints 1-3
- [ ] Twilio account (for invite SMS, eventually) — not blocking S1
- [ ] Domain decision: keep `buildtogether-v2.vercel.app` or get a
      real domain (`tilly.app`?) — affects Apple Universal Links setup

---

## Realistic timeline

- Sprints 1-2: weeks 1-2 (numbers + patterns)
- Sprint 3: week 3 (protections + push)
- Sprint 4: week 4 (social)
- Sprint 5: weeks 5-6 (mobile build)
- Sprint 6: weeks 7-8 (beta launch)

That's 8 calendar weeks to "10 beta users using it daily." Plaid
approval timing could push this to 10-12 weeks. Public launch is
sometime after — depends on what beta surfaces.

---

## What we ship after this plan

If sprints 1-6 land, you have a product that:

- Works end-to-end with real bank data
- Notices patterns and tells users about them
- Sends helpful pushes (not noisy)
- Connects roommates for splits
- Runs on iPhone + Android with proper store listings
- Has 10 humans actively using it
- Is observable enough that you know when it breaks

That's the bar. Everything past that is iteration on what beta users
actually do.
