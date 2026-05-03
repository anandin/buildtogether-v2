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
  `requirePasskeyVerified` (link-token, exchange).
