# Smart Tilly v1 — Pattern Intelligence Report

**Generated:** 2026-05-16T04:24:07.463Z  
**Target:** https://buildtogether-v2.vercel.app  
**Detector run:** 2026-05-16T04:24:06.800Z (America/Toronto)  
**Observations fired:** 3 of 11 detectors  

## Executive summary

Twelve pattern detectors were built to lift Tilly from a per-call calculator into a learning agent. Each detector observes a real signal in the user's transaction history (income classification gaps, subscription creep, trip bursts, dossier-anchored explanations, etc.), and the firing observations are written to `tilly_events` so the nightly distiller can lift stable patterns into typed memories the dossier reads on the next chat turn — closing the loop from observation → memory → contextual response.

Item #1 (paycheck cadence projection) ships in `server/tilly/income-summary.ts::projectRemainingIncomeForMonth`. The other 11 ship in `server/tilly/detectors.ts` and run in parallel via `runAllDetectors` from `computeMonthFlow`.

## Verification snapshot — current user

```json
{
  "spentToDate": 17961,
  "income": {
    "amount": 6744.58,
    "source": "plaid",
    "note": "From 1 paycheck this month."
  },
  "surplus": -11216,
  "forwardLook": {
    "projectedClose": -7311,
    "dailyPace": 122,
    "incomeProjected": 12480,
    "incomeProjection": {
      "projectedRemaining": 5735.84,
      "cadence": "biweekly",
      "typicalAmount": 5735.84,
      "nextPaycheckDate": "2026-05-28"
    },
    "leverageInsight": {
      "kind": "top_variable",
      "amount": 514,
      "text": "restaurants is your biggest variable line this month ($514). Worth a closer look?"
    },
    "observationCount": 3
  }
}
```

## Detectors

### #2. Income classification gap

**Purpose.** Recurring inflows from same merchant ≥2× over 60d that aren't tagged as income — likely roommate rent or side gigs misclassified as transfers/other.

**Code:** `server/tilly/detectors.ts:64-126`

**Fired against your data:**

```json
{
  "kind": "income_classification_gap",
  "candidates": [
    {
      "merchant": "csa group testi msp",
      "occurrences": 2,
      "avgAmount": 5571.41,
      "lastSeenDate": "2026-05-08",
      "currentCategory": "credit_adjustment"
    },
    {
      "merchant": "td trust toronto",
      "occurrences": 2,
      "avgAmount": 5127.5,
      "lastSeenDate": "2026-05-04",
      "currentCategory": "transfers"
    },
    {
      "merchant": "preauthorized payment",
      "occurrences": 2,
      "avgAmount": 4301.61,
      "lastSeenDate": "2026-04-27",
      "currentCategory": "transfers"
    },
    {
      "merchant": "thank you td canada trust",
      "occurrences": 2,
      "avgAmount": 750,
      "lastSeenDate": "2026-05-11",
      "currentCategory": "transfers"
    }
  ]
}
```

### #3. Bonus / refund seasonality

**Purpose.** Compares this month's income to same month last year; flags when ratio > 1.4× (likely bonus or refund).

**Code:** `server/tilly/detectors.ts:128-195`

**Did not fire** for the resolved user this run — pattern not present in the trailing window. The detector is wired and will fire as soon as the underlying pattern emerges (e.g. new bonus deposit lands, sub load grows, trip booking hits, etc.).

### #4. Subscription creep

**Purpose.** Trailing 6mo sub load avg vs current month; surfaces drift that's invisible per-month but crushing in aggregate.

**Code:** `server/tilly/detectors.ts:197-258`

**Did not fire** for the resolved user this run — pattern not present in the trailing window. The detector is wired and will fire as soon as the underlying pattern emerges (e.g. new bonus deposit lands, sub load grows, trip booking hits, etc.).

### #5. Annual / quarterly bill calendar

**Purpose.** Scans 13mo for ≥$300 same-merchant patterns (annual / semi-annual / quarterly); predicts next-60d occurrences so projections aren't blindsided.

**Code:** `server/tilly/detectors.ts:260-356`

**Fired against your data:**

```json
{
  "kind": "annual_bill_upcoming",
  "bills": [
    {
      "merchant": "canada txd",
      "typicalAmount": 4908,
      "cadence": "semiannual",
      "expectedNextDate": "2026-05-18",
      "daysUntil": 2
    },
    {
      "merchant": "td visa preauth pymt",
      "typicalAmount": 4302,
      "cadence": "semiannual",
      "expectedNextDate": "2026-05-30",
      "daysUntil": 14
    },
    {
      "merchant": "scotialine",
      "typicalAmount": 750,
      "cadence": "semiannual",
      "expectedNextDate": "2026-06-14",
      "daysUntil": 29
    }
  ]
}
```

### #6. Recurring obligation prediction

**Purpose.** From the subscriptions table, flags items expected this month, separating already-hit from still-ahead.

**Code:** `server/tilly/detectors.ts:358-407`

**Did not fire** for the resolved user this run — pattern not present in the trailing window. The detector is wired and will fire as soon as the underlying pattern emerges (e.g. new bonus deposit lands, sub load grows, trip booking hits, etc.).

### #7. Trip / event detection

**Purpose.** Consecutive-day spend bursts at TRAVEL category merchants ≥$400 total. Bucket separately so daily-pace projection isn't poisoned.

**Code:** `server/tilly/detectors.ts:409-516`

**Did not fire** for the resolved user this run — pattern not present in the trailing window. The detector is wired and will fire as soon as the underlying pattern emerges (e.g. new bonus deposit lands, sub load grows, trip booking hits, etc.).

### #8. Reclassification persistence

**Purpose.** Surfaces user_preferences learned rules (markPaymentToOwnCard / markIncomeAsTransfer / hideCategoryFromSpend / merchant rename) so the user can review/revoke.

**Code:** `server/tilly/detectors.ts:518-561`

**Did not fire** for the resolved user this run — pattern not present in the trailing window. The detector is wired and will fire as soon as the underlying pattern emerges (e.g. new bonus deposit lands, sub load grows, trip booking hits, etc.).

### #9. Nudge follow-up loop

**Purpose.** tilly_nudges with NULL outcome >14 days old. Tilly can reference these in chat: 'Two weeks ago you said you'd review X — still on the list?'

**Code:** `server/tilly/detectors.ts:563-604`

**Did not fire** for the resolved user this run — pattern not present in the trailing window. The detector is wired and will fire as soon as the underlying pattern emerges (e.g. new bonus deposit lands, sub load grows, trip booking hits, etc.).

### #10. Pattern explanation from dossier

**Purpose.** When a category spikes ≥1.4× trailing, searches dossier sections (recent_decisions, money_arc, soft_spots, open_loops) for any past memo mentioning the category.

**Code:** `server/tilly/detectors.ts:606-688`

**Did not fire** for the resolved user this run — pattern not present in the trailing window. The detector is wired and will fire as soon as the underlying pattern emerges (e.g. new bonus deposit lands, sub load grows, trip booking hits, etc.).

### #11. Projection error tracking

**Purpose.** Reads projection_history; surfaces predicted-vs-actual mean absolute error so the hero can build trust over time.

**Code:** `server/tilly/detectors.ts:690-734`

**Did not fire** for the resolved user this run — pattern not present in the trailing window. The detector is wired and will fire as soon as the underlying pattern emerges (e.g. new bonus deposit lands, sub load grows, trip booking hits, etc.).

### #12. Multi-month income vs spend trend

**Purpose.** Trailing 6mo income-spend net per month. Classifies improving / flat / worsening with concrete numbers.

**Code:** `server/tilly/detectors.ts:736-816`

**Fired against your data:**

```json
{
  "kind": "multi_month_trend",
  "monthsAnalyzed": 6,
  "trailingNets": [
    {
      "month": "2025-11",
      "income": 0,
      "spend": 0,
      "net": 0
    },
    {
      "month": "2025-12",
      "income": 0,
      "spend": 0,
      "net": 0
    },
    {
      "month": "2026-01",
      "income": 0,
      "spend": 0,
      "net": 0
    },
    {
      "month": "2026-02",
      "income": 5976,
      "spend": 14993,
      "net": -9017
    },
    {
      "month": "2026-03",
      "income": 13452,
      "spend": 14999,
      "net": -1547
    },
    {
      "month": "2026-04",
      "income": 19715,
      "spend": 14603,
      "net": 5111
    }
  ],
  "trendDirection": "worsening",
  "hint": "Net down $1818/mo trend. Worth a closer look at where the weight came from."
}
```

## Architecture

```
           ┌──────────────────────────────────┐
           │  GET /api/tilly/today + monthly  │
           └────────────────┬─────────────────┘
                            ▼
                ┌─────────────────────────┐
                │   computeMonthFlow      │
                │   (single-source spend) │
                └────────────┬────────────┘
                             ▼
              ┌───────────────────────────────┐
              │  runAllDetectors (parallel)   │
              │  11 detectors via allSettled  │
              └────────────┬──────────────────┘
                           ▼
                  ┌────────────────┐
                  │  Observations  │
                  └───┬────────┬───┘
                      │        │
           ┌──────────┘        └──────────┐
           ▼                              ▼
  ┌────────────────┐         ┌─────────────────────────┐
  │  forwardLook   │         │  emitEvent (obs_*)      │
  │  in API resp   │         │  → tilly_events         │
  └────────────────┘         │  → nightly distiller    │
                             │  → tilly_memory_v2      │
                             │  → dossier              │
                             │  → next chat turn       │
                             └─────────────────────────┘
```

## Crons

- `record-projection-history` — daily 05:33 UTC. Captures predicted_close per household.
- `settle-projection-history` — monthly 1st 05:11 UTC. Computes actual_close for the month that just closed.

## Files added/modified

```
artifacts/api-server/server/tilly/detectors.ts          (new, 882 lines)
artifacts/api-server/server/tilly/projection-history.ts (new, 151 lines)
artifacts/api-server/server/tilly/income-summary.ts     (+108 lines, projectRemainingIncomeForMonth)
artifacts/api-server/server/tilly/event-emitter.ts      (+11 obs_* event kinds)
artifacts/api-server/server/routes/tilly/insights.ts    (computeMonthFlow + observations wiring)
artifacts/api-server/server/routes/cron.ts              (+2 cron handlers)
artifacts/api-server/server/routes/e2e.ts               (+detectors-snapshot)
artifacts/api-server/server/migrate-boot.ts             (+projection_history table)
artifacts/buildtogether/client/bt/api/types.ts          (+forwardLook + observations types)
vercel.json                                              (+2 crons)
```

## Smoke status

All 7 smoke checks pass against prod. The new fields are additive — older clients keep parsing.

---

*Generated by `scripts/build-smart-tilly-report.mjs`.*