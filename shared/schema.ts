import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: text("email").unique(),
  name: text("name"),
  passwordHash: text("password_hash"),
  appleId: text("apple_id").unique(),
  googleId: text("google_id").unique(),
  coupleId: varchar("couple_id"),
  partnerRole: text("partner_role"),
  avatarUrl: text("avatar_url"),
  /** Admin flag — gates access to /api/admin/* + /admin/* routes (spec D8). */
  isAdmin: boolean("is_admin").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at"),
});

export const sessions = pgTable("sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const partnerInvites = pgTable("partner_invites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coupleId: varchar("couple_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  inviteCode: text("invite_code").notNull().unique(),
  invitedBy: varchar("invited_by").notNull().references(() => users.id),
  invitedEmail: text("invited_email"),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedBy: varchar("accepted_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Members of a household. Replaces the V1 couples-tracker `partners` table.
 *
 * `role` describes the relationship to the household owner:
 *   - `owner`           — the primary student / account holder
 *   - `trusted_viewer`  — sees credit + dreams (e.g. parent)
 *   - `splitter`        — used in expense splits (roommate)
 *   - `family`          — informational only (sibling)
 *
 * For a student-edition household-of-one, exactly one row exists with
 * role='owner'. Trusted-people invitations append additional rows.
 */
export const members = pgTable("members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Phase 1: keeping `couple_id` column name for back-compat with V1 partners table data.
  // Phase 1c renames to `household_id` per-router as we extract.
  coupleId: varchar("couple_id").notNull(),
  partnerId: varchar("partner_id").notNull(),
  userId: varchar("user_id"), // null until the trusted person accepts an invite + creates an account
  name: text("name").notNull(),
  role: text("role").notNull().default("owner"), // owner | trusted_viewer | splitter | family
  scope: text("scope"), // human-readable summary, e.g. "splits — groceries, rent"
  avatar: text("avatar"),
  color: text("color"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const expenses = pgTable("expenses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coupleId: varchar("couple_id").notNull(),
  amount: real("amount").notNull(),
  description: text("description").notNull(),
  merchant: text("merchant"),
  category: text("category").notNull(),
  date: text("date").notNull(),
  paidBy: text("paid_by").notNull(),
  splitMethod: text("split_method").notNull().default("even"),
  splitRatio: real("split_ratio"),
  splitAmounts: jsonb("split_amounts"),
  note: text("note"),
  isRecurring: boolean("is_recurring").default(false),
  recurringFrequency: text("recurring_frequency"),
  receiptImage: text("receipt_image"),
  isSettled: boolean("is_settled").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Goals / "Dreams" — the spec §4.5 portrait cards. The BT redesign adds
 * portrait-specific fields (glyph, gradient, loc, weekly auto-save, nudge
 * copy) on top of the legacy V1 goal shape (kept for backward compatibility
 * during the transition).
 */
export const goals = pgTable("goals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Phase 1: column kept as `couple_id` for incremental rename. Phase 1c renames per-router.
  coupleId: varchar("couple_id").notNull(),
  name: text("name").notNull(),
  targetAmount: real("target_amount").notNull(),
  savedAmount: real("saved_amount").default(0).notNull(),
  emoji: text("emoji").notNull(),
  color: text("color").notNull(),
  targetDate: text("target_date"),
  whyItMatters: text("why_it_matters"),
  // BT dream-portrait fields:
  glyph: text("glyph"), // ✺ ◇ ◉ — single oversized character
  loc: text("loc"), // "Spring break · Mar 12"
  gradient: jsonb("gradient"), // [from, to] hex strings for header
  weeklyAuto: real("weekly_auto"), // amount Tilly moves each Friday (0 = manual)
  nudge: text("nudge"), // contextual Tilly line, e.g. "Skip two takeouts and Barcelona arrives Feb 18"
  dueLabel: text("due_label"), // "Mar 5" / "Year-round" — display-friendly target
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const goalContributions = pgTable("goal_contributions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  goalId: varchar("goal_id").notNull().references(() => goals.id, { onDelete: "cascade" }),
  amount: real("amount").notNull(),
  date: text("date").notNull(),
  contributor: text("contributor").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const categoryBudgets = pgTable("category_budgets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coupleId: varchar("couple_id").notNull(),
  category: text("category").notNull(),
  monthlyLimit: real("monthly_limit").notNull(),
  budgetType: text("budget_type").notNull().default("recurring"),
  alertThreshold: integer("alert_threshold").default(80).notNull(),
  rolloverBalance: real("rollover_balance").default(0).notNull(),
  endDate: text("end_date"),
  lastResetDate: text("last_reset_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const customCategories = pgTable("custom_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coupleId: varchar("couple_id").notNull(),
  name: text("name").notNull(),
  icon: text("icon").notNull(),
  color: text("color").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const settlements = pgTable("settlements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coupleId: varchar("couple_id").notNull(),
  expenseIds: jsonb("expense_ids").notNull(),
  from: text("from_partner").notNull(),
  to: text("to_partner").notNull(),
  amount: real("amount").notNull(),
  date: text("date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Households — the 1+ member container that owns expenses, dreams, budgets,
 * subscriptions, etc. Replaces the V1 couples-tracker `couples` table. A
 * student-edition household has one member with role='owner'; trusted-people
 * (parents, roommates, friends) are added via the `members` table.
 *
 * Legacy V1 partner1/partner2 fields are retained for back-compat during the
 * Phase 1 → Phase 2 transition; new code should read from `members` instead.
 */
export const households = pgTable("households", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  connectedSince: text("connected_since"),
  hasCompletedOnboarding: boolean("has_completed_onboarding").default(false).notNull(),
  // Legacy couples fields — kept for back-compat, deprecated in Phase 2.
  partner1Name: text("partner1_name").default("You").notNull(),
  partner2Name: text("partner2_name").default("Partner").notNull(),
  partner1Color: text("partner1_color").default("#FF9AA2"),
  partner2Color: text("partner2_color").default("#C7CEEA"),
  numAdults: integer("num_adults").default(2),
  numKidsUnder5: integer("num_kids_under_5").default(0),
  numKids5to12: integer("num_kids_5_to_12").default(0),
  numTeens: integer("num_teens").default(0),
  city: text("city"),
  country: text("country").default("US"),
  // BT student-edition fields:
  schoolName: text("school_name"), // "NYU"
  schoolShort: text("school_short"), // "NYU"
  studentRole: text("student_role"), // "NYU Junior"
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const lineItems = pgTable("line_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  expenseId: varchar("expense_id").notNull().references(() => expenses.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  quantity: real("quantity").default(1),
  unitPrice: real("unit_price"),
  totalPrice: real("total_price").notNull(),
  classification: text("classification").notNull(),
  isEssential: boolean("is_essential").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const spendingBenchmarks = pgTable("spending_benchmarks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  category: text("category").notNull(),
  familySize: integer("family_size").notNull(),
  hasKids: boolean("has_kids").default(false),
  country: text("country").notNull().default("US"),
  monthlyAverage: real("monthly_average").notNull(),
  lowRange: real("low_range").notNull(),
  highRange: real("high_range").notNull(),
  source: text("source"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const cachedInsights = pgTable("cached_insights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coupleId: varchar("couple_id").notNull().unique(),
  dataHash: text("data_hash").notNull(),
  insights: jsonb("insights").notNull(),
  healthScore: integer("health_score").notNull(),
  spendingBreakdown: jsonb("spending_breakdown").notNull(),
  monthlyProjected: real("monthly_projected"),
  daysInMonth: integer("days_in_month"),
  dayOfMonth: integer("day_of_month"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

// Guardian Memory System - for hyper-personalized AI coaching
export const guardianInsights = pgTable("guardian_insights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coupleId: varchar("couple_id").notNull(),
  insightType: text("insight_type").notNull(), // pattern, achievement, warning, preference
  category: text("category"), // spending category if relevant
  title: text("title").notNull(),
  description: text("description").notNull(),
  confidence: real("confidence").default(0.5), // 0-1 how confident the AI is
  isActive: boolean("is_active").default(true),
  metadata: jsonb("metadata"), // flexible data for different insight types
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const guardianRecommendations = pgTable("guardian_recommendations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coupleId: varchar("couple_id").notNull(),
  insightId: varchar("insight_id"), // link to the insight that triggered this
  recommendationType: text("recommendation_type").notNull(), // savings_tip, budget_adjust, goal_reminder, celebrate
  title: text("title").notNull(),
  message: text("message").notNull(),
  suggestedAction: text("suggested_action"), // what the user should do
  targetAmount: real("target_amount"), // if saving/budget related
  category: text("category"), // if category specific
  status: text("status").notNull().default("pending"), // pending, shown, acted, dismissed, expired
  shownAt: timestamp("shown_at"),
  actedAt: timestamp("acted_at"),
  dismissedAt: timestamp("dismissed_at"),
  userFeedback: text("user_feedback"), // helpful, not_helpful, already_knew
  rationale: text("rationale"), // WHY the AI made this recommendation
  evidenceData: jsonb("evidence_data"), // specific data points that led to this: {spendingPattern, amounts, dates}
  behavioralTechnique: text("behavioral_technique"), // which psychology technique was used
  techniqueEffective: boolean("technique_effective"), // was this technique effective? (set after response)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const behavioralLearningHistory = pgTable("behavioral_learning_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coupleId: varchar("couple_id").notNull(),
  partnerRole: text("partner_role"), // partner1, partner2, or null for couple-level
  
  // Score snapshots at this learning event
  lossAversionScore: real("loss_aversion_score"),
  gainFramingScore: real("gain_framing_score"),
  socialProofScore: real("social_proof_score"),
  progressScore: real("progress_score"),
  urgencyScore: real("urgency_score"),
  
  // What triggered this learning event
  triggerEvent: text("trigger_event").notNull(), // periodic_analysis, major_response, manual_reset
  nudgesAnalyzed: integer("nudges_analyzed").default(0),
  
  // AI's observations about this learning cycle
  aiObservation: text("ai_observation"), // "User responds well to progress framing, ignores urgency"
  recommendedApproach: text("recommended_approach"), // "Use progress updates, avoid time pressure"
  
  // Specific patterns detected
  effectiveTechniques: jsonb("effective_techniques"), // ["progress", "loss_aversion"]
  ineffectiveTechniques: jsonb("ineffective_techniques"), // ["urgency", "social_proof"]
  categoryPatterns: jsonb("category_patterns"), // {restaurants: "responds to cooking suggestions"}
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const savingsConfirmations = pgTable("savings_confirmations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coupleId: varchar("couple_id").notNull(),
  goalId: varchar("goal_id"), // optional link to a specific dream/goal
  amount: real("amount").notNull(),
  confirmationType: text("confirmation_type").notNull(), // bank_transfer, cash_saved, auto_transfer
  note: text("note"),
  triggeredBy: text("triggered_by"), // which partner confirmed
  recommendationId: varchar("recommendation_id"), // if this was from a Guardian recommendation
  isVerified: boolean("is_verified").default(false), // for future bank linking
  confirmationDate: text("confirmation_date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Track savings streaks for gamification
export const savingsStreaks = pgTable("savings_streaks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coupleId: varchar("couple_id").notNull().unique(),
  currentStreak: integer("current_streak").default(0).notNull(), // weeks in a row
  longestStreak: integer("longest_streak").default(0).notNull(),
  lastConfirmationDate: text("last_confirmation_date"),
  totalConfirmations: integer("total_confirmations").default(0).notNull(),
  totalAmountSaved: real("total_amount_saved").default(0).notNull(),
  streakBrokenCount: integer("streak_broken_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Daily AI Analysis tracking - triggers proactive insights
export const dailyAnalysis = pgTable("daily_analysis", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coupleId: varchar("couple_id").notNull(),
  analysisDate: text("analysis_date").notNull(), // YYYY-MM-DD
  
  // What was analyzed
  expensesAnalyzed: integer("expenses_analyzed").default(0),
  totalSpentToday: real("total_spent_today").default(0),
  topCategoryToday: text("top_category_today"),
  
  // AI-generated daily insight
  dailyNudge: text("daily_nudge"), // The main message for the day
  nudgeType: text("nudge_type"), // celebration, warning, encouragement, tip, loss_aversion
  nudgePriority: text("nudge_priority").default("medium"), // low, medium, high, urgent
  suggestedAction: text("suggested_action"),
  targetGoalId: varchar("target_goal_id"), // Which dream to nudge toward
  
  // AI Transparency: WHY the recommendation was made
  rationale: text("rationale"), // Human-readable explanation of why AI made this recommendation
  evidenceData: jsonb("evidence_data"), // Specific data: {triggerPattern, dataPoints[], comparisonContext, confidenceLevel}
  behavioralTechnique: text("behavioral_technique"), // Which psychology technique was used
  
  // Behavioral context used
  daysWithoutDeposit: integer("days_without_deposit"),
  currentStreakDays: integer("current_streak_days"),
  spendingVsAverage: real("spending_vs_average"), // 1.0 = normal, 1.5 = 50% higher
  
  // User response tracking
  wasShown: boolean("was_shown").default(false),
  shownAt: timestamp("shown_at"),
  userResponse: text("user_response"), // acted, dismissed, ignored
  respondedAt: timestamp("responded_at"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Partner-specific nudge preferences - learn what works for each person
export const partnerNudgePreferences = pgTable("partner_nudge_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coupleId: varchar("couple_id").notNull(),
  partnerRole: text("partner_role").notNull(), // partner1 or partner2
  
  // Nudge style effectiveness (0-1 scale, higher = more effective)
  lossAversionScore: real("loss_aversion_score").default(0.5), // "You'll lose X if..."
  gainFramingScore: real("gain_framing_score").default(0.5), // "You'll gain X if..."
  socialProofScore: real("social_proof_score").default(0.5), // "Couples like you..."
  progressScore: real("progress_score").default(0.5), // "You're X% there!"
  urgencyScore: real("urgency_score").default(0.5), // "Act now before..."
  
  // Category-specific patterns
  weaknessCategories: jsonb("weakness_categories"), // ["shopping", "restaurants"]
  peakSpendingDays: jsonb("peak_spending_days"), // ["saturday", "friday"]
  bestResponseTime: text("best_response_time"), // "morning", "evening"
  
  // Historical effectiveness
  totalNudgesReceived: integer("total_nudges_received").default(0),
  nudgesActedOn: integer("nudges_acted_on").default(0),
  nudgesDismissed: integer("nudges_dismissed").default(0),
  totalSavedFromNudges: real("total_saved_from_nudges").default(0),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Escalating nudge history - tracks nudge intensity over time
export const nudgeEscalation = pgTable("nudge_escalation", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coupleId: varchar("couple_id").notNull(),
  topic: text("topic").notNull(), // e.g., "shopping_overspend", "no_deposits", "streak_risk"
  
  currentLevel: integer("current_level").default(1), // 1-5, 1=gentle, 5=urgent
  lastEscalationDate: text("last_escalation_date"),
  
  // Escalation history
  level1SentAt: timestamp("level1_sent_at"),
  level2SentAt: timestamp("level2_sent_at"),
  level3SentAt: timestamp("level3_sent_at"),
  level4SentAt: timestamp("level4_sent_at"),
  level5SentAt: timestamp("level5_sent_at"),
  
  // Resolution
  resolvedAt: timestamp("resolved_at"),
  resolutionType: text("resolution_type"), // user_acted, auto_resolved, dismissed
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const goalsRelations = relations(goals, ({ many }) => ({
  contributions: many(goalContributions),
}));

export const goalContributionsRelations = relations(goalContributions, ({ one }) => ({
  goal: one(goals, {
    fields: [goalContributions.goalId],
    references: [goals.id],
  }),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  sessions: many(sessions),
  household: one(households, {
    fields: [users.coupleId],
    references: [households.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const partnerInvitesRelations = relations(partnerInvites, ({ one }) => ({
  household: one(households, {
    fields: [partnerInvites.coupleId],
    references: [households.id],
  }),
  inviter: one(users, {
    fields: [partnerInvites.invitedBy],
    references: [users.id],
  }),
}));

// User Commitments - pre-commitments made from nudges
export const commitments = pgTable("commitments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coupleId: varchar("couple_id").notNull(),
  
  // What they committed to
  title: text("title").notNull(),
  description: text("description"),
  commitmentType: text("commitment_type").notNull(), // budget_limit, spending_reduction, alternative_switch, savings_target
  
  // The specific commitment details
  category: text("category"), // if category-specific
  merchant: text("merchant"), // if merchant-specific (e.g., "Starbucks")
  alternativeMerchant: text("alternative_merchant"), // if switching (e.g., "Tim Hortons")
  targetAmount: real("target_amount"), // budget limit or savings target
  currentAmount: real("current_amount"), // baseline for comparison
  reductionPercent: integer("reduction_percent"), // e.g., 50% reduction
  
  // Source: what triggered this commitment
  sourceNudgeId: varchar("source_nudge_id"), // link to the recommendation that created this
  sourcePatternId: varchar("source_pattern_id"), // link to detected pattern
  
  // Status tracking
  status: text("status").notNull().default("active"), // active, paused, completed, broken, cancelled
  startDate: text("start_date").notNull(),
  endDate: text("end_date"), // null = ongoing
  
  // Progress tracking
  timesChecked: integer("times_checked").default(0),
  timesKept: integer("times_kept").default(0),
  timesBroken: integer("times_broken").default(0),
  totalSaved: real("total_saved").default(0),
  
  // If cancelled/modified, store user rationale for learning
  cancellationRationale: text("cancellation_rationale"),
  modificationHistory: jsonb("modification_history"), // [{date, change, rationale}]
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Detected spending patterns
export const spendingPatterns = pgTable("spending_patterns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coupleId: varchar("couple_id").notNull(),
  
  // Pattern identification
  patternType: text("pattern_type").notNull(), // habitual_merchant, category_spike, time_based, escalating
  category: text("category"),
  merchant: text("merchant"),
  
  // Pattern details
  frequency: text("frequency"), // daily, weekly, bi-weekly
  averageAmount: real("average_amount"),
  totalSpent: real("total_spent"),
  occurrenceCount: integer("occurrence_count").notNull(),
  firstOccurrence: text("first_occurrence"),
  lastOccurrence: text("last_occurrence"),
  
  // Pattern strength
  confidence: real("confidence").default(0.5), // 0-1
  isHabitual: boolean("is_habitual").default(false), // true if established pattern (3+ occurrences)
  
  // AI analysis
  aiSummary: text("ai_summary"), // "You visit Starbucks 3x/week, spending $27/week on coffee"
  suggestedAction: text("suggested_action"), // "Set a $15/week coffee budget"
  alternativeSuggestion: text("alternative_suggestion"), // "Try Tim Hortons - save $2/visit"
  potentialMonthlySavings: real("potential_monthly_savings"),
  
  // Status
  status: text("status").notNull().default("detected"), // detected, nudge_sent, commitment_made, resolved, ignored
  nudgeSentAt: timestamp("nudge_sent_at"),
  resolvedAt: timestamp("resolved_at"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Admin tables for AI management
export const adminUsers = pgTable("admin_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  role: text("role").default("admin"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at"),
});

export const aiPrompts = pgTable("ai_prompts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  category: text("category").notNull(),
  description: text("description"),
  promptTemplate: text("prompt_template").notNull(),
  modelId: text("model_id").default("gpt-4o"),
  temperature: real("temperature").default(0.3),
  isActive: boolean("is_active").default(true),
  version: integer("version").default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const aiLogs = pgTable("ai_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  promptName: text("prompt_name").notNull(),
  coupleId: varchar("couple_id"),
  inputData: jsonb("input_data"),
  outputData: jsonb("output_data"),
  tokensUsed: integer("tokens_used"),
  latencyMs: integer("latency_ms"),
  status: text("status").notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const aiCorrections = pgTable("ai_corrections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coupleId: varchar("couple_id").notNull(),
  expenseId: varchar("expense_id"),
  originalCategory: text("original_category").notNull(),
  correctedCategory: text("corrected_category").notNull(),
  aiConfidence: real("ai_confidence"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const benchmarkConfigs = pgTable("benchmark_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  configKey: text("config_key").notNull().unique(),
  configValue: jsonb("config_value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const feedback = pgTable("feedback", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coupleId: varchar("couple_id"),
  userId: varchar("user_id"),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  platform: text("platform"),
  appVersion: text("app_version"),
  status: text("status").default("new").notNull(),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertFeedbackSchema = createInsertSchema(feedback).omit({
  id: true,
  createdAt: true,
  status: true,
  adminNotes: true,
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  lastLoginAt: true,
});

export const insertSessionSchema = createInsertSchema(sessions).omit({
  id: true,
  createdAt: true,
});

export const insertPartnerInviteSchema = createInsertSchema(partnerInvites).omit({
  id: true,
  createdAt: true,
  acceptedBy: true,
});

export const insertExpenseSchema = createInsertSchema(expenses).omit({
  id: true,
  createdAt: true,
});

export const insertGoalSchema = createInsertSchema(goals).omit({
  id: true,
  createdAt: true,
  savedAmount: true,
});

export const insertCategoryBudgetSchema = createInsertSchema(categoryBudgets).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type InsertPartnerInvite = z.infer<typeof insertPartnerInviteSchema>;
export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type PartnerInvite = typeof partnerInvites.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type GoalContribution = typeof goalContributions.$inferSelect;
export type CategoryBudget = typeof categoryBudgets.$inferSelect;
export type CustomCategory = typeof customCategories.$inferSelect;
export type Settlement = typeof settlements.$inferSelect;
export type Couple = typeof couples.$inferSelect;
export type LineItem = typeof lineItems.$inferSelect;
export type SpendingBenchmark = typeof spendingBenchmarks.$inferSelect;
export type CachedInsight = typeof cachedInsights.$inferSelect;
export type GuardianInsight = typeof guardianInsights.$inferSelect;
export type GuardianRecommendation = typeof guardianRecommendations.$inferSelect;
export type SavingsConfirmation = typeof savingsConfirmations.$inferSelect;
export type SavingsStreak = typeof savingsStreaks.$inferSelect;
export type DailyAnalysis = typeof dailyAnalysis.$inferSelect;
export type PartnerNudgePreference = typeof partnerNudgePreferences.$inferSelect;
export type NudgeEscalation = typeof nudgeEscalation.$inferSelect;
export type BehavioralLearningHistory = typeof behavioralLearningHistory.$inferSelect;
export type AdminUser = typeof adminUsers.$inferSelect;
export type AiPrompt = typeof aiPrompts.$inferSelect;
export type AiLog = typeof aiLogs.$inferSelect;
export type AiCorrection = typeof aiCorrections.$inferSelect;
export type BenchmarkConfig = typeof benchmarkConfigs.$inferSelect;
export type Commitment = typeof commitments.$inferSelect;
export type SpendingPattern = typeof spendingPatterns.$inferSelect;
export type Feedback = typeof feedback.$inferSelect;
export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;

// ==================== Phase 3: Activity Feed ====================

export const activityFeed = pgTable("activity_feed", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coupleId: varchar("couple_id").notNull(),
  userId: varchar("user_id"),
  activityType: text("activity_type").notNull(), // expense_added, expense_updated, goal_contributed, etc
  entityId: varchar("entity_id"),
  summary: text("summary").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ActivityFeedItem = typeof activityFeed.$inferSelect;

// ==================== Phase 4: Guardian Conversation Memory ====================

export const guardianConversations = pgTable("guardian_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coupleId: varchar("couple_id").notNull(),
  userId: varchar("user_id"),
  role: text("role").notNull(), // "user" or "guardian"
  content: text("content").notNull(),
  intent: text("intent"), // "expense" | "question" | "clarification" | null
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type GuardianConversation = typeof guardianConversations.$inferSelect;

// ==================== Plaid bank sync ====================

/**
 * Each connected bank Item from Plaid. One row per bank connection per
 * couple. Stores the long-lived access_token that lets us fetch
 * transactions on that bank.
 */
export const plaidItems = pgTable("plaid_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coupleId: varchar("couple_id").notNull(),
  userId: varchar("user_id").notNull(), // the partner who connected it
  plaidItemId: text("plaid_item_id").notNull().unique(),
  accessToken: text("access_token").notNull(), // encrypted at rest via DB; never exposed to client
  institutionId: text("institution_id"),
  institutionName: text("institution_name"),
  cursor: text("cursor"), // incremental sync cursor from /transactions/sync
  status: text("status").notNull().default("active"), // active | error | disconnected
  lastSyncAt: timestamp("last_sync_at"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type PlaidItem = typeof plaidItems.$inferSelect;

/**
 * Mirror of Plaid transactions we've imported. Keeps plaid_transaction_id so
 * we can dedupe when Plaid sends updates. When user accepts, we copy into
 * the main `expenses` table. Keeping them separate lets us show "pending
 * review" UX and handle edits/removals cleanly.
 */
export const plaidTransactions = pgTable("plaid_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coupleId: varchar("couple_id").notNull(),
  plaidItemId: varchar("plaid_item_id").notNull(),
  plaidTransactionId: text("plaid_transaction_id").notNull().unique(),
  accountId: text("account_id"),
  amount: real("amount").notNull(),
  date: text("date").notNull(),
  merchantName: text("merchant_name"),
  name: text("name").notNull(),
  plaidCategory: jsonb("plaid_category"), // hierarchy array from Plaid
  ourCategory: text("our_category"), // mapped to our ExpenseCategory
  pending: boolean("pending").default(false),
  status: text("status").notNull().default("pending_review"), // pending_review | accepted | ignored
  expenseId: varchar("expense_id"), // set once accepted → links to expenses.id
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type PlaidTransaction = typeof plaidTransactions.$inferSelect;

// ==================== BuildTogether v2 (Tilly student-edition) ====================
// Spec §5: Tilly's AI learning behavior. New tables introduced for the
// student-edition pivot. Use `householdId` from day one (no V1 column-name
// debt) — these tables are write-once new code paths.

/**
 * Tilly's first-person notes timeline (spec §4.6 Profile, §5.4 memory pill).
 *
 * Every durable observation Tilly extracts from chat or actions lands here.
 * The user can `forget` (archive) any entry; the spec's trust contract
 * promises this surface is fully transparent and exportable.
 *
 * `kind` semantics:
 *   - observation — "you skipped DoorDash twice this week"
 *   - anxiety     — verbal cue: "you said money makes you anxious"
 *   - value       — named priority: "Barcelona is a dream"
 *   - commitment  — shared rule: "utilization stays under 30%"
 *   - preference  — quiet hours, tone, alert thresholds
 */
export const tillyMemory = pgTable("tilly_memory", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  householdId: varchar("household_id").notNull(),
  kind: text("kind").notNull(), // observation | anxiety | value | commitment | preference
  body: text("body").notNull(), // first-person, in Tilly's voice
  source: text("source").notNull().default("inferred"), // chat | inferred | action | onboarding
  // Optional structured anchors so we can re-surface or revise this note later.
  category: text("category"), // spending category if relevant
  goalId: varchar("goal_id"), // if it references a dream
  conversationId: varchar("conversation_id"), // if extracted from a chat turn
  // Date ramps — `dateLabel` is what we render ("Today", "Apr 18"); `noticedAt`
  // is the actual moment so we can sort + show "X days ago".
  dateLabel: text("date_label").notNull(),
  noticedAt: timestamp("noticed_at").defaultNow().notNull(),
  // The "recent" dot pulses on the most recent note. Computed by a query, but
  // also stored so we don't need a window function on every read.
  isMostRecent: boolean("is_most_recent").default(false),
  archivedAt: timestamp("archived_at"), // null = active
  /**
   * Embedding for hybrid RAG retrieval (spec D7). 1536 dims for OpenAI's
   * text-embedding-3-small. Stored as `real[]` for portability — we do
   * cosine in JS for now (Tilly's scale: a few hundred memories per user).
   * Phase 6 can migrate to pgvector + an HNSW index when read volume
   * justifies it.
   */
  embedding: real("embedding").array(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type TillyMemory = typeof tillyMemory.$inferSelect;

/**
 * Per-user Tilly tone preference (spec §5.5).
 *
 * One row per user. Switching tones updates this row; older Tilly messages
 * keep their original tone (preserving history per the spec).
 */
export const tillyTonePref = pgTable("tilly_tone_pref", {
  userId: varchar("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  tone: text("tone").notNull().default("sibling"), // sibling | coach | quiet
  quietHoursStart: text("quiet_hours_start").default("23:00"), // 11pm
  quietHoursEnd: text("quiet_hours_end").default("07:00"), // 7am
  bigPurchaseThreshold: real("big_purchase_threshold").default(25),
  subscriptionScanCadence: text("subscription_scan_cadence").default("weekly"), // weekly | daily | off
  phishingWatch: boolean("phishing_watch").default(true),
  memoryRetention: text("memory_retention").default("forever"), // forever | 1y | 90d
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type TillyTonePref = typeof tillyTonePref.$inferSelect;

/**
 * Subscription detection table (spec §4.1 Home tile, §4.4 Credit "protected"
 * card, §5.7 protective surface).
 *
 * Populated from Plaid's recurring-transactions endpoint and rule-based
 * detection (same merchant + same amount + ≥2 cycles). The `lastUsedAt`
 * column lets Tilly say "used twice in 30 days" — we infer usage from
 * non-recurring transactions at the same merchant.
 */
export const subscriptions = pgTable("subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  householdId: varchar("household_id").notNull(),
  merchant: text("merchant").notNull(), // "CitiBike", "Spotify", etc.
  amount: real("amount").notNull(),
  currency: text("currency").default("USD"),
  cadence: text("cadence").notNull(), // weekly | monthly | yearly | custom
  cadenceDays: integer("cadence_days"), // for `custom`
  lastChargedAt: text("last_charged_at"),
  nextChargeAt: text("next_charge_at"), // ISO date — used by Home tile "renews tomorrow"
  lastUsedAt: text("last_used_at"), // last non-recurring tx at this merchant
  status: text("status").notNull().default("active"), // active | paused | cancelled | flagged
  source: text("source").notNull().default("plaid_recurring"), // plaid_recurring | rule_based | manual
  plaidRecurringStreamId: text("plaid_recurring_stream_id"), // for plaid_recurring source
  // Tilly's contextual line: "Used twice in 30 days"
  usageNote: text("usage_note"),
  pausedAt: timestamp("paused_at"),
  cancelledAt: timestamp("cancelled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Subscription = typeof subscriptions.$inferSelect;

/**
 * Protections inbox (spec §5.7 protective surface).
 *
 * Single feed for everything Tilly is watching for and flagging on the
 * user's behalf — phishing texts, free trials about to convert, unused
 * subscriptions, unusual charges. The Home tile + Credit "Tilly protected
 * you · 24h" card both read from this table with different filters.
 *
 * Phase 5 lights up phishing & free-trial detection; Phase 4 lights up
 * unused-sub. The schema is ready for all of them now.
 */
export const protections = pgTable("protections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  householdId: varchar("household_id").notNull(),
  kind: text("kind").notNull(), // phishing | free_trial | unused_sub | unusual_charge | overdraft_risk
  severity: text("severity").notNull().default("fyi"), // fyi | decision_needed | act_today
  summary: text("summary").notNull(), // "Blocked one phishing text pretending to be Chase."
  detail: text("detail"), // longer explanation
  // Optional one-tap action: when set, surfaces a CTA button on the card.
  ctaLabel: text("cta_label"), // "Pause $19.95"
  ctaAction: text("cta_action"), // pause_subscription | dismiss | review | block_sender
  ctaTargetId: varchar("cta_target_id"), // e.g. subscriptions.id when ctaAction = pause_subscription
  // Linkage to source data:
  subscriptionId: varchar("subscription_id"),
  plaidTransactionId: varchar("plaid_transaction_id"),
  status: text("status").notNull().default("flagged"), // flagged | dismissed | acted | expired
  flaggedAt: timestamp("flagged_at").defaultNow().notNull(),
  actedAt: timestamp("acted_at"),
  dismissedAt: timestamp("dismissed_at"),
  expiresAt: timestamp("expires_at"), // for time-sensitive flags
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Protection = typeof protections.$inferSelect;

/**
 * Push notification tokens — one per (user, device). Registered by the
 * client on app launch via expo-notifications.getExpoPushTokenAsync().
 */
export const pushTokens = pgTable("push_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  platform: text("platform").notNull(), // ios | android | web
  deviceLabel: text("device_label"),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  disabledAt: timestamp("disabled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type PushToken = typeof pushTokens.$inferSelect;

/**
 * Tilly runtime configuration — singleton row keyed by id='default'. Admins
 * tune these via /admin/tilly without redeploying. The factory in
 * `server/tilly/llm/factory.ts` reads this row, builds the right LLMClient,
 * and caches it for ~30s.
 */
export const tillyConfig = pgTable("tilly_config", {
  id: varchar("id").primaryKey().default("default"),
  // LLM provider + model — admin can swap providers from the UI.
  provider: text("provider").notNull().default("openrouter"), // openrouter | anthropic
  model: text("model").notNull().default("anthropic/claude-opus-4"),
  embeddingModel: text("embedding_model").notNull().default("openai/text-embedding-3-small"),
  maxTokens: integer("max_tokens").notNull().default(4096),
  // Retrieval knobs (RAG)
  retrievalTopK: integer("retrieval_top_k").notNull().default(5),
  similarityThreshold: real("similarity_threshold").notNull().default(0.65),
  retrievalStrategy: text("retrieval_strategy").notNull().default("hybrid"), // recency_only | semantic_only | hybrid
  recencyHalfLifeHours: real("recency_half_life_hours").notNull().default(168), // 1 week
  // Prompt overrides — null means use the in-code defaults.
  personaPromptOverride: text("persona_prompt_override"),
  toneSiblingOverride: text("tone_sibling_override"),
  toneCoachOverride: text("tone_coach_override"),
  toneQuietOverride: text("tone_quiet_override"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type TillyConfig = typeof tillyConfig.$inferSelect;

// ==================== Legacy aliases ====================
// Keep V1-name imports compiling during the Phase 1c route-splitting transition.
// These re-exports point to the renamed tables. Do NOT use in new code.

/** @deprecated Use `households` instead. */
export const couples = households;
/** @deprecated Use `members` instead. */
export const partners = members;

export type Household = typeof households.$inferSelect;
export type Member = typeof members.$inferSelect;

