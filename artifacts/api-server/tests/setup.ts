// Test setup — runs before any test file, providing the env vars
// that server/db.ts requires at import time. Our unit tests never
// actually hit the DB (they exercise pure functions like bucketFor,
// merchantSignature, TOOL_NAMES validation), but the modules they
// import transitively pull in server/db.ts which throws on a missing
// DATABASE_URL at module load.
//
// Real DB tests, when we add them, should use testcontainers-postgres
// or a local migrate'd database; setting DATABASE_URL here doesn't
// mean tests will hit Neon.
process.env.DATABASE_URL ||= "postgres://test:test@localhost:5432/test";
process.env.OPENROUTER_API_KEY ||= "sk-test-fake-for-test-only";
process.env.NODE_ENV ||= "test";
process.env.SESSION_SECRET ||= "test-session-secret-not-used";
