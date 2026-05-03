# Tilly — Security Notes (Plaid Production Access Evidence)

This folder collects the artifacts requested by Plaid's production-access
security questionnaire (Q4 — phishing-resistant MFA).

## What we implemented

Tilly enforces **device-bound, biometric-gated MFA** before any user can
launch Plaid Link or exchange a public token. The flow:

1. After signing in (email / Apple / Google), the user is prompted to
   enroll a passkey on first attempt to connect a bank.
2. The mobile app generates an **Ed25519 keypair locally** using
   `@noble/ed25519` seeded with `react-native-get-random-values`.
3. The **private key never leaves the device**. It is written to the
   platform Keychain (iOS) or Keystore (Android) via
   `expo-secure-store` with `requireAuthentication: true`. iOS uses the
   Secure Enclave and gates retrieval behind Face ID / Touch ID /
   passcode; Android uses `BiometricPrompt`.
4. **Enrollment is a two-step challenge–response ceremony with anti-
   bootstrap step-up:**
   - Client calls `/api/auth/passkey/register/options`. The server checks:
     - **First credential ever** — the session must be from a fresh
       login (created within the last 10 minutes). This stops an
       attacker who steals a long-lived session from silently adding
       their own key.
     - **Adding another credential** — the session must already be
       passkey-verified within the freshness window (12 h). This means
       a new key can only be added by someone who already controls an
       existing one.
     - If step-up fails, the server returns `403 PASSKEY_STEP_UP_REQUIRED`.
   - On success the server issues a 32-byte single-use challenge.
   - The client signs `(publicKey ‖ challenge)` with the new private
     key (proves possession of the matching key) and posts it to
     `/api/auth/passkey/register/verify`. The server **verifies the
     Ed25519 signature** before storing the public key. Without this
     proof an attacker with a session token could submit any public key
     and falsely claim a verified MFA factor.
5. Before each Plaid action, the client requests a 32-byte challenge
   from `/api/auth/passkey/authenticate/options`, retrieves the
   private key (which triggers the Face ID prompt — this is the screenshot
   for Plaid), signs the challenge, and submits it to
   `/api/auth/passkey/authenticate/verify`.
6. The server verifies the Ed25519 signature, stamps
   `sessions.passkey_verified_at`, and only then does
   `requirePasskeyVerified` middleware permit any of the sensitive
   Plaid endpoints:
   - `POST /api/plaid/link-token`
   - `POST /api/plaid/exchange`
   - `GET  /api/plaid/items/:coupleId`
   - `DELETE /api/plaid/items/:itemId`
   - `POST /api/plaid/sync/:coupleId`
   - `GET  /api/plaid/pending/:coupleId`
   - `POST /api/plaid/pending/:plaidTxnId/accept`
   - `POST /api/plaid/pending/:plaidTxnId/ignore`

   `GET /api/plaid/status` is intentionally exempt — it only reports
   whether the deployment has Plaid configured and exposes no user
   data. Verification is fresh for 12 h, then re-prompted.

This satisfies "phishing-resistant MFA" because:

- The factor is **device-bound** (a phishing site cannot replay a
  signature signed by a key that lives in another phone's Secure
  Enclave).
- The factor is **biometric-gated** (an attacker who steals the phone
  still cannot use the key without the user's face/finger/passcode).
- The challenge is **server-issued and single-use** (rotates per
  request, 5-minute TTL, deleted on verify).

## How to capture the screenshot Plaid asked for

Plaid's reviewer wants a screenshot of the MFA prompt. To capture it:

1. Sign in to the Tilly mobile app on a real iOS device (iOS Simulator
   does not display the Face ID system sheet).
2. Tap **Connect bank** on the Home or You → Bank connections screen.
3. Accept the privacy disclosure ("I understand, continue").
4. The system Face ID sheet appears with the prompt
   *"Verify with Face ID to connect your bank"*. Take a screenshot
   (Side button + Volume Up).
5. Save the file under `docs/security/screenshots/face-id-plaid-gate.png`
   and upload it as the Q4 evidence in the Plaid dashboard.

For the **enrollment** screenshot (also useful for Plaid):

1. Sign out, then sign back in on a fresh install (or delete the local
   passkey from **You → Security → Passkeys**).
2. Tap **Connect bank** → the enrollment sheet
   *"Protect your bank with Face ID"* appears.
3. Tap **Set up Face ID** → the system Face ID sheet shows
   *"Set up Face ID for bank access"*. Screenshot here too.

## Why a custom Ed25519 ceremony instead of `@simplewebauthn/server` + WebAuthn?

The phishing-resistance properties Plaid Q4 cares about — device-bound
hardware-backed key, biometric unlock, server-issued challenge, signed
assertion — are achieved by both designs. We picked the custom Ed25519
flow over the WebAuthn standard libraries for these concrete reasons:

1. **WebAuthn on React Native / Expo is not first-class today.**
   `react-native-passkeys` requires Expo dev builds (no Expo Go),
   modern OS versions (iOS 16+ / Android 9+), AND a registered
   associated domain (`apple-app-site-association`,
   Digital Asset Links) tied to a stable production hostname. Tilly
   does not yet have a finalized production domain locked in, and the
   evidence is needed before that's true.
2. **The on-device key store is the same.** Both designs end up with
   a hardware-backed key in the iOS Secure Enclave / Android Keystore
   gated by `LAContext` / `BiometricPrompt`. We use `expo-secure-store`
   with `requireAuthentication: true`, which is the same OS API
   `react-native-passkeys` calls under the hood.
3. **The server-side trust model is identical.** Server issues a
   single-use 32-byte challenge, client signs it with the device-bound
   private key, server verifies the signature against a stored public
   key it accepted at enrollment time after verifying a separate
   challenge. WebAuthn adds RP-ID/origin binding on top, which on a
   native mobile app reduces to "the OS knows which app is asking" —
   already enforced by iOS app code-signing + Keychain access groups
   that scope the key to this bundle ID.
4. **Phishing resistance does not require WebAuthn.** Plaid's Q4 asks
   for a phishing-resistant factor; the operative properties are
   "device-bound" and "non-replayable", both of which this design
   provides. A phishing site cannot replay a signature signed by a
   key that lives in another phone's Secure Enclave behind Face ID.

If/when Tilly registers a stable production domain and ships dev
builds via TestFlight/Play, swapping to `react-native-passkeys` +
`@simplewebauthn/server` is a drop-in replacement for the ceremony
without changing the server's gating model. That migration is tracked
as a follow-up; it is **not** a blocker for the Plaid Q4 attestation.

## Files

- `artifacts/api-server/server/routes/passkey.ts` — server endpoints +
  `requirePasskeyVerified` middleware.
- `artifacts/api-server/shared/schema.ts` — `user_credentials` and
  `passkey_challenges` tables, `sessions.passkey_verified_at` column.
- `artifacts/buildtogether/client/lib/passkey.ts` — mobile Ed25519
  key management + biometric gate.
- `artifacts/buildtogether/client/components/PasskeyGate.tsx` — the
  enroll/verify modal sheet.
- `artifacts/api-server/server/routes.ts` — Plaid endpoints gated by
  `requirePasskeyVerified` (full list above).
- `docs/security/screenshots/` — drop point for the device screenshots
  the Plaid reviewer requires (captured manually on a physical phone).
- `docs/security/plaid-credentials.md` — rotation runbook for the
  Plaid `client_secret` and the one-time sandbox → production switch
  on the deployed API server.
