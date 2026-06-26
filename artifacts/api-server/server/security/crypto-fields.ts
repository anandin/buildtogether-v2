/**
 * Application-layer field encryption for secrets at rest (SOC 2 CC6.1).
 *
 * Postgres-at-rest encryption (Neon/Supabase volume encryption) protects
 * against stolen disks, NOT against a leaked DB credential, a SQL-layer
 * read, or a logged row — and the most sensitive value we hold, the Plaid
 * `access_token`, is the master key to a user's entire bank. So we encrypt
 * it in the application before it ever touches a column, and decrypt only
 * at the moment we hand it to Plaid.
 *
 * Scheme: AES-256-GCM (authenticated). Stored format is a self-describing
 * string so we can rotate algorithms later and tell encrypted from legacy
 * plaintext during migration:
 *
 *     enc:v1:<iv_b64url>:<authTag_b64url>:<ciphertext_b64url>
 *
 * Key: APP_ENCRYPTION_KEY — 32 bytes supplied as base64 or hex (64 hex
 * chars). Required in production (enforced in env-validation). In non-prod
 * without a key we derive an EPHEMERAL key and warn loudly: dev tokens
 * won't survive a restart, which is the correct, safe default (never a
 * hardcoded fallback key that could end up protecting prod data).
 */
import crypto from "crypto";

const PREFIX = "enc:v1:";
const ALGO = "aes-256-gcm";

let cachedKey: Buffer | null = null;

function loadKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.APP_ENCRYPTION_KEY?.trim();
  if (raw) {
    let key: Buffer;
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      key = Buffer.from(raw, "hex");
    } else {
      key = Buffer.from(raw, "base64");
    }
    if (key.length !== 32) {
      throw new Error(
        `APP_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${key.length}). ` +
          `Generate one with: openssl rand -base64 32`,
      );
    }
    cachedKey = key;
    return key;
  }
  // No key configured. In production this is a hard failure (env-validation
  // catches it at boot); reaching here in prod means something bypassed
  // validation, so we still refuse rather than invent a key.
  if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
    throw new Error(
      "APP_ENCRYPTION_KEY is required in production to encrypt secrets at rest.",
    );
  }
  console.warn(
    "[crypto-fields] APP_ENCRYPTION_KEY not set — using an EPHEMERAL dev key. " +
      "Encrypted values will NOT be readable after a restart. Set APP_ENCRYPTION_KEY for stable local data.",
  );
  cachedKey = crypto.randomBytes(32);
  return cachedKey;
}

const b64url = (b: Buffer): string =>
  b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string): Buffer =>
  Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

/** True if a stored value is in our encrypted envelope (vs legacy plaintext). */
export function isEncrypted(stored: string | null | undefined): boolean {
  return typeof stored === "string" && stored.startsWith(PREFIX);
}

/** Encrypt a secret for storage. Returns the self-describing envelope. */
export function encryptSecret(plaintext: string): string {
  const key = loadKey();
  const iv = crypto.randomBytes(12); // 96-bit nonce, standard for GCM
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${b64url(iv)}:${b64url(tag)}:${b64url(ct)}`;
}

/**
 * Decrypt a stored secret. BACKWARD-COMPATIBLE: a value that isn't in our
 * envelope is assumed to be legacy plaintext and returned as-is, so reads
 * keep working during the rollout window before the boot migration
 * re-encrypts existing rows. Throws only on a corrupt/tampered envelope
 * (GCM auth failure) — which is a real integrity signal worth surfacing.
 */
export function decryptSecret(stored: string): string {
  if (!isEncrypted(stored)) return stored; // legacy plaintext
  const body = stored.slice(PREFIX.length);
  const parts = body.split(":");
  if (parts.length !== 3) {
    throw new Error("[crypto-fields] malformed encrypted value");
  }
  const [ivB, tagB, ctB] = parts;
  const key = loadKey();
  const decipher = crypto.createDecipheriv(ALGO, key, fromB64url(ivB));
  decipher.setAuthTag(fromB64url(tagB));
  const pt = Buffer.concat([decipher.update(fromB64url(ctB)), decipher.final()]);
  return pt.toString("utf8");
}

/** Whether a usable encryption key is configured (for health/diagnostics). */
export function encryptionConfigured(): boolean {
  return !!process.env.APP_ENCRYPTION_KEY?.trim();
}
