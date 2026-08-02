# PRD: Tilly — The Commitment Layer

**Status:** Draft v1 — engineering handoff
**Replaces:** "The Abundance Experience" (shelf/jars/companion PRD)
**Derived from:** *Abundance, Automation, and the Failure of Personal Finance Software*
**Owner:** Anand
**Last updated:** August 2026

---

## 1. The thesis, in one paragraph

Automation is the mechanism that changes financial outcomes. Abundance framing is the
mechanism that earns enough trust for automation to be adopted, and that keeps the person
from switching it back off during a bad month. They are not competing designs — they are
two layers of one product, and conflating them is why this category keeps failing.

Everything below follows from that. The outcome layer is a commitment engine that moves
money on income events. The emotional layer is a tone constraint and a setback protocol,
not a visualization.

---

## 2. What changed from the previous PRD

| Previous PRD | Now | Why |
|---|---|---|
| Shelf of jars showing accumulated spend | **Deleted** | The autonomy effect comes from *prospective choice among live options*, not from reviewing what you already bought. A jar of past coffees is the residue, not the mechanism. |
| Companion (plant/pet) as daily-state render | **Deferred, gated on Test 4** | A wilting plant is loss aversion with a face — the exact mechanic the self-compassion basis forbids. Also: good news has no news value; a companion that thrives 90% of the time is wallpaper by week 3. |
| Maximizer/satisficer persona routing via one onboarding question | **Deleted** | The trait is domain-unstable — most people maximize in some categories and satisfice in others. One question cannot classify reliably. Maximizing also predicts *regret*, so designing toward it is designing toward dissatisfaction. |
| Predictive nudges at the purchase moment | **Deleted as the primary mechanic** | Aggregated data lands ≥1 day late with inconsistent pending behavior. Prediction only works on habitual, time-stable spending and fails precisely on the impulsive purchases worth intervening on. |
| "Your treats jar has room — go enjoy the coffee" | **Prohibited copy** | Mechanically a spending prompt. The scarcity research shows abundance framing alters *valuation*; it is entirely plausible it increases willingness to spend. |
| Success = unprompted opens, DAU | **Success = consent rate + commitment survival + saving rate** | If automation works without engagement, opens are not the variable. |
| Ceilings, streaks, goal layer proposed as new | **Already shipped — reused, not rebuilt** | `user_preferences` scope `caps`, `categoryBudgets`, `goals`, `frame-bandit` streak frame all exist. |

**The one thing genuinely missing from the codebase: nothing moves money.** All 16 chat
tools mutate a classification or a preference. `/api/cron/auto-save` increments
`goals.savedAmount` in Postgres and moves no funds (its own comment says *"Phase 6 wires
this to Plaid Transfer"*). Tilly is an observation product with an excellent nervous system
and no hands. That is the gap this PRD closes.

---

## 3. Principles

**P1 — Abundance is a claim about facts, not a coat of paint.**
Never show a number without the room around it. Every figure carries a denominator that
includes what is coming in and what is already committed. `$340 free this cycle, after the
Amex hits on the 14th` is abundance-framed *and* falsifiable. `Your jar has room` is a mood
with no information content.

**P2 — Abundance framing is underwritten.** Every permission-shaped statement is a small
guarantee. A tool that says "you're fine" and is wrong loses trust faster than a neutral
tracker ever could, because the neutral tracker never promised anything. **Phase 0 is
blocking for this reason.**

**P3 — Self-compassion is not self-indulgence.** Neff's construct includes mindfulness and
common humanity precisely to prevent collapse into permissiveness. Tilly must be able to
say "not this cycle" without judgment. If the abundance frame cannot say no, it is a
yes-machine and Test 2 will fail.

**P4 — Every engagement surface terminates in a commitment or it is decoration.**
No screen ships whose best-case outcome is that the user felt something.

**P5 — Intercept the paycheck, not the purchase.** Purchases are irregular, late-arriving,
and unpredictable. Income is the most regular, most detectable event in the data, and a
day of latency is irrelevant against a 48-hour decision window. This is also where Save
More Tomorrow operates.

**P6 — Inertia works for the saver.** Consent once, at a calm moment. Reducing a
commitment is one tap. Cancelling is deliberately slightly more effortful.

**P7 — Never claim money moved when it did not.** See §6, F3.

---

## 4. Outcome variables

**Primary**
1. **Consent rate** — % of users who turn on ≥1 automated commitment within 14 days.
2. **Commitment survival at 90 days** — % of commitments still active. This is what the
   emotional layer exists to protect.
3. **Automated saving rate** — committed $/month ÷ detected income.
4. **Financial anxiety** — in-app micro-survey at day 0 / 30 / 90.

**Guardrail (anti-metric)**
5. **Discretionary spend must not rise.** If anxiety falls and discretionary spend rises,
   the product is producing a *pleasant harm* and ships no further. This is the direction
   test, promoted from an experiment to a permanent guardrail.

**Explicit non-goals:** DAU, session length, streak counts, push open rate. A product the
user opens twice a month that automates $400/cycle is a success.

---

## 5. The product, in one screen

The core surface is a single screen, triggered on paycheck detection, offering a live
allocation choice. Not a dashboard. Not a daily state.

```
$6,745 landed today.
$4,100 is committed through the 14th — rent, Visa, hydro.

  $2,645 is yours to point somewhere.

  → Japan trip          +$250/cycle    [ arrives 3 weeks sooner ]
  → Visa balance        +$250/cycle    [ clear by Feb instead of May ]
  → Leave it liquid                    [ nothing changes ]

  Whatever you pick, I'll do it every payday until you tell me otherwise.
```

Why this satisfies the thesis: it is prospective choice among live options (§3 mechanism),
it terminates in an automated commitment (P4), it lands at a predictable event (P5), and
the framing carries real information rather than reassurance (P1). "Leave it liquid" is a
first-class option — the choice must be genuine for the autonomy effect to exist.

---

## 6. Feature specs

### F0 — Income confirmation (blocking, Phase 0)

Surface detected income candidates for one-tap confirmation during onboarding and whenever
the `income_classification_gap` detector fires.

- Reuse `splitAnomalousIncome()` / `loadConfirmedIncomeKeys()` in
  `server/tilly/income-summary.ts` — the detector already finds candidates.
- New tool `flagAsIncome(merchantSignature)` writes `ourCategory='income'` + alias rule.
- New tool `setMerchantCadence(merchantSignature, cadence)` — detector reads override first.
- **Regression guard:** assert projected monthly income is within 15% of the sum of
  user-confirmed paychecks; fail the daily-brief render loudly rather than shipping a
  doom projection. Currently the live user shows ~$6,745 against a real ~$15k+
  (`docs/TILLY_PERCEPTION_AUDIT.md`), which makes every abundance claim false.

This is not a bugfix — it is the feature that makes the denominator user-verified, which
is what P2 requires.

### F1 — Payday allocation screen

New screen `BTPayday`, pushed on paycheck-detected push tap; also reachable from BTHome.

- Data source: `computePaydayAllocation()` in `server/tilly/payday-brief.ts` —
  **already returns `trulyFree`, `billsDue`, `billsTotal`, `expectedVariable`, and a
  `dreamSuggestion`.** The compute layer exists; only the choice surface and the
  commitment write are new.
- Extend `PaydayAllocation` with `options: AllocationOption[]` — one per active goal, one
  per liability with a balance, plus a always-present `liquid` option.
- Each option shows a **consequence delta** ("arrives 3 weeks sooner", "clear by Feb
  instead of May"), computed from `targetAmount - savedAmount` over cadence, and from
  liability balance over payoff rate. The delta is the information content that makes this
  a choice rather than a mood.
- Copy runs through the §7 tone rubric. No option is pre-selected.

### F2 — Commitments (new table)

```
commitments
  id, user_id, household_id
  kind            'sweep' | 'cap'
  target_ref      goal_id | liability_signature | category
  amount          numeric        -- per-cycle
  cadence         'per_paycheck' | 'monthly'
  status          'active' | 'paused' | 'ended'
  escalation      jsonb NULL     -- { rate, ceiling, baselinePaycheck, consentedAt }
  floor_amount    numeric NULL   -- never push trulyFree below this
  consented_at, consent_frame, created_at, ended_at, ended_reason
```

`consent_frame` records which framing produced the consent — that is the DV for Test 1.

Supersedes `goals.weeklyAuto` as the source of truth. Keep the column, backfill it, mark
deprecated.

### F3 — Sweep execution (honest v0)

Replace the Friday-weekly `/api/cron/auto-save` with a **payday-triggered** sweep hung off
`runPaydayPulseForHousehold()` in `server/tilly/payday-brief.ts`, which already detects the
paycheck.

**The honesty fix is mandatory and ships with this feature.** Today the cron increments
`goals.savedAmount` and inserts a `goal_contributions` row with `contributor='auto'` while
no money moves — the UI then tells the user they saved $250 that is still sitting in
checking. That is a P7 violation and, worse, it is a false abundance claim (P2).

- Add `goal_contributions.kind`: `'earmarked' | 'moved'`.
- All pre-rail contributions are `'earmarked'`. UI copy says **"earmarked"**, never
  "saved", and shows the two totals separately on BTDreams.
- Once the rail lands (Phase 4), the same commitment produces `'moved'` rows and the
  language upgrades automatically.

Earmarking still tests the variable that matters — consent — so this is not a stub, it is
the measurable v0.

### F4 — Escalation on income events

Save More Tomorrow, mapped onto detected paychecks.

- At commitment time, record `escalation.baselinePaycheck` = median paycheck from
  `getMonthlyIncome()` / `medianIncomeAmount()`.
- On each payday, if the trailing-3 median exceeds baseline by ≥ $50, raise the sweep by
  `escalation.rate` (default 25%) of the delta, rounded down to $25.
- **Consent model:** the user consents *once, to the rule*. Subsequent escalations apply
  automatically with a pre-notice 48h ahead and a one-tap decline. That opt-out default is
  the entire mechanism — an escalation that requires fresh consent each time is just a
  notification.
- Take-home never falls: escalation only ever consumes a fraction of an *increase*.
- Hard stops: `escalation.ceiling`, and never push `trulyFree` below `floor_amount`.

This is the highest-leverage feature in the document, and the detector it depends on is
already built.

### F5 — Setback protocol

The self-compassion evidence is specifically about days when goals are *not* met. That is
the only place tone is load-bearing, and it is a set of templates, not a UI mode.

Triggers: sweep skipped for insufficient room, cap breached, commitment paused.

Rules:
- Do not moralize; do not restate the amount as a failure.
- Restate the commitment as intact ("still on, nothing lost").
- Offer **reduce** as the primary action, **pause** as secondary. Cancel is in settings,
  two taps deeper (P6).
- Never auto-cancel a commitment on a failed cycle. Skip and continue.

### F6 — Tone rubric + copy gate

Every user-facing string that mentions money passes a checklist before ship:

1. Does it lead with a deficit number? → fail
2. Does it read as permission or as judgment? → must be permission
3. **Is it mechanically a spending prompt?** → fail (this is the one the previous PRD failed)
4. Does it carry information, or only reassurance? → must carry information
5. Could it be false if the income denominator is off? → then it is gated on F0

Implement as a unit-testable predicate over the copy constants + an LLM-judge pass in CI
over `persona.ts` outputs. Cheap, and the whole thesis rests on it.

### F7 — Live-options surface (reuse, do not rebuild)

`server/tilly/scout/` + `watchlist` + `findOptions` + `predictSalePrice` already implement
"browse real acquirable options without transacting" — literally the §3 mechanism, already
shipped. Route the autonomy hypothesis through it rather than building a shelf.

**Business-model constraint, decided now:** no affiliate or interchange revenue on this
surface, ever. It is the exact node where "feel abundant, go spend" becomes profitable and
the product's incentives invert. Subscription only.

---

## 7. Implementation roadmap

Sizing assumes one engineer. Phase 1 runs in parallel with Phase 0 and gates Phase 2.

### Phase 0 — Truth (blocking, ~1 week)

| # | Item | Files |
|---|---|---|
| 0.1 | `flagAsIncome` + `setMerchantCadence` tools | `server/tilly/tools/registry.ts` |
| 0.2 | `user_preferences` scope `'taxonomy'`; `computeMonthFlow` + detectors read overrides | `server/routes/tilly/insights.ts`, `server/tilly/detectors.ts` |
| 0.3 | Apply to live data — 4 income candidates + `td visa preauth pymt` cadence | one-off script |
| 0.4 | Income-confirmation UI (F0) | `BTProfile` / onboarding |
| 0.5 | Income regression guard | `server/tilly/daily-brief.ts` |

**Exit:** projected close on the owner's account is accurate. Until then no abundance copy
ships (P2).

### Phase 1 — Validation (~1 week, no product build)

| # | Item |
|---|---|
| 1.1 | **Test 5 (representativeness)** — 5–10 users on the *existing* product, recruited for "anxious about money, objectively okay". TestFlight path already documented in `NEXT_STEPS.md` §5. |
| 1.2 | **Test 1′ (corrected framing test)** — same commitment offer, two framings, **DV = consent rate**, not opens. The original test measured unprompted opens, which contradicts the thesis's own claim that engagement is not where the leverage is. |
| 1.3 | Retrospective query on `tilly_nudges` — `GROUP BY frame, outcome`. The Thompson sampler has been running; find out whether `sdt_autonomy` / permission frames already win. Free. |

**Exit:** go / no-go on Phase 2. If permission framing does not beat neutral on consent,
the emotional-layer premise is weak and the product collapses to bare automation.

### Phase 2 — Commitment engine v0 (~3–4 weeks)

| # | Item | Depends on |
|---|---|---|
| 2.1 | `commitments` table + migration in `migrate-boot.ts` | — |
| 2.2 | `goal_contributions.kind` + earmarked/moved split in UI (F3 honesty fix) | — |
| 2.3 | Extend `computePaydayAllocation()` with `options[]` + consequence deltas | 0.x |
| 2.4 | `BTPayday` allocation screen (F1) | 2.1, 2.3 |
| 2.5 | Payday-triggered sweep; retire Friday `auto-save` | 2.1, 2.2 |
| 2.6 | Chat tools `createCommitment` / `adjustCommitment` / `pauseCommitment` | 2.1 |

**Exit:** a user can consent to a per-paycheck sweep in one tap and see it execute.

### Phase 3 — Escalation + setback (~2 weeks)

| # | Item |
|---|---|
| 3.1 | Escalation rule engine (F4) hung off `runPaydayPulseForHousehold` |
| 3.2 | 48h pre-notice + one-tap decline |
| 3.3 | Setback protocol templates (F5) wired to sweep-skip and cap-breach events |
| 3.4 | Reduce / pause flows; cancel moved two taps deeper |
| 3.5 | Tone rubric as CI check (F6) |

### Phase 4 — The rail (~1 quarter, external dependency)

Plaid Transfer or a partner-bank ACH integration. This is where the project stops being a
design exercise: NACHA handling, ledger reconciliation, failed-transfer states, and a
compliance posture. **Cost this honestly before committing** — the thesis argues its way to
automation without pricing it.

Preconditions: Phase 2 consent rate clears the bar in Phase 1; security review (§9) closed.

### Phase 5 — Gated experiments

- **Test 4 (transfer test):** do non-purchase choices produce a measurable autonomy/mood
  effect versus browsing live acquirable options? Survey instrument, no build. This is the
  single riskiest assumption in the thesis and it decides whether F1's allocation screen
  is doing real work.
- **Test 3 (automation-alone control):** an arm with commitments and no emotional layer.
  If it matches on saving rate, delete the emotional layer.
- Companion visualization — only if Test 4 passes and Test 3 shows the emotional layer earns
  its cost.

---

## 8. Falsification tests

Restated from the thesis with one correction.

1. **Framing test (corrected).** Permission vs. neutral framing on the same commitment
   offer. **DV = consent rate**, not unprompted opens. Four weeks, small panel.
2. **Direction test.** Saving rate alongside anxiety. Abundance cohort reporting lower
   anxiety while saving less = pleasant harm; stop. Promoted to a permanent guardrail (§4.5).
3. **Automation-alone control.** If bare automation matches the full experience on saving
   rate, collapse the product.
4. **Transfer test.** Do non-purchase choices carry the autonomy effect at all?
5. **Representativeness test.** Run first. The founding observation ("I don't open it") comes
   from a builder with no novelty effect, no information asymmetry, and — per the account
   data — no acute need. Check it against real users before redesigning anything.

Tests 5 and 1′ cost almost nothing and gate everything else.

---

## 9. Open decisions

| # | Decision | Status |
|---|---|---|
| 1 | **Money rail** — Plaid Transfer vs. partner bank vs. stay earmark-only | Open. Blocks Phase 4. Earmark-only is a legitimate long-term answer if consent rate is high but the rail is uneconomic. |
| 2 | **Business model** — subscription only | **Decided.** Any interchange or affiliate revenue inverts the incentives; the scout surface is where it would happen. |
| 3 | **Contraindication** — permission-framed prompts are plausibly harmful for compulsive spending patterns | Open. Either a detection path plus an alternate mode exists, or the decision not to serve that population is made deliberately. Do not ship broadly without one. |
| 4 | **Security review** — encryption at rest, token handling, breach response | Largely addressed (`f072b86` SOC 2 hardening, `docs/security/`). Needs confirmation, not re-scoping. In a trust product a breach is an ending, not a setback. |
| 5 | **Household semantics** — commitments in a two-person household | Open. The app is household-native (`households`, `splits`, `invites`, `trusted_viewer`). Whose paycheck triggers the sweep, and does the other member see it? The previous PRD deleted this by putting households out of scope; that removed the product's spine. |

---

## 10. Deleted from scope

Shelf, jars, watch jar, companion character, persona routing, the maximizer/satisficer
onboarding question, purchase-moment predictive nudges as the primary mechanic, wardrobe
inventory, and every metric in the previous §11.

---

## Appendix — what already exists

Verified in `artifacts/api-server/`. The reason this PRD is mostly wiring, not building.

| Capability | Where |
|---|---|
| Paycheck detection, cadence inference, income projection | `server/tilly/income-summary.ts` — `getIncomeCadence`, `inferCadence`, `projectRemainingIncomeForMonth`, `medianIncomeAmount` |
| Payday cycle compute incl. `trulyFree` and a sweep suggestion | `server/tilly/payday-brief.ts` — `computePaydayAllocation`, `runPaydayPulseForHousehold` |
| Goals + contributions ledger + weekly auto amount | `goals`, `goal_contributions`, `goals.weeklyAuto` |
| Ledger-only auto-save cron (**no money movement**) | `server/routes/cron.ts` `/api/cron/auto-save` |
| Category caps + 80/100% checks | `user_preferences` scope `caps`; `server/tilly/engagement-cron.ts` |
| Category budgets w/ rollover | `categoryBudgets` |
| Nudge framing bandit, 15 frames, outcome logging | `server/tilly/frame-bandit.ts`, `tilly_nudges` |
| Tone variants + quiet hours | `server/tilly/tone.ts`, `notify-cron.ts` |
| 16 mutation tools over chat | `server/tilly/tools/registry.ts` |
| Live-option browsing without transacting | `server/tilly/scout/`, `watchlist`, `findOptions`, `predictSalePrice` |
| Subscription detection + cancel links | `subscription-detect.ts`, `merchant-cancel-links.ts` |
| Biometric confirm infrastructure | passkey routes + `PasskeySecurityScreen` |
| Push, quiet hours, dedupe | `expo-push.ts`, `engagement-cron.ts`, `notify-cron.ts` |

**Not present anywhere: a code path that moves money.** That is the product.
