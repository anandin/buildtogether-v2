# Run Build Together on a real phone (Expo Go)

The Build Together app is a React Native / Expo app. The Replit web preview
shows the **Expo web** build, but the real target is iOS and Android. Use the
Expo Go app to load the dev build on a physical device.

## 1. Install Expo Go on your phone

- iOS: install **Expo Go** from the App Store
  (https://apps.apple.com/app/expo-go/id982107779)
- Android: install **Expo Go** from the Play Store
  (https://play.google.com/store/apps/details?id=host.exp.exponent)

Open Expo Go once and accept the camera / network prompts.

## 2. Make sure both Replit workflows are running

In the Replit workspace, confirm these two workflows show **Running**:

- `artifacts/api-server: API Server` — the Express backend the phone will
  call for login, sessions, expenses, etc.
- `artifacts/buildtogether: expo` — the Metro bundler that serves the
  JavaScript bundle to your phone.

If either is stopped, click the workflow and press **Restart**.

## 3. Open the project in Expo Go

The Metro bundler prints an `exp://` URL on startup. To find it:

1. Open the **Console** for the `artifacts/buildtogether: expo` workflow.
2. Look for the line that begins with `Metro waiting on`. It looks like:

   ```
   Metro waiting on exp://<repl-id>.<region>.expo.riker.replit.dev
   ```

3. Open that URL on your phone:
   - **iOS**: open the **Camera** app, point it at the QR code printed
     above the URL in the console (or tap the URL on your phone if you've
     opened the Replit workspace there).
   - **Android**: open **Expo Go**, tap **Scan QR code**, and point it at
     the QR code in the console.

   You can also paste the `exp://...` URL straight into Expo Go via
   **Enter URL manually**.

The first launch downloads the JS bundle (~10–20 s on a fast network), then
the splash screen and **sign-in** screen appear.

## 4. Verify it works end-to-end

Once the app loads on the phone:

1. **Sign-in screen renders.** You should see the Tilly mascot, the
   Instrument Serif headline, and the email / password fields.
2. **Create an account.** Tap **Sign up**, enter an email + password, and
   submit. The request goes to
   `https://<replit-dev-domain>/api/auth/register` against the
   `artifacts/api-server` workflow.
3. **Post-login screen renders.** After register/login you should be
   routed into the BT home / onboarding flow (a screen other than
   sign-in). That confirms the JWT was stored in `expo-secure-store` and
   `/api/auth/session` returned a user.
4. **A non-auth data fetch succeeds.** From the post-login screen,
   navigate into the **Spend** / expenses tab (or any screen that lists
   household data). The first time you open it the list will be empty,
   but the network call must succeed. Confirm in the
   `artifacts/api-server: API Server` workflow console that you see a
   line like:

   ```
   GET /api/expenses/<coupleId> 200 in <n>ms
   ```

   (or `/api/categories/<coupleId>` / `/api/couple/<coupleId>` —
   anything other than `/api/auth/*` returning **200** proves the
   bearer token from the phone reached the API and authorized a real
   data query.) If you instead see `401`, the token wasn't sent;
   re-check that login completed and that
   `EXPO_PUBLIC_DOMAIN=$REPLIT_DEV_DOMAIN` is in the Expo workflow
   logs.

If the network request fails, double-check that `EXPO_PUBLIC_DOMAIN` is
populated in the Expo workflow logs (the `dev` script sets it from
`$REPLIT_DEV_DOMAIN`). The mobile client routes all API traffic to
`https://$EXPO_PUBLIC_DOMAIN/api/...`, which the Replit proxy forwards to
the API Server artifact based on its `/api` path mapping.

## Troubleshooting

- **"Something went wrong" / endless splash on the phone** — restart the
  `artifacts/buildtogether: expo` workflow. Metro sometimes loses the
  tunnel after long idle periods.
- **Login/register returns a 500 with `relation "users" does not exist`** —
  the database schema hasn't been pushed. Run:
  ```
  pnpm --filter @workspace/api-server exec drizzle-kit push --force
  ```
  This is only needed once per fresh database.
- **Phone can't reach the bundler** — both your phone and Replit are on
  the public internet, so corporate / school Wi-Fi that blocks
  `*.replit.dev` will break the connection. Switch to cellular or a
  different network.
- **"Apple sign in" button does nothing in Expo Go** — Apple Sign In only
  works in a custom dev build or TestFlight, not in Expo Go. Use the
  email / password flow on the phone.
