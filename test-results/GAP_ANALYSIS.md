# Gap analysis — what's actually wrong with the UI

Done by clicking through the live deploy in Playwright, taking screenshots
**after** each interaction, and comparing against spec §3 / §4.

## Bugs found (ranked by severity)

### S1 — Tilly chat suggested-prompts render as giant empty ovals
**File**: `client/bt/screens/BTGuardian.tsx` (suggested-prompts ScrollView)
**What's happening**: the pills paint tall vertical capsules that fill the
chat area. Text label sits at the top of each capsule with empty space
below. Visible in `clickthrough/tab-tilly.png`.
**Root cause**: RN web's horizontal ScrollView stretches children to its
container height when the container itself has `flex: 1` or no height
constraint. The Pressable pill has `paddingVertical: 8` but no explicit
height, so it inherits the ScrollView's vertical bounds.
**Fix**: cap the container height via `style={{ maxHeight: 44 }}` on the
ScrollView and add `alignItems: "center"` to the contentContainerStyle.

### S2 — Tilly chat bubbles render markdown as raw text
**File**: `client/bt/screens/BTGuardian.tsx` (`Bubble` component, text render)
**What's happening**: Claude returns markdown — backticks for code blocks,
asterisks for italic, `---` for dividers. The chat bubble passes the
string straight to `<Text>`, so users see literal ` ``` ` and `*$22*`.
**Root cause**: persona prompt allows markdown formatting (asterisks for
italic numbers per spec §3) but the renderer is plain Text.
**Fix**: lightweight markdown rendering — split on `*...*` to italicize,
strip ` ``` ` fences. Or instruct Tilly to use Unicode rather than
markdown for emphasis. I'll do BOTH: tighten the prompt AND render
asterisks as italic spans + strip code fences.

### S3 — BTSpend "+" FAB looks clipped/wrong on web
**File**: `client/bt/screens/BTSpend.tsx` (FAB Pressable)
**What's happening**: pink rounded square at bottom-right with a `+`
glyph cropped off (visible in user's screenshot, top of column).
**Root cause**: shadow + position absolute + bottom: 28 conflicts with
the safe-area + tab bar at the bottom. The shadow uses iOS-only
`shadowColor`/`shadowOffset` which RN web doesn't render — instead web
uses `boxShadow` natively but RN doesn't translate. End result: the
button paints but the shape is unstyled because none of the shadow
props apply on web.
**Fix**: switch shadow to `boxShadow` for web via `Platform.select`,
move FAB up so it sits above the tab bar (currently it's covered).

### S4 — Tweaks bottom-sheet covers the tab bar; "Spend" tab unclickable while open
**File**: `client/bt/TweaksPanel.tsx`
**What's happening**: when Tweaks is open, the modal's transparent
backdrop covers the screen. Tapping outside the sheet dismisses it,
but tapping a tab through the backdrop was the user's expectation
("spend button isn't working"). The user clicked Tweaks earlier and
the tabs stopped responding.
**Root cause**: standard React Native Modal behavior — backdrop is
always above tab bar.
**Fix**: instead of a fullscreen Modal, use an inline absolute-positioned
overlay that's pinned to the bottom and doesn't cover the tab bar.
OR add a `pointer-events: none` to the modal backdrop's bottom 100px
region. Simpler: replace Modal with a custom slide-up View positioned
within the screen, leaving the tab bar exposed.

### S5 — Tilly mascot reads as childish ("preschooler")
**File**: `client/bt/Tilly.tsx`
**What's happening**: round pink bird with two big eyes + small triangle
beak. User says it reads as preschool, not "calm older sibling AI".
**Root cause**: SVG has 3:3 body:belly ratio (very round), eyes are 5px
on a 100px viewBox (large relative size), uniform pink fill. No
shading, no detail beyond stroke.
**Fix**: refine geometry — taller egg shape (32×38 instead of 32×30
ellipse), smaller more thoughtful eyes (3px instead of 5px), softer
two-tone belly with subtle gradient, longer/leaner beak. Keep the
breathing animation. Same single-color theme tokens, just better
proportions.

### S6 — SignInScreen still uses V1 purple/Nunito design
**File**: `client/screens/SignInScreen.tsx`
**What's happening**: first thing a new user sees is the V1 purple
"Build Together" with Nunito font and the old logo. Then they sign
in and the world changes to Tilly's editorial-fintech aesthetic.
Visual whiplash.
**Root cause**: Phase 1 deliberately kept SignInScreen as a stub.
**Fix**: rewrite in BT aesthetic — paper background, Tilly mascot
with halo, Instrument Serif headline, mono caps labels, ink-bg
primary button. Same auth functionality.

### S7 — Suggested prompts list is empty on a fresh chat (no chat history yet)
**File**: `client/bt/screens/BTGuardian.tsx`
**What's happening**: After force-completing onboarding via API, the
chat surface shows only "Talk to Tilly..." input with no previous
messages and no quick-prompt pills (because the hook returns no
messages, but BTGuardian only shows pills when `!thinking`).
Actually pills DO show — the issue is they're the giant capsules
from S1.
Already covered by S1.

### S8 — Memory inspector "no memories yet" even after chat
**File**: `client/bt/MemoryInspector.tsx` + chat memory writer flow
**What's happening**: After two real chat exchanges, opening memory
inspector shows "Tilly hasn't written anything yet."
**Root cause**: `extractMemories` is fire-and-forget. The model sometimes
returns empty arrays for casual chitchat (correct behavior). For the
specific test messages "i'm anxious about money" + "saving for
barcelona" both should have created anxiety + value memories — but
they didn't.
**Investigation needed**: check the structured-output schema used by
`extractMemories`. The Zod schema requires `category` and `goalIdHint`
to be `nullable`, which I changed in the OpenRouter rewrite. If the
upstream provider doesn't honor `nullable` and returns an empty/missing
field, validation fails and `extractMemories` returns `[]`.
**Fix**: relax the schema — make `category` and `goalIdHint` `.optional()`
instead of `.nullable()`. The OpenRouter `json_schema` strictness
varies per provider. Also: log the raw model output when validation
fails so we can iterate on the prompt.

### S9 — Onboarding "Begin" button not clickable from Playwright
**File**: `client/bt/onboarding/Onboarding.tsx` (PrimaryButton)
**What's happening**: Playwright `getByText("Begin")` times out — the
text exists but the click target's hit area doesn't include the text
node. Real users on real browsers DO click it though.
**Root cause**: RN-web Pressable wraps Text in a div with
`pointer-events` set on the Pressable, but Playwright's locator
prefers visible-text matches and finds the inner Text node which has
no click handler.
**Fix**: add `aria-label="Begin"` and `accessibilityRole="button"` to
the PrimaryButton so Playwright (and screen readers) treat it as a
button. Same pattern for all CTAs.

## What WAS working

- BTHome rendering: spec-correct (breathing Tilly halo, $312 italic accent,
  ink-bg balance card with diagonal stripes, Barcelona dream tile)
- BTSpend rendering minus FAB: paycheck shimmer banner, day bars with
  soft-spot highlight, category rows with soft-spot tags
- BTCredit rendering: utilization gauge, target marker, score card with
  diagonal stripes, levers
- BTProfile rendering: Maya + Tilly avatar pair, tone tuner with live
  preview, timeline rail
- Tweaks bottom sheet: theme switcher + tone + time-of-day rendered
  correctly. Theme switch DID work (Paper theme applied — cream + brown)
- 6-tab bottom bar: tabs ARE clickable from Playwright using exact
  text match. The Tilly mascot in the Tilly tab slot breathes.
- Real Claude Opus 4 reply through OpenRouter: voice match, multi-
  paragraph thoughtful response

## Fix plan

In priority order. Each is a small, focused commit:

1. **S1 + S9** — fix suggested-prompts pill height + add aria-label to
   onboarding/CTA buttons (one PR, both are RN-web compatibility issues)
2. **S2** — render markdown italic + strip code fences in chat bubbles
3. **S5** — refine Tilly mascot SVG proportions (taller, smaller eyes,
   leaner beak)
4. **S6** — rewrite SignInScreen in BT aesthetic
5. **S3** — fix BTSpend FAB shadow + position
6. **S4** — replace Tweaks Modal with bottom-anchored View that doesn't
   cover the tab bar
7. **S8** — relax memory extraction Zod schema + log raw output on
   validation failure
