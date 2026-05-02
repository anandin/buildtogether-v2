# Tilly E2E tests

Functional end-to-end tests against the live deploy at
https://buildtogether-v2.vercel.app, run via Playwright in mobile-emulated
Chromium.

Each scenario logs in as the long-lived QA account, exercises one
feature area click-by-click, captures full-page screenshots into
`test-results/e2e/<run-id>/`, and asserts the expected network calls
fired and the expected DB state landed.

## Running

```bash
# Install playwright once if you haven't (uses the global skill plugin's
# install if available; otherwise install locally):
npm install --save-dev playwright

# Run the whole suite:
npm run e2e

# Run a single scenario:
npm run e2e:one -- scenarios/03-tilly-chat-and-reminders.js
```

Override targets via env vars:

| Var | Default |
| --- | --- |
| `BT_BASE` | `https://buildtogether-v2.vercel.app` |
| `BT_EMAIL` | `riley-qa-2026-04-28@buildtogether.test` |
| `BT_PASSWORD` | `testpass123` |
| `BT_HEADLESS` | `1` (set `0` to watch the browser) |
| `BT_RESULTS_DIR` | `test-results/e2e/<timestamp>` |

## Scenarios

| File | What it covers |
| --- | --- |
| `01-auth-and-nav.js` | Login, all 5 tabs render (Today / Spend / Tilly / Dreams / You) |
| `02-add-expense.js` | + FAB → TEXT save (`POST /api/expenses` → totals update); VOICE + PHOTO tabs render with proper SVG icons |
| `03-tilly-chat-and-reminders.js` | Affordability question → Quick Math card; reminder commitment → `tilly_reminders` row written; × cancel removes row |
| `04-profile.js` | Tone change persists via `PATCH /api/tilly/profile`; Quiet hours / Big-purchase alert / Subscription scan rows open editors; Add trusted person invite sheet opens |
| `05-home-tilly-learned.js` | "Yes, remind me" / "Don't worry about it" buttons fire `POST /api/tilly/learned/{remind,dismiss}` and the card transitions |
| `06-dreams.js` | "+ Move money to Tokyo trip" → contribute sheet opens; "+ Name a new dream" placeholder visible |

## Implementation notes

- **Auth.** Token lives in `localStorage["build_together_auth_token"]`.
  Use `apiCall(page, path, opts)` from `lib/helpers.js` to make
  authenticated `fetch` calls inside `page.evaluate`.
- **Mobile viewport.** All scenarios run at 412×915 (Pixel 7) with
  `isMobile: true` + touch — matches the production target. Don't lazily
  use desktop sizing; many bottom-sheet modals render differently.
- **RN-Web scrolling.** `window.scrollTo` doesn't move RN-Web's
  ScrollView; use `locator.scrollIntoViewIfNeeded()` then
  `locator.click()` (handles intercept retries).
- **Tab labels.** The bottom tab bar uses CSS `text-transform: uppercase`
  so the DOM text is `Today / Spend / Tilly / Dreams / You` (capitalised),
  not `TODAY` etc. The same applies to the AddExpense modal tabs:
  DOM text is `text / voice / photo` (lowercase) styled uppercase.
- **Tab clicks at y≈845.** The tab bar sits above the system nav at
  `y≈845`. Don't synthesise clicks below that line — the OS tab will
  swallow it. Use `locator(...).click()` instead of `mouse.click(x, y)`.
- **Quick Math card** is rendered client-side by parsing Tilly's
  plain-text ledger lines (`"Starting buffer  $312"` etc.). The
  affordability LLM path is best-effort; the card render is a
  deterministic regex fallback. See `client/bt/screens/BTGuardian.tsx`.
