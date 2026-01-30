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
  coupleId: varchar("couple_id").notNull().references(() => couples.id, { onDelete: "cascade" }),
  inviteCode: text("invite_code").notNull().unique(),
  invitedBy: varchar("invited_by").notNull().references(() => users.id),
  invitedEmail: text("invited_email"),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedBy: varchar("accepted_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const partners = pgTable("partners", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coupleId: varchar("couple_id").notNull(),
  partnerId: varchar("partner_id").notNull(),
  name: text("name").notNull(),
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

export const goals = pgTable("goals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coupleId: varchar("couple_id").notNull(),
  name: text("name").notNull(),
  targetAmount: real("target_amount").notNull(),
  savedAmount: real("saved_amount").default(0).notNull(),
  emoji: text("emoji").notNull(),
  color: text("color").notNull(),
  targetDate: text("target_date"),
  whyItMatters: text("why_it_matters"),
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

export const couples = pgTable("couples", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  connectedSince: text("connected_since"),
  hasCompletedOnboarding: boolean("has_completed_onboarding").default(false).notNull(),
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
  couple: one(couples, {
    fields: [users.coupleId],
    references: [couples.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const partnerInvitesRelations = relations(partnerInvites, ({ one }) => ({
  couple: one(couples, {
    fields: [partnerInvites.coupleId],
    references: [couples.id],
  }),
  inviter: one(users, {
    fields: [partnerInvites.invitedBy],
    references: [users.id],
  }),
}));

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
