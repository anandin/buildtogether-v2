# Tilly UX audit
## Overall impression

The skeleton is solid — the editorial-fintech DNA is there, and several individual moments (the ink balance card, the BTProfile timeline, the shimmer paycheck banner) genuinely hold up against the spec. But the app looks like it was built to a visual spec, not experienced as a product: every screen drops you straight into content with zero orientation, empty states are absent, loading transitions are abrupt, and the bottom-half of almost every screen feels sparse to the point of abandonment. The "calm older sibling" feeling breaks whenever the UI makes you guess what to do next or exposes a dead CTA.

---

## Screen-by-screen findings

### Sign-in

#### S1 high
- **Tilly halo overflows the viewport on mobile-width.** The halo is `size * 1.8 = 194px` radius around a `108px` Tilly, so the halo View is `~194px` wide. On the 390px wide iPhone viewport this is fine, but the pink circle clips the edges on anything narrower (320px budget Android, small-browser zoom). More importantly, the halo `View` is clipped by its parent container because `overflow` isn't set, so on web Chromium you can see a rectangular pink box behind the circular gradient instead of a soft radial glow. Fix: add `overflow: "hidden"` to the halo's parent `View` in `Tilly.tsx` (line 67), or swap the halo from a solid `backgroundColor` View to a proper `LinearGradient` or `RadialGradient` that fades to transparent. The spec says "soft accent halo" — what renders is a flat pink circle.

- **"Make an account" link text reads like a typo.** `client/screens/SignInScreen.tsx` line ~288: the toggle reads "New here? Make an account". The natural phrasing is either "Create an account" or "Sign up." "Make an account" sounds informal in a way that crosses the line from warm into careless. The Tilly voice is calm-sibling, not casual-texting. Fix: change to "Create an account" (matches the primary button label on the signup mode).

#### S2 medium
- **No focus states on the form fields.** The `TextInput` in `SignInScreen.tsx` has a `borderColor: t.rule` (nearly invisible at `rgba(42,26,28,0.10)`) and no focused state. On web, clicking a field gives no visual affordance that it's active. Fix: add `onFocus`/`onBlur` state to each `Field` component and swap `borderColor` to `t.accent` on focus. This is also an accessibility issue — keyboard users have no focus indicator.

- **Error box styling is alarming for a minor mistake.** The error box uses `t.accentSoft` background with a `t.bad` left-border (red). On Bloom theme, `accentSoft` is a warm pink and `bad` is `#B24050` — the combination reads as urgent warning for something as routine as "wrong password." Fix: reduce to a single-color soft treatment — `t.surfaceAlt` background, `t.bad` text, no border. Reserve the bordered box for actual authentication failures (account locked, network error).

- **"Pause $19.95" button has a 32px touch target.** In `BTHome.tsx` line 118–131, the Pressable has `paddingVertical: 8` and no explicit height, rendering at approximately 32px tall on web. Spec §3 says editorial restraint but Apple HIG / WCAG 2.5.5 require 44px minimum touch target. Fix: change `paddingVertical: 8` to `paddingVertical: 12`, or set `minHeight: 44` on the Pressable. Same issue exists on the "skip for now" and "continue" link-buttons in Onboarding (`BankCard`).

#### S3 polish
- **The sign-in screen has a large dead zone below the Terms text.** On desktop-width renders the `ScrollView` centering leaves ~200px of blank `t.bg` below the terms paragraph. This is a CSS flexbox issue: `contentContainerStyle={{ flexGrow: 1 }}` only grows the container; the hero section uses `marginBottom: 8` instead of `flex: 1` centering. For shorter screens (tablet landscape, wide browser) this looks abandoned. Fix: wrap both hero and form in a container with `flex: 1, justifyContent: "center"` so content is vertically distributed, not top-pinned.

---

### Onboarding (5 cards)

#### S1 high
- **No step indicator.** The user goes through 5 screens with zero orientation. On Card 2 ("Let's start with your name") there's no way to know whether this is step 2 of 5 or step 2 of 10. This is particularly jarring because the card layout changes — Card 1 is centered hero, Cards 2–5 are top-aligned forms. Spec §8 calls out onboarding as an "open extension" but that doesn't mean it should be invisible. Fix: add a 5-dot progress indicator (simple `View` dots, active = `t.accent`, inactive = `t.rule`, no text needed) at the top of `Onboarding.tsx`. 5px dots, 6px gap, centered. Do not add a step counter like "2 of 5" — that reads corporate.

- **The "I agree. Let's go." button is the most important CTA in the app and uses the same visual treatment as every other button.** The CommitCard is where the user seals their first promise with Tilly. The CTA (`client/bt/onboarding/Onboarding.tsx` line 313) has `backgroundColor: t.ink` identical to every other primary button. This moment should feel different — heavier, more ceremonial. Fix: give it an accent-colored treatment instead: `backgroundColor: t.accent`, white text. Or add a brief shimmer animation to the button before it fades to rest, mirroring the paycheck shimmer. Either signals "this one matters."

#### S2 medium
- **WelcomeCard: "Hi." as a `BTLabel` is too small and too low-contrast.** `BTLabel` renders at 11px mono uppercase. On Bloom, `t.inkMute` is `#A1838A` on `#F6E8E6` — contrast ratio approximately 2.8:1, failing WCAG AA (4.5:1 minimum for normal text, 3:1 for large text). "Hi." at 11px is normal text. Fix: either bump size to 14px (hits the large-text threshold), or change the `Hi.` to a `BTSerif size={22}` instead of using `BTLabel` — the spec uses label only for mono-caps metadata, not conversational copy.

- **BankCard "connect bank" serif subtext (`fontStyle: "italic"`) renders inconsistently across tones.** The text "I never see your password. I never share your data." is always in `BTFonts.serif` italic regardless of the chosen Tilly tone. On the Coach tone this voice mismatch is noticeable — the Coach tone uses shorter, punchy sentences ("I'll only flag what's worth flagging" is on-tone) but the longer subordinate clause reads Sibling. This is a minor copy issue but worth flagging: the onboarding copy should either be tone-neutral or swap based on `tone.key`. File: `Onboarding.tsx` `BankCard` component.

- **DreamCard glyph is hardcoded to "✺"** regardless of what the user names their dream. `Onboarding.tsx` line 279: `glyph: "✺"` is always passed. The Dreams screen (`BTDreams.tsx`) shows the oversized glyph prominently in the gradient header. If a user names their dream "New laptop" they still get a ✺ instead of ◇. Fix: add a glyph picker (the same row of 5 glyphs that exists in `NewDreamModal`) to `DreamCard` — it's already implemented there, just needs to be copied across.

#### S3 polish
- **NameCard shows no label for the "Where do you study?" field when empty.** `placeholder="NYU"` vanishes when the user starts typing. The field label `BTLabel` is tiny enough that by the time they're typing they've lost context. Add a visible label above that persists. This is already the pattern in `Field` (which uses a `BTLabel` above the `TextInput`) — it is implemented. The issue is the label text "Where do you study? (optional)" is long enough to feel like a paragraph, not a field label. Trim to "School (optional)" in line 166.

---

### BTHome

#### S2 medium
- **The two-tile row has mismatched card heights and no visual resolution.** The CitiBike tile (left) contains a `Pressable` button ("Pause $19.95") which makes it taller than the Barcelona fund tile (right). Both use `flex: 1` so they stretch to match, but the right tile ends up with a visible gap at the bottom. The tiles look unequal in visual weight. This is common in 2-col layouts — fix by giving both tiles `alignSelf: "stretch"` and ensuring they grow together, or by adding a `minHeight: 140` to both so they're explicitly equalized (`BTHome.tsx` lines 95–170). Alternatively, put the Barcelona tile's progress bar at the bottom using `justifyContent: "space-between"` in the card's flex column so it fills naturally.

- **The Tilly invite pill's "→" arrow is a plain Unicode character with no visual weight.** `BTHome.tsx` line 198: `<Text style={{ color: t.accent, fontSize: 18 }}>→</Text>`. On Bloom this renders as a thin pink arrow. Compare to the hero card's ↗ chip which is in a proper `BTChip` container with background — that reads as tappable. The invite pill's arrow is visually ambiguous. Fix: wrap the arrow in a small `BTChip` with `bg={t.accentSoft}` or swap to a small circular arrow badge (24×24 circle, accent bg, white →). This makes the whole pill read as an interaction affordance rather than just text.

- **The "TWEAKS" button overlaps the Tilly halo.** In `00-bthome-loaded.png`, the tweaks pill sits at `position: absolute, top: 18, right: 18`. The Tilly mascot with `size={84}` and halo at `1.8x = 151px` diameter overlaps the tweaks button region. On web Chrome the z-index may be fine (tweaks button is z:50) but visually the overlap is busy — the pink halo runs right up behind the tweaks pill. Fix: push the mascot block `paddingRight: 12` so it doesn't crowd the top-right, or add `marginRight: 64` to the mascot container so it clears the tweaks pill.

- **Home headline sub-text line breaks badly at 390px.** The subtitle "You have $312 of breathing room this week." wraps mid-phrase on mobile widths because the `BTSerif size={22}` has no `maxWidth` constraint. Looking at the screenshot it wraps at "this" — "…breathing room this / week." The last word orphaned on its own line reads as awkward pacing. This is a copy + layout problem. Fix: either tighten copy to "You have $312 breathing room this week." (drop "of") — saves ~10px — or add `maxWidth: "85%"` to the subtitle View to control the wrap point.

#### S3 polish
- **Barcelona tile uses a hardcoded progress bar width.** `BTHome.tsx` line 162: `width: \`${(870 / 2400) * 100}%\`` — this fraction is hardcoded, not derived from `BT_DATA.homeTiles`. Fine for the demo but if data ever changes, this tile silently shows the wrong progress. Wire it to `BT_DATA.homeTiles[1].saved / BT_DATA.homeTiles[1].target`.

- **The hero balance card sub-copy at line 82 repeats context already stated in the label.** The label reads "AFTER THURSDAY RENT" and the sub-copy reads "After Thursday rent · Friday paycheck +$612." The rent reference appears twice. Fix: trim sub-copy to "Friday paycheck +$612 lands in 2 days" — removes the redundancy and adds a time dimension that the label doesn't have.

---

### BTGuardian (Tilly chat)

#### S1 high
- **First-time user experience shows mocked seed conversation, not a real greeting.** `BTGuardian.tsx` lines 69–72: when `tilly.messages.length === 0`, the screen falls back to `BT_CHAT_SEED` — a pre-baked "is this $90 concert ticket okay?" exchange with Maya. A new user signing in for the first time sees a fake conversation they never had. This is the most jarring dissonance in the app: the profile says their name is X, but the chat says "is this $90 ticket okay?" in voice they never typed. Fix: when `messages.length === 0`, instead of showing `BT_CHAT_SEED`, show a single Tilly greeting bubble: the output of `tone.greeting(userName)` + the tone's sample message. This is data the app already has. The seed conversation should only appear in an explicit demo mode.

- **The "memory" pill in the header has a ~24px vertical touch target.** `BTGuardian.tsx` lines 118–129: `paddingHorizontal: 12, paddingVertical: 6`. Total height approximately 28px. This is the trust-contract entry point (spec §5.4 calls it the most important feature for earning trust). Fix: bump to `paddingVertical: 10` for a 36px+ target.

#### S2 medium
- **Chat scroll area has no clear visual separation between old messages and the suggested-prompts row.** There's no hairline, no fade, no margin — the last bubble bleeds right into the pill row. On short-reply threads the visual boundary is clear, but after a multi-turn conversation the last Tilly bubble and the first suggested-prompt pill sit ~12px apart with no separator. Fix: add a `BTRule color={t.rule}` between the ScrollView and the suggested-prompts row (same as the rule already used between header and chat).

- **The Tilly subtitle "calm, wise, plainspoken" is hardcoded** regardless of active tone. `BTGuardian.tsx` line 108: `"calm, wise, plainspoken"` is a string literal. When the user switches to Coach tone (voice: "warm, direct, future-focused") or Quiet tone ("minimal, observational, no nudging"), this subtitle still reads "calm, wise, plainspoken." Fix: replace with `{tone.voice}` — `tone` is available via `useBT()` which is already imported.

- **The analysis card "Quick math" title (`BTLabel`) always shows the label from the local `m.title` field** but doesn't italicize the serif "note" paragraph correctly. `BTGuardian.tsx` lines 307–315: the `m.note` text uses `fontFamily: BTFonts.serif` but not `fontStyle: "italic"`. The spec says the analysis card ends with "a serif sentence with the actual recommendation" — in §5.6 these are described as Tilly's "human call," which by spec convention uses italic serif for emphasis. Fix: add `fontStyle: "italic"` to the note `Text` style at line 308.

- **No empty state for the chat input — placeholder copy is generic.** The `TextInput` placeholder reads "Talk to Tilly…" with an ellipsis (`BTGuardian.tsx` line 212). This is fine functionally but misses the voice. A calm older sibling wouldn't say "talk to me," she'd say something more specific. Fix: "What's on your mind?" or "Ask me anything." — shorter, warmer, no ellipsis (ellipsis on a placeholder reads as the system trailing off, which is the opposite of confident).

#### S3 polish
- **User bubbles are ink-bg (`t.ink`) with `t.surface` text.** On Bloom, `t.ink = #2A1A1C` (dark wine/brown). This is correct per spec "ink-bg right-aligned." However, the rounded corners are uniform `borderRadius: 18` on all four corners — the spec-aesthetic conversation pattern (and iOS HIG) conventionally flattens the corner nearest the avatar tail. With no tail visible, uniform corners look fine, but the very wide `maxWidth: "82%"` means on narrow screens user messages nearly span the full width, losing the right-aligned "conversation partner" spatial logic. Fix: reduce user bubble `maxWidth` to `"72%"`.

---

### BTSpend

#### S1 high
- **The day-bar "today" pulse ring is positioned wrong.** `BTSpend.tsx` lines 241–254: the `Animated.View` pulse ring uses `position: "absolute", bottom: -6`. But the bar itself is inside a `View` with `alignItems: "center"`, and the day letter `Text` sits below the bar. So the ring renders *between* the bar and the day letter, visually on top of the "S" character. You can see this in `tab-spend.png` — the Sunday bar (today) shows a ring hovering over the "S" label. Fix: move the ring to center on the bar's bottom edge — either position it relative to the bar view itself, or move the ring inside the bar View with `bottom: 0` and `alignSelf: "center"`.

- **The "Today" mini-ledger section is incomplete — it only shows 3 of N transactions.** `BTSpend.tsx` line 119: `BT_DATA.recent.slice(0, 3)` — hardcoded to 3. With real data this could show 10 transactions without a "see all" escape. In the current build this also means the 4th item (Campus job income) is never visible. For the demo this is okay, but a "see all" link needs to exist. Fix: after the 3 items, add a `Pressable` link: `<Text style={{ color: t.inkSoft, fontFamily: BTFonts.serif, fontStyle: "italic", fontSize: 14, textAlign: "center", marginTop: 8 }}>All transactions →</Text>`. This link can be a no-op for now but it teaches the user the ledger continues.

#### S2 medium
- **The paycheck shimmer banner lacks a `minHeight`.** `BTSpend.tsx` `PaycheckBanner`: the `LinearGradient` has `padding: 16` and `flexDirection: "row"`. If the copy overflows (longer paycheck source name), the banner stretches without constraint and the shimmer diagonal swipe looks off because the sweep is sized for a fixed height. Set `minHeight: 72` on the gradient container to anchor the shimmer dimensions.

- **Day bars have no minimum height for $0 spend days.** `BTSpend.tsx` line 202: `const h = (b.amt / max) * 100`. If `b.amt === 0`, `h = 0`, and the bar renders as invisible. A student can have a genuine $0 day (no purchases). Fix: `const h = Math.max(4, (b.amt / max) * 100)` — a 4px stub ensures the bar exists and the pulse ring still renders on $0 today days.

- **"Soft spot" chip color inverts the spec.** `BTSpend.tsx` line 91–93: soft-spot chips use `bg={t.accent}` with `fg="#fff"`. On Bloom, `t.accent = #C3416B` (pink-red). These are meant to be gentle observations, not alerts. A white-on-pink chip reads as a warning badge. Spec §4.3 says categories with soft spots have "tinted bg" — the soft spot tag should feel contextual, not alarming. Fix: change to `bg={t.accentSoft}` and `fg={t.accent}` — matches the accentSoft palette use in other gentle-signal contexts (CitiBike tile, Tilly protection card).

- **The "Where it goes" section label spacing is too tight.** `BTSpend.tsx` lines 56–57: `<View style={{ gap: 10 }}>` means the section label "WHERE IT GOES" is only 10px above the first category row. Other sections on the same screen (e.g., "Today" vs its card) use 10px consistently — but spec §3 calls for "real whitespace." The section transition feels rushed. Fix: bump the gap on the outer wrapper to 14–16px, or add `marginTop: 4` to `BTLabel` renders across all screens (a global fix in `atoms.tsx`).

#### S3 polish
- **The "Today" section BTLabel is `inkMute` but the section below it (the BTCard with transactions) has no padding-top gap from the label.** The gap between the label and its card is inherited from the parent `gap: 22` but then `gap: 10` inside the "Today" View creates an inconsistent rhythm — label is 10px above first content, but there are 22px between sections. Consider standardizing to a 2-tier spacing system: 24px between sections, 10px between a label and its content, applied uniformly across BTSpend, BTCredit, BTDreams, BTProfile.

---

### BTCredit

#### S2 medium
- **The utilization gauge's "TARGET" label is hard to read.** `BTCredit.tsx` line 103–117: the TARGET label `Text` is positioned at `left: \`${c.target}%\``, `transform: [{ translateX: -16 }]`. The transform `-16px` is a magic number that tries to center "TARGET" (6 characters) over the marker line. This works at the default 30% but if `c.target` were 10% (narrow bar), the text clips the left edge of the card. More critically: on Bloom theme the label text color is `t.ink = #2A1A1C` against the gauge track which is `t.surfaceAlt` — the contrast is adequate, but the positioning is visually awkward: the text sits below the bar but the tick mark is above it (lines 94–100 put the tick above, lines 103–117 put the label below). This creates a disjointed pointer. Fix: position both tick and label below the bar, side by side: `{ label: "TARGET", tick: at 30% }` in a single `View row`, making it a unified callout rather than two separate absolute elements.

- **The "Pay $50 now" CTA button has `borderRadius: 14`** but all other primary action buttons in the app use `borderRadius: 14` too (consistent). However this button's text "Pay $50 now → drop to 28%" is the only CTA in the app that contains a `→` direction arrow inline in the button label. The arrow styling is inconsistent — other directional elements use the `BTChip` with `↗` or the text arrow at `fontSize: 18`. Here it's inline at `fontSize: 14`. Fine as-is, but either adopt inline arrows everywhere or remove them everywhere. File: `BTCredit.tsx` line 138.

- **The Levers section has no visual hierarchy between "good" and "neutral" states.** All three lever rows use the same card style (`backgroundColor: t.surface`). The "good" payment history row and the "neutral" account-age row look identical at a glance. Spec §4.4 specifies "soft pill rows" — the state should have more visual distinction. Fix: give the "good" row a left accent bar (3px wide, `backgroundColor: t.good`) similar to how BTSpend category rows use a left color bar. One line of code per row, big readability gain.

- **The "Tilly protected you · 24h" card uses `Tilly size={28}` with `breathing={false}`.** This is intentional (no animation in a card) but Tilly is static at every size across the Credit screen except on Home/Profile. On the protection card, she's essentially just a pink blob at 28px — indistinguishable from a colored dot. At this size the mascot adds visual noise rather than character. Fix: remove Tilly from this card entirely and replace with the ✦ accent glyph already used in the header "Why this matters today" section. The ✦ at `color: t.accent, fontSize: 16` reads as "Tilly's signal" without needing a full mascot.

#### S3 polish
- **The score card uses `color: "#FFFCF6"` hardcoded** for the score number (`BTCredit.tsx` line 163). This is the Paper theme's surface color — not a token. On other themes this hardcoded off-white may contrast inadequately. Fix: replace with `color="rgba(255,252,246,0.95)"` or better yet a token: add `scoreText: string` to `BTTheme` or just use the existing pattern of `"rgba(255,252,246,0.6)"` for the VantageScore label and `"#FFFCF6"` for the score value — but pull from a named constant, not a magic hex.

---

### BTDreams

#### S1 high
- **The live data fallback shows $0 of $2,400 saved for Barcelona.** In `tab-dreams.png`, the Barcelona portrait reads "$0 of $2,400" with a nearly-invisible progress bar. This is because the live `useDreams()` hook is fetching real data from the server (the user who completed onboarding via API did create a dream at 0% saved), and the code in `BTDreams.tsx` line 43 only falls back to `BT_DATA.dreams` when `live.dreams.length === 0`. Since the API returned one dream with `saved: 0`, the design-time data (Barcelona at $870/$2,400) never renders. This exposes the raw $0 empty state which the spec says doesn't exist yet (§8: "empty states — pre-paycheck, pre-first-dream"). Fix: when `d.saved === 0 && d.target > 0`, show a distinct "just started" state: replace the progress bar with the text "Just started — $40/wk auto" and the milestone track shows only the 0% dot filled. Do not show "$0 of $2,400" as a headline serif — it reads as a bug.

- **The three spec dreams (Barcelona / Laptop / Emergency cushion) render for the default user but a real logged-in user only sees their API dream.** The BT_DATA fallback logic means a new API user (who named, say, "Travel fund") sees only their one dream with $0 saved — the designed experience of three richly varied portrait cards never appears unless the user creates three dreams. This is a demo vs. product tension. For the near term, consider keeping the BT_DATA dreams as "examples" below the user's real dreams when `dreams.length === 1`: show one real card, then a dashed-border "You might also want to save for…" teaser of one or two example goals. This is not in scope for the audit to fix, but it's why the screen feels empty.

#### S2 medium
- **The oversized glyph (`fontSize: 160`) overflows the gradient header.** `BTDreams.tsx` line 391: the glyph is `position: "absolute", right: 14, bottom: -36`. The `bottom: -36` intentionally lets the glyph bleed below the header into the card body. But this only works visually because the card has `overflow: "hidden"` at the outer `borderRadius: 22` wrapper (line 375). On React Native web with `overflow: "hidden"`, the SVG/text compositing sometimes clips the glyph at the card boundary instead of letting it bleed. In `tab-dreams.png`, the Barcelona ✺ glyph appears fully clipped. Fix: change `bottom: -36` to `bottom: -8` so the glyph sits entirely within the header bounds. The visual interest of the large glyph comes from its size and opacity, not from bleeding below — keep it inside.

- **The "Name a new dream" dashed border tile is at the very bottom of the scroll, after three large portrait cards.** On a phone viewport the tile is never visible on first load — the user must scroll. This is fine structurally, but the tile's `padding: 22` with centered `+` text at `fontSize: 22` in `t.inkMute` is the lowest-contrast element on the screen. A student with one dream (the empty state) sees this as their only option and it barely reads. Fix: increase contrast — change `color: t.inkMute` to `color: t.inkSoft` for both the `+` and the "Name a new dream" text, and bump the `+` to `BTSerif size={28}` with `color: t.accent`.

- **Tilly nudge in each dream portrait has `breathing={false}` and renders at 28px.** At this size on Bloom (`body: #C3416B`), Tilly is just a small pink egg. The nudge section is meant to be conversational — a brief Tilly observation. Fix: consistent with the suggestion on Credit, remove the 28px Tilly from the nudge row and replace with a left-border accent stripe (3px, `t.accent`) or the ✦ glyph. This frees up 38px of horizontal space and makes the italic serif nudge text wider and more readable.

- **"+ Move money to Barcelona" button hardcodes the first word of the dream name.** `BTDreams.tsx` line 579: `d.name.split(" ")[0]` — so "Barcelona spring" becomes "Barcelona" which is great, but "New laptop" becomes "New" ("+ Move money to New"), and "Emergency cushion" becomes "Emergency" ("+ Move money to Emergency"). Fix: use the full `d.name` but limit to 20 characters: `d.name.length > 20 ? d.name.slice(0, 18) + "…" : d.name`.

#### S3 polish
- **The ContributeModal and NewDreamModal both use full-screen RN `Modal`** with the same architecture the Tweaks panel was fixed to avoid — the modal backdrop covers the tab bar. Since these modals are "task-completing" flows (not navigation), this is acceptable UX (you're in a focused task). However, the `NewDreamModal` `PrimaryButton` has no `accessibilityRole="button"` or `accessibilityLabel`, making it unfindable to screen readers and to Playwright. File: `BTDreams.tsx` lines 181–196. Add `accessibilityRole="button"` and `accessibilityLabel="Add to your dreams"`.

---

### BTProfile

#### S2 medium
- **The hero "You + Tilly" pair uses a `Text` "+" connector at `fontSize: 18, color: t.inkMute`.** `BTProfile.tsx` line 76: the `+` character is a plain `Text`. It renders in the default sans font at `inkMute` (low-contrast muted) between two 64px elements. It reads as an afterthought — "Maya [muted text] [Tilly bird]". The spec says "visually a pair." Fix: replace with a short `BTRule vertical` or a subtle `✦` glyph in `t.accentSoft` color, or simply use a tighter gap (12px instead of 18px) with no connector character. The connection should be spatial, not typographic.

- **The tone tuner live-preview card has no visual differentiation between tones beyond the text changing.** `BTProfile.tsx` lines 136–159: all three tones render the preview in the same `t.surfaceAlt` card with the same `t.ink` italic serif text. When the user taps "Coach" vs "Quiet," only the words change — there's no color shift, no visual signature. For a screen whose entire purpose is showing how Tilly talks to you, this is flat. Fix: tint the preview card's background with a subtle tone-specific color: sibling = `t.accentSoft` (warm/familiar), coach = a tint of `t.good` (`rgba(63,135,112,0.12)` on Bloom — encouragement green), quiet = `t.surfaceAlt` (already muted/minimal). One line change per tone.

- **"What I've learned" section headline has split typography.** `BTProfile.tsx` lines 165–169: `"Tilly's notes"` is accent+italic inside a `BTSerif` that reads `", in her own words"` after. The rendered line is: `[pink italic Tilly's notes] [normal ink , in her own words]`. The comma after "Tilly's notes" is in the normal ink color/weight because it's outside the `Text` span. This looks like a rendering artifact. Fix: keep the full phrase italic: `<BTSerif italic>Tilly's notes, in her own words</BTSerif>` — no inline color span needed if the full phrase is unified. If you want the italic + accent on "Tilly's notes" only, move the comma inside the accent span: `"Tilly's notes,"` so the comma shares the accent style.

- **The trusted-people section gradient avatars use `c2 = t.surface` as the end color.** `BTProfile.tsx` line 181: `const c2 = t.surface`. So all three trusted-people avatars have the same light end color, and the gradient goes from `t.accent / t.accent2 / t.warn → t.surface`. The three avatars therefore differ only in their start color, but on Bloom theme `t.accent (#C3416B)` and `t.accent2 (#D89180)` are similar enough that Mom and Priya's avatars look nearly identical (pink → light). Fix: either use more visually distinct gradients (Mom: accent → accentSoft, Priya: good → surface, Jordan: warn → surface), or simplify to solid fill circles (no gradient) using distinct tokens per person.

#### S3 polish
- **Profile timeline: "today" shows "TODAY" in mono caps (`t.accent`) but older entries show "APR 18", "MAR 02", "AUG 2025" — the year on the Aug entry makes it read like a historical archive label, not a memory.** The Aug 2025 entry (spec: "You said money makes you anxious. I said okay, slow.") is from about 8 months ago in story-time. "AUG 2025" in all-caps mono feels like a timestamp on a log file, not a memory Tilly is cherishing. Fix: format past months as "Aug '25" (using sentence-style with abbreviated year) rather than "AUG 2025." Small but changes the emotional register from audit trail to journal entry.

- **The "quiet settings" list items have no toggle controls.** `BTProfile.tsx` lines 250–289: all settings are read-only text rows. "Phishing watch · on" and "Quiet hours · 11pm — 7am" are rendered with values but no affordance to change them. A user looking at this list sees static information, not settings they can control. This is a known gap (§8) but needs a visual cue that these *are* settings. Fix: add a right-facing `>` chevron (14px, `color: t.inkMute`) to each non-memory row, and a small `on/off` badge pill for binary settings. The "Memory · forever — your choice" row already has special emphasis treatment (`emphasize: true`) — preserve that, but give the binary settings toggles even if the tap is a stub.

---

### Memory inspector

#### S1 high
- **Empty state copy is the most broken voice moment in the app.** `MemoryInspector.tsx` line 109: "Tilly hasn't written anything yet. As you talk, she'll start keeping notes — only what's worth remembering." The phrase "she'll start keeping notes" breaks Tilly's voice: Tilly speaks in first person ("I noticed," "I said okay, slow"). Even in the third-person shell of the inspector, the empty state should sound like Tilly wrote it. Fix: "Nothing here yet. Once we've talked a bit, I'll start writing down what matters — only the real things." Sounds like Tilly, not a developer describing Tilly.

- **"Forget" action has no undo affordance.** `MemoryInspector.tsx` lines 269–282: tapping "forget" calls `onForget(m.id)` which fires `useForgetMemory().mutate(id)`. There's no confirmation, no undo toast, no 5-second grace period. For a feature the spec describes as the "trust contract" — "the chance to forget a specific entry — user-controlled, no friction" — this is appropriately frictionless for the action. But "no friction" should not mean "no feedback." After a forget, the entry should visually dismiss (slide out or fade) rather than the list just silently updating on the next refetch. Fix: add an optimistic update that immediately sets `opacity: 0` with a 300ms fade transition on the forgotten entry before the API call resolves. This is UX confirmation without friction.

#### S2 medium
- **Export button is always visible even with 0 memories.** `MemoryInspector.tsx` line 125: the `BTRule` and export `Pressable` render unconditionally below the memory list — even when the empty state is shown. A user with no memories sees the empty state text and then immediately below it: a hairline rule and an "Export as markdown" button for data that doesn't exist. Fix: conditionally render both the rule and the export button only when `list.length > 0`.

- **"Copied to clipboard" success state never resets.** After export, `exportMem.isSuccess` remains `true` until the component unmounts. If the user exports, closes the inspector, and reopens it, the button reads "Copied to clipboard" immediately without them having done anything. Fix: use `setTimeout` to reset the mutation state after 3 seconds, or manage the label with local `useState` that resets on close.

#### S3 polish
- **The trust contract footer uses `t.accentSoft` background.** On Bloom, `accentSoft = #F1CFD4` — a warm pink. Against the Bloom `t.bg = #F6E8E6` (another warm pink), the footer card barely reads as a distinct surface. The rule and padding are doing all the separation work. Fix: use `t.surfaceAlt` as the background with a `t.accent` left border (3px) — this gives the trust block a visual signature without the "alert" feel of the current pink-on-pink.

---

### Tweaks panel

#### S2 medium
- **Theme picker swatches have an incorrect active state.** `TweaksPanel.tsx` lines 143–155: active state uses `backgroundColor: active ? t.surfaceAlt : t.surface` and `borderColor: active ? t.ink : t.rule`. The difference between `surfaceAlt` and `surface` on Bloom is approximately 15% lightness — barely visible. Fix: give the active theme button `backgroundColor: t.ink` with text `color: t.surface` (same as the active tone in BTProfile's tone tuner). This makes the selection state unambiguous.

- **Time of day selector ("Morning" / "Evening") has no effect that is immediately visible to the user.** Tapping "Evening" in the Tweaks panel changes `time` in BTContext, which changes `BTHome`'s `dayLabel` and `greeting`. But: (a) the Tweaks panel covers the screen content, so the change is invisible until the panel closes, and (b) the greeting change on the Home tab requires navigating back to Home to see it. The Tweaks panel currently has no live preview of what changes. For tone, the BTProfile screen provides live preview. For theme, the panel itself re-renders in the new theme (visible immediately). For time-of-day, nothing. Fix: add a one-line preview below the time picker: a small BTLabel showing the result: "Morning → 'Hey Maya.'" vs "Evening → 'Good evening, Maya.'" — the current greeting function output.

#### S3 polish
- **The drag handle at the top of the sheet (`width: 36, height: 4`) is not draggable.** It looks like a drag handle (iOS convention) but it does nothing — you can only dismiss by tapping the backdrop. Either make it draggable (complex) or remove it entirely and replace with a `×` close button in the top-right, which has a clear affordance. The fake drag handle is more confusing than no handle.

- **Panel closes by tapping backdrop but not by tapping the "✦ tweaks" button again.** `TweaksPanel.tsx` `TweaksToggle` sets `open = true` on press. There's no "toggle" — pressing the tweaks button while the panel is open does nothing (the backdrop blocks the tap anyway, but if it didn't, a second press should close). Minor, but worth noting.

---

### Admin /admin/tilly

The admin page (`server/templates/admin-tilly.html`) is functionally excellent — clean Paper theme, correct type system (Instrument Serif headlines, Inter body, JetBrains Mono labels), compact card layout. Two issues worth flagging:

#### S2 medium
- **The admin is locked to Paper theme hardcoded in CSS variables.** This is intentional (admin is a tool, not the product) but if you ever add dark-mode support to the admin, the colors are all hardcoded in `:root {}` rather than using a theme-swappable approach. Not urgent.

- **`<code>` elements inside `.hint` texts inherit the page font (Inter) not JetBrains Mono.** Lines 143, 147: `<code>anthropic/claude-sonnet-4</code>` renders in the default Inter font because there's no `code { font-family: ... }` rule. Fix: add `code { font-family: "JetBrains Mono", Menlo, monospace; font-size: 0.9em; background: var(--surface-alt); padding: 2px 6px; border-radius: 4px; }` to the admin stylesheet. Keeps the technical copy feeling deliberate.

#### S3 polish
- **The admin heading "Tune Tilly." has italic accent on "Tilly" but the page `<title>` reads "Tilly admin · BuildTogether" — breaking the editorial voice convention.** A small thing, but the spec is consistent about reversed/sentence-style casing. Change `<title>` to "Admin · Tilly — BuildTogether" to match the on-page hierarchy.

---

## Cross-cutting issues

### Typography

1. **`BTSerif` `lineHeight` is `size * 1.1`.** At size 44 (BTHome "Hey Maya.") this is `lineHeight: 48.4`. Correct. But at size 28 (BTDreams hero, BTProfile hero), `lineHeight: 30.8` is tight for a two-line serif headline that wraps. The Dreams screen headline "set aside this year. About $4.20 / a day." wraps across two lines and the leading is cramped. Spec says "real whitespace." Fix: use `size * 1.25` for sizes ≤ 30, `size * 1.1` for sizes > 30. Change in `atoms.tsx` line 45: `lineHeight: size > 30 ? size * 1.1 : size * 1.25`.

2. **`BTNum` is used for the 38% utilization figure on Credit but not for the score number (704).** The score `704` at `fontSize: 44` uses a plain `Text` with `fontFamily: BTFonts.serif` (lines 162–170 in `BTCredit.tsx`) rather than `BTNum`. `BTNum` applies `fontVariant: ["tabular-nums"]` which keeps digit widths consistent. For numbers that pulse or animate, this matters. Use `<BTNum size={44} color="#FFFCF6">{c.score}</BTNum>`.

3. **`BTFonts.serif = "InstrumentSerif_400Regular"` is used directly in several places where italic is needed but `BTFonts.serifItalic` exists.** Specifically: `BTHome.tsx` line 63 uses `fontFamily: BTFonts.serif` with `fontStyle: "italic"` on the accent number. On web this works (browsers synthesize italic), but on native iOS/Android, RN will not synthesize italic from a regular face — it'll fall back to system font or render as upright. The `BTFonts.serifItalic` constant was defined specifically for this case. Fix: replace `fontFamily: BTFonts.serif` + `fontStyle: "italic"` with `fontFamily: BTFonts.serifItalic` everywhere italic is needed. Affected files: `BTHome.tsx` line 63, `BTProfile.tsx` lines 166–167, `BTCredit.tsx` line 48, `BTDreams.tsx` lines 56–57, `Onboarding.tsx` multiple, `SignInScreen.tsx` multiple.

### Spacing

4. **The `paddingTop: 36` on screen `contentContainerStyle` is inconsistent with how the Tweaks button (`top: 18`) overlaps.** Every screen uses `paddingTop: 36` for the ScrollView, but the Tweaks toggle is `position: absolute, top: 18`. On Home, the Tilly mascot is in the top-right so the Tweaks button sits above it with visual purpose. On Spend, Credit, and Dreams, the first element is a label/banner at `paddingTop: 36` but the Tweaks button at `top: 18` sits within that padding zone. In `tab-spend.png`, the Tweaks button sits at the same horizontal level as the "FRIDAY LANDS / Paycheck" banner text — it's a z-index conflict that works visually only because the banner is centered and the button is right-aligned. More padding or a different Tweaks placement is needed. Fix: increase `paddingTop` to 52 on Spend/Credit/Dreams screens, OR give the Tweaks button `top: 8` so it clearly sits in the chrome zone above the content.

5. **`gap` values across cards are inconsistent.** BTHome uses `gap: 22` in the scrollview. BTSpend uses `gap: 22`. BTCredit uses `gap: 20`. BTDreams uses `gap: 22`. BTProfile uses `gap: 26`. These small differences are imperceptible but reflect an unresolved token. The spec doesn't name a gap token but one should be established: `S_GAP_SCREEN = 22` as the canonical scrollview gap, applied consistently.

### Color / Contrast

6. **`t.inkMute` on `t.bg` fails WCAG AA in Bloom theme.** Bloom: `inkMute = #A1838A`, `bg = #F6E8E6`. Contrast ratio: approximately 2.7:1. This fails 4.5:1 (normal text) and 3:1 (large text 18px+/bold 14px+). Affected everywhere `BTLabel color={t.inkMute}` is used: all section headers, the VantageScore label, the day-bar dollar amounts. This is the primary accessibility failure in the app. Fix for Bloom: darken `inkMute` from `#A1838A` to `#7A6068` — this brings contrast to approximately 3.8:1 on `bg` and passes the large-text threshold (most `BTLabel` uses are 11px bold, which requires 3:1 for bold text ≥14px per WCAG — but 11px bold is still in the small text category requiring 4.5:1). The safest fix: darken `inkMute` to `#6B5058` which hits 4.6:1.

7. **The `t.rule` borderColor on white-surface cards in Bloom is nearly invisible.** `rule: "rgba(42,26,28,0.10)"`. On `surface: #FCF3F1`, this border renders at approximately 1% lightness difference. Cards float on the page with no visible container — which is intentional for the editorial feel (spec: "paper-feeling"), but on the web render where background colors aren't perfectly calibrated, the cards look uncontained. This is a design judgment call: either increase rule opacity to 0.15–0.18 for Bloom, or explicitly lean into the borderless approach by removing `borderWidth: 1` from `BTCard` when the card color is very close to `t.bg`. Not a hard bug, but worth monitoring across devices.

### Animation

8. **Breathing animation is present on the Tilly tab icon when the Tilly tab is active, but not on the Home Tilly (despite breathing=true).** Looking at the screenshots: in `00-bthome-loaded.png`, Tilly at `size=84` with `breathing=true` should be pulsing — this can't be assessed from a static screenshot, but the halo is a fixed flat circle rather than a radial gradient, so if the pulse fires it scales a flat pink circle rather than a soft glow. The halo is not a radial gradient — it's `backgroundColor: t.accentSoft` at `opacity: 0.6`. On web this renders as a flat circle. The spec says "soft accent halo behind her (radial gradient)." Fix: in `Tilly.tsx` lines 69–81, replace the `backgroundColor: t.accentSoft` View with a `LinearGradient` fading from `t.accentSoft` at center to transparent at edges. On React Native web with expo-linear-gradient, use `colors={[t.accentSoft, "transparent"]}` in a square View — it won't be a true radial but approximates one.

---

## What's working well — don't break this

1. **The ink hero balance card on BTHome** is the best surface in the app. Ink background, diagonal stripes, faded cents, the accent chip — this is the editorial-fintech aesthetic realized. Do not simplify or "clean it up."

2. **The paycheck shimmer banner on BTSpend** is beautiful. The skewed diagonal light sweep is subtle and satisfying. The ✦ glyph, mono "FRIDAY LANDS" label, and serif paycheck amount are perfectly sized and spaced.

3. **The BTProfile memory timeline** — the vertical rail, pulsing accent dot on the most recent entry, italic serif quotes with mono-caps dates — is the most differentiated UI in the app. The "oldest entry" format (Aug 2025 founding memory) and the incremental commitments are genuinely moving when you read them in sequence. This is the thing that makes the product feel real.

4. **The BTCredit score card** — ink bg, diagonal stripes, 704 at large serif, "good" accent pill top-right — holds up. The stripes are doing real work here separating the VantageScore surface from the gauge card above it.

5. **The Tilly typing indicator** (three dots with staggered bounce and opacity fade) is well-tuned — 180ms offset, 420ms per dot, smooth easing. Don't accelerate it or change the opacity range.

6. **The tone tuner live-preview** on BTProfile is the right interaction model: instant feedback, same Tilly avatar, italic serif — you feel the voice change rather than being told it changed.

7. **The bottom tab bar** — 9px mono-caps labels, serif glyphs, breathing Tilly in the Tilly slot, accent color for active — is clean and feels designed. The `Today` glyph (○) and `You` glyph (◍) in particular feel editorial and specific.

8. **The dream portrait card gradient headers.** The Barcelona sunset, laptop purple-blue, and cushion green are distinct and specific — they feel authored, not randomly generated. The oversized glyph at 18% opacity with the `DiagonalLines` texture creates real depth.

---

## Top 10 fixes ranked by ROI

These are ordered by impact-per-effort. Each can be done in a single focused session.

| # | Fix | Screen(s) | Severity | Time |
|---|---|---|---|---|
| 1 | **Replace seed chat with a real Tilly greeting on first load.** The fake Maya conversation is the single most jarring moment in the app for a real user. When `messages.length === 0`, render `tone.greeting(userName)` + `tone.sample` as Tilly's opening. | BTGuardian | S1 | 30 min |
| 2 | **Fix `t.inkMute` contrast in Bloom theme.** Darken from `#A1838A` to `#6B5058`. Affects every `BTLabel` across all screens — one token change in `theme.ts`. | Global | S2 (accessibility) | 5 min |
| 3 | **Add empty-state handling for $0 dream progress.** When `d.saved === 0`, show "Just started" copy instead of "$0 of $2,400" serif headline. A new user's first dream shouldn't open on a $0 state that reads as a bug. | BTDreams | S1 | 45 min |
| 4 | **Replace `fontFamily: BTFonts.serif` + `fontStyle: "italic"` with `BTFonts.serifItalic` across all italic serif spans.** Native iOS/Android fail to synthesize italic — browsers paper over this. One find-replace across 6 files. | Global | S1 (native) | 20 min |
| 5 | **Change "soft spot" chip to `accentSoft` bg + `accent` fg** (currently `accent` bg + white fg). The chip should feel observational, not alarming. | BTSpend | S2 | 5 min |
| 6 | **Move day-bar pulse ring inside the bar View and fix its positioning** so it doesn't collide with the day letter. | BTSpend | S1 | 20 min |
| 7 | **Add onboarding step indicator** — 5 dots, active = `t.accent`, centered above the card. Required for basic usability orientation. | Onboarding | S1 | 30 min |
| 8 | **Wire Tilly subtitle in BTGuardian to `tone.voice`** instead of hardcoded "calm, wise, plainspoken." One line change, immediately correct across all tones. | BTGuardian | S2 | 2 min |
| 9 | **Add focus state to all `TextInput` fields** (SignInScreen, Onboarding, BTDreams modals). `onFocus`: `borderColor: t.accent`. `onBlur`: `borderColor: t.rule`. Required for WCAG 2.4.7 and basic web usability. | SignIn, Onboarding | S2 | 45 min |
| 10 | **Fix the MemoryInspector empty state voice** — replace developer-describing-Tilly with Tilly's first-person voice. Also conditionally hide the export button and rule when `list.length === 0`. | Memory Inspector | S1 (voice) | 10 min |
