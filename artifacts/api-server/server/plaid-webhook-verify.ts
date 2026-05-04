/**
 * Plaid webhook signature verification.
 *
 * Plaid signs every webhook with a JWT (ES256) in the `Plaid-Verification`
 * header. The JWT's `request_body_sha256` claim must match SHA256 of the
 * raw request body, and `iat` must be within 5 minutes (replay window).
 *
 * Public keys (JWKs) are fetched on demand from Plaid's
 * `/webhook_verification_key/get` endpoint, keyed by the JWT header `kid`,
 * and cached in-memory for 5 minutes per Plaid's recommendation. Keys
 * Plaid has marked `expired_at` are rejected outright.
 *
 * See: https://plaid.com/docs/api/webhooks/webhook-verification/
 */
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { getPlaidClient } from "./plaid";

type CachedKey = {
  jwk: any;
  pem: string;
  fetchedAt: number;
  expiredAt: number | null;
};

const KEY_CACHE_TTL_MS = 5 * 60 * 1000;
const REPLAY_WINDOW_MS = 5 * 60 * 1000;

const keyCache = new Map<string, CachedKey>();

/** Test-only: clear the in-memory key cache between tests. */
export function _resetPlaidWebhookKeyCache(): void {
  keyCache.clear();
}

function jwkToPem(jwk: any): string {
  const keyObject = crypto.createPublicKey({
    key: {
      kty: jwk.kty,
      crv: jwk.crv,
      x: jwk.x,
      y: jwk.y,
    },
    format: "jwk",
  });
  return keyObject.export({ format: "pem", type: "spki" }).toString();
}

async function fetchKey(kid: string): Promise<CachedKey | null> {
  const cached = keyCache.get(kid);
  if (cached && Date.now() - cached.fetchedAt < KEY_CACHE_TTL_MS) {
    return cached;
  }
  const plaid = getPlaidClient();
  if (!plaid) return null;

  let resp: any;
  try {
    resp = await plaid.webhookVerificationKeyGet({ key_id: kid });
  } catch (err: any) {
    console.error(
      "Plaid webhook key fetch failed:",
      err?.response?.data || err?.message || err,
    );
    return null;
  }
  const key = resp?.data?.key;
  if (!key || key.kty !== "EC" || key.alg !== "ES256") return null;

  const entry: CachedKey = {
    jwk: key,
    pem: jwkToPem(key),
    fetchedAt: Date.now(),
    expiredAt:
      typeof key.expired_at === "number" && key.expired_at > 0
        ? key.expired_at
        : null,
  };
  keyCache.set(kid, entry);
  return entry;
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Verify a Plaid webhook request. Returns { ok: true } on success, or
 * { ok: false, reason } on any failure (missing header, bad signature,
 * stale timestamp, body hash mismatch, expired key, etc.).
 */
export async function verifyPlaidWebhook(
  verificationHeader: string | undefined,
  rawBody: Buffer | string | undefined,
): Promise<VerifyResult> {
  if (!verificationHeader || typeof verificationHeader !== "string") {
    return { ok: false, reason: "missing Plaid-Verification header" };
  }
  if (rawBody === undefined || rawBody === null) {
    return { ok: false, reason: "missing raw request body" };
  }

  // Decode header without verifying to extract kid + alg.
  const decoded = jwt.decode(verificationHeader, { complete: true });
  if (!decoded || typeof decoded === "string") {
    return { ok: false, reason: "malformed JWT" };
  }
  const header = decoded.header as { alg?: string; kid?: string; typ?: string };
  if (header.alg !== "ES256") {
    return { ok: false, reason: `unexpected alg ${header.alg}` };
  }
  if (!header.kid || typeof header.kid !== "string") {
    return { ok: false, reason: "missing kid" };
  }

  const key = await fetchKey(header.kid);
  if (!key) return { ok: false, reason: "unknown signing key" };
  if (key.expiredAt !== null) {
    return { ok: false, reason: "signing key has been expired by Plaid" };
  }

  let payload: any;
  try {
    payload = jwt.verify(verificationHeader, key.pem, {
      algorithms: ["ES256"],
    });
  } catch (err: any) {
    return { ok: false, reason: `signature invalid: ${err?.message || err}` };
  }

  if (!payload || typeof payload !== "object") {
    return { ok: false, reason: "malformed JWT payload" };
  }
  const iat = (payload as any).iat;
  if (typeof iat !== "number") {
    return { ok: false, reason: "missing iat" };
  }
  const ageMs = Date.now() - iat * 1000;
  if (ageMs > REPLAY_WINDOW_MS || ageMs < -REPLAY_WINDOW_MS) {
    return { ok: false, reason: "iat outside 5-minute replay window" };
  }

  const claimedHash = (payload as any).request_body_sha256;
  if (typeof claimedHash !== "string" || claimedHash.length !== 64) {
    return { ok: false, reason: "missing request_body_sha256" };
  }
  const bodyBuf =
    typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;
  const actualHash = crypto.createHash("sha256").update(bodyBuf).digest("hex");
  // constant-time compare
  const a = Buffer.from(claimedHash, "hex");
  const b = Buffer.from(actualHash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: "request body hash mismatch" };
  }

  return { ok: true };
}
