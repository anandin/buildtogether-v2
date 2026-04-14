# Mobile Testing Guide

BuildTogether V2 is an Expo app that runs on iOS, Android, and web. The production web build is already live at `https://buildtogether-v2.vercel.app/app`. This guide covers mobile-specific testing.

## Option A: Test via phone browser (fastest, 30 sec)

On your iPhone or Android, open Safari/Chrome and go to:

```
https://buildtogether-v2.vercel.app/app
```

Use incognito mode to avoid cached V1 assets. Sign in as:
- `alex@v2-test.app` / `Test12345!`

The account is pre-seeded with 60 days of realistic expenses and 3 dreams.

**What you'll get:** Full UI, real Guardian AI, real database. The PWA-ish experience is surprisingly close to native.

**What you won't get:** Native haptics, camera (receipt scan opens file picker instead), push notifications.

## Option B: Expo Go (for true native feel)

1. Install Expo Go on your phone
2. On your laptop:
   ```bash
   cd C:/Projects/BuildtogetherV2
   npx expo start
   ```
3. Scan the QR code from the terminal with Expo Go (iOS camera also works)
4. App hot-reloads as you make changes locally

**Caveat:** This loads the full RN app pointed at the Vercel backend. Auth, Guardian, DB all work. But: the RevenueCat subscription flow won't work in Expo Go (requires a dev build or EAS).

## Key mobile UX checks

### Keyboard behavior
- Home screen: GuardianInput stays above keyboard (KeyboardAvoidingView)
- AddExpenseScreen: form fields stay visible when keyboard opens
- SignInScreen, OnboardingScreen, FeedbackScreen: same

### Haptics
Should fire on:
- Send button in GuardianInput (light)
- Save/Confirm buttons (medium)
- Dream card tap (light)
- Tab switch (handled by RN Navigation)
- Onboarding Continue (medium)
- Solo toggle (light)

### Safe areas (iOS)
- StatusRail and GuardianInput both respect safe-area insets
- Tab bar uses `useBottomTabBarHeight()` so content doesn't get hidden
- Keyboard offset uses `headerHeight` so the header doesn't overlap

### Assets
The owl icon (`dream-guardian-icon.png`) is imported via `import x from "path"` which Metro handles for all platforms. If you see a broken image:
- On native Expo Go: run `npx expo start --clear` to clear Metro cache
- On web Vercel: the build includes hashed assets in `/dist/_expo/static/`

## Known native-vs-web differences

| Feature | Web | Native |
|---------|-----|--------|
| Guardian owl icon in input | ✅ | ✅ |
| Haptics | No-op (silently ignored) | Real taps |
| Camera (receipt scan) | File picker | Camera view |
| Push notifications | No | Yes (if permission granted) |
| Apple Sign In | Redirect to Apple web | Native sheet |
| Google Sign In | Redirect to Google web | Native OAuth |
| RevenueCat subscriptions | Bypassed (paywall shows App Store link) | Full IAP |
| Deep links | URL-based | `buildtogether://` scheme |

## Troubleshooting

**"Cannot find module" errors in Expo Go**
- Kill Metro, run `npx expo start --clear`
- If still broken, `rm -rf node_modules && npm install --legacy-peer-deps`

**Backend API 401/500 from mobile**
- The app reads `EXPO_PUBLIC_DOMAIN` from env to know where to hit the API
- When running Expo locally, it defaults to `http://localhost:5000` — but you need the Vercel URL
- Set it: `EXPO_PUBLIC_DOMAIN=buildtogether-v2.vercel.app npx expo start`

**Keyboard covers the input**
- Should be fixed via KeyboardAvoidingView on AddExpenseScreen, HomeScreen, SignIn, Onboarding, etc.
- If you find a screen where it still covers, that screen needs the wrapper added

**Guardian not responding on mobile**
- Check browser network tab (Safari iOS: Settings → Safari → Advanced → Web Inspector, then connect to Mac)
- Most likely: auth token not being sent. Verify `AuthContext` `getToken()` returns a value on that device.

## Next-level polish (not yet done)

- [ ] EAS Build + TestFlight / Play Internal for true native
- [ ] Push notification integration (Expo Notifications already configured but not wired to backend events yet)
- [ ] Widget extensions (iOS Home screen budget widget)
- [ ] Face ID / biometric unlock
- [ ] Offline-first mutation queue (currently: fails gracefully if offline)
