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

  // Tilly retrieval log — every chat/analysis turn's RAG hit list.
  // Powers the admin transparency surface (latest retrieval per user).
  `CREATE TABLE IF NOT EXISTS "tilly_retrieval_log" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" varchar NOT NULL,
    "conversation_id" varchar,
    "kind" text NOT NULL DEFAULT 'chat',
    "memory_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
    "scores" jsonb NOT NULL DEFAULT '[]'::jsonb,
    "strategy" text NOT NULL DEFAULT 'hybrid',
    "prompt_size" integer NOT NULL DEFAULT 0,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "tilly_retrieval_log_user_created_idx" ON "tilly_retrieval_log" ("user_id", "created_at" DESC)`,

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

  // Task #27: per-call LLM cost log. One row per LLM/embedding call,
  // written fire-and-forget by recordLLMCall() in tilly/llm/cost-log.ts.
  // Drives the /admin Cost tab.
  `CREATE TABLE IF NOT EXISTS "tilly_llm_call_log" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" varchar,
    "route" text NOT NULL,
    "provider" text,
    "model" text NOT NULL,
    "prompt_tokens" integer NOT NULL DEFAULT 0,
    "completion_tokens" integer NOT NULL DEFAULT 0,
    "cache_read_tokens" integer NOT NULL DEFAULT 0,
    "cache_write_tokens" integer NOT NULL DEFAULT 0,
    "cost_usd" real NOT NULL DEFAULT 0,
    "latency_ms" integer NOT NULL DEFAULT 0,
    "ok" boolean NOT NULL DEFAULT true,
    "error" text,
    "created_at" timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS "tilly_llm_call_log_created_idx" ON "tilly_llm_call_log" ("created_at" DESC)`,
  `CREATE INDEX IF NOT EXISTS "tilly_llm_call_log_user_created_idx" ON "tilly_llm_call_log" ("user_id", "created_at" DESC)`,
  `CREATE INDEX IF NOT EXISTS "tilly_llm_call_log_route_created_idx" ON "tilly_llm_call_log" ("route", "created_at" DESC)`,

  // Task #23: merchant rules + sync-time questions. The signature column +
  // applied_rule_id breadcrumb on plaid_transactions let the pending queue
  // group by merchant without recomputing, and let auditors trace which
  // rule auto-accepted which row.
  `ALTER TABLE "plaid_transactions" ADD COLUMN IF NOT EXISTS "signature" text`,
  `ALTER TABLE "plaid_transactions" ADD COLUMN IF NOT EXISTS "applied_rule_id" varchar`,
  `ALTER TABLE "plaid_transactions" ADD COLUMN IF NOT EXISTS "ai_suggested_reasoning" text`,
  `CREATE TABLE IF NOT EXISTS "user_preferences" (
    "user_id" varchar NOT NULL,
    "scope" text NOT NULL,
    "key" text NOT NULL,
    "value" jsonb NOT NULL,
    "updated_at" timestamp NOT NULL DEFAULT now(),
    PRIMARY KEY ("user_id", "scope", "key")
  )`,
  `CREATE INDEX IF NOT EXISTS "plaid_transactions_couple_status_signature_idx"
     ON "plaid_transactions" ("couple_id", "status", "signature")`,
  // Tilly self-learned skill library (Hermes/Voyager pattern, 2026).
  // Stores the skills the induction worker has extracted from successful
  // tool trajectories. Retrieved at chat time via embedding similarity.
  `CREATE TABLE IF NOT EXISTS "tilly_skills" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "name" text NOT NULL UNIQUE,
    "description" text NOT NULL,
    "instructions" text NOT NULL,
    "trigger_phrases" jsonb NOT NULL DEFAULT '[]'::jsonb,
    "trigger_embedding" real[],
    "applies_when" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "source_event_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
    "confidence" real NOT NULL DEFAULT 0.5,
    "status" text NOT NULL DEFAULT 'proposed',
    "used_count" integer NOT NULL DEFAULT 0,
    "success_count" integer NOT NULL DEFAULT 0,
    "fail_count" integer NOT NULL DEFAULT 0,
    "last_used_at" timestamp,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS "tilly_skills_status_used_idx" ON "tilly_skills" ("status", "last_used_at" DESC NULLS LAST)`,
  // Projection history — records computeMonthFlow's projected_close at
  // (a) the time the projection was made and (b) the actual close once
  // the month rolls over. The detector reads this to surface "Tilly's
  // been within $X on average" + uses error to weight future
  // projections. One row per (household, month).
  `CREATE TABLE IF NOT EXISTS "projection_history" (
    "household_id" varchar NOT NULL,
    "month" text NOT NULL,
    "predicted_close" real NOT NULL,
    "actual_close" real NOT NULL DEFAULT 0,
    "predicted_at" timestamp NOT NULL DEFAULT now(),
    "settled_at" timestamp,
    PRIMARY KEY ("household_id", "month")
  )`,
  // Re-imports of the same real-world Plaid debit (sync rewrite replays,
  // item reconnects, Plaid issuing fresh transaction_ids for the same
  // posting) slipped through the (plaid_transaction_id) unique
  // constraint and produced 13 phantom rows totalling $5,181 of fake
  // outflow on 2026-05-13. This partial unique index catches them at
  // insert time: two rows with the same (couple, item, date, amount,
  // signature) tuple are blocked. The sync handler's existing
  // try/catch-on-duplicate logic swallows the violation silently. The
  // WHERE clause skips legacy rows without signatures so we don't
  // retroactively collide on old data.
  `CREATE UNIQUE INDEX IF NOT EXISTS "plaid_transactions_couple_item_date_amount_signature_uniq"
     ON "plaid_transactions" ("couple_id", "plaid_item_id", "date", "amount", "signature")
     WHERE "signature" IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS "merchant_rules" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "couple_id" varchar NOT NULL,
    "signature" text NOT NULL,
    "last_merchant" text NOT NULL,
    "category" text,
    "default_tags" jsonb,
    "default_note" text,
    "auto_accept" boolean NOT NULL DEFAULT false,
    "auto_ignore" boolean NOT NULL DEFAULT false,
    "hit_count" integer NOT NULL DEFAULT 0,
    "ignore_count" integer NOT NULL DEFAULT 0,
    "source" text NOT NULL DEFAULT 'learned',
    "last_applied_at" timestamp,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "merchant_rules_couple_signature_uniq"
     ON "merchant_rules" ("couple_id", "signature")`,
  `ALTER TABLE "merchant_rules" ADD COLUMN IF NOT EXISTS "display_name_override" text`,
  // Lightweight debug-trace table. Survives Vercel Fluid instance recycling
  // so we can correlate "what the iPhone got" against UI behavior. Cleaned
  // up automatically on a 24-hour TTL window inside the audit endpoint.
  `CREATE TABLE IF NOT EXISTS "debug_audit_log" (
    "id" bigserial PRIMARY KEY,
    "kind" text NOT NULL,
    "couple_id" varchar,
    "data" jsonb NOT NULL,
    "created_at" timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS "debug_audit_log_created_idx"
     ON "debug_audit_log" ("created_at" DESC)`,
  `CREATE TABLE IF NOT EXISTS "tilly_questions" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" varchar NOT NULL,
    "household_id" varchar NOT NULL,
    "kind" text NOT NULL,
    "body" text NOT NULL,
    "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "status" text NOT NULL DEFAULT 'open',
    "answer" text,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "answered_at" timestamp
  )`,
  `CREATE INDEX IF NOT EXISTS "tilly_questions_household_status_idx"
     ON "tilly_questions" ("household_id", "status", "created_at" DESC)`,

  // Phase 3: LLM-aided categorization. The PFC column unblocks the backfill
  // loop in /api/plaid/pending — it was passing personal_finance_category=null
  // and so the PFC-based filters in shouldAutoAcceptPlaidTransaction never
  // fired, leaving transfers/CC payments stranded. ai_suggested_* columns
  // are populated by the classifier when no merchant rule exists yet.
  `ALTER TABLE "plaid_transactions" ADD COLUMN IF NOT EXISTS "personal_finance_category" jsonb`,
  `ALTER TABLE "plaid_transactions" ADD COLUMN IF NOT EXISTS "ai_suggested_category" text`,
  `ALTER TABLE "plaid_transactions" ADD COLUMN IF NOT EXISTS "ai_suggested_tags" jsonb`,
  `ALTER TABLE "plaid_transactions" ADD COLUMN IF NOT EXISTS "ai_suggested_confidence" real`,

  // Sprint A — watchlist. Core thesis surface ("name what you're eyeing
  // before you act"). Each row is one item the user (or Tilly via tool)
  // has put on the list. Statuses: active (default), bought, dropped.
  // estimatedPrice is optional — Tilly fills it in if user provides;
  // affordability snapshots downstream will refresh it.
  `CREATE TABLE IF NOT EXISTS "watchlist_items" (
     "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
     "user_id" varchar NOT NULL,
     "household_id" varchar NOT NULL,
     "name" text NOT NULL,
     "estimated_price" real,
     "status" text NOT NULL DEFAULT 'active',
     "added_at" timestamp DEFAULT now() NOT NULL,
     "resolved_at" timestamp,
     "last_nudged_at" timestamp,
     "metadata" jsonb
   )`,
  `CREATE INDEX IF NOT EXISTS "watchlist_household_status_added_idx"
     ON "watchlist_items" ("household_id", "status", "added_at" DESC)`,

  // Plaid item webhook backfill — track which items have already had
  // their webhook URL pushed to Plaid via itemWebhookUpdate so the
  // backfill is idempotent across boots.
  `ALTER TABLE "plaid_items" ADD COLUMN IF NOT EXISTS "webhook_registered_at" timestamp`,

  // Security audit log (SOC 2 CC7.2) — append-only record of
  // auth/privileged/data-deletion events. Written by security/audit.ts.
  `CREATE TABLE IF NOT EXISTS "audit_log" (
     "id" bigserial PRIMARY KEY,
     "action" text NOT NULL,
     "actor_type" text NOT NULL,
     "actor_id" varchar,
     "target_type" text,
     "target_id" varchar,
     "status" text NOT NULL DEFAULT 'success',
     "ip" text,
     "user_agent" text,
     "metadata" jsonb,
     "created_at" timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS "audit_log_action_created_idx" ON "audit_log" ("action", "created_at" DESC)`,
  `CREATE INDEX IF NOT EXISTS "audit_log_actor_created_idx" ON "audit_log" ("actor_id", "created_at" DESC)`,
  // Commitment layer (docs/PRD_COMMITMENT_LAYER.md, Phase 2).
  `ALTER TABLE "goal_contributions" ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'earmarked'`,
  `ALTER TABLE "goal_contributions" ADD COLUMN IF NOT EXISTS "commitment_id" varchar`,
  `ALTER TABLE "goal_contributions" ADD COLUMN IF NOT EXISTS "payday_date" text`,
  // Manual contributions are the user asserting money moved; only the
  // ledger-only auto rows were ever "earmarked". Idempotent re-run.
  `UPDATE "goal_contributions" SET "kind" = 'moved' WHERE "contributor" <> 'auto' AND "kind" = 'earmarked' AND "commitment_id" IS NULL`,
  `CREATE TABLE IF NOT EXISTS "sweep_commitments" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "household_id" varchar NOT NULL,
    "user_id" varchar NOT NULL,
    "kind" text NOT NULL DEFAULT 'sweep',
    "target_goal_id" varchar REFERENCES "goals"("id") ON DELETE CASCADE,
    "amount" real NOT NULL,
    "cadence" text NOT NULL DEFAULT 'per_paycheck',
    "status" text NOT NULL DEFAULT 'active',
    "floor_amount" real,
    "escalation" jsonb,
    "consent_frame" text,
    "consented_at" timestamp DEFAULT now() NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "ended_at" timestamp,
    "ended_reason" text
  )`,
  `ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "liability_ref" text`,
  `CREATE INDEX IF NOT EXISTS "sweep_commitments_household_status_idx" ON "sweep_commitments" ("household_id", "status")`,
  `CREATE INDEX IF NOT EXISTS "goal_contributions_commitment_payday_idx" ON "goal_contributions" ("commitment_id", "payday_date")`,
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

    // Data migration (not pure SQL): encrypt any Plaid access_token still
    // stored as legacy plaintext. Idempotent — encrypted rows carry the
    // `enc:v1:` prefix and are skipped. Best-effort; a failure here must
    // not block boot (reads stay backward-compatible via decryptSecret).
    try {
      const { isEncrypted, encryptSecret, encryptionConfigured } = await import(
        "./security/crypto-fields"
      );
      if (encryptionConfigured()) {
        const { rows } = await pool.query<{ id: string; access_token: string }>(
          `SELECT "id", "access_token" FROM "plaid_items"`,
        );
        let migrated = 0;
        for (const r of rows) {
          if (isEncrypted(r.access_token)) continue;
          const enc = encryptSecret(r.access_token);
          await pool.query(
            `UPDATE "plaid_items" SET "access_token" = $1 WHERE "id" = $2`,
            [enc, r.id],
          );
          migrated++;
        }
        if (migrated > 0) {
          console.log(`[migrate-boot] encrypted ${migrated} legacy Plaid access token(s)`);
        }
      } else {
        console.warn(
          "[migrate-boot] APP_ENCRYPTION_KEY not set — skipping Plaid token encryption migration",
        );
      }
    } catch (err) {
      console.error("[migrate-boot] token encryption migration failed (non-fatal):", (err as Error)?.message);
    }

    _applied = true;
  })();

  await _applying;
  return { applied: 0, failed: 0, errors: [] };
}
