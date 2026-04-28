# After UI fix pass — what changed

Re-ran the click-through audit on commit `d384064` against the live deploy.

## Side-by-side visual comparison

| Surface | Before (`57dbeb4`) | After (`d384064`) |
| --- | --- | --- |
| Sign-in | V1 purple "Build Together" with Nunito, old logo | BT aesthetic — paper bg, Tilly with halo, "I'm *Tilly*." Instrument Serif, mono caps labels, ink primary button. See `clickthrough/v2-signin.png`. |
| Tilly chat suggested-prompts | Giant empty ovals filling half the screen | Proper 36px-tall pill row, pills sit cleanly above the input. See `clickthrough/tab-tilly.png`. |
| Tilly chat reply formatting | Raw markdown — backticks, asterisks visible as text | Clean ledger lines, asterisks rendered as italic accent (e.g. `*$49 of breathing room*` shows as italic accent serif). |
| Tilly mascot | Round 32×30 pink bird, large 5px eyes — "preschool" | Taller egg silhouette 28×35, smaller close-set eyes 3px, leaner beak, single feather flick. Reads calmer / more deliberate. |
| BTSpend "+" FAB | Square clipped weirdly at bottom | Proper round 56px circle with boxShadow on web, sits above tab bar. |
| Tweaks panel | Modal backdrop covered tab bar — felt like Spend was broken | Slide-up panel anchored at `bottom:80` with backdrop stopping at tab bar — tabs stay reachable. |
| Onboarding/CTA buttons | Playwright couldn't find them as buttons | All have `accessibilityRole="button"` + `accessibilityLabel`. |

## What still needs polish (small)

1. **BTSpend FAB hovers over the last category card** — fixed in this pass
   by bumping `paddingBottom` from 140 to 180 on the ScrollView.
2. **Tilly chat first-time experience** — when no chat history exists, the
   surface starts with just the input. Could add a "Hey, I'm Tilly. What's
   on your mind?" greeting bubble.
3. **Memory writer still occasionally returns 0 rows** — the schema is
   relaxed now but the model sometimes correctly decides "this exchange
   wasn't durable." Need a few more turns to verify.

## Process correction

The earlier test ran headless and used API-direct calls for the LLM-heavy
flows. That meant the screenshots passed visual checks (the screen had
*some* render) but missed:
- RN-web horizontal ScrollView height collapse
- Markdown bleed-through
- FAB shadow loss
- Modal backdrop hit-area issues
- Native-only module crashes (already caught earlier)

The click-through script (`test-results/scripts/clickthrough.js`) now drives
the UI like a user would — clicks tabs, types into inputs, opens panels,
captures screenshots **after** each interaction. This is the test pattern
to use going forward.

## Process checklist for future UI changes

Before claiming a UI change is done, run:

```sh
cd C:/Users/anand/.claude/plugins/cache/playwright-skill/playwright-skill/4.1.0/skills/playwright-skill
node run.js C:/Projects/BuildtogetherV2/test-results/scripts/clickthrough.js
```

Then OPEN the screenshots in `test-results/clickthrough/` and look at them.
Don't trust pass-counts. Don't trust API responses. Trust pixels.
