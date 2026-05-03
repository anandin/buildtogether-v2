/**
 * Boot-time environment validation.
 *
 * Why a single source of truth: AI features fail in confusing ways when
 * a key is missing — the error surfaces deep inside a chat handler or
 * embedding call, often after the user has already typed a message.
 * Failing fast at startup with a clear, actionable message is cheaper
 * for everyone.
 *
 * Two tiers:
 *   - REQUIRED: server refuses to boot without these.
 *   - PAIRED:   either both must be set, or both unset (feature flag).
 *               Half-configured pairs throw because they almost always
 *               mean "I forgot to add the second secret."
 *
 * Optional vars (e.g. ANTHROPIC_API_KEY when provider="openrouter") are
 * checked lazily inside their respective client modules, not here.
 */

type RequiredVar = {
  name: string;
  reason: string;
};

type PairedVars = {
  feature: string;
  vars: string[];
};

const REQUIRED: RequiredVar[] = [
  {
    name: "AI_INTEGRATIONS_OPENAI_API_KEY",
    reason:
      "OpenAI access (chat fallback, image, audio) — provisioned automatically by the Replit AI Integration",
  },
  {
    name: "AI_INTEGRATIONS_OPENAI_BASE_URL",
    reason:
      "OpenAI proxy URL — provisioned automatically alongside AI_INTEGRATIONS_OPENAI_API_KEY",
  },
  {
    name: "OPENROUTER_API_KEY",
    reason:
      "Tilly chat (Claude via OpenRouter) and RAG embeddings — required for any Tilly conversation to work",
  },
  {
    name: "DATABASE_URL",
    reason: "Postgres connection string — needed for users, couples, Tilly memory",
  },
];

const PAIRED: PairedVars[] = [
  {
    feature: "Plaid bank linking",
    vars: ["PLAID_CLIENT_ID", "PLAID_SECRET"],
  },
];

/**
 * Validate all required env vars are present. Throws a single error that
 * lists every missing var so the operator can fix them all in one pass
 * rather than playing whack-a-mole.
 *
 * Call this once during server boot, before registering routes.
 */
export function validateRequiredEnv(): void {
  const missing: string[] = [];
  for (const { name, reason } of REQUIRED) {
    if (!process.env[name]) {
      missing.push(`  - ${name}: ${reason}`);
    }
  }

  const halfConfigured: string[] = [];
  for (const { feature, vars } of PAIRED) {
    const present = vars.filter((v) => !!process.env[v]);
    if (present.length > 0 && present.length < vars.length) {
      const missingFromPair = vars.filter((v) => !process.env[v]);
      halfConfigured.push(
        `  - ${feature}: have [${present.join(", ")}], missing [${missingFromPair.join(", ")}]`,
      );
    }
  }

  // Production-Plaid extra requirements: OAuth banks (Chase, Wells Fargo,
  // Capital One, BofA, …) need a registered redirect_uri, and a deployment
  // without a webhook silently misses transaction updates. Both are
  // optional in sandbox so dev iteration stays fast.
  const productionPlaidMissing: string[] = [];
  const plaidEnv = (process.env.PLAID_ENV || "").toLowerCase();
  if (
    plaidEnv === "production" &&
    process.env.PLAID_CLIENT_ID &&
    process.env.PLAID_SECRET
  ) {
    if (!process.env.PLAID_REDIRECT_URI) {
      productionPlaidMissing.push(
        "  - PLAID_REDIRECT_URI: required in production so OAuth banks (Chase, Wells Fargo, Capital One, BofA) complete the Plaid Link flow",
      );
    }
    if (!process.env.PLAID_WEBHOOK_URL) {
      productionPlaidMissing.push(
        "  - PLAID_WEBHOOK_URL: required in production so transaction updates arrive in the background instead of only on user-triggered /sync",
      );
    }
  }

  if (
    missing.length === 0 &&
    halfConfigured.length === 0 &&
    productionPlaidMissing.length === 0
  )
    return;

  const lines: string[] = ["Environment validation failed:"];
  if (missing.length > 0) {
    lines.push("", "Missing required environment variables:");
    lines.push(...missing);
  }
  if (halfConfigured.length > 0) {
    lines.push("", "Partially configured features (set both keys or neither):");
    lines.push(...halfConfigured);
  }
  if (productionPlaidMissing.length > 0) {
    lines.push(
      "",
      "Plaid is set to PLAID_ENV=production but is missing required production wiring:",
    );
    lines.push(...productionPlaidMissing);
  }
  lines.push(
    "",
    "Set these in Replit Secrets (or Vercel env vars in production) and restart the server.",
  );
  throw new Error(lines.join("\n"));
}

/**
 * Read-only snapshot of which optional features are wired up. Useful for
 * /api/health and admin debugging without leaking the actual key values.
 */
export function getFeatureFlags(): Record<string, boolean> {
  return {
    plaid: !!(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET),
    anthropicDirect: !!process.env.ANTHROPIC_API_KEY,
    openrouter: !!process.env.OPENROUTER_API_KEY,
  };
}
