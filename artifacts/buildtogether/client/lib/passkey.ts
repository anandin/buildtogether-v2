/**
 * Mobile passkey (phishing-resistant MFA) helpers.
 *
 * Generates a device-bound Ed25519 keypair on enrollment, stores the
 * private key in the platform Keychain/Keystore behind a biometric
 * prompt (expo-secure-store + requireAuthentication=true), and signs
 * server-issued challenges to prove possession + biometric unlock.
 *
 * This is the client half of the Plaid production-access "phishing-
 * resistant MFA" claim. See `server/routes/passkey.ts` for the server
 * verification.
 */
import "react-native-get-random-values";
import * as SecureStore from "expo-secure-store";
import * as LocalAuth from "expo-local-authentication";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { Platform } from "react-native";
import { apiRequest, apiRequestRaw } from "./query-client";

// @noble/ed25519 v3 needs SHA-512 wired in. By default it tries
// `crypto.subtle.digest`, which React Native (Hermes) does not provide,
// so enrollment crashes on real devices with
// "crypto.subtle must be defined, consider polyfill". Setting the sync
// hash from @noble/hashes makes signAsync/verifyAsync work on every
// platform we ship (iOS, Android, web) without pulling in a native
// WebCrypto polyfill. Must run before any sign/verify call.
ed.hashes.sha512 = (msg: Uint8Array) => sha512(msg);

const PRIV_KEY_PREFIX = "tilly.passkey.priv."; // suffix with credentialId
const META_KEY = "tilly.passkey.meta";

interface StoredMeta {
  credentialId: string;
  publicKey: string;
  createdAt: string;
  deviceLabel: string;
}

// ---- base64url helpers (RN-safe; no Buffer) ----
function b64encode(buf: Uint8Array): string {
  let s = "";
  for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
  return globalThis.btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64decode(s: string): Uint8Array {
  const pad = s.length % 4;
  const padded = pad ? s + "===".slice(0, 4 - pad) : s;
  const norm = padded.replace(/-/g, "+").replace(/_/g, "/");
  const bin = globalThis.atob(norm);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function randomBytes(n: number): Uint8Array {
  const arr = new Uint8Array(n);
  (globalThis as any).crypto.getRandomValues(arr);
  return arr;
}

// ---- local meta helpers ----
async function getMeta(): Promise<StoredMeta | null> {
  if (Platform.OS === "web") return null;
  try {
    const raw = await SecureStore.getItemAsync(META_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
async function saveMeta(meta: StoredMeta): Promise<void> {
  await SecureStore.setItemAsync(META_KEY, JSON.stringify(meta));
}
async function clearMeta(): Promise<void> {
  try { await SecureStore.deleteItemAsync(META_KEY); } catch {}
}

// ---- public API ----

/** True if the device has biometric (or device-passcode fallback) hardware enrolled. */
export async function isPasskeySupported(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const has = await LocalAuth.hasHardwareAsync();
    if (!has) return false;
    return await LocalAuth.isEnrolledAsync();
  } catch {
    return false;
  }
}

export async function hasLocalPasskey(): Promise<boolean> {
  return !!(await getMeta());
}

export async function getLocalPasskeyMeta(): Promise<StoredMeta | null> {
  return getMeta();
}

/**
 * Enroll a new passkey on this device.
 *
 *   1. Prompt for biometric (proves the user is present).
 *   2. Generate Ed25519 keypair locally.
 *   3. Store private key in Keychain/Keystore with `requireAuthentication`
 *      so future retrievals also require Face ID / Touch ID / passcode.
 *   4. POST the public key to the server, which marks the session as
 *      passkey-verified.
 */
export async function enrollPasskey(deviceLabel?: string): Promise<{ credentialId: string }> {
  if (!(await isPasskeySupported())) {
    throw new Error("This device doesn't have Face ID, Touch ID, or a fingerprint set up. Enable it in your phone settings, then try again.");
  }

  const present = await LocalAuth.authenticateAsync({
    promptMessage: "Set up Face ID for bank access",
    cancelLabel: "Cancel",
    disableDeviceFallback: false,
  });
  if (!present.success) throw new Error("Biometric verification cancelled.");

  const priv = randomBytes(32);
  const pub = await ed.getPublicKeyAsync(priv);
  const credentialId = b64encode(randomBytes(24));
  const label = deviceLabel ?? `${Platform.OS === "ios" ? "iPhone" : Platform.OS === "android" ? "Android device" : "device"}`;

  // 1. Ask server for an enrollment challenge. Server enforces step-up
  //    requirements (fresh login for first credential, existing passkey
  //    verification for additional ones) and returns 403 if not allowed.
  const optsRes = await apiRequestRaw("POST", "/api/auth/passkey/register/options", {
    credentialId,
    publicKey: b64encode(pub),
    deviceLabel: label,
    platform: Platform.OS,
  });
  if (optsRes.status === 403) {
    let code: string | undefined;
    try { code = (await optsRes.json())?.code; } catch {}
    if (code === "PASSKEY_STEP_UP_REQUIRED") {
      throw new Error("STEP_UP_REQUIRED");
    }
    throw new Error("Enrollment not allowed right now. Please sign in again and try.");
  }
  if (!optsRes.ok) {
    const text = await optsRes.text();
    throw new Error(`Couldn't start passkey setup: ${text}`);
  }
  const { challenge } = (await optsRes.json()) as { challenge: string };

  // 2. Sign (publicKey || challenge) with the brand-new private key, proving
  //    we hold the matching key. Without this, an attacker could submit
  //    any public key they like.
  const msg = new Uint8Array(pub.length + 32);
  msg.set(pub, 0);
  msg.set(b64decode(challenge), pub.length);
  const attestation = await ed.signAsync(msg, priv);

  // requireAuthentication=true → iOS Keychain uses Secure Enclave + biometric
  // gate; Android Keystore uses BiometricPrompt before returning the value.
  await SecureStore.setItemAsync(
    PRIV_KEY_PREFIX + credentialId,
    b64encode(priv),
    {
      requireAuthentication: true,
      keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
    },
  );

  // 3. Finalize — server verifies the attestation signature before storing.
  const res = await apiRequestRaw("POST", "/api/auth/passkey/register/verify", {
    credentialId,
    publicKey: b64encode(pub),
    attestation: b64encode(attestation),
    deviceLabel: label,
    platform: Platform.OS,
  });
  if (!res.ok) {
    await SecureStore.deleteItemAsync(PRIV_KEY_PREFIX + credentialId).catch(() => {});
    const text = await res.text();
    throw new Error(`Couldn't save your passkey on the server: ${text}`);
  }

  await saveMeta({
    credentialId,
    publicKey: b64encode(pub),
    createdAt: new Date().toISOString(),
    deviceLabel: label,
  });

  return { credentialId };
}

/**
 * Re-prove possession + biometric unlock to refresh the session's
 * passkey-verified timestamp. Called before launching Plaid Link.
 */
export async function verifyPasskey(): Promise<void> {
  const meta = await getMeta();
  if (!meta) throw new Error("NO_LOCAL_PASSKEY");

  // 1. Get challenge + the credentialIds the server has on file.
  const optsRes = await apiRequestRaw("POST", "/api/auth/passkey/authenticate/options");
  if (optsRes.status === 404) {
    // Server has no credentials for this user — local meta is stale.
    await clearMeta();
    throw new Error("NO_LOCAL_PASSKEY");
  }
  if (!optsRes.ok) {
    const t = await optsRes.text();
    throw new Error(`Could not start passkey verification: ${t}`);
  }
  const { challenge, credentialIds } = (await optsRes.json()) as {
    challenge: string; credentialIds: string[];
  };

  // 2. Match local credential to a server credential.
  const usable = credentialIds.find((id) => id === meta.credentialId);
  if (!usable) {
    await clearMeta();
    throw new Error("NO_LOCAL_PASSKEY");
  }

  // 3. Retrieve private key — triggers Face ID prompt.
  const privB64 = await SecureStore.getItemAsync(PRIV_KEY_PREFIX + usable, {
    requireAuthentication: true,
    authenticationPrompt: "Verify with Face ID to connect your bank",
  });
  if (!privB64) throw new Error("Biometric verification cancelled.");

  const priv = b64decode(privB64);
  const msg = b64decode(challenge);
  const sig = await ed.signAsync(msg, priv);

  // 4. Submit signature.
  const verifyRes = await apiRequest("POST", "/api/auth/passkey/authenticate/verify", {
    credentialId: usable,
    signature: b64encode(sig),
  });
  if (!verifyRes.ok) {
    const t = await verifyRes.text();
    throw new Error(`Passkey verification failed: ${t}`);
  }
}

/** Wipe local passkey state (used on sign-out and on stale-meta detection). */
export async function clearLocalPasskey(): Promise<void> {
  const meta = await getMeta();
  if (meta) {
    try { await SecureStore.deleteItemAsync(PRIV_KEY_PREFIX + meta.credentialId); } catch {}
  }
  await clearMeta();
}

export interface ServerCredential {
  id: string;
  credentialId: string;
  deviceLabel: string | null;
  platform: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export async function listServerCredentials(): Promise<ServerCredential[]> {
  const res = await apiRequest("GET", "/api/auth/passkey/credentials");
  if (!res.ok) throw new Error("Failed to list passkeys");
  const data = await res.json();
  return data.credentials || [];
}

export async function deleteServerCredential(id: string): Promise<void> {
  const res = await apiRequest("DELETE", `/api/auth/passkey/credentials/${id}`);
  if (!res.ok) throw new Error("Failed to delete passkey");
  // If we deleted the local key's server twin, clear the local key too.
  const meta = await getMeta();
  if (meta) {
    const list = await listServerCredentials();
    if (!list.find((c) => c.credentialId === meta.credentialId)) {
      await clearLocalPasskey();
    }
  }
}
