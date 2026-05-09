# Tilly dev workflow — custom dev client (Expo Go replacement)

Plain Expo Go cannot load Tilly anymore. The native Plaid SDK
(`react-native-plaid-link-sdk`) is not bundled into Expo Go, and Apple Sign In
+ Face ID need our own `Info.plist`. The fix is a one-time **custom dev
client**: a Tilly-branded build that contains all our native modules and works
exactly like Expo Go after install (scan QR, OTA updates, fast iteration).

## What you only do once

### 1. Install EAS + log in

```bash
cd artifacts/buildtogether
npx eas-cli@latest login
```

### 2. Link the project to EAS

```bash
npx eas-cli@latest init
```

This writes `expo.extra.eas.projectId` into `app.json`. Then replace the
`REPLACE_WITH_EAS_PROJECT_ID` placeholder in `app.json` `expo.updates.url`
with the same id (the EAS dashboard prints the full
`https://u.expo.dev/<id>` URL after `init`). Commit both changes.

### 3. Build dev clients for your phones

iOS (TestFlight/ad-hoc — needs the Apple Developer account from
`BUILD_TESTFLIGHT.md`):

```bash
npx eas-cli@latest build --profile development --platform ios
```

Android (just a `.apk`):

```bash
npx eas-cli@latest build --profile development --platform android
```

When the cloud build finishes (15–25 min), EAS emails you. iOS installs via
the link in the email (or TestFlight if your team is set up). Android
installs by downloading the `.apk` and tapping it on your phone — allow
"Install unknown apps" once for your browser.

You now have a Tilly Dev Client app icon on your phone, separate from
production Tilly.

## Daily workflow (just like Expo Go used to be)

### Local Metro

```bash
pnpm --filter @workspace/buildtogether run dev
```

The console prints a QR code. Open the **Tilly Dev Client** on your phone
(not Expo Go!), tap **Enter URL manually** or scan the QR. The JS bundle
loads in ~10 s. Bank connections, Face ID, and Apple Sign In all work
because the native modules are baked in.

### OTA updates (the "publish" replacement)

When your changes are JS-only (no new native module, no `app.json` plugin
changes), don't rebuild — push the new bundle over-the-air:

```bash
cd artifacts/buildtogether
npx eas-cli@latest update --branch development --message "<short msg>"
```

Force-quit Tilly Dev Client and reopen — the new bundle downloads on launch.
Anyone else on your team running the dev client gets the same update
automatically.

You only need to rebuild the dev client when:

- you add a new dependency that ships native code (`expo install <pkg>` warns
  when this is the case), or
- you change `app.json` plugins / Info.plist / Android permissions.

## Production builds

For TestFlight + Play Store internal track, use the `production` profile —
see `BUILD_TESTFLIGHT.md` for the iOS path and run the equivalent
`--platform android` for Play. The production channel is separate, so
`eas update --branch production` only touches App Store / Play builds.

## Troubleshooting

- **"Something went wrong" on launch** — your dev client and the JS bundle's
  `runtimeVersion` no longer match. Rebuild the dev client.
- **Phone can't reach the bundler** — same as before; tunnel through `expo
  start --tunnel` if you're on a restricted network.
- **Face ID prompt says "Expo Go"** — you're still on Expo Go. Open Tilly
  Dev Client instead.
- **Plaid Link sheet never opens** — confirm the dev client was built AFTER
  `react-native-plaid-link-sdk` was added to `package.json`. Native deps
  aren't in OTA updates; they require a fresh build.
