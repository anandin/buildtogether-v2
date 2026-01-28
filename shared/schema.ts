import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
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

export const goalsRelations = relations(goals, ({ many }) => ({
  contributions: many(goalContributions),
}));

export const goalContributionsRelations = relations(goalContributions, ({ one }) => ({
  goal: one(goals, {
    fields: [goalContributions.goalId],
    references: [goals.id],
  }),
}));

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
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
export type User = typeof users.$inferSelect;
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
