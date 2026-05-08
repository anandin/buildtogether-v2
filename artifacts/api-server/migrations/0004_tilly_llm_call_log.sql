-- BuildTogether — Task #27: per-call LLM cost logging.
--
-- One row per LLM or embedding call (chat, analyse, dossier, distil,
-- scout, brief, embedding, reembed, preview, expense-parse). Written
-- fire-and-forget by recordLLMCall() in server/tilly/llm/cost-log.ts.
-- The /admin Cost tab aggregates from this table.

CREATE TABLE IF NOT EXISTS "tilly_llm_call_log" (
  "id"                  varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"             varchar,
  "route"               text NOT NULL,
  "provider"            text,
  "model"               text NOT NULL,
  "prompt_tokens"       integer NOT NULL DEFAULT 0,
  "completion_tokens"   integer NOT NULL DEFAULT 0,
  "cache_read_tokens"   integer NOT NULL DEFAULT 0,
  "cache_write_tokens"  integer NOT NULL DEFAULT 0,
  "cost_usd"            real    NOT NULL DEFAULT 0,
  "latency_ms"          integer NOT NULL DEFAULT 0,
  "ok"                  boolean NOT NULL DEFAULT true,
  "error"               text,
  "created_at"          timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
-- Admin queries are "summary over a rolling N-day window", optionally
-- filtered or grouped by user / route / model. These three indexes cover
-- the hot paths without bloating writes (this table is append-only).
CREATE INDEX IF NOT EXISTS "tilly_llm_call_log_created_idx"
  ON "tilly_llm_call_log" ("created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tilly_llm_call_log_user_created_idx"
  ON "tilly_llm_call_log" ("user_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tilly_llm_call_log_route_created_idx"
  ON "tilly_llm_call_log" ("route", "created_at" DESC);
