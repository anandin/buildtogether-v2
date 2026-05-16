# Tilly Perception + Action Audit (v1)

*Generated 2026-05-16 after user complaint: "Tilly says it doesn't have control. The classifications and expectations of taxes are wrong. Do a full audit."*

## The principle

Tilly is the agent operating the UI. Every screen is her output surface. Two questions matter for every screen and every classification:

1. **Can she see it?** (perception via screenContext or detector observations)
2. **Can she change it?** (mutation via tool registry)

When either answer is "no" and the user expects "yes", Tilly looks dumb.

---

## Screen-by-screen perception

| Screen | Sees via screenContext? | Sees via detector observations? | Gap |
|---|---|---|---|
| BTHome (Today) | ✅ monthly + forwardLook + heroNarrative | ✅ all 11 detectors via forwardLook.observations | None |
| BTSpend (week) | ✅ spent + headline + bars + categories | ✅ soft-spot detection | None |
| BTSpend (month) | ⚠️ partial — same shape as week | ✅ same | Period-specific data not flagged in snapshot |
| BTSpend (year) | ❌ horizon panel not in snapshot | ✅ multi_month_trend | Year monthlyHistory not in screenContext |
| BTGuardian (chat) | n/a — this IS the surface | n/a | n/a |
| BTDreams | ❌ not in screenContext | ❌ no detector | Tilly can't reason about dream progress in chat |
| BTCredit | ❌ not in screenContext | ❌ no detector | Tilly can't reason about utilization in chat |
| BTProfile (YOU) | ❌ not in screenContext | ❌ no detector | Tilly can't reason about prefs in chat |
| BTCategories | ❌ not in screenContext | ❌ no detector | Tilly can't see what categories user is browsing |

**Implication.** Tilly has GOOD perception of the two screens that drive the money story (Home + Spend week). She's blind on Year horizon, Dreams, Credit, Profile. Closing each of these = adding 3-10 fields to the screenContext snapshot that BTGuardian builds + the corresponding screens passing their own snapshot when chat is invoked from them.

---

## Mutation capability — what tools exist

The chat tool registry currently has 16 tools:

| Tool | What it changes | Surface |
|---|---|---|
| `createDream` | Inserts goal row | Dreams |
| `deleteDream` | Removes goal | Dreams |
| `markPaymentToOwnCard` | Aliases Plaid debit as "transfers" | Spend totals, Categories |
| `removePaymentToOwnCardAlias` | Reverses above | Same |
| `markIncomeAsTransfer` | Flips income → transfers | Income side |
| `hideCategoryFromSpend` | Filters category from Spend page | Spend |
| `unhideCategory` | Reverses above | Same |
| `setCategoryInclusion` | Toggle whether category counts in headline | Spend total |
| `setMerchantCategory` | Move merchant to new category | All category-derived data |
| `renameMerchant` | Override Plaid descriptor | All merchant-named surfaces |
| `pinToHome` / `unpinFromHome` | Add/remove home tile | Home |
| `setOnboardingField` / `unsetOnboardingField` | Profile prefs | Settings, You tab |
| `addToWatchlist` | Saves intent-to-buy | Today watchlist tile |
| `findOptions` | Enqueue scout job | Chat scout card |
| `predictSalePrice` | Enqueue wait advisor | Chat wait card |

## Mutation gaps Tilly hits today

| Gap | What user wants | Currently | Fix |
|---|---|---|---|
| **Move category between recurring/one-off/variable buckets** | "Taxes aren't recurring, move them out" | Hardcoded RECURRING_CATS / ONE_OFF_CATS / FIXED_CATS sets in `routes/tilly/insights.ts`. NOT user-configurable. | **New tool `setCategoryBucket`** + user_preferences `scope='taxonomy'` |
| **Flag misclassified income** | "CSA Group MSP is my paycheck, not credit_adjustment" (detector finds 4 candidates) | Detector surfaces gap but no tool to fix it. Persona doesn't even mention income reclassification. | **New tool `flagAsIncome`** — retroactively writes `ourCategory='income'` + alias rule |
| **Override merchant cadence** | "TD Visa Preauth Pymt is monthly, not semiannual" (detector mis-classifies) | annual_bill_upcoming detector classifies cadence from 13mo window. With sparse data it guesses wrong; no override. | **New tool `setMerchantCadence`** — detector reads override first |
| **Tilly says "I can't" when she actually can** | User asks "move taxes out of recurring" → Tilly: "I can't directly edit the forecast engine" | Tilly's persona prompt has incomplete tool inventory. She defaults to "I can't" when uncertain. | **Persona rewrite** — explicit "WHEN YOU CAN ACT" list with every tool |

---

## Hardcoded classifications today

These all live in code, not user_preferences, and Tilly can't change them at chat time:

| Constant | File | What it controls | User-configurable? |
|---|---|---|---|
| `ADJUSTMENT_CATS` | `routes/tilly/insights.ts` `computeMonthFlow` | Categories excluded from spend (transfers/cashback/credit_adjustment) | ❌ |
| `RECURRING_CATS` | same | Categories shown as "recurring · already hit" on Home | ❌ |
| `ONE_OFF_CATS` | same | Categories shown as "one-off this month" on Home | ❌ |
| `FIXED_OBLIGATION_CATS` | `tilly/spend-pattern.ts` | Categories excluded from soft-spot detection | ⚠️ Partially — `setCategoryInclusion` toggles inclusion but not bucket |
| Default `kindMap` for observation events | `routes/tilly/insights.ts` | Maps detector kind → event kind | n/a (internal) |

**Fix:** add a `user_preferences` scope `'taxonomy'` with keys like `bucket_override.taxes` = `'one_off'`. Both `computeMonthFlow` and detectors read this map before falling back to defaults.

---

## Specific live issues found on the user's data (2026-05-16)

Pulled from `/api/_e2e/detectors-snapshot`:

### Income misclassified (income_classification_gap detector fired with 4 candidates)

| Merchant | Avg/hit | Currently bucketed as | Should be |
|---|---|---|---|
| **CSA Group Testi MSP** | $5,571 | `credit_adjustment` | `income` |
| **TD Trust Toronto** | $5,128 | `transfers` | likely `income` (verify with user) |
| **Preauthorized Payment** | $4,302 | `transfers` | likely `income` |
| **Thank You TD Canada Trust** | $750 | `transfers` | likely `cashback` (already adjustment) |

The user's income shows ~$6,745 (single paycheck) but real income may be ~$15k+/mo. This is why projected close looks doom — the income side is missing thousands.

### Bill cadence misclassified (annual_bill_upcoming)

| Merchant | Detected | Likely reality |
|---|---|---|
| `canda txd` $4,908 | semiannual, next May 18 | correct (CRA instalments) |
| **`td visa preauth pymt` $4,302** | **semiannual, next May 30** | **monthly CC payment** — wrong! |
| `scotialine` $750 | semiannual, next June 14 | likely monthly |

The detector's `dates.length < 1 || > 4` check + the 13-month window with sparse data is producing false-positive semiannual classifications for monthly bills.

---

## Action plan being shipped right now

1. **`user_preferences` scope='taxonomy'** — bucket overrides per category
2. **Tool `setCategoryBucket(category, bucket)`** — Tilly can move taxes to one-off via chat
3. **Tool `flagAsIncome(merchantSignature)`** — Tilly can fix the CSA Group MSP misclassification
4. **Tool `setMerchantCadence(merchantSignature, cadence)`** — Tilly can fix the TD Visa Preauth semiannual error
5. **Persona rewrite** — explicit tool inventory section, never "I can't" when tool exists
6. **`computeMonthFlow` + detectors read user_preferences** — taxonomy is configurable, not hardcoded

After this lands: the user's chat above ("move taxes out of recurring") gets a one-tool response that actually changes the home, and the income detector's 4 candidates each have a one-tap "yes that's income" path.
