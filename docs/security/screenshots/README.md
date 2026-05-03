# Plaid Q4 Evidence — MFA Screenshots

This folder is the drop point for the real device screenshots Plaid's
reviewer asks for in question 4 ("phishing-resistant MFA"). The
screenshots **must be captured on a physical iOS or Android device** —
the iOS Simulator does not render the Face ID system sheet, and the
sandbox/CI environment used by Replit Agent has no biometric hardware,
so this is a manual step the founder completes once on their own phone
before submitting the questionnaire.

## What to capture

Two screenshots, both of the actual OS-level biometric prompt (not the
in-app modal — Plaid wants to see that the system itself is gating
access):

1. `face-id-enroll.png` — the system sheet shown the **first time** a
   user enrolls a passkey. Title is *"Set up Face ID for bank access"*.
2. `face-id-verify.png` — the system sheet shown on a **subsequent**
   bank action. Title is *"Verify with Face ID to connect your bank"*.

Optionally also capture the in-app Connect Bank CTA in its
pre-enrollment state ("Set up Face ID to connect a bank") as
`connect-bank-cta-pre-enroll.png` to prove MFA is a hard prerequisite,
not a reactive popup.

## How to capture (iOS)

1. Install a TestFlight or dev build of the Build Together app on a
   real iPhone with Face ID enabled.
2. Sign in with email / Apple / Google.
3. Open **You → Bank connections** (or the Home connect-bank card).
   The CTA reads *"Set up Face ID to connect a bank"*. Take the
   pre-enroll screenshot now.
4. Tap the CTA. The in-app *"Protect your bank with Face ID"* sheet
   appears. Tap **Set up Face ID**.
5. The OS Face ID sheet appears with title *"Set up Face ID for bank
   access"*. Press **Side button + Volume Up** to capture
   `face-id-enroll.png`.
6. Complete enrollment. Tap **Connect bank** again — this time the OS
   Face ID sheet shows *"Verify with Face ID to connect your bank"*.
   Capture `face-id-verify.png`.
7. Drop both PNGs into this folder and commit, then upload to the
   Plaid dashboard as Q4 evidence.

## How to capture (Android)

Same flow, but the system sheet is `BiometricPrompt` and the capture
shortcut is **Power + Volume Down**.
