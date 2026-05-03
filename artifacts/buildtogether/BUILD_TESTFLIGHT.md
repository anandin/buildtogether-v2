# Build Tilly for TestFlight (Plaid Q4 evidence)

We need a real iOS build (not Expo Go) so the OS Face ID sheet says
**"Tilly wants to use Face ID"** instead of "Expo Go wants to use Face ID".
Plaid's reviewer needs to see your branded app gating bank access, not the
Expo Go sandbox.

This guide gets you from zero to a TestFlight build you can install on your
own iPhone in ~30–45 minutes (most of it waiting for the EAS cloud build).

## What I (the agent) already set up

- `eas.json` — build profiles for `development`, `preview`, and `production`.
- `app.json` — added `NSFaceIDUsageDescription`, registered the
  `expo-local-authentication`, `expo-secure-store`, and
  `expo-apple-authentication` plugins so the native build wires Face ID,
  Keychain, and Sign in with Apple correctly.
- The crypto.subtle crash fix from task #14 is already in.

You don't need to touch any code. The remaining steps are credentials and
running the EAS cloud build, which require your own accounts.

## What you need before you start

- **Free Expo account** — sign up at https://expo.dev/signup (the build
  itself is free; EAS gives a generous free tier for development builds).
- **Apple Developer Program membership** ($99/year) — required for
  TestFlight. Sign up at https://developer.apple.com/programs/. If you
  already have one, skip.
- The iPhone you want to install on (Face ID-capable). It does NOT need to
  be in any developer mode for TestFlight installs.

## Step 1 — Log in to Expo

In a Replit shell:

```bash
cd artifacts/buildtogether
npx eas-cli@latest login
```

Use your Expo account. You only need to do this once.

## Step 2 — Link the project to EAS

```bash
npx eas-cli@latest init
```

This creates an EAS project ID and writes it into `app.json` under
`expo.extra.eas.projectId`. Commit the change.

## Step 3 — Configure Apple credentials (one-time)

```bash
npx eas-cli@latest credentials
```

Pick **iOS → production → Set up a new distribution certificate**. EAS
will walk you through logging into your Apple Developer account; it
generates and stores the certificate + provisioning profile for you. You
do **not** need to touch Xcode.

## Step 4 — Run the TestFlight build

```bash
npx eas-cli@latest build --profile production --platform ios
```

This kicks off a build on Expo's cloud builders. Expect 15–25 minutes.
You'll see a progress URL printed in the terminal — leave the tab open or
just check back later; EAS emails you when it's done.

## Step 5 — Submit to TestFlight

When the build finishes, in the same shell:

```bash
npx eas-cli@latest submit --profile production --platform ios --latest
```

EAS uploads the `.ipa` to App Store Connect. The first time, it'll ask
for your Apple ID and an app-specific password (generate one at
https://appleid.apple.com → Sign-In and Security → App-Specific
Passwords).

After ~10–15 minutes Apple finishes processing and the build appears in
App Store Connect → My Apps → Tilly → TestFlight. Add your own Apple ID
as an internal tester (Internal Testing → +) — you'll get an email with
a TestFlight install link within a couple of minutes.

## Step 6 — Capture the Plaid screenshots

Install the TestFlight build on your iPhone, then:

1. Sign in (email / Apple).
2. Tap **Connect bank** on Home or You → Bank connections.
3. The in-app **Protect your bank with Face ID** modal appears → tap
   **Set up Face ID**.
4. The OS Face ID sheet now reads **"Tilly" Wants to Use Face ID** with
   the subtitle "Tilly uses Face ID as a second factor to protect your
   bank connection."
5. Side-button + Volume-Up to capture → save as
   `docs/security/screenshots/face-id-enroll.png`.
6. Complete enrollment, then tap **Connect bank** again. The verify Face
   ID sheet appears with subtitle "Verify with Face ID to connect your
   bank." Capture as `face-id-verify.png`.
7. Drop both PNGs into `docs/security/screenshots/` and upload as Q4
   evidence in the Plaid dashboard.

## Troubleshooting

- **"Invalid bundle identifier"** — make sure the bundle ID in
  `app.json` (`com.tilly.app`) is registered in your Apple Developer
  account. EAS will offer to register it for you in step 3.
- **EAS build fails on `pnpm install`** — EAS builders run from the
  project root by default, but this is a pnpm monorepo. If install
  fails, run `npx eas-cli@latest build:configure` to let EAS detect the
  workspace, or set `"build": { "production": { "node": "20.x" } }` in
  `eas.json`.
- **Face ID sheet still says Expo Go** — you're still on the Expo Go
  build, not the TestFlight build. Delete Expo Go from the phone or
  open the TestFlight version explicitly.

## After the screenshot

Once you've captured the evidence, you don't need to keep the
production build active for development. Continue using Expo Go day-to-
day; the TestFlight build is only there to brand the OS prompt for the
Plaid reviewer.
