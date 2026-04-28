-- BuildTogether V2 — student-edition pivot (Phase 1 schema migration).
--
-- Transforms the V1 couples-tracker schema into the household-shaped schema
-- the Tilly student-edition needs:
--   - `couples`  → `households`  (1+ member container, was 2-person couple)
--   - `partners` → `members`     (now has role + scope, optional userId)
--   - `goals`    extended with BT dream-portrait fields
--   - `households` extended with student fields (school, role)
--
-- Net-new tables for the relationship layer:
--   - `tilly_memory`     — first-person notes timeline (spec §4.6, §5.4)
--   - `tilly_tone_pref`  — per-user tone + quiet hours + thresholds (spec §5.5)
--   - `subscriptions`    — recurring tx detection (spec §4.1, §5.7)
--   - `protections`      — phishing / free-trial / unused-sub feed (spec §5.7)
--
-- Existing `coupleId`/`couple_id` field names are intentionally preserved
-- for now; Phase 1c renames them per-router as routes get extracted to
-- avoid a single landmine commit. New tables use `household_id` from day one.

-- ─── Table renames ──────────────────────────────────────────────────────────
ALTER TABLE "couples"  RENAME TO "households";
ALTER TABLE "partners" RENAME TO "members";

-- ─── Members: role + scope + nullable userId ───────────────────────────────
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "user_id" varchar;
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "role" text NOT NULL DEFAULT 'owner';
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "scope" text;

-- ─── Households: student-edition fields ────────────────────────────────────
ALTER TABLE "households" ADD COLUMN IF NOT EXISTS "school_name" text;
ALTER TABLE "households" ADD COLUMN IF NOT EXISTS "school_short" text;
ALTER TABLE "households" ADD COLUMN IF NOT EXISTS "student_role" text;

-- ─── Goals: BT dream portrait fields ───────────────────────────────────────
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "glyph" text;
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "loc" text;
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "gradient" jsonb;
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "weekly_auto" real;
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "nudge" text;
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "due_label" text;

-- ─── tilly_memory ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "tilly_memory" (
  "id"               varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"          varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "household_id"     varchar NOT NULL,
  "kind"             text NOT NULL,
  "body"             text NOT NULL,
  "source"           text NOT NULL DEFAULT 'inferred',
  "category"         text,
  "goal_id"          varchar,
  "conversation_id"  varchar,
  "date_label"       text NOT NULL,
  "noticed_at"       timestamp DEFAULT now() NOT NULL,
  "is_most_recent"   boolean DEFAULT false,
  "archived_at"      timestamp,
  "created_at"       timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tilly_memory_user_active_idx"
  ON "tilly_memory" ("user_id", "archived_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tilly_memory_household_idx"
  ON "tilly_memory" ("household_id");
--> statement-breakpoint

-- ─── tilly_tone_pref ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "tilly_tone_pref" (
  "user_id"                    varchar PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "tone"                       text NOT NULL DEFAULT 'sibling',
  "quiet_hours_start"          text DEFAULT '23:00',
  "quiet_hours_end"            text DEFAULT '07:00',
  "big_purchase_threshold"     real DEFAULT 25,
  "subscription_scan_cadence"  text DEFAULT 'weekly',
  "phishing_watch"             boolean DEFAULT true,
  "memory_retention"           text DEFAULT 'forever',
  "updated_at"                 timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── subscriptions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id"                          varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id"                varchar NOT NULL,
  "merchant"                    text NOT NULL,
  "amount"                      real NOT NULL,
  "currency"                    text DEFAULT 'USD',
  "cadence"                     text NOT NULL,
  "cadence_days"                integer,
  "last_charged_at"             text,
  "next_charge_at"              text,
  "last_used_at"                text,
  "status"                      text NOT NULL DEFAULT 'active',
  "source"                      text NOT NULL DEFAULT 'plaid_recurring',
  "plaid_recurring_stream_id"   text,
  "usage_note"                  text,
  "paused_at"                   timestamp,
  "cancelled_at"                timestamp,
  "created_at"                  timestamp DEFAULT now() NOT NULL,
  "updated_at"                  timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_household_status_idx"
  ON "subscriptions" ("household_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_next_charge_idx"
  ON "subscriptions" ("next_charge_at");
--> statement-breakpoint

-- ─── protections ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "protections" (
  "id"                     varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"                varchar NOT NULL,
  "household_id"           varchar NOT NULL,
  "kind"                   text NOT NULL,
  "severity"               text NOT NULL DEFAULT 'fyi',
  "summary"                text NOT NULL,
  "detail"                 text,
  "cta_label"              text,
  "cta_action"             text,
  "cta_target_id"          varchar,
  "subscription_id"        varchar,
  "plaid_transaction_id"   varchar,
  "status"                 text NOT NULL DEFAULT 'flagged',
  "flagged_at"             timestamp DEFAULT now() NOT NULL,
  "acted_at"               timestamp,
  "dismissed_at"           timestamp,
  "expires_at"             timestamp,
  "created_at"             timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "protections_user_status_idx"
  ON "protections" ("user_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "protections_household_severity_idx"
  ON "protections" ("household_id", "severity");
