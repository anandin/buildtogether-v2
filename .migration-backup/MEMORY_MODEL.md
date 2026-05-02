# Tilly's memory model

How Tilly remembers students, why she feels like a relationship instead
of a robotic data analyst, and where the code lives.

## The problem we're solving

Without memory, Tilly is a stateless data analyst with a friendly voice.
She can answer "what did I spend on Wednesday" but she can't notice
patterns, remember decisions you made, or learn which kinds of nudges
actually move you.

We need her to remember things like:

- *Why* Riley picked the $90 show over the $200 one last week.
- That Riley regrets Wednesday DoorDash but keeps doing it anyway.
- That when Tilly framed a save as "loss aversion" ("you'll lose $43"),
  Riley acted — but social-proof framing ("students at your school...")
  got eye-rolled three times in a row.
- That Riley is mid-week stressed and that's what triggers the spending.

None of this fits into a single table. So we built a five-layer memory
that each does what it's best at.

## The five layers

```
┌─────────────────────────────────────────────────────────────────┐
│  L5  BANDIT POLICY        which framing to use for next nudge   │
│      (Beta-Bernoulli per user, derived from L4 outcomes)        │
├─────────────────────────────────────────────────────────────────┤
│  L4  USER DOSSIER         what Tilly believes about Riley today │
│      (JSONB on tilly_dossiers; injected in every chat prompt)   │
├─────────────────────────────────────────────────────────────────┤
│  S4  NUDGE LOG            every nudge sent + the outcome        │
│      (tilly_nudges; reward signal for L5)                       │
├─────────────────────────────────────────────────────────────────┤
│  L2  TYPED MEMORIES       atomic, structured facts              │
│      (tilly_memory_v2 — kind, body, metadata, lineage)          │
├─────────────────────────────────────────────────────────────────┤
│  L1  EVENT LOG            immutable raw signal                  │
│      (tilly_events — append-only, never edit, never delete)     │
└─────────────────────────────────────────────────────────────────┘
```

Each layer is **derived** from the layer below it. Which means: if we
ever change the schema upstairs, we can rebuild it from the event log.
That's why L1 is non-negotiable and gets written *first*.

### L1 — Event log

A row goes in here every time something meaningful happens:

- Riley sends Tilly a chat message
- Tilly replies
- Riley logs an expense (text, voice, or photo)
- Tilly creates a reminder ("I'll ping you Friday")
- Riley cancels a reminder
- Riley clicks "Yes, remind me" on the Tilly Learned card
- Riley moves money to the Tokyo dream

That's it. The row is `(user_id, kind, ts, payload, source_table, source_id)`.
Append-only. Never edited. Never deleted (cold-archived after 180d).

**Why we have this:** if we change everything above it, we can replay L1
and rebuild. If we lose it, we lose the truth tape.

Code: `server/tilly/event-emitter.ts` (`emitEventAsync`), wired at every
relevant route handler.

### L2 — Typed memories

Once a night, the **distiller** reads the last 24 hours of L1 events for
each active user and asks Haiku 4.5: *"what's actually worth remembering
from this?"*

Haiku writes one or more rows like:

```
[regret]   "Riley repeatedly orders DoorDash on Wednesdays despite
            planning to cook, expressed frustration in chat."
            metadata: { spend_amount: 22, intensity: "mild",
                        trigger: "soft_spot_wednesday" }
            source_event_ids: ["abc-123", "def-456"]

[decision] "Riley chose the $90 show over the $200 one, citing Tokyo
            savings. Stuck with it."
            metadata: { amount: 90, alternative_amount: 200,
                        rationale_quote: "saving for Tokyo" }
            source_event_ids: ["ghi-789"]

[bias_observed] "Riley demonstrates present_bias on Wednesdays —
                 chooses immediate DoorDash over Sunday meal-prep plans."
                metadata: { frame: "present_bias",
                            evidence_quote: "I keep doing this" }
```

The seven kinds: `decision`, `regret`, `nudge_outcome`, `bias_observed`,
`preference`, `tradeoff`, `life_context`. Each kind has a typed metadata
shape so the bandit and the dossier can read structured fields, not free
text.

**Why this layer exists:** L1 is too raw to feed an LLM at chat time
(thousands of rows, mostly noise). L2 is the *interpreted* version —
small, typed, and traceable back to L1 via `source_event_ids`.

Code: `server/tilly/nightly-distiller.ts`. Cron `0 3 * * *` (3am UTC).

### S4 — Nudge log

A nudge is anything proactive Tilly does to try to change behaviour:

- Tilly Learned card on Today ("Wednesdays are still your soft spot")
- Push notification when a free trial is about to convert
- Reminder firing at the time it was scheduled
- A chat-inline suggestion ("want me to lock $20 until Friday?")

Each nudge gets a row at send time:

```
{ id, frame, channel, body, context, sent_at, outcome, outcome_at }
```

Where `outcome` is one of `accepted | dismissed | ignored | null` (null
= still pending).

When the user clicks "Yes, remind me," we look up the matching pending
nudge and mark it `accepted`. When they cancel a reminder, we mark it
`dismissed`. When they don't respond within 72h, a sweeper marks it
`ignored`.

**Why it exists:** the bandit needs a clean reward signal. Without this
table, "did the user act on this nudge?" is a fuzzy join across events.
With it, it's `WHERE outcome = 'accepted'`.

Code: `server/tilly/nudge-log.ts`. Wired at the nudge sites.

### L4 — User dossier

This is the thing that makes Tilly **feel like she remembers you.**

Once a night, Sonnet (well, Haiku — Sonnet's structured output 400's on
the schema) reads all the L2 typed memories + the previous dossier and
rewrites a 7-section JSON file:

```jsonc
{
  "identity": "Riley, undergraduate student managing tight weekly
               cash flow ($312 weekly buffer). Mid-week stress
               cycles trigger spending.",

  "money_arc": "Weekly income/allowance cadence. Consistent Wednesday
                spending spike ($22+ DoorDash) despite Sunday meal-prep
                plans. Buffer thinning toward weekends.",

  "soft_spots": ["Wednesday DoorDash orders despite cooking plans",
                 "Mid-week food delivery spending ($22+ per order)",
                 "Stress-triggered eatout purchases"],

  "nudge_response_profile": [
    { "frame": "loss_aversion", "accept_rate": 0.71, "n": 7,
      "best_form": "concrete dollar amount" },
    { "frame": "implementation_intention", "accept_rate": 0.83, "n": 6,
      "best_form": "Friday morning specific time" }
  ],

  "recent_decisions": ["Apr 26: chose $90 show over $200 — stuck with it",
                       "Apr 28: declined $200 concert ticket"],

  "trust_signals": ["asked Tilly to set a real reminder, accepted persistence"],

  "open_loops": ["Promised reminder Fri morning re: cash for show"]
}
```

This whole thing — about 3000 tokens — is stuffed into the system prompt
*before* the persona prompt on every chat turn. So when you ask Tilly
"what do you remember about my Wednesdays?" she doesn't run a query —
she just reads the dossier and answers from it. That's why she can say
"Your Wednesday DoorDash habit. You order even after Sunday meal-prep
plans — usually $22+ per order. You told me it's frustrating" without
hallucinating.

**Why it exists, again:** L2 has hundreds of rows after a few months. We
can't put hundreds of rows in every chat prompt. L4 is the one-shot
distillation that makes the persistent context cheap to inject.

Code: `server/tilly/dossier-rewriter.ts`. Cron `30 3 * * *` (3:30am UTC,
30 min after the distiller).

### L5 — Frame bandit

The bandit picks **how Tilly frames the next nudge** to you specifically.
There are 15 frames, each from the behavioral-economics literature:

```
loss_aversion         "you'll lose $43 this week"
social_proof          "62% of CS sophomores at your school..."
default_taken         pre-selected toggle, opt-out only
anchor                "most students save $X"
present_bias          delay-reward framing
mental_accounting     "your fun bucket vs your goals bucket"
goal_gradient         progress bar nearing 100%
implementation_intention   "when you get paid Friday, move $50"
fresh_start           Mondays / month-1 / birthdays
endowment             "your $200 savings" (possessive)
sdt_autonomy          "you pick which goal matters"
sdt_competence        streaks, levels, "rare achievement"
habit_loop            cue → routine → reward
streak                "don't break your 12-day streak"
pre_commitment        "lock $20 until Friday"
```

Different framings work for different people. Loss aversion is strong
for some students; eye-roll for others. We don't know which is which
until we try a few and see what they accept.

**The bandit, in plain English:**

For each frame, we keep two counters per user:

- `α` = times this frame got accepted
- `β` = times this frame got dismissed or ignored

These define a **Beta distribution** — a bell curve over the underlying
"true accept rate." A frame with α=5, β=0 has a tight curve near 1.0 —
we're confident it works. A frame with α=0, β=0 has a wide flat curve —
we have no idea yet.

**Thompson Sampling** is one line of math: roll a random number from
each frame's curve, pick whichever rolled highest. The high-confidence
winners *usually* roll high. The unknown frames *sometimes* roll high
enough to get tried, which is how we keep exploring instead of getting
locked into the first frame that works.

This gives us exploration-vs-exploitation for free. No epsilon-greedy,
no decay schedule, no hyperparameters to tune.

**Cold-start prior:** we don't start at α=β=0. We start with informed
priors from Ideas42 and the Common Cents Lab on what works for the
under-25 financial cohort:

```
loss_aversion              α=3, β=2  (~60% accept)
implementation_intention   α=3, β=2  (~60%)
goal_gradient              α=2.7, β=2.3
fresh_start                α=2.6, β=2.4
...
present_bias               α=1.8, β=3.2  (~36%) — we describe this bias,
                                                  don't counter it well
```

So a brand-new user's first 5 nudges aren't random — they're informed
by what works for *similar* students. After 5 real outcomes, the prior
is washed out and we're learning from this specific user.

**Where it's used:** when the weekly pattern detector creates a "Tilly
Learned" card, the card's framing used to be hardcoded as loss aversion.
Now `pickFrame()` picks one of seven candidate frames every Monday and
records which one — so the card you see this week might be loss-aversion
shaped, the next week might be implementation-intention shaped, and the
bandit learns which works for you.

Code: `server/tilly/frame-bandit.ts`.

## What about a knowledge graph?

We considered adding Graphiti (a temporally-aware knowledge graph) on
Kuzu (embedded graph engine). It would store relationships like:

```
(Riley) --decided--> (Concert ticket) [amount=200, alt=Tokyo]
(Riley) --regretted--> (Wednesday DoorDash) [intensity=mild]
(Riley) --respondsTo--> (loss_aversion) [strength=high]
```

Each edge would have a `valid_from` and `valid_to` timestamp, so when
your preferences change, the old fact isn't deleted — it's stamped
"valid until [date]." That's powerful for *trajectory* questions:

- "How has Riley's risk tolerance evolved over the last 90 days?"
- "Which framings worked for them in fall vs spring?"
- "What changed since last month?"

**We didn't add it.** The dossier (L4) already answers the questions we
actually have at this scale. When you ask Tilly "what do you remember
about my Wednesdays?" she answers with specifics — without needing a
graph traversal.

We'll revisit if Tilly starts losing real *trajectory* questions ("how
have my soft spots changed?") or if regulators want audit trails of what
Tilly believed on a specific past date. Until then, adding the graph
means more nightly compute, a new dependency, and a UI surface to
justify it — with no clear payoff.

## The nightly cycle

```
03:00 UTC  ──  cron: distill-memories
                Read last-24h L1 events per user.
                Skip users with no behaviorally-meaty events.
                Haiku 4.5 → typed memories.
                INSERT into tilly_memory_v2.

03:30 UTC  ──  cron: rewrite-dossiers
                For each user with new typed memories,
                read latest 50 + previous dossier,
                Haiku 4.5 → updated 7-section JSON.
                INSERT new row into tilly_dossiers (history-keeping).
```

Each user costs about $0.09 per night (~30 events distilled, 1 dossier
rewrite). At 1k MAU that's ~$2.7k/month. At 10k MAU, ~$27k/month — still
small relative to typical AI-infra spend at that scale. Optimizations
(batch dossier rewrites every 3 nights, drop empty days) bring it down
further when needed.

## The admin inspector

Visit **`/admin/memory`**. Auth uses your bearer token from `/app`.

- Top: list of users sorted by recent activity. Click anyone.
- For the selected user, you see all four layers stacked:
  - **L4 Dossier** — the 7 sections rendered as cards + a frame profile table
  - **L5 Bandit** — every frame, accept rate, α/β, with a visual bar
  - **L2 Typed memories** — filterable by kind. Click a row to see the
    metadata. Click any event ID in the lineage → the matching event in
    L1 below scrolls into view and highlights.
  - **S4 Nudges** — every nudge sent, frame chip, channel, outcome pill
  - **L1 Events** — the raw truth tape, paginated

The inspector is read-only. No write paths.

## Where it lives in the code

```
shared/schema.ts                        # tilly_events, tilly_memory_v2,
                                        # tilly_dossiers, tilly_nudges
server/migrate-boot.ts                  # idempotent CREATE TABLE migrations
server/tilly/event-emitter.ts           # L1 emit
server/tilly/nightly-distiller.ts       # L1 -> L2
server/tilly/dossier-rewriter.ts        # L2 -> L4 + format-for-prompt
server/tilly/nudge-log.ts               # S4 record + resolve
server/tilly/frame-bandit.ts            # L5 sample + stats
server/tilly/pattern-cron.ts            # nudge originator (uses bandit)
server/routes/cron.ts                   # cron endpoints
server/routes/admin-memory.ts           # admin API
server/templates/admin-memory.html      # admin UI
server/routes/tilly/chat.ts             # dossier injection in system prompt
```

## Privacy + safety

- **Audit trail:** every L4 dossier claim was distilled from L2 memories
  whose `source_event_ids` point to L1 events. Three-hop lineage from
  the dossier to the raw turn that fed it.
- **No silent overwrites:** the dossier table keeps history. Old rows
  don't get deleted — we always insert a new row, never update.
- **PII boundaries:** the distiller prompt is told to never write PII it
  wasn't given. Everything goes through Anthropic via OpenRouter (no
  third-party model providers in the path).
- **User control (TODO):** we should expose the dossier read-only to the
  user themselves through a "what Tilly remembers" UI surface — they can
  audit it, and we can let them mark sections as "delete this."
