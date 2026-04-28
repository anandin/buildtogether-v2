-- BuildTogether V2 — Phase 2.5: admin gate, LLM config, RAG embeddings.
--
-- Adds three things:
--   1. `is_admin` flag on `users` so /admin/* routes can gate access
--   2. `tilly_config` singleton row — admin tunes LLM provider/model/RAG
--   3. `embedding` column on `tilly_memory` — vector for hybrid RAG retrieval
--
-- Embeddings are stored as `real[]` for portability. Cosine similarity is
-- computed in JS for now (Tilly's scale is a few hundred memories per user).
-- Migration to `pgvector` is a future optimization when read volume warrants
-- the index cost.

-- ─── Users: admin flag ────────────────────────────────────────────────────
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "is_admin" boolean NOT NULL DEFAULT false;

-- Bootstrap the project owner as admin (anand.inbasekaran@gmail.com).
-- Idempotent — runs every deploy but only sets if a row matches.
UPDATE "users"
   SET "is_admin" = true
 WHERE "email" = 'anand.inbasekaran@gmail.com';

-- ─── Tilly memory: embedding column ───────────────────────────────────────
ALTER TABLE "tilly_memory"
  ADD COLUMN IF NOT EXISTS "embedding" real[];

-- ─── tilly_config singleton ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "tilly_config" (
  "id"                       varchar PRIMARY KEY DEFAULT 'default',
  "provider"                 text NOT NULL DEFAULT 'openrouter',
  "model"                    text NOT NULL DEFAULT 'anthropic/claude-opus-4',
  "embedding_model"          text NOT NULL DEFAULT 'openai/text-embedding-3-small',
  "max_tokens"               integer NOT NULL DEFAULT 4096,
  "retrieval_top_k"          integer NOT NULL DEFAULT 5,
  "similarity_threshold"     real NOT NULL DEFAULT 0.65,
  "retrieval_strategy"       text NOT NULL DEFAULT 'hybrid',
  "recency_half_life_hours"  real NOT NULL DEFAULT 168,
  "persona_prompt_override"  text,
  "tone_sibling_override"    text,
  "tone_coach_override"      text,
  "tone_quiet_override"      text,
  "updated_at"               timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- Seed the singleton row idempotently.
INSERT INTO "tilly_config" ("id") VALUES ('default')
  ON CONFLICT ("id") DO NOTHING;
