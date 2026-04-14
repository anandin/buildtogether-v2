CREATE TABLE "activity_feed" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"couple_id" varchar NOT NULL,
	"user_id" varchar,
	"activity_type" text NOT NULL,
	"entity_id" varchar,
	"summary" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text,
	"role" text DEFAULT 'admin',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_login_at" timestamp,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "ai_corrections" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"couple_id" varchar NOT NULL,
	"expense_id" varchar,
	"original_category" text NOT NULL,
	"corrected_category" text NOT NULL,
	"ai_confidence" real,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt_name" text NOT NULL,
	"couple_id" varchar,
	"input_data" jsonb,
	"output_data" jsonb,
	"tokens_used" integer,
	"latency_ms" integer,
	"status" text NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_prompts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"description" text,
	"prompt_template" text NOT NULL,
	"model_id" text DEFAULT 'gpt-4o',
	"temperature" real DEFAULT 0.3,
	"is_active" boolean DEFAULT true,
	"version" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_prompts_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "behavioral_learning_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"couple_id" varchar NOT NULL,
	"partner_role" text,
	"loss_aversion_score" real,
	"gain_framing_score" real,
	"social_proof_score" real,
	"progress_score" real,
	"urgency_score" real,
	"trigger_event" text NOT NULL,
	"nudges_analyzed" integer DEFAULT 0,
	"ai_observation" text,
	"recommended_approach" text,
	"effective_techniques" jsonb,
	"ineffective_techniques" jsonb,
	"category_patterns" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "benchmark_configs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"config_key" text NOT NULL,
	"config_value" jsonb NOT NULL,
	"description" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "benchmark_configs_config_key_unique" UNIQUE("config_key")
);
--> statement-breakpoint
CREATE TABLE "cached_insights" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"couple_id" varchar NOT NULL,
	"data_hash" text NOT NULL,
	"insights" jsonb NOT NULL,
	"health_score" integer NOT NULL,
	"spending_breakdown" jsonb NOT NULL,
	"monthly_projected" real,
	"days_in_month" integer,
	"day_of_month" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "cached_insights_couple_id_unique" UNIQUE("couple_id")
);
--> statement-breakpoint
CREATE TABLE "category_budgets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"couple_id" varchar NOT NULL,
	"category" text NOT NULL,
	"monthly_limit" real NOT NULL,
	"budget_type" text DEFAULT 'recurring' NOT NULL,
	"alert_threshold" integer DEFAULT 80 NOT NULL,
	"rollover_balance" real DEFAULT 0 NOT NULL,
	"end_date" text,
	"last_reset_date" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commitments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"couple_id" varchar NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"commitment_type" text NOT NULL,
	"category" text,
	"merchant" text,
	"alternative_merchant" text,
	"target_amount" real,
	"current_amount" real,
	"reduction_percent" integer,
	"source_nudge_id" varchar,
	"source_pattern_id" varchar,
	"status" text DEFAULT 'active' NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text,
	"times_checked" integer DEFAULT 0,
	"times_kept" integer DEFAULT 0,
	"times_broken" integer DEFAULT 0,
	"total_saved" real DEFAULT 0,
	"cancellation_rationale" text,
	"modification_history" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "couples" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connected_since" text,
	"has_completed_onboarding" boolean DEFAULT false NOT NULL,
	"partner1_name" text DEFAULT 'You' NOT NULL,
	"partner2_name" text DEFAULT 'Partner' NOT NULL,
	"partner1_color" text DEFAULT '#FF9AA2',
	"partner2_color" text DEFAULT '#C7CEEA',
	"num_adults" integer DEFAULT 2,
	"num_kids_under_5" integer DEFAULT 0,
	"num_kids_5_to_12" integer DEFAULT 0,
	"num_teens" integer DEFAULT 0,
	"city" text,
	"country" text DEFAULT 'US',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_categories" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"couple_id" varchar NOT NULL,
	"name" text NOT NULL,
	"icon" text NOT NULL,
	"color" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_analysis" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"couple_id" varchar NOT NULL,
	"analysis_date" text NOT NULL,
	"expenses_analyzed" integer DEFAULT 0,
	"total_spent_today" real DEFAULT 0,
	"top_category_today" text,
	"daily_nudge" text,
	"nudge_type" text,
	"nudge_priority" text DEFAULT 'medium',
	"suggested_action" text,
	"target_goal_id" varchar,
	"rationale" text,
	"evidence_data" jsonb,
	"behavioral_technique" text,
	"days_without_deposit" integer,
	"current_streak_days" integer,
	"spending_vs_average" real,
	"was_shown" boolean DEFAULT false,
	"shown_at" timestamp,
	"user_response" text,
	"responded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"couple_id" varchar NOT NULL,
	"amount" real NOT NULL,
	"description" text NOT NULL,
	"merchant" text,
	"category" text NOT NULL,
	"date" text NOT NULL,
	"paid_by" text NOT NULL,
	"split_method" text DEFAULT 'even' NOT NULL,
	"split_ratio" real,
	"split_amounts" jsonb,
	"note" text,
	"is_recurring" boolean DEFAULT false,
	"recurring_frequency" text,
	"receipt_image" text,
	"is_settled" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"couple_id" varchar,
	"user_id" varchar,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"platform" text,
	"app_version" text,
	"status" text DEFAULT 'new' NOT NULL,
	"admin_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goal_contributions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" varchar NOT NULL,
	"amount" real NOT NULL,
	"date" text NOT NULL,
	"contributor" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"couple_id" varchar NOT NULL,
	"name" text NOT NULL,
	"target_amount" real NOT NULL,
	"saved_amount" real DEFAULT 0 NOT NULL,
	"emoji" text NOT NULL,
	"color" text NOT NULL,
	"target_date" text,
	"why_it_matters" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guardian_conversations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"couple_id" varchar NOT NULL,
	"user_id" varchar,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"intent" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guardian_insights" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"couple_id" varchar NOT NULL,
	"insight_type" text NOT NULL,
	"category" text,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"confidence" real DEFAULT 0.5,
	"is_active" boolean DEFAULT true,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guardian_recommendations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"couple_id" varchar NOT NULL,
	"insight_id" varchar,
	"recommendation_type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"suggested_action" text,
	"target_amount" real,
	"category" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"shown_at" timestamp,
	"acted_at" timestamp,
	"dismissed_at" timestamp,
	"user_feedback" text,
	"rationale" text,
	"evidence_data" jsonb,
	"behavioral_technique" text,
	"technique_effective" boolean,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "line_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_id" varchar NOT NULL,
	"name" text NOT NULL,
	"quantity" real DEFAULT 1,
	"unit_price" real,
	"total_price" real NOT NULL,
	"classification" text NOT NULL,
	"is_essential" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nudge_escalation" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"couple_id" varchar NOT NULL,
	"topic" text NOT NULL,
	"current_level" integer DEFAULT 1,
	"last_escalation_date" text,
	"level1_sent_at" timestamp,
	"level2_sent_at" timestamp,
	"level3_sent_at" timestamp,
	"level4_sent_at" timestamp,
	"level5_sent_at" timestamp,
	"resolved_at" timestamp,
	"resolution_type" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_invites" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"couple_id" varchar NOT NULL,
	"invite_code" text NOT NULL,
	"invited_by" varchar NOT NULL,
	"invited_email" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"accepted_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "partner_invites_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "partner_nudge_preferences" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"couple_id" varchar NOT NULL,
	"partner_role" text NOT NULL,
	"loss_aversion_score" real DEFAULT 0.5,
	"gain_framing_score" real DEFAULT 0.5,
	"social_proof_score" real DEFAULT 0.5,
	"progress_score" real DEFAULT 0.5,
	"urgency_score" real DEFAULT 0.5,
	"weakness_categories" jsonb,
	"peak_spending_days" jsonb,
	"best_response_time" text,
	"total_nudges_received" integer DEFAULT 0,
	"nudges_acted_on" integer DEFAULT 0,
	"nudges_dismissed" integer DEFAULT 0,
	"total_saved_from_nudges" real DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"couple_id" varchar NOT NULL,
	"partner_id" varchar NOT NULL,
	"name" text NOT NULL,
	"avatar" text,
	"color" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plaid_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"couple_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"plaid_item_id" text NOT NULL,
	"access_token" text NOT NULL,
	"institution_id" text,
	"institution_name" text,
	"cursor" text,
	"status" text DEFAULT 'active' NOT NULL,
	"last_sync_at" timestamp,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plaid_items_plaid_item_id_unique" UNIQUE("plaid_item_id")
);
--> statement-breakpoint
CREATE TABLE "plaid_transactions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"couple_id" varchar NOT NULL,
	"plaid_item_id" varchar NOT NULL,
	"plaid_transaction_id" text NOT NULL,
	"account_id" text,
	"amount" real NOT NULL,
	"date" text NOT NULL,
	"merchant_name" text,
	"name" text NOT NULL,
	"plaid_category" jsonb,
	"our_category" text,
	"pending" boolean DEFAULT false,
	"status" text DEFAULT 'pending_review' NOT NULL,
	"expense_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plaid_transactions_plaid_transaction_id_unique" UNIQUE("plaid_transaction_id")
);
--> statement-breakpoint
CREATE TABLE "savings_confirmations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"couple_id" varchar NOT NULL,
	"goal_id" varchar,
	"amount" real NOT NULL,
	"confirmation_type" text NOT NULL,
	"note" text,
	"triggered_by" text,
	"recommendation_id" varchar,
	"is_verified" boolean DEFAULT false,
	"confirmation_date" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "savings_streaks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"couple_id" varchar NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"last_confirmation_date" text,
	"total_confirmations" integer DEFAULT 0 NOT NULL,
	"total_amount_saved" real DEFAULT 0 NOT NULL,
	"streak_broken_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "savings_streaks_couple_id_unique" UNIQUE("couple_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"couple_id" varchar NOT NULL,
	"expense_ids" jsonb NOT NULL,
	"from_partner" text NOT NULL,
	"to_partner" text NOT NULL,
	"amount" real NOT NULL,
	"date" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spending_benchmarks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text NOT NULL,
	"family_size" integer NOT NULL,
	"has_kids" boolean DEFAULT false,
	"country" text DEFAULT 'US' NOT NULL,
	"monthly_average" real NOT NULL,
	"low_range" real NOT NULL,
	"high_range" real NOT NULL,
	"source" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spending_patterns" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"couple_id" varchar NOT NULL,
	"pattern_type" text NOT NULL,
	"category" text,
	"merchant" text,
	"frequency" text,
	"average_amount" real,
	"total_spent" real,
	"occurrence_count" integer NOT NULL,
	"first_occurrence" text,
	"last_occurrence" text,
	"confidence" real DEFAULT 0.5,
	"is_habitual" boolean DEFAULT false,
	"ai_summary" text,
	"suggested_action" text,
	"alternative_suggestion" text,
	"potential_monthly_savings" real,
	"status" text DEFAULT 'detected' NOT NULL,
	"nudge_sent_at" timestamp,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"name" text,
	"password_hash" text,
	"apple_id" text,
	"google_id" text,
	"couple_id" varchar,
	"partner_role" text,
	"avatar_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_login_at" timestamp,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_apple_id_unique" UNIQUE("apple_id"),
	CONSTRAINT "users_google_id_unique" UNIQUE("google_id")
);
--> statement-breakpoint
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_items" ADD CONSTRAINT "line_items_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_invites" ADD CONSTRAINT "partner_invites_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_invites" ADD CONSTRAINT "partner_invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;