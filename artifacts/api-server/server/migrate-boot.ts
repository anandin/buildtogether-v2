/**
 * Boot-time migration runner.
 *
 * Vercel runs `drizzle-kit push --force` during build, but on serverless
 * cold starts that's not always sufficient — particularly for migrations
 * that drizzle-kit can't infer from the schema diff (e.g. INSERT seed
 * rows). This function runs on first request, applies the hand-written
 * SQL files in `migrations/` that drizzle-kit might miss, and is
 * idempotent (every statement uses IF NOT EXISTS / ON CONFLICT).
 *
 * Safe to call repeatedly. Caches "done" per process so we don't hit
 * the DB on every request.
 */
import { pool } from "./db";

let _applied = false;
let _applying: Promise<void> | null = null;

const CRITICAL_STATEMENTS: string[] = [
  // Phase 1: schema rename
  `ALTER TABLE IF EXISTS "couples" RENAME TO "households"`,
  `ALTER TABLE IF EXISTS "partners" RENAME TO "members"`,
  `ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "user_id" varchar`,
  `ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "role" text NOT NULL DEFAULT 'owner'`,
  `ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "scope" text`,
  `ALTER TABLE "households" ADD COLUMN IF NOT EXISTS "school_name" text`,
  `ALTER TABLE "households" ADD COLUMN IF NOT EXISTS "school_short" text`,
  `ALTER TABLE "households" ADD COLUMN IF NOT EXISTS "student_role" text`,
  `ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "glyph" text`,
  `ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "loc" text`,
  `ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "gradient" jsonb`,
  `ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "weekly_auto" real`,
  `ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "nudge" text`,
  `ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "due_label" text`,

  // Passkey MFA (phishing-resistant) — used to gate Plaid endpoints.
  `ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "passkey_verified_at" timestamp`,
  `CREATE TABLE IF NOT EXISTS "user_credentials" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "credential_id" text NOT NULL UNIQUE,
    "public_key" text NOT NULL,
    "device_label" text,
    "platform" text,
    "sign_count" integer NOT NULL DEFAULT 0,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "last_used_at" timestamp
  )`,
  `CREATE INDEX IF NOT EXISTS "user_credentials_user_idx" ON "user_credentials" ("user_id")`,
  // Reshape passkey_challenges: original PK was session_id alone, but the
  // server issues concurrent challenges per (session, purpose) — drop and
  // recreate. Safe because rows are short-lived (5-10 min TTL) nonces.
  `DROP TABLE IF EXISTS "passkey_challenges"`,
  `CREATE TABLE IF NOT EXISTS "passkey_challenges" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "session_id" varchar NOT NULL REFERENCES "sessions"("id") ON DELETE CASCADE,
    "challenge" text NOT NULL,
    "purpose" text NOT NULL,
    "expires_at" timestamp NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "passkey_challenges_session_purpose_uniq" ON "passkey_challenges" ("session_id", "purpose")`,

  // Phase 2: tilly tables (idempotent)
  `CREATE TABLE IF NOT EXISTS "tilly_memory" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" varchar NOT NULL,
    "household_id" varchar NOT NULL,
    "kind" text NOT NULL,
    "body" text NOT NULL,
    "source" text NOT NULL DEFAULT 'inferred',
    "category" text,
    "goal_id" varchar,
    "conversation_id" varchar,
    "date_label" text NOT NULL,
    "noticed_at" timestamp DEFAULT now() NOT NULL,
    "is_most_recent" boolean DEFAULT false,
    "archived_at" timestamp,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "tilly_tone_pref" (
    "user_id" varchar PRIMARY KEY,
    "tone" text NOT NULL DEFAULT 'sibling',
    "quiet_hours_start" text DEFAULT '23:00',
    "quiet_hours_end" text DEFAULT '07:00',
    "big_purchase_threshold" real DEFAULT 25,
    "subscription_scan_cadence" text DEFAULT 'weekly',
    "phishing_watch" boolean DEFAULT true,
    "memory_retention" text DEFAULT 'forever',
    "updated_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "subscriptions" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "household_id" varchar NOT NULL,
    "merchant" text NOT NULL,
    "amount" real NOT NULL,
    "currency" text DEFAULT 'USD',
    "cadence" text NOT NULL,
    "cadence_days" integer,
    "last_charged_at" text,
    "next_charge_at" text,
    "last_used_at" text,
    "status" text NOT NULL DEFAULT 'active',
    "source" text NOT NULL DEFAULT 'plaid_recurring',
    "plaid_recurring_stream_id" text,
    "usage_note" text,
    "paused_at" timestamp,
    "cancelled_at" timestamp,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "protections" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" varchar NOT NULL,
    "household_id" varchar NOT NULL,
    "kind" text NOT NULL,
    "severity" text NOT NULL DEFAULT 'fyi',
    "summary" text NOT NULL,
    "detail" text,
    "cta_label" text,
    "cta_action" text,
    "cta_target_id" varchar,
    "subscription_id" varchar,
    "plaid_transaction_id" varchar,
    "status" text NOT NULL DEFAULT 'flagged',
    "flagged_at" timestamp DEFAULT now() NOT NULL,
    "acted_at" timestamp,
    "dismissed_at" timestamp,
    "expires_at" timestamp,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,

  // Phase 2.5: admin + LLM config + RAG embeddings
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_admin" boolean NOT NULL DEFAULT false`,
  `UPDATE "users" SET "is_admin" = true WHERE "email" = 'anand.inbasekaran@gmail.com'`,
  // The long-lived e2e QA account also needs admin so /admin/memory
  // scenarios can drive the inspector. Safe — this email is hardcoded
  // throughout the e2e suite + is the only seeded test account.
  `UPDATE "users" SET "is_admin" = true WHERE "email" = 'riley-qa-2026-04-28@buildtogether.test'`,
  `ALTER TABLE "tilly_memory" ADD COLUMN IF NOT EXISTS "embedding" real[]`,
  `CREATE TABLE IF NOT EXISTS "tilly_config" (
    "id" varchar PRIMARY KEY DEFAULT 'default',
    "provider" text NOT NULL DEFAULT 'openrouter',
    "model" text NOT NULL DEFAULT 'anthropic/claude-opus-4',
    "embedding_model" text NOT NULL DEFAULT 'openai/text-embedding-3-small',
    "max_tokens" integer NOT NULL DEFAULT 4096,
    "retrieval_top_k" integer NOT NULL DEFAULT 5,
    "similarity_threshold" real NOT NULL DEFAULT 0.65,
    "retrieval_strategy" text NOT NULL DEFAULT 'hybrid',
    "recency_half_life_hours" real NOT NULL DEFAULT 168,
    "persona_prompt_override" text,
    "tone_sibling_override" text,
    "tone_coach_override" text,
    "tone_quiet_override" text,
    "updated_at" timestamp DEFAULT now() NOT NULL
  )`,
  `INSERT INTO "tilly_config" ("id") VALUES ('default') ON CONFLICT ("id") DO NOTHING`,

  // Phase 6: manual expense capture (text/voice/photo) — for users without
  // Plaid. The expenses table already exists (V1) but lacked a source column
  // to discriminate manual vs Plaid-imported entries. Spend pattern engine
  // reads from this column to know what to attribute to Tilly's "I noticed".
  `ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'manual_text'`,
  `ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "user_id" varchar`,
  `ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "raw_input" text`,
  `CREATE INDEX IF NOT EXISTS "expenses_household_date_idx" ON "expenses" ("couple_id", "date")`,

  // Phase 5: push tokens
  `CREATE TABLE IF NOT EXISTS "push_tokens" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" varchar NOT NULL,
    "token" text NOT NULL UNIQUE,
    "platform" text NOT NULL,
    "device_label" text,
    "last_seen_at" timestamp DEFAULT now() NOT NULL,
    "disabled_at" timestamp,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,

  // Tilly reminders — what Tilly promised the user (e.g. "I'll ping you
  // before ticket day"). Without this table the promise was a lie.
  `CREATE TABLE IF NOT EXISTS "tilly_reminders" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" varchar NOT NULL,
    "household_id" varchar NOT NULL,
    "label" text NOT NULL,
    "kind" text NOT NULL DEFAULT 'generic',
    "fire_at" timestamp NOT NULL,
    "status" text NOT NULL DEFAULT 'scheduled',
    "metadata" text,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "fired_at" timestamp,
    "cancelled_at" timestamp
  )`,
  // Tag indulgence-classified expenses for the Spend list ✦ marker.
  `ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "intent" text`,
  `ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "nudge" text`,

  // Tilly event log — append-only truth tape feeding the memory pipeline
  // (S2 distiller, S3 dossier, S5 bandit). Every meaningful agent/user
  // action lands here so upper layers can be rebuilt from L1.
  `CREATE TABLE IF NOT EXISTS "tilly_events" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" varchar NOT NULL,
    "household_id" varchar NOT NULL,
    "kind" text NOT NULL,
    "ts" timestamp DEFAULT now() NOT NULL,
    "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "source_table" text,
    "source_id" varchar
  )`,

  // S2 typed memory — output of the nightly distiller. New kinds
  // (decision/regret/nudge_outcome/bias_observed/tradeoff/life_context)
  // with structured metadata + lineage back to the events that fed them.
  `CREATE TABLE IF NOT EXISTS "tilly_memory_v2" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" varchar NOT NULL,
    "household_id" varchar NOT NULL,
    "kind" text NOT NULL,
    "body" text NOT NULL,
    "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "source_event_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "valid_from" timestamp DEFAULT now() NOT NULL,
    "valid_to" timestamp
  )`,

  // S3 dossier — the "what I believe about this user" doc Tilly reads
  // on every chat turn. One row per (user, generation); latest wins.
  `CREATE TABLE IF NOT EXISTS "tilly_dossiers" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" varchar NOT NULL,
    "content" jsonb NOT NULL,
    "memories_considered" integer NOT NULL DEFAULT 0,
    "generated_at" timestamp DEFAULT now() NOT NULL
  )`,

  // S8 scout jobs — live substitute / wait-and-save lookups.
  // Async — Tilly enqueues from chat, orchestrator runs in background,
  // result writes back here, push notification delivers.
  `CREATE TABLE IF NOT EXISTS "tilly_scout_jobs" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" varchar NOT NULL,
    "household_id" varchar NOT NULL,
    "query" text NOT NULL,
    "location" text,
    "status" text NOT NULL DEFAULT 'queued',
    "result" jsonb,
    "error_text" text,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "started_at" timestamp,
    "completed_at" timestamp
  )`,

  // S4 nudge log — every proactive Tilly action + its outcome. Powers
  // S5 bandit's reward signal.
  `CREATE TABLE IF NOT EXISTS "tilly_nudges" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" varchar NOT NULL,
    "household_id" varchar NOT NULL,
    "frame" text NOT NULL,
    "channel" text NOT NULL,
    "body" text NOT NULL,
    "context" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "source_table" text,
    "source_id" varchar,
    "sent_at" timestamp DEFAULT now() NOT NULL,
    "outcome" text,
    "outcome_at" timestamp,
    "outcome_event_id" varchar
  )`,

  // Indexes (idempotent)
  `CREATE INDEX IF NOT EXISTS "tilly_memory_user_active_idx" ON "tilly_memory" ("user_id", "archived_at")`,
  `CREATE INDEX IF NOT EXISTS "subscriptions_household_status_idx" ON "subscriptions" ("household_id", "status")`,
  `CREATE INDEX IF NOT EXISTS "protections_user_status_idx" ON "protections" ("user_id", "status")`,
  `CREATE INDEX IF NOT EXISTS "push_tokens_user_active_idx" ON "push_tokens" ("user_id", "disabled_at")`,
  `CREATE INDEX IF NOT EXISTS "tilly_reminders_due_idx" ON "tilly_reminders" ("status", "fire_at")`,
  // Distiller scans by (user_id, ts) every night to pull last-24h events.
  `CREATE INDEX IF NOT EXISTS "tilly_events_user_ts_idx" ON "tilly_events" ("user_id", "ts" DESC)`,
  `CREATE INDEX IF NOT EXISTS "tilly_events_kind_ts_idx" ON "tilly_events" ("kind", "ts" DESC)`,
  // Dossier reader pulls latest-N memories per user; bi-temporal queries
  // filter by valid_to IS NULL.
  `CREATE INDEX IF NOT EXISTS "tilly_memory_v2_user_created_idx" ON "tilly_memory_v2" ("user_id", "created_at" DESC)`,
  `CREATE INDEX IF NOT EXISTS "tilly_memory_v2_user_kind_idx" ON "tilly_memory_v2" ("user_id", "kind")`,
  // Dossier read on every chat turn: latest-per-user.
  `CREATE INDEX IF NOT EXISTS "tilly_dossiers_user_generated_idx" ON "tilly_dossiers" ("user_id", "generated_at" DESC)`,
  // Bandit reads pending nudges (outcome IS NULL) per user; ignore-sweeper
  // queries by sent_at.
  `CREATE INDEX IF NOT EXISTS "tilly_nudges_user_sent_idx" ON "tilly_nudges" ("user_id", "sent_at" DESC)`,
  `CREATE INDEX IF NOT EXISTS "tilly_nudges_pending_idx" ON "tilly_nudges" ("user_id", "outcome") WHERE "outcome" IS NULL`,
  // Scout jobs: client polls latest by user; recovery scans queued/running.
  `CREATE INDEX IF NOT EXISTS "tilly_scout_jobs_user_created_idx" ON "tilly_scout_jobs" ("user_id", "created_at" DESC)`,
  `CREATE INDEX IF NOT EXISTS "tilly_scout_jobs_status_idx" ON "tilly_scout_jobs" ("status", "created_at")`,
  // S11 — wait/seasonal advice mode for scout jobs.
  `ALTER TABLE "tilly_scout_jobs" ADD COLUMN IF NOT EXISTS "mode" text NOT NULL DEFAULT 'find'`,
  // S12 — persistent location signal on the user, used as the default
  // for scouts when no per-job location is provided.
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "city" text`,
  // Reminder UX S6 — Expo Push Token for the fire-reminders cron.
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "expo_push_token" text`,

  // Beta-without-Plaid: manual money snapshots collected at onboarding
  // (or later from settings) so Tilly has income/balance numbers to work
  // with even when no bank is connected.
  `CREATE TABLE IF NOT EXISTS "tilly_money_snapshot" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "household_id" varchar NOT NULL,
    "user_id" varchar,
    "monthly_income" real,
    "current_balance" real,
    "primary_bank" text,
    "source" text NOT NULL DEFAULT 'onboarding',
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "tilly_money_snapshot_household_idx" ON "tilly_money_snapshot" ("household_id", "created_at" DESC)`,

  // tilly_life_context — captures who the user is right now (employment,
  // age band, city, dependents, support obligations) so Tilly can give
  // context-aware advice. Append-only; latest row wins.
  `CREATE TABLE IF NOT EXISTS "tilly_life_context" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "household_id" varchar NOT NULL,
    "user_id" varchar,
    "employment_type" text,
    "age_band" text,
    "city" text,
    "dependents" integer,
    "support_note" text,
    "source" text NOT NULL DEFAULT 'onboarding',
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "tilly_life_context_household_idx" ON "tilly_life_context" ("household_id", "created_at" DESC)`,

  // User context on expenses: optional note + jsonb array of preset/custom tags.
  // Captured at Plaid review time (and eventually on manual entry) so Tilly can
  // explain why spend looked unusual.
  `ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "tags" jsonb`,
];

export async function applyBootMigrations(): Promise<{
  applied: number;
  failed: number;
  errors: string[];
}> {
  if (_applied) return { applied: 0, failed: 0, errors: [] };
  if (_applying) {
    await _applying;
    return { applied: 0, failed: 0, errors: [] };
  }

  _applying = (async () => {
    let applied = 0;
    let failed = 0;
    const errors: string[] = [];
    if (!pool) {
      console.warn("[migrate-boot] no DB pool — skipping");
      return;
    }
    for (const sql of CRITICAL_STATEMENTS) {
      try {
        await pool.query(sql);
        applied++;
      } catch (err: any) {
        const msg = err?.message ?? String(err);
        // "already exists" / "does not exist" errors on idempotent statements
        // are expected — count them as applied, not failed.
        if (
          msg.includes("already exists") ||
          msg.includes("does not exist") ||
          msg.includes("duplicate key")
        ) {
          applied++;
          continue;
        }
        failed++;
        errors.push(`${msg} :: ${sql.slice(0, 80)}…`);
      }
    }
    console.log(
      `[migrate-boot] applied ${applied}, failed ${failed}` +
        (errors.length ? `\n  ${errors.join("\n  ")}` : ""),
    );
    _applied = true;
  })();

  await _applying;
  return { applied: 0, failed: 0, errors: [] };
}
