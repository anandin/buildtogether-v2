# Tilly Generality Audit (v1)

*2026-05-16 — after user surfaced: "make sure Tilly works for everyone, not just for me."*

## What was specific to one user (now fixed)

| Gap | File | Fix |
|---|---|---|
| Persona: "US college student" hardcoded | `tilly/persona.ts:31` | Now: Canadian-default (beachhead) with explicit "scales to US users; pick up cues from data" |
| Persona examples used my real transactions verbatim ("CSA Group $15,233 reclassified", "Preauthorized Payment", "TD Visa Preauth") | `tilly/persona.ts:84, 95-97` | Replaced with placeholder shapes (`<employer name>`, `<card>`, `<roommate>`, `<line of credit>`) so the LLM uses the user's actual merchants |
| Persona example: "I support 4 people in Toronto" | `tilly/persona.ts:82` | Now "I support 2 people in Waterloo" — still beachhead-anchored but not literally my onboarding |
| Hardcoded `"America/Toronto"` tz in `getIncomeCadence` | `tilly/income-summary.ts:176` | Now takes `tz` parameter (defaults to Toronto for the beachhead, but callers pass user's actual tz from `getUserTimezone`) |
| Scout debug default query: "Levis 501 jeans Toronto" | `routes/tilly/scout.ts:83` | Now neutral: "running shoes" |

## What's beachhead-anchored on purpose (not a bug)

| Default | Where | Why |
|---|---|---|
| `notify-cron.ts DEFAULT_TZ = "America/Toronto"` | Cron timezone fallback for users without a city set | Documented choice — beachhead is Canada; falls back gracefully to user's set tz when available |
| `category-classifier.ts` system prompt says "Canadian student app" | LLM category classifier | Documented beachhead — classifier still works on US transactions, just optimized for CA merchants |
| `migrate-boot.ts` admin-promotes specific email | Bootstrap mechanism | Run-once dev fixture, not user-facing |
| Plaid country_codes `["US", "CA"]` | Plaid Link config | Already multi-country — works for both |

## Detectors — graceful for sparse data

Each of the 11 detectors handles "not enough data" by returning null. So a brand-new user gets `observations: []` and the hero falls back to the structured card without LLM-authored insight. Specifically:

| Detector | Threshold | Empty-data behavior |
|---|---|---|
| income_classification_gap | ≥2 hits, avg ≥$100, in 60d | Returns null |
| seasonality | Needs Y-1 data with same-month income ≥$100 | Returns null |
| subscription_creep | ≥3 trailing months with sub data | Returns null |
| annual_bill_upcoming | ≥1 charge ≥$300 in 13mo | Returns null |
| recurring_obligation | ≥1 active subscription | Returns null |
| trip_detected | ≥$400 travel-shaped burst | Returns null |
| reclassification_learned | ≥1 user_pref alias | Returns null |
| nudge_followup | ≥1 nudge >14d old, outcome NULL | Returns null |
| pattern_explanation | Variable category ≥$200, 1.4× trailing avg | Returns null |
| projection_accuracy | ≥1 row in projection_history | Returns null |
| multi_month_trend | ≥3 months of data | Returns null |

## New-user empty state

Verified the home renders gracefully when no data:
- `hasMoneyData` = `bankConnected` OR has surplus/breathing > 0 OR paycheckCopy mentions income
- New user without bank → renders "Connect your bank when you're ready" empty state
- New user WITH bank but no transactions yet → renders hero card with zeros + Tilly narrative ("you're early in the month, nothing's flowing yet")
- Single-paycheck user → income projection returns `cadence: "irregular"` and `projectedRemaining: 0` — hero shows current income only, no fake forecast

## Default taxonomy buckets — worth user attention

The hardcoded defaults work for most users but some categories are debatable. Users can override any of these via `setCategoryBucket(category, bucket)`.

| Category | Default bucket | Notes |
|---|---|---|
| subscriptions, insurance, rent, mortgage, utilities | recurring | Universally true |
| taxes, fees | one_off | Mostly true (annual tax instalments, occasional overdraft fees) |
| loans | **one_off** | DEBATABLE — student/auto loans hit monthly. For these users, `setCategoryBucket("loans", "recurring")` is the right move. Default is "one_off" because CC payments live here too and they vary. |
| transfers, cashback, credit_adjustment | adjustment | Universally true |
| income | income | Universally true |
| everything else | variable | Default |

## What still needs work for multi-user scale (not blocking)

- **Currency formatting** — assumes USD `$` sign everywhere. Multi-currency users (mixed CAD/USD) would see ambiguous totals. Defer until we have one.
- **Locale-aware date formatting** — uses `Sep 28` style; works for EN-CA and EN-US, would need adapter for fr-CA (Quebec). Defer until needed.
- **Default categorization for users with NO Plaid connection** — `manual_text` / `manual_voice` paths exist but are less polished. Real users will probably always connect a bank; lower priority.
- **Empty-state hero copy when LLM unavailable** — falls back to `deterministicBrief` which is generic but works.

## Verification

- All persona changes typecheck clean
- Detector dismissals tied to userId, never leak across households
- Cron jobs iterate all households via `db.select().from(households)` — scales
- E2E smoke suite passes with the new persona

Conclusion: the fixes shipped today + the existing structure should support **any college-aged user with a Plaid-connected bank**. New users with no data render gracefully. Users who don't fit the beachhead defaults can correct via the chat tools (`setCategoryBucket`, `flagAsIncome`, `setMerchantCadence`, `dismissAsNotIncome`).
