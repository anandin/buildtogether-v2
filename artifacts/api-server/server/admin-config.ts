export interface AdminConfig {
  email: string;
  passwordHash: string;
  sessionSecret: string;
}

let cachedConfig: AdminConfig | null = null;

function isBcryptHash(value: string): boolean {
  return /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value);
}

export function loadAdminConfig(): AdminConfig {
  if (cachedConfig) return cachedConfig;

  const email = process.env.ADMIN_EMAIL?.trim();
  const passwordHash = process.env.ADMIN_PASSWORD_HASH?.trim();
  const sessionSecret = process.env.SESSION_SECRET?.trim();

  const missing: string[] = [];
  if (!email) missing.push("ADMIN_EMAIL");
  if (!passwordHash) missing.push("ADMIN_PASSWORD_HASH");
  if (!sessionSecret) missing.push("SESSION_SECRET");

  if (missing.length > 0) {
    throw new Error(
      `[admin-config] Refusing to start: required environment variable(s) missing: ${missing.join(
        ", ",
      )}. ` +
        `Set ADMIN_EMAIL, ADMIN_PASSWORD_HASH (a bcrypt hash, e.g. produced by \`bcrypt.hash(password, 10)\`), ` +
        `and a strong random SESSION_SECRET (>= 32 chars) before starting the server.`,
    );
  }

  if (!isBcryptHash(passwordHash!)) {
    throw new Error(
      "[admin-config] Refusing to start: ADMIN_PASSWORD_HASH is not a valid bcrypt hash. " +
        "Generate one with `bcrypt.hash(password, 10)` (it should start with `$2a$`, `$2b$`, or `$2y$`).",
    );
  }

  if (sessionSecret!.length < 32) {
    throw new Error(
      "[admin-config] Refusing to start: SESSION_SECRET must be at least 32 characters long. " +
        "Generate one with `openssl rand -hex 32`.",
    );
  }

  cachedConfig = {
    email: email!,
    passwordHash: passwordHash!,
    sessionSecret: sessionSecret!,
  };
  return cachedConfig;
}
