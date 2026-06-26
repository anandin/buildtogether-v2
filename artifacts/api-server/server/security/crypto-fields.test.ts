import { afterAll, beforeAll, describe, expect, it } from "vitest";
import crypto from "crypto";

// A stable key for the test process. Set before importing the module so
// loadKey() caches it. 32 bytes base64.
const TEST_KEY = crypto.randomBytes(32).toString("base64");

let mod: typeof import("./crypto-fields");

beforeAll(async () => {
  process.env.APP_ENCRYPTION_KEY = TEST_KEY;
  mod = await import("./crypto-fields");
});

afterAll(() => {
  delete process.env.APP_ENCRYPTION_KEY;
});

describe("crypto-fields — Plaid token encryption at rest", () => {
  it("round-trips a secret through encrypt/decrypt", () => {
    const secret = "access-production-3a1b2c3d-not-a-real-token";
    const enc = mod.encryptSecret(secret);
    expect(enc.startsWith("enc:v1:")).toBe(true);
    expect(enc).not.toContain(secret); // ciphertext must not leak plaintext
    expect(mod.decryptSecret(enc)).toBe(secret);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const a = mod.encryptSecret("same-input");
    const b = mod.encryptSecret("same-input");
    expect(a).not.toBe(b);
    expect(mod.decryptSecret(a)).toBe("same-input");
    expect(mod.decryptSecret(b)).toBe("same-input");
  });

  it("treats legacy plaintext as plaintext (backward compatible reads)", () => {
    // A value not in our envelope is returned as-is, so reads keep working
    // before the boot migration re-encrypts existing rows.
    expect(mod.decryptSecret("access-production-legacy-plaintext")).toBe(
      "access-production-legacy-plaintext",
    );
    expect(mod.isEncrypted("access-production-legacy-plaintext")).toBe(false);
  });

  it("detects tampering (GCM auth tag) and throws", () => {
    const enc = mod.encryptSecret("integrity-matters");
    // Flip a character in the ciphertext segment.
    const parts = enc.split(":");
    parts[parts.length - 1] = parts[parts.length - 1].slice(0, -2) + "AA";
    const tampered = parts.join(":");
    expect(() => mod.decryptSecret(tampered)).toThrow();
  });

  it("isEncrypted recognizes the envelope", () => {
    expect(mod.isEncrypted(mod.encryptSecret("x"))).toBe(true);
    expect(mod.isEncrypted("")).toBe(false);
    expect(mod.isEncrypted(null)).toBe(false);
  });
});
