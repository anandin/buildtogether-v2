-- BuildTogether V2 — Phase 5: push notifications.
--
-- One row per (user, device). The client calls
-- /api/push/register on app launch with the Expo push token from
-- expo-notifications.getExpoPushTokenAsync().

CREATE TABLE IF NOT EXISTS "push_tokens" (
  "id"            varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"       varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token"         text NOT NULL UNIQUE,
  "platform"      text NOT NULL,
  "device_label"  text,
  "last_seen_at"  timestamp NOT NULL DEFAULT now(),
  "disabled_at"   timestamp,
  "created_at"    timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "push_tokens_user_active_idx"
  ON "push_tokens" ("user_id", "disabled_at");
