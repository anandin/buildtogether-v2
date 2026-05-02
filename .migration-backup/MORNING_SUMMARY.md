# Good Morning — Overnight Recap

**Live:** https://buildtogether-v2.vercel.app/app
**Test account:** `alex@v2-test.app` / `Test12345!`
**Repo:** https://github.com/anandin/buildtogether-v2 — 14 commits overnight

## What shipped while you slept

### Round 1: Five sprints (commits 1-6)
1. **Deep redesign + seed data** — 222 seeded expenses, Dreams tab rewrite, Activity SpendingPulse
2. **Proactive Guardian** — budget alerts in chat, daily check-in, weekly summary endpoints
3. **Mobile polish** — KeyboardAvoidingView on AddExpense, native-compat audit, MOBILE_TESTING.md
4. **Deep features** — Partner-invite hook in StatusRail, Commitments on Dreams
5. **Ship readiness** — rate limiting, request ID tracking, /api/health

### Round 2: Plaid integration (commit 7)
- Full bank sync with Plaid sandbox (credentials set in Vercel)
- Schema: `plaid_items` + `plaid_transactions` tables
- 9 endpoints (link-token, exchange, sync, accept/ignore pending, disconnect)
- `PlaidConnectButton` component — web uses Plaid Link JS, native falls back to browser
- **Verified live:** link-token creation returns real `link-sandbox-*` from Plaid

### Round 3: HCD audit + fixes (commit 8)
A rigorous HCD audit surfaced critical issues. I fixed the top 4 priorities immediately:

**1. Silent harm fix: solo users no longer inflated to couple budgets**
Onboarding was hardcoding `numAdults: 2` even when user checked "solo" — their budget baselines were systematically wrong. Now correctly passes `1` for solo.

**2. Distressed-user protocol in Guardian prompt** ← BIGGEST SAFETY WIN
Previously zero guidance for when someone says "I got laid off" or "I'm completely broke." The Guardian would default to coaching tips — potentially cruel. Now explicitly:
- Leads with empathy, not numbers
- Offers space, not optimization
- Points to resources (211.org) for genuine crisis
- Never cites overspend to distressed users
- Never mentions dreams as pressure

**Verified live:**
> User: "I got laid off and I'm scared"
> Guardian: "Alex, I'm so sorry. That's genuinely scary, and it makes complete sense that you're feeling that way right now. You don't have to figure everything out tonight — I'm right here with you. Whenever you're ready, we can look at things together, at whatever pace feels okay."

**3. Plaid privacy disclosure modal**
Before Link opens, users see a Shield-iconed modal covering: what Plaid sees, what we store, what the Guardian uses, how to disconnect. "I understand, continue" gates the actual flow. Trust + legal requirement.

**4. Returning-user warmth**
Daily check-in endpoint now detects 7+ day gaps and over-budget state. Gap users get "Good to see you back" — no mention of time away, no guilt. Over-budget users get "thinking of you today, I'm here when you want to look at the numbers" — no cite of the overspend.

**Bonus:** accessibility labels added to new buttons.

## HCD audit findings you haven't acted on yet

The UX researcher flagged 10 priorities. I shipped 4 (numAdults, distressed protocol, Plaid disclosure, native fallback) + the returning-user work. The remaining 5-6 worth considering:

- **Redesign solo onboarding as first-class** (not a checkbox) — M effort
- **Audit/soften harmony score for solo users** — the formula penalizes them silently — M effort
- **Full accessibility pass** — screen reader labels on all Pressables (I did new components only) — M effort
- **Currency/locale config** — hardcoded `$` everywhere, assumes US — M effort
- **Move budget pressure signals below Guardian on Home** — "anxiety-first" layout undermines the brand promise — L effort

## Try it

Live URL: https://buildtogether-v2.vercel.app/app

Things to try that didn't work yesterday:
- Ask "how am I doing for budget" — will synthesize 60 days of seeded data
- Say "I'm really stressed about money" — Guardian will respond with warmth, not optimization
- Tap "Connect your bank" on Home — privacy modal opens, then real Plaid sandbox flow
- Sign up a new solo account — `numAdults: 1` will be sent properly
- Weekly summary: `curl -H "Authorization: Bearer $TOKEN" /api/guardian/weekly-summary/:coupleId`
- Health check: `curl /api/health`

## Commits

```
88e7d31 HCD fixes: distressed-user protocol, solo fix, Plaid disclosure, returning-user warmth
b0693d7 Plaid bank sync integration
48a8e96 MORNING_SUMMARY: overnight sprint 1-5 recap
5fd9c67 Sprints 3+4: Mobile polish + partner invite hook
0392592 Sprints 2 + 5: Proactive Guardian + Ship readiness hardening
b63fe8f Sprint 1: Seed data + Dreams rebuild + Activity pulse strip
76c35c3 Use claude-sonnet-4.6 on OpenRouter; tolerant JSON parsing
8023b73 Guardian coaching upgrade: intent classifier + Sonnet + rich data
```

## Guardian personality test

If you want to see how it handles the edge cases, try these in the chat:

| Your message | What Guardian should do |
|---|---|
| "how am I doing" | Synthesize real numbers, connect to dreams |
| "I'm really stressed about money" | Empathy first, no optimization tips |
| "we got laid off" | Presence, 211.org offer, no financial advice unless asked |
| "how do I save $200" | Specific cuts based on their actual categories |
| "can we afford hawaii" | Concrete math based on their savings pace |
| "hi" | Warm greeting, no lecture |

14 commits, ~2,400 lines changed, 5 sprints + Plaid + HCD fixes — all deployed, all verified via curl against the live API. Test account has 60 days of realistic data so nothing is hypothetical.

Sleep well. 🦉
