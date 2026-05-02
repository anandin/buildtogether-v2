# BuildTogether V2 (Tilly) — Test Plan

This is the verification plan for the overnight Phase 1–5 build. Each
scenario is mapped to a phase, an expected outcome, and the proof
artifact (screenshot or response body) saved under
`/test-results/`.

The live deployment under test:

- **Web app**: https://buildtogether-v2.vercel.app/app
- **Admin page**: https://buildtogether-v2.vercel.app/admin/tilly
- **API base**: https://buildtogether-v2.vercel.app/api
- **Health**: https://buildtogether-v2.vercel.app/api/health

Verified at session start:
- `db.ok: true` — Neon Postgres connected
- `ai.configured: true`, `provider: openrouter` — OpenRouter wired
- Latest commit `55ca877` (Phase 5)

---

## What's actually testable from this Windows host

| Scenario | Can test here? | Why / why not |
| --- | --- | --- |
| Web app sign-in screen | ✅ Yes | Static React render |
| Onboarding 5-card flow | ✅ Yes | Renders in web build |
| BTHome / BTGuardian / BTProfile / BTDreams / BTSpend / BTCredit | ✅ Yes (web build) | Same RN code via Expo web |
| Real Tilly chat reply | ✅ Yes | Hits live OpenRouter |
| Memory inspector + RAG retrieval | ✅ Yes | Hits live DB |
| Admin /admin/tilly (server-rendered HTML) | ✅ Yes | Plain HTML over API |
| Admin saves config + preview | ✅ Yes | Live API |
| Plaid native sheet (iOS / Android) | ❌ No simulator | Requires phone |
| Push notifications | ❌ No device | Requires APNs/FCM |
| Real bank connection | ❌ Partial | Plaid Sandbox public token works in web Plaid Link |
| App Store / Play Store builds | ❌ No EAS run | Requires `eas build` execution |

---

## Test scenarios

### Phase 1 — Foundation

| ID | Scenario | Expected | Proof |
| --- | --- | --- | --- |
| 1.1 | `GET /api/health` returns ok + db ok + openrouter configured | 200 with `db.ok=true`, `ai.configured=true`, version=latest commit | `health.json` |
| 1.2 | Web app loads at `/app` | 200, renders sign-in screen | `01-signin.png` |
| 1.3 | Real fonts (Instrument Serif, Inter, JetBrains Mono) load | Headlines render with serif, labels render mono | Visible in screenshots |

### Phase 2 — Today + Tilly chat real

| ID | Scenario | Expected | Proof |
| --- | --- | --- | --- |
| 2.1 | Email register works | 201 with `{token, user}` | `register.json` |
| 2.2 | Bearer token authenticates session | `/api/auth/session` returns user | `session.json` |
| 2.3 | Onboarding gate blocks BTApp until complete | `/api/household/onboarding-status` returns `hasCompletedOnboarding=false` for new user | `onboarding-status.json` |
| 2.4 | Onboarding 5-card flow completes | Final card calls `complete-onboarding`, returns `{ok: true}` | `02-onboarding-welcome.png` … `06-onboarding-commit.png` |
| 2.5 | BTHome renders with Tilly greeting from Claude | Real greeting, not BT_DATA "Hey Maya." | `07-bthome.png` |
| 2.6 | BTGuardian sends message, gets Claude reply | Reply text persists to `guardian_conversations` | `08-bttilly-chat.png` + `chat-reply.json` |
| 2.7 | Affordability question gets quick-math card | Reply is `kind=analysis` with rows[] + note | `09-bttilly-analysis.png` |
| 2.8 | Memory pill opens MemoryInspector | Modal shows timeline + export button | `10-memory-inspector.png` |

### Phase 2.5 — OpenRouter + RAG + Admin

| ID | Scenario | Expected | Proof |
| --- | --- | --- | --- |
| 2.5.1 | `/admin/tilly` loads HTML | 200, shows auth modal until token entered | `11-admin-auth.png` |
| 2.5.2 | Admin auth allows config load | Config form populated with current values | `12-admin-config.png` |
| 2.5.3 | Admin save updates `tilly_config` | PUT returns updated row, factory cache invalidated | `admin-save.json` |
| 2.5.4 | Live preview hits real OpenRouter | Returns Tilly reply with usage tokens | `13-admin-preview.png` |
| 2.5.5 | Memory stats endpoint shows counts | `total/active/archived/withEmbedding` plus `byKind` | `memory-stats.json` |
| 2.5.6 | Embedding flow: chat creates memory with embedding | After chat, `tilly_memory.embedding` is populated | `embeddings-after-chat.json` |
| 2.5.7 | Hybrid retriever surfaces relevant past memory | Second chat references first chat's content | `chat-with-rag.json` |

### Phase 3 — Dreams + Auto-save

| ID | Scenario | Expected | Proof |
| --- | --- | --- | --- |
| 3.1 | `POST /api/dreams` creates dream | Returns dream with gradient, glyph, weeklyAuto | `dream-create.json` |
| 3.2 | BTDreams renders portrait card | New dream shows with milestone track | `14-btdreams.png` |
| 3.3 | Contribute increments savedAmount + writes goal_contributions | After contribute, savedAmount += amount | `dream-contribute.json` |
| 3.4 | Cron `/api/cron/auto-save` is idempotent | Second run skips dreams contributed within 6 days | `cron-auto-save.json` |

### Phase 4 — Spend + Credit + Subscriptions

| ID | Scenario | Expected | Proof |
| --- | --- | --- | --- |
| 4.1 | `/api/tilly/spend-pattern` returns `ready=false` with no Plaid | Sensible empty state | `spend-pattern-empty.json` |
| 4.2 | BTSpend renders with BT_DATA fallback | Headline/bars/categories render | `15-btspend.png` |
| 4.3 | `/api/tilly/credit-snapshot` returns ready=false with no Plaid | `reason=no_plaid_items` | `credit-snapshot-empty.json` |
| 4.4 | BTCredit renders with BT_DATA fallback | Utilization gauge renders | `16-btcredit.png` |
| 4.5 | `/api/subscriptions/scan` returns gracefully w/o Plaid | `errors: ['plaid_not_configured']` | `subs-scan.json` |

### Phase 5 — Profile + Splits + Push + Stores

| ID | Scenario | Expected | Proof |
| --- | --- | --- | --- |
| 5.1 | BTProfile renders timeline + tone tuner | Timeline reads useMemory; tone tuner has live preview | `17-btprofile.png` |
| 5.2 | Tone change syncs to server | PUT `/api/tilly/tone` returns the new tone | `tone-set.json` |
| 5.3 | `POST /api/household/members` adds trusted person | Returns member with role/scope | `member-add.json` |
| 5.4 | Trusted person appears in BTProfile | Card with name + scope renders | `18-btprofile-trusted.png` |
| 5.5 | `POST /api/splits/draft` returns Venmo deeplink | Has `venmoUrl` starting with `venmo://paycharge?` | `split-draft.json` |
| 5.6 | `POST /api/push/register` accepts a token | Returns `{ok: true}` for an `ExponentPushToken[...]` value | `push-register.json` |
| 5.7 | `POST /api/protections/scan` runs detectors gracefully w/o Plaid | Returns `flagged: 0` with detector counts | `protections-scan.json` |

---

## Execution

All scenarios run via `test-results/run-tests.js` (Playwright) and direct
`curl`/`fetch` for API-only checks. Output saved to:

- `test-results/screenshots/*.png` — visual proofs
- `test-results/api-responses/*.json` — JSON proofs
- `test-results/results.md` — pass/fail summary
- `test-results/console-log.txt` — full log

## What this run can NOT prove

These remain manual-test items because they need physical hardware,
production-only Plaid features, or a build pipeline I can't trigger
from this host:

1. Plaid Link bank connection on iOS/Android — needs a phone with the
   app installed and an EAS dev build
2. Push notifications actually arriving — needs APNs/FCM credentials
   plus a device
3. Plaid Transfer auto-debit moving real dollars — Plaid Transfer is
   gated to production-approved accounts; sandbox has no transfer
   product. Phase 3 ships internal-accounting auto-save which is
   testable on this host.
4. App Store / Play Store submission — needs `eas submit`, app store
   credentials, and signed builds

A separate manual checklist for these is at the bottom of
`test-results/results.md` after the autonomous run completes.
