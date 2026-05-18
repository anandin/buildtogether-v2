import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["server/**/*.test.ts", "tests/**/*.test.ts"],
    // Vitest reads tsconfig automatically for path aliases / imports.
    // We don't need ESM tricks because tsx already does the runtime
    // transformation matching tsc settings.
    environment: "node",
    // Tests are isolated by default — each file gets a fresh worker
    // (no module-level state bleeds between files). Important for the
    // DB-mocked tests in particular.
    isolate: true,
    // Pre-test env setup — server/db.ts throws at import time if
    // DATABASE_URL is missing, so we stub it before any module loads.
    // Pure unit tests never actually touch the DB, but the import
    // graph still needs the env to exist.
    setupFiles: ["./tests/setup.ts"],
    // Per-test timeout — most are pure unit tests that finish in ms.
    // Bump on a per-test basis only when needed.
    testTimeout: 10000,
    // Coverage isn't enforced yet — we're just standing up the harness.
    // When we add LLM-output evals, we'll switch to v8 coverage with
    // module-level thresholds.
    coverage: {
      enabled: false,
    },
  },
});
