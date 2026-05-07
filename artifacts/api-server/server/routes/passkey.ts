/**
 * Passkey (phishing-resistant MFA) routes + middleware.
 *
 * Architecture: device-bound Ed25519 keypair. Private key lives in the
 * device Keychain/Keystore behind a biometric prompt (expo-secure-store
 * with requireAuthentication=true). Server stores only the public key
 * and verifies signatures over server-issued challenges.
 *
 * This satisfies Plaid's production-access security questionnaire Q4
 * ("phishing-resistant MFA — biometrics, passkeys, hardware keys")
 * because the authentication ceremony requires:
 *   1. possession of the device-bound private key (hardware-backed), AND
 *   2. successful biometric/passcode unlock to retrieve it.
 *
 * Routes (all auth-gated):
 *   POST   /api/auth/passkey/register                  → enroll a new device
 *   POST   /api/auth/passkey/authenticate/options      → fetch challenge
 *   POST   /api/auth/passkey/authenticate/verify       → submit signature
 *   GET    /api/auth/passkey/credentials               → list this user's keys
 *   DELETE /api/auth/passkey/credentials/:id           → revoke a key
 *
 * Middleware:
 *   requirePasskeyVerified — 403 unless session has fresh passkey claim.
 */
import type { Express, Request, Response, NextFunction } from "express";
import * as ed from "@noble/ed25519";
import { eq, and } from "drizzle-orm";
import crypto from "node:crypto";
import { db } from "../db";
import { sessions, userCredentials, passkeyChallenges, plaidItems, users } from "../../shared/schema";
import { requireAuth } from "../middleware/auth";

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 min
export const PASSKEY_FRESHNESS_MS = 12 * 60 * 60 * 1000; // 12 h
// First-credential bootstrap window — the user must have signed in (or
// re-authenticated) within this window to enroll their FIRST passkey.
// Prevents an attacker who steals a long-lived session from silently
// adding their own key. After the first key exists, subsequent enrollments
// require an existing-passkey verification ceremony.
const FRESH_LOGIN_MS = 10 * 60 * 1000;

function b64encode(buf: Uint8Array): string {
  return Buffer.from(buf).toString("base64url");
}

function b64decode(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, "base64url"));
}

async function getSessionId(req: Request): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.split(" ")[1];
  const session = await db.query.sessions.findFirst({ where: eq(sessions.token, token) });
  return session?.id ?? null;
}

/**
 * Step-up check for enrollment. Returns null if allowed, or an error code
 * if not. Two policies:
 *   - First credential ever: session must be from a fresh login
 *     (createdAt within FRESH_LOGIN_MS). Prevents a stolen long-lived
 *     session from silently bootstrapping MFA.
 *   - Subsequent credential: session must already be passkey-verified
 *     and fresh (i.e. user just re-proved with an existing passkey).
 */
type StepUpResult = { ok: boolean; code: "OK" | "PASSKEY_STEP_UP_REQUIRED" | "NO_SESSION" };
async function checkEnrollmentStepUp(userId: string, sessionId: string): Promise<StepUpResult> {
  const session = await db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) });
  if (!session) return { ok: false, code: "NO_SESSION" };

  const existing = await db.select().from(userCredentials)
    .where(eq(userCredentials.userId, userId));

  if (existing.length === 0) {
    const ageMs = Date.now() - new Date(session.createdAt).getTime();
    if (ageMs > FRESH_LOGIN_MS) return { ok: false, code: "PASSKEY_STEP_UP_REQUIRED" };
    return { ok: true, code: "OK" };
  }

  // Adding another key — require fresh existing-passkey verification.
  const verifiedAt = session.passkeyVerifiedAt;
  if (!verifiedAt) return { ok: false, code: "PASSKEY_STEP_UP_REQUIRED" };
  if (Date.now() - new Date(verifiedAt).getTime() > PASSKEY_FRESHNESS_MS) {
    return { ok: false, code: "PASSKEY_STEP_UP_REQUIRED" };
  }
  return { ok: true, code: "OK" };
}

export function mountPasskeyRoutes(app: Express): void {
  // -------- REGISTER: options (issue enrollment challenge) --------
  // Two-step ceremony: server enforces step-up policy and issues a random
  // challenge. The client signs (publicKey || challenge) with the brand-
  // new private key and submits to /register/verify. Without this proof,
  // an attacker holding a session could submit any public key and claim
  // a verified second factor.
  app.post("/api/auth/passkey/register/options", requireAuth, async (req, res) => {
    try {
      const { credentialId } = req.body ?? {};
      if (typeof credentialId !== "string" || credentialId.length < 16 || credentialId.length > 200) {
        return res.status(400).json({ error: "credentialId required (16-200 chars)" });
      }

      const sid = await getSessionId(req);
      if (!sid) return res.status(401).json({ error: "no session" });

      const stepUp = await checkEnrollmentStepUp(req.user!.id, sid);
      if (!stepUp.ok) {
        return res.status(403).json({
          error: "step_up_required",
          code: stepUp.code,
        });
      }

      // Tag challenges by sessionId + credentialId so concurrent enrollments
      // don't clobber each other (purpose differentiates from auth challenges).
      const challenge = b64encode(crypto.randomBytes(32));
      const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
      await db.delete(passkeyChallenges).where(and(
        eq(passkeyChallenges.sessionId, sid),
        eq(passkeyChallenges.purpose, `register:${credentialId}`),
      ));
      await db.insert(passkeyChallenges).values({
        sessionId: sid,
        challenge,
        purpose: `register:${credentialId}`,
        expiresAt,
      });

      res.json({ challenge, expiresAt: expiresAt.toISOString() });
    } catch (err: any) {
      console.error("[passkey] register/options error:", err);
      res.status(500).json({ error: "register options failed" });
    }
  });

  // -------- REGISTER: verify (finalize enrollment) --------
  app.post("/api/auth/passkey/register/verify", requireAuth, async (req, res) => {
    try {
      const { credentialId, publicKey, attestation, deviceLabel, platform } = req.body ?? {};
      if (typeof credentialId !== "string" || credentialId.length < 16 || credentialId.length > 200) {
        return res.status(400).json({ error: "credentialId required (16-200 chars)" });
      }
      if (typeof publicKey !== "string" || typeof attestation !== "string") {
        return res.status(400).json({ error: "publicKey and attestation required" });
      }

      let pk: Uint8Array, sig: Uint8Array, chBytes: Uint8Array;
      try {
        pk = b64decode(publicKey);
        sig = b64decode(attestation);
      } catch {
        return res.status(400).json({ error: "publicKey/attestation must be base64url" });
      }
      if (pk.length !== 32) {
        return res.status(400).json({ error: "publicKey must be 32 bytes (Ed25519)" });
      }
      if (sig.length !== 64) {
        return res.status(400).json({ error: "attestation must be 64 bytes (Ed25519 signature)" });
      }

      const sid = await getSessionId(req);
      if (!sid) return res.status(401).json({ error: "no session" });

      // Re-check step-up at verify time so policy can't be raced.
      const stepUp = await checkEnrollmentStepUp(req.user!.id, sid);
      if (!stepUp.ok) {
        return res.status(403).json({ error: "step_up_required", code: stepUp.code });
      }

      const purpose = `register:${credentialId}`;
      const challengeRow = await db.query.passkeyChallenges.findFirst({
        where: and(
          eq(passkeyChallenges.sessionId, sid),
          eq(passkeyChallenges.purpose, purpose),
        ),
      });
      if (!challengeRow) {
        return res.status(400).json({ error: "no_challenge", code: "NO_CHALLENGE" });
      }
      if (new Date(challengeRow.expiresAt) < new Date()) {
        await db.delete(passkeyChallenges).where(and(
          eq(passkeyChallenges.sessionId, sid),
          eq(passkeyChallenges.purpose, purpose),
        ));
        return res.status(400).json({ error: "challenge_expired", code: "CHALLENGE_EXPIRED" });
      }
      try {
        chBytes = b64decode(challengeRow.challenge);
      } catch {
        return res.status(500).json({ error: "stored challenge corrupt" });
      }

      // Verify signature over (publicKey || challenge). Proves the client
      // holds the matching private key for the public key they submitted.
      const msg = new Uint8Array(pk.length + chBytes.length);
      msg.set(pk, 0);
      msg.set(chBytes, pk.length);
      const sigOk = await ed.verifyAsync(sig, msg, pk);
      if (!sigOk) {
        return res.status(401).json({ error: "attestation invalid", code: "BAD_ATTESTATION" });
      }

      // Conflict check: if this credentialId is already taken by another user, reject.
      const existing = await db.query.userCredentials.findFirst({
        where: eq(userCredentials.credentialId, credentialId),
      });
      if (existing && existing.userId !== req.user!.id) {
        return res.status(409).json({ error: "credential already registered" });
      }

      const now = new Date();
      if (!existing) {
        await db.insert(userCredentials).values({
          userId: req.user!.id,
          credentialId,
          publicKey,
          deviceLabel: typeof deviceLabel === "string" ? deviceLabel.slice(0, 80) : null,
          platform: typeof platform === "string" ? platform.slice(0, 16) : null,
        });
      }

      await Promise.all([
        db.update(sessions).set({ passkeyVerifiedAt: now }).where(eq(sessions.id, sid)),
        db.delete(passkeyChallenges).where(and(
          eq(passkeyChallenges.sessionId, sid),
          eq(passkeyChallenges.purpose, purpose),
        )),
      ]);

      res.json({ ok: true, passkeyVerifiedAt: now.toISOString() });
    } catch (err: any) {
      console.error("[passkey] register/verify error:", err);
      res.status(500).json({ error: "register verify failed" });
    }
  });

  // -------- AUTHENTICATE: options --------
  app.post("/api/auth/passkey/authenticate/options", requireAuth, async (req, res) => {
    try {
      const sid = await getSessionId(req);
      if (!sid) return res.status(401).json({ error: "no session" });

      const creds = await db.select().from(userCredentials)
        .where(eq(userCredentials.userId, req.user!.id));
      if (creds.length === 0) {
        return res.status(404).json({ error: "no_passkey_enrolled", code: "NO_PASSKEY" });
      }

      const challenge = b64encode(crypto.randomBytes(32));
      const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
      await db.delete(passkeyChallenges).where(and(
        eq(passkeyChallenges.sessionId, sid),
        eq(passkeyChallenges.purpose, "authenticate"),
      ));
      await db.insert(passkeyChallenges).values({
        sessionId: sid,
        challenge,
        purpose: "authenticate",
        expiresAt,
      });

      res.json({
        challenge,
        credentialIds: creds.map((c) => c.credentialId),
        expiresAt: expiresAt.toISOString(),
      });
    } catch (err: any) {
      console.error("[passkey] options error:", err);
      res.status(500).json({ error: "options failed" });
    }
  });

  // -------- AUTHENTICATE: verify --------
  app.post("/api/auth/passkey/authenticate/verify", requireAuth, async (req, res) => {
    try {
      const { credentialId, signature } = req.body ?? {};
      if (typeof credentialId !== "string" || typeof signature !== "string") {
        return res.status(400).json({ error: "credentialId and signature required" });
      }

      const sid = await getSessionId(req);
      if (!sid) return res.status(401).json({ error: "no session" });

      const challengeRow = await db.query.passkeyChallenges.findFirst({
        where: and(
          eq(passkeyChallenges.sessionId, sid),
          eq(passkeyChallenges.purpose, "authenticate"),
        ),
      });
      if (!challengeRow) {
        return res.status(400).json({ error: "no_challenge", code: "NO_CHALLENGE" });
      }
      if (new Date(challengeRow.expiresAt) < new Date()) {
        await db.delete(passkeyChallenges).where(and(
          eq(passkeyChallenges.sessionId, sid),
          eq(passkeyChallenges.purpose, "authenticate"),
        ));
        return res.status(400).json({ error: "challenge_expired", code: "CHALLENGE_EXPIRED" });
      }

      const cred = await db.query.userCredentials.findFirst({
        where: and(
          eq(userCredentials.credentialId, credentialId),
          eq(userCredentials.userId, req.user!.id),
        ),
      });
      if (!cred) return res.status(404).json({ error: "credential not found" });

      let sigBytes: Uint8Array, pkBytes: Uint8Array, msgBytes: Uint8Array;
      try {
        sigBytes = b64decode(signature);
        pkBytes = b64decode(cred.publicKey);
        msgBytes = b64decode(challengeRow.challenge);
      } catch {
        return res.status(400).json({ error: "invalid encoding" });
      }
      if (sigBytes.length !== 64 || pkBytes.length !== 32) {
        return res.status(400).json({ error: "invalid signature shape" });
      }

      const ok = await ed.verifyAsync(sigBytes, msgBytes, pkBytes);
      if (!ok) {
        return res.status(401).json({ error: "signature invalid", code: "BAD_SIGNATURE" });
      }

      const now = new Date();
      await Promise.all([
        db.update(sessions).set({ passkeyVerifiedAt: now }).where(eq(sessions.id, sid)),
        db.update(userCredentials)
          .set({ lastUsedAt: now, signCount: (cred.signCount ?? 0) + 1 })
          .where(eq(userCredentials.id, cred.id)),
        db.delete(passkeyChallenges).where(and(
          eq(passkeyChallenges.sessionId, sid),
          eq(passkeyChallenges.purpose, "authenticate"),
        )),
      ]);

      res.json({ ok: true, passkeyVerifiedAt: now.toISOString() });
    } catch (err: any) {
      console.error("[passkey] verify error:", err);
      res.status(500).json({ error: "verify failed" });
    }
  });

  // -------- LIST credentials --------
  app.get("/api/auth/passkey/credentials", requireAuth, async (req, res) => {
    try {
      const rows = await db.select().from(userCredentials)
        .where(eq(userCredentials.userId, req.user!.id));
      res.json({
        credentials: rows.map((c) => ({
          id: c.id,
          credentialId: c.credentialId,
          deviceLabel: c.deviceLabel,
          platform: c.platform,
          createdAt: c.createdAt,
          lastUsedAt: c.lastUsedAt,
        })),
      });
    } catch (err: any) {
      console.error("[passkey] list error:", err);
      res.status(500).json({ error: "list failed" });
    }
  });

  // -------- DELETE credential --------
  // Refuses to remove the user's last passkey while their household has
  // any active Plaid connections — otherwise they'd lose the ability to
  // re-prove MFA and the bank-data flows would 403 forever. They must
  // disconnect their banks first, or enroll a replacement device.
  app.delete("/api/auth/passkey/credentials/:id", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const all = await db.select().from(userCredentials).where(eq(userCredentials.userId, userId));
      const target = all.find((c) => c.id === req.params.id);
      if (!target) return res.status(404).json({ error: "credential not found" });

      if (all.length === 1) {
        const me = await db.query.users.findFirst({ where: eq(users.id, userId) });
        const coupleId = me?.coupleId;
        if (coupleId) {
          const activeBanks = await db.select({ id: plaidItems.id })
            .from(plaidItems)
            .where(and(
              eq(plaidItems.coupleId, coupleId),
              eq(plaidItems.status, "active"),
            ));
          if (activeBanks.length > 0) {
            return res.status(409).json({
              error: "last_passkey_with_active_banks",
              code: "LAST_PASSKEY_WITH_ACTIVE_BANKS",
              activeBankCount: activeBanks.length,
              message: "Disconnect your bank connections before removing your only passkey, or add another device first.",
            });
          }
        }
      }

      await db.delete(userCredentials)
        .where(and(
          eq(userCredentials.id, req.params.id),
          eq(userCredentials.userId, userId),
        ));
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[passkey] delete error:", err);
      res.status(500).json({ error: "delete failed" });
    }
  });
}

/**
 * Middleware: require fresh passkey verification on the session.
 *
 * Returns 403 with `code: PASSKEY_REQUIRED` when the session has never
 * been passkey-verified, or `code: PASSKEY_STALE` when verification is
 * older than the freshness window. Clients are expected to surface the
 * passkey gate UI on either code and retry the original request.
 *
 * Must run AFTER requireAuth.
 */
/**
 * Dev-only routes — passkey bypass for Expo Go / simulator testing.
 * MUST NOT be mounted in production (checked by caller in routes/index.ts).
 *
 * POST /api/dev/passkey-bypass
 *   Stamps passkeyVerifiedAt on the current session without a real biometric
 *   ceremony. Lets developers test bank-connected screens in Expo Go where
 *   the Secure Enclave / Face ID gate isn't available.
 */
export function mountPasskeyDevRoutes(app: Express): void {
  app.post("/api/dev/passkey-bypass", requireAuth, async (req, res) => {
    try {
      const sid = await getSessionId(req);
      if (!sid) return res.status(401).json({ error: "no session" });
      const now = new Date();
      await db.update(sessions).set({ passkeyVerifiedAt: now }).where(eq(sessions.id, sid));
      console.log(`[dev] passkey bypassed for session ${sid}`);
      res.json({ ok: true, passkeyVerifiedAt: now.toISOString() });
    } catch (err: any) {
      console.error("[dev] passkey-bypass error:", err);
      res.status(500).json({ error: "bypass failed" });
    }
  });
}

export async function requirePasskeyVerified(req: Request, res: Response, next: NextFunction) {
  try {
    const sid = await getSessionId(req);
    if (!sid) return res.status(401).json({ error: "no session" });
    const session = await db.query.sessions.findFirst({ where: eq(sessions.id, sid) });
    if (!session) return res.status(401).json({ error: "no session" });

    const verifiedAt = session.passkeyVerifiedAt;
    if (!verifiedAt) {
      return res.status(403).json({ error: "passkey_required", code: "PASSKEY_REQUIRED" });
    }
    if (Date.now() - new Date(verifiedAt).getTime() > PASSKEY_FRESHNESS_MS) {
      return res.status(403).json({ error: "passkey_stale", code: "PASSKEY_STALE" });
    }
    next();
  } catch (err) {
    console.error("[passkey] requirePasskeyVerified error:", err);
    res.status(500).json({ error: "auth check failed" });
  }
}
