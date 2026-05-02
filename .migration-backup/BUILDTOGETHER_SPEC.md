# BuildTogether — Student Edition · Design & AI Spec

> **For Claude (or any builder) picking up this design.** A detailed brief covering every concept, feature, AI-learning behavior, and content choice in the BuildTogether reimagining for college students. Read top to bottom; the order is intentional.

---

## 1. The big idea

BuildTogether v2 is a financial app reimagined for an **18–23 year old college student** (US-flavored, mix of urban + small-college). The original product was a couples expense tracker; this version keeps the warmth and partnership spirit, but the partner is no longer a romantic one — it's an **AI guardian named Tilly** that knows the student's accounts, spending, dreams, and emotional patterns around money.

The student-AI relationship is the product. Money is just the surface.

### Tilly, in one paragraph
Tilly is a calm older-sibling AI. She's quietly protective, never alarmist, and remembers what you've told her. She watches your accounts in the background, surfaces patterns *before* they hurt, moves money toward what you said matters, and only speaks up when there's something real to say. She has three selectable tones (sibling / coach / quiet) but the same underlying personality.

### Three non-negotiable principles
1. **Less is more.** No data slop, no badge spam, no novelty stats. One number per screen, one decision at a time.
2. **Every surface is contextual.** Nothing is a generic dashboard. Each screen opens with *why this matters today*.
3. **Tilly has memory.** The Profile screen literally shows you what she's learned about you, in your own words, on a timeline. This is the most differentiating feature.

---

## 2. Core scenarios (designed-for use cases)

The product is built around six scenarios a student actually faces:

| # | Scenario | Where it surfaces |
|---|---|---|
| 1 | **Daily check-in** ("can I afford this?") | Home hero; Tilly chat quick-math card |
| 2 | **Building credit safely** (first card, utilization, score) | Credit screen with moving gauge |
| 3 | **Splitting** with roommates / friends (groceries, rent, concerts) | Spend ledger; Profile trusted-people |
| 4 | **Saving for dreams** (study abroad, laptop, emergency cushion) | Dreams portraits with milestone shimmer |
| 5 | **Subscription / phishing / fraud protection** | Home tile; Credit "Tilly protected you · 24h" card |
| 6 | **Emotional patterns around money** (Wednesday spirals, late-night food, anxiety) | Spend "soft spots"; Profile timeline |

---

## 3. Aesthetic system

### Voice / vibe
**Editorial fintech.** Calm, literary, paper-feeling. Inspired by independent magazines and modern banking (Monzo, Lunar) but more *intimate*. NEVER:
- AI-slop gradients everywhere
- Emoji chrome (a few intentional glyphs are fine — see Dreams)
- Drop-shadowed cards stacked like Trello
- Numbers everywhere just to look "data-rich"

ALWAYS:
- One huge serif headline per screen
- Real whitespace — let things breathe
- A single color accent doing emotional work
- Italic serif spans for emphasis on key numbers ("$312 of breathing room")

### Type system
| Role | Font | Notes |
|---|---|---|
| Headlines, key numbers | **Instrument Serif** | 22–84px depending on hierarchy. `<BTSerif>` atom. Italic for emphasis. |
| UI body | **Inter** | 11–14px, 400/500/600/700. The workhorse. |
| Mono labels, ledger amounts | **JetBrains Mono** | 9–13px, ALL CAPS, letter-spacing 0.08–0.14em. Used sparingly. |

Atoms in `bt-system.jsx`:
- `<BTSerif size weight style>` — renders `<span>` or `<div>` based on `style.display`. Critical for line-box math when serif headlines wrap.
- `<BTLabel>` — small mono uppercase label.
- `<BTNum size>` — tabular-nums serif number for currency.
- `<BTRule>`, `<BTPlaceholder>` — utility.

### Color themes
There are **four themes**, all switchable via the in-app Tweaks panel. Each defines a full token set: `bg`, `surface`, `surfaceAlt`, `ink`, `inkSoft`, `inkMute`, `rule`, `accent`, `accent2`, `accentSoft`, `good`, `warn`, `bad`, `chip`, plus a `tilly: { body, belly, beak }` palette for the mascot.

| Theme | Mood | Bg | Accent |
|---|---|---|---|
| **Paper** | Default editorial cream | `#F4EFE6` | Coral-amber `#D8602B` |
| **Dusk** | Night mode, warm shadows | `#181612` | Tangerine `#F0934A` |
| **Citrus** | Bright, juicy, energetic | Sun-yellow `#F5E9B8` | Hot tangerine `#D14A2C` |
| **Bloom** | Soft pink, romantic, gentle | `#F6E8E6` | (defined in bt-system.jsx) |

The user is currently using **Bloom** as the primary theme.

### Tilly's visual identity
Tilly is a **simple SVG bird**, drawn with three colors from the active theme: body, belly, beak. Defined in `tilly.jsx`. States:
- `idle` — default, gentle eyes
- `think` — looking up, used while typing/processing
- (room to add `happy`, `worried` — not yet implemented)

Tilly **breathes**. The home and profile screens wrap her in `animation: btBreathe 4s ease-in-out infinite` (subtle 4% scale pulse, 2px translateY). This is the single most important moment of life in the UI — don't remove it.

### Animation library (in `BuildTogether.html` style block)
- `btBreathe` — Tilly's breathing pulse (4s)
- `btFloat` — floating element (4s, 4px)
- `btDrift` — horizontal drift (slower, decorative)
- `btShimmer` — diagonal light sweep across a gradient (3.2s linear). Used on **paycheck banner** and **dream milestone shimmer**
- `btPulse` — ringed box-shadow pulse (1.6s). Used on the active milestone dot in Dreams and the most-recent memory in Profile timeline
- `tilly-dot` — chat-typing dot bounce (1.2s staggered)

---

## 4. The six screens — detailed

Each screen is a function in `screens.jsx` taking `{ t, tone, time, onNav, active }` props (`t` = theme tokens object). All scroll vertically inside an iOS or Android device frame.

### 4.1 Home — "Today" (`BTHome`)
The morning briefing / night check-in.

**Composition:**
- Time stamp ("Tuesday morning" or "Tuesday · 9:18 pm") — small mono caps
- Big serif greeting ("Hey Maya.") — uses `BT_TONES[tone].greeting()`
- Sub-headline serif sentence with italic accent number ("You have *$312* of breathing room this week.")
- **Tilly mascot** in top-right with breathing animation + soft accent halo behind her (radial gradient)
- **Hero balance card** — deep ink background with diagonal stripe texture (7% opacity), big serif `$412.58` (cents at 0.45 opacity), "After Thursday rent · Friday paycheck +$612" copy, accent-colored `↗` chip
- **Two color tiles** in a 2-col grid:
  - Coral-soft "CitiBike renews tomorrow · Used twice in 30 days · [Pause $19.95]"
  - Beige-surface "Barcelona fund · +$40 moves Friday · progress bar · $870/$2,400"
- **Tilly invite pill** — small Tilly + italic prompt "Anything you want to think through?" + accent arrow. Taps to navigate to Guardian.

**What this screen teaches:**
- Tilly is alive (breathing, halo)
- The number that matters today is *breathing room*, not balance
- Subscriptions you don't use are flagged before they auto-charge
- Dreams progress quietly in the background

### 4.2 Tilly — Guardian chat (`BTGuardian`)
Multi-turn conversation with quick-math analysis cards.

**Composition:**
- Header: small Tilly avatar (changes to `think` state when processing), "Tilly" serif title, voice subtitle ("calm, wise, plainspoken"), "memory" pill button (top-right)
- Chat scroll — alternating user (ink-bg right-aligned) and Tilly (surface-bg left-aligned with small Tilly avatar)
- **Special message kinds:**
  - `text` — normal bubble
  - `typing` — three animated dots
  - `analysis` — a "Quick math" card with mono ledger of impact (`Available Fri after rent · $412.58`, `Concert ticket · −$90.00`, `Buffer left · $262.58`) + a serif sentence with the actual recommendation
- **Suggested prompts** below chat when not thinking:
  - "split groceries with priya"
  - "what's killing my budget?"
  - "is this $90 ticket okay?"
  - "help me think about my first credit card"
- Composer: rounded input + circular send button

**Tilly's voice in chat (sample):**
> "Honestly? Yes — but only because you skipped takeout twice this week. Want me to move it from your spending money, not from Barcelona?"

She names the tradeoff, offers the action, and protects the dream.

### 4.3 Spend — pattern of the week (`BTSpending`)
Not a ledger — a **story** of where your money emotionally went.

**Composition:**
- **Paycheck shimmer banner** at top — gradient (accent → accent2) with diagonal light sweep animation, ✦ glyph, "Friday lands · Paycheck +$612 · in 2 days"
- "This week's pattern" mono label + big serif headline: *"$148 spent. Wednesdays are still your soft spot."* (italic accent on "Wednesdays")
- **Tactile time horizon** — 7 day-bars (M–S), heights ∝ spend, with:
  - Today highlighted in accent + glowing ring + bold day letter
  - "Soft spot" days (W, F) in `accent2` 
  - Other days in soft ink
  - Dollar amount above each bar
- **"Where it goes" — emotional categories** as colored pill rows:
  - Coffee — coral · "Wednesdays especially" · `soft spot` tag · $32
  - Late food — green · "Always after 9pm" · `soft spot` · $41
  - Groceries — moss · "Trader Joe haul Sunday" · $28
  - Transit — ink-soft · "Subway + that one Uber" · $24
  - School — warn · "Pearson eText" · $23
  
  Each row: 8px colored bar on left (emotional weight), name + soft-spot tag, contextual one-liner about *when/why*, big serif amount on right. Cards with soft spots have tinted bg.
- "Today" mini-ledger (compact)
- Floating accent-colored `+` FAB for adding expenses (with accent-colored shadow)

**The point:** spending isn't bad/good — it has a *time* and *feeling* attached. Wednesdays are your soft spot because that's when classes pile up and you DoorDash.

### 4.4 Credit — the one number (`BTCredit`)
Built around utilization (the metric students don't know matters most).

**Composition:**
- **"Why this matters today"** — accent label with ✦ glyph, then Tilly avatar + serif sentence: *"You're at 38% of your limit. Lenders want under 30. Pay $50 today and you're there."*
- **Utilization gauge card** (the hero):
  - "Utilization · $190 of $500" header
  - Massive `38%` in red (BTNum 72px) + "aim for 30%" target on right
  - **Moving gauge bar**: gradient (good → warn → bad), filled to 38%, with vertical ink line + "TARGET" caps label at 30% mark
  - One-tap CTA: "Pay $50 now → drop to 28%"
- **Score card** — deep ink bg with diagonal stripes, "VantageScore · 704 · +12 · since March · good"
- **Levers** — three soft pill rows:
  - Payment history · 100% · good · "Never late. Keep autopay on."
  - Account age · 14mo · neutral · "Don't close your sophomore card."
  - Hard inquiries · 1 · neutral · "Drops off in 23 months."
- **"Tilly protected you · 24h"** card in accent-soft bg: "Blocked one phishing text pretending to be Chase. Flagged a free trial converting in 4 days."

**The point:** credit isn't a number in a vault — it's a thing Tilly can move *today* with a $50 payment. Action over abstraction.

### 4.5 Dreams — goal portraits (`BTDreams`)
Each dream is a portrait card with its own gradient sky and glyph.

**Composition:**
- "What you're building" mono label
- Hero serif: *"$2,462 set aside this year. About $4.20 a day."* (italic accent on the number)
- Sub: "Tilly auto-moves it after every paycheck — you don't have to remember."
- **Three goal portraits**, each:
  - **Gradient header** (132px tall) — unique per dream:
    - Barcelona spring: `#E94B3C → #F59E0B` (sunset orange)
    - New laptop: `#6B5BD2 → #3F4DB8` (deep purple-blue)
    - Emergency cushion: `#2D7A5F → #4FB283` (forest green)
  - Diagonal stripe texture on header (8% opacity)
  - **Shimmer animation** on the header if currently within 8% of a milestone (25/50/75)
  - Oversized glyph in bottom-right (160px Instrument Serif, 18% opacity): `✺` Barcelona, `◇` Laptop, `◉` Cushion
  - Loc/context label + serif goal name on header
  - **Body**:
    - `$870 of $2,400` + percentage chip (chip turns accent-bg if just-crossed milestone)
    - **Milestone track** — gradient progress line, dots at 0/25/50/75/100, just-crossed dot has `btPulse` ringed glow
    - "+$40/wk auto" + due date footer
    - **Tilly nudge** (per goal, contextual): on Barcelona — "Skip two takeout meals a week and Barcelona arrives Feb 18 instead of March 5"
- "+ Name a new dream" dashed-border tile

**The point:** a goal isn't a progress bar — it's a place. The portrait makes saving feel like collecting postcards, not data entry.

### 4.6 Profile — Tilly's relationship surface (`BTProfile`)
The most differentiated screen. This is where the AI relationship lives.

**Composition:**
- **Hero "You + Tilly"** — centered:
  - Big radial halo glow behind everything
  - User initial avatar (accent-soft circle) `+` Tilly (with breathing animation) — visually a *pair*
  - Name & Tilly · "247 days · NYU Junior"
- **Tone tuner with live preview**:
  - "How Tilly talks to you" label
  - 3-segment radio: Sibling / Coach / Quiet
  - **Live preview card** below — actual sample Tilly message in italic, *changes the instant you tap a tone*. Sample lines:
    - sibling: "Hey. Rent's covered. You've got $312 of breathing room — doable, just tight if takeout twice this week."
    - coach: "Two no-spend days down. Let's make it three. Coffee at home tomorrow puts you back in the green."
    - quiet: "Three subscriptions you haven't touched in 60 days. Nothing urgent. Just want you to know."
- **"What I've learned about you" — Tilly's notes timeline**:
  - Section label + serif headline with italic "*Tilly's notes*"
  - Vertical rail with dots (most recent has accent fill + pulse ring)
  - Each entry: date in mono caps + italic quote in Tilly's voice:
    - **Today** · "You skipped DoorDash twice this week. I noticed — that's real."
    - **Apr 18** · "You were anxious about rent on the 14th. We made it."
    - **Mar 02** · "You named 'Barcelona' a dream. I started moving $40 every Friday."
    - **Feb 11** · "First credit card. We agreed: utilization stays under 30%."
    - **Aug 2025** · "You said money makes you anxious. I said okay, slow."
- **Trusted people**:
  - Mom · sees credit + dreams · accent gradient avatar
  - Priya · splits — groceries, rent · accent2 gradient
  - Jordan · splits — concerts, gas · warn gradient
  - "+ Invite someone you trust" dashed tile
- **Quiet settings** (small list):
  - Quiet hours · 11pm — 7am
  - Big-purchase alert · > $25
  - Subscription scan · weekly
  - Phishing watch · on
  - Memory · forever — your choice ← *this is the one that matters*

**The point:** Tilly isn't a tool you log into — she's a relationship that has history. The timeline is her commitment to remember things you said when you were anxious, in your own words.

---

## 5. Tilly's AI learning behavior — detailed

This is the spec for what Tilly *actually does* under the hood. Implement these as you build the real backend.

### 5.1 What Tilly observes
- Every transaction (amount, merchant, time-of-day, day-of-week, category)
- Account balances across checking, savings, credit, splits
- Recurring payments (subscriptions) and their last-used signal where available
- Income events (paychecks, transfers, refunds) with cadence
- User actions in-app: which prompts they tap, what they pause, what they commit to
- User-written messages in chat (anxieties, intentions, dream names)
- Time-of-interaction (morning vs evening, before/after a payday)

### 5.2 What Tilly *learns* (durable memory)
- **Soft spots** — categories + day-of-week combos that consistently overspend (e.g., "Wednesdays · Late food")
- **Emotional triggers** — verbal cues from chat ("anxious", "stressed", "broke") tagged to dates so she can reference them later
- **Stated values** — when the user names a dream, she records the name + emotional weight
- **Commitments** — when she suggests something and the user agrees ("keep utilization under 30%"), she logs it as a shared rule
- **Reliability of nudges** — which kinds of suggestions the user acts on vs ignores; she stops nagging about the ones that don't work
- **Quiet hours preference** — observed pattern of when the user wants to be left alone

### 5.3 When Tilly speaks (initiative model)
Tilly is *quiet by default*. She only surfaces a notification when **all** of:
1. There's a real, time-sensitive opportunity (a sub renews tomorrow, a free trial converts in 4 days, utilization will hurt the score if not paid by statement date)
2. The user can take a single action to change the outcome
3. It's outside quiet hours
4. She hasn't said the same kind of thing in the past 24h (anti-fatigue)

Otherwise: she waits. The Home screen is where ambient signals live; the chat is where the user comes when they want her.

### 5.4 The "memory pill" (top-right of Tilly chat)
Tapping it should open a transparent view of:
- Everything Tilly has learned about you (the timeline from Profile, expanded)
- The chance to **forget** a specific entry — user-controlled, no friction
- The chance to **export** all of it as a markdown file
- A statement of what Tilly will never do (sell data, share with banks, etc.)

This is the trust contract. Implement it for real.

### 5.5 Tone system
Three selectable tones, each defined by:
- A **greeting function** `(name) => string`
- A **voice descriptor** ("calm, wise, plainspoken")
- A **sample message** used in the live preview on Profile

The same underlying analysis powers all three tones — only the surface phrasing changes. The user can switch any time and Tilly's *next* message uses the new tone; older messages stay as written (preserving history).

### 5.6 Quick-math analysis card (in chat)
When the user asks an affordability question, Tilly returns an `analysis` message:
- Mono table: starting buffer, line-items deducted (with negative amounts in `bad` color), final buffer (in `good` if positive)
- A serif paragraph with the actual call: "yes, but only because…" or "no, because the post-concert dinner is the real risk"
- An optional follow-up action ("set a $30 ceiling on Friday night food")

This is the format that earns trust: she shows her math, then makes a human call.

### 5.7 Protective surface (auto, low-volume)
Runs continuously, surfaces in two places:
- **Home tile** if there's one item to pause/review
- **Credit "Tilly protected you · 24h"** card with a 1-sentence summary

Examples of what she watches:
- Phishing texts pretending to be the user's bank
- Free trials about to convert
- Subscriptions unused in 60+ days
- Unusual charges that don't match historical patterns
- Repeat overdraft risk based on spending velocity

She blocks/flags first, *then* tells the user — never the other way around.

---

## 6. Tweaks (in-app design panel)

The prototype exposes a Tweaks panel (top-right when toggled on) with three controls:

| Tweak | Options | Effect |
|---|---|---|
| **Visual theme** | Paper · Dusk · Citrus · Bloom | Swaps the entire token set |
| **Tilly's tone** | Sibling · Coach · Quiet | Changes greeting + sample voice |
| **Time of day** | Morning · Evening | Changes hero copy and timestamps |

Implementation: `useTweaks(TWEAK_DEFAULTS)` in `BuildTogether.html`, persisted via `__edit_mode_set_keys` postMessage. Default values are wrapped in `/*EDITMODE-BEGIN*/...{json}.../*EDITMODE-END*/` so the host can rewrite them on disk.

---

## 7. Technical notes

### File map
```
BuildTogether.html           ← main entry (canvas with iOS + Android grid)
BuildTogether-print.html     ← print-ready letter portrait, 3 pages, auto-print
bt-system.jsx                ← themes, tones, atoms (BTSerif, BTLabel, BTNum, BTTabBar, BTMasthead)
tilly.jsx                    ← the bird mascot SVG
screens.jsx                  ← all 6 screen components + BT_DATA
design-canvas.jsx            ← starter pan/zoom canvas
ios-frame.jsx                ← iOS device bezel
android-frame.jsx            ← Android device bezel
tweaks-panel.jsx             ← starter tweaks shell + control atoms
```

### React conventions
- Inline JSX via `<script type="text/babel">`, pinned React 18.3.1 + Babel 7.29.0
- Each component file ends with `Object.assign(window, { ... })` to share globals across Babel scripts
- **No `const styles = {}`** — use inline styles or namespace as `homeStyles` etc. Style-object name collisions break Babel-shared scope.
- Atoms accept a `style` prop to merge into their inline style — never use className for theming.

### Mock data shape (`BT_DATA` in screens.jsx)
```js
{
  user: { name, school, balance, school_short },
  monthBudget,
  rentDue: { amount, day, daysLeft },
  paycheck: { amount, source, day },
  recent: [{ id, who, cat, amt, time, tag, incoming?, flag? }],
  dreams: [{ id, name, emoji, target, saved, due }]
}
```

### Print version
`BuildTogether-print.html` lays out cover + iOS grid (3×2) + Android grid (3×2), each phone scaled 0.48x. Animations are zeroed via redefined `@keyframes` to avoid mid-print weirdness. Auto-print fires after `document.fonts.ready` + 800ms settle.

---

## 8. What's *not* yet built (open extensions)

- **Onboarding** — connecting first account, naming first dream, agreeing to first commitment with Tilly
- **Splits flow** — actually splitting a Trader Joe receipt with Priya (Venmo handoff)
- **Subscription review modal** — the "[Pause $19.95]" button currently does nothing; needs a confirmation flow
- **Memory inspector** — the trust contract view from §5.4
- **Push notification copy** — written in each tone, for each scenario
- **Alert tiers** — distinguish "fyi" / "decision needed" / "act today" visually
- **Empty states** — pre-paycheck, pre-first-dream, pre-credit-card
- **Accessibility audit** — color contrast in Bloom, focus states on all interactives, screen reader for the mascot

---

## 9. Quick handoff prompt for next Claude

> Read `BUILDTOGETHER_SPEC.md` end-to-end before touching anything. The personality is calm, the visual restraint is intentional, the AI memory is the differentiator. When extending, prefer adding *one more meaningful surface* over adding more tiles to existing screens. Tilly never nags. Every screen opens with a reason. The number that matters is breathing room, not balance.

— end of spec —
