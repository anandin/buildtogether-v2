import type { Express } from "express";
import { createServer, type Server } from "node:http";
import OpenAI from "openai";
import { eq, and, desc } from "drizzle-orm";
import { db } from "./db";
import {
  couples,
  expenses,
  goals,
  goalContributions,
  categoryBudgets,
  customCategories,
  settlements,
  lineItems,
  spendingBenchmarks,
  cachedInsights,
} from "@shared/schema";
import crypto from "crypto";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Receipt scanning endpoint - enhanced with line item extraction
  app.post("/api/scan-receipt", async (req, res) => {
    try {
      const { image } = req.body;

      if (!image) {
        return res.status(400).json({ error: "Image is required" });
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a receipt scanning assistant for a couples expense tracking app. Analyze the receipt image and extract:

1. Total amount (as a number, e.g., 25.99)
2. Merchant name (the store/business name)
3. A brief description of the purchase
4. Category (one of: food, groceries, transport, utilities, internet, entertainment, shopping, health, travel, home, restaurants, subscriptions, pets, gifts, personal, other)
5. Suggested split method: "even" for shared items, "joint" for date nights, "single" for personal
6. ALL individual line items from the receipt with:
   - name: item description
   - quantity: number of items (default 1)
   - totalPrice: price for this line
   - classification: one of "staple" (essentials like produce, dairy, bread), "treat" (snacks, candy, desserts), "beverage" (drinks, coffee), "household" (cleaning, toiletries), "prepared" (ready-made meals), "luxury" (premium/expensive items), "kids" (children's items), "other"
   - isEssential: true for staples/household, false for treats/luxury

Respond in JSON format:
{
  "amount": number,
  "merchant": "string",
  "description": "string",
  "category": "string",
  "suggestedSplit": "even" | "joint" | "single",
  "lineItems": [
    {
      "name": "string",
      "quantity": number,
      "totalPrice": number,
      "classification": "staple" | "treat" | "beverage" | "household" | "prepared" | "luxury" | "kids" | "other",
      "isEssential": boolean
    }
  ]
}

If you cannot read the receipt clearly, still try to provide your best guess. If completely unreadable, respond with:
{
  "error": "Could not read receipt"
}`,
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${image}`,
                },
              },
              {
                type: "text",
                text: "Please analyze this receipt and extract all details including individual line items.",
              },
            ],
          },
        ],
        max_completion_tokens: 2000,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return res.status(500).json({ error: "Failed to analyze receipt" });
      }

      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.error) {
            return res.status(400).json({ error: parsed.error });
          }
          return res.json({
            amount: parsed.amount,
            merchant: parsed.merchant,
            description: parsed.description,
            category: parsed.category,
            suggestedSplit: parsed.suggestedSplit || "even",
            lineItems: parsed.lineItems || [],
          });
        }
        return res.status(500).json({ error: "Failed to parse receipt data" });
      } catch (parseError) {
        return res.status(500).json({ error: "Failed to parse receipt data" });
      }
    } catch (error: any) {
      console.error("Receipt scan error:", error);
      return res.status(500).json({ 
        error: error.message || "Failed to scan receipt" 
      });
    }
  });

  // AI Insights endpoint - analyzes spending patterns and generates savings tips
  app.post("/api/ai-insights", async (req, res) => {
    try {
      const { expenses, goals, categoryBudgets, partners } = req.body;

      if (!expenses || !Array.isArray(expenses)) {
        return res.status(400).json({ error: "Expenses array is required" });
      }

      // Calculate spending stats for the prompt
      const now = new Date();
      const thisMonth = expenses.filter((e: any) => {
        const d = new Date(e.date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });

      const lastMonth = expenses.filter((e: any) => {
        const d = new Date(e.date);
        const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        return d.getMonth() === lastMonthDate.getMonth() && d.getFullYear() === lastMonthDate.getFullYear();
      });

      const thisMonthTotal = thisMonth.reduce((s: number, e: any) => s + e.amount, 0);
      const lastMonthTotal = lastMonth.reduce((s: number, e: any) => s + e.amount, 0);

      // Group by category
      const categoryTotals: Record<string, number> = {};
      thisMonth.forEach((e: any) => {
        categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
      });

      // Group by merchant
      const merchantTotals: Record<string, { total: number; count: number }> = {};
      expenses.forEach((e: any) => {
        if (e.merchant) {
          if (!merchantTotals[e.merchant]) {
            merchantTotals[e.merchant] = { total: 0, count: 0 };
          }
          merchantTotals[e.merchant].total += e.amount;
          merchantTotals[e.merchant].count += 1;
        }
      });

      // Find over-budget categories (using effective budget with rollover)
      const budgetStatus = categoryBudgets?.map((b: any) => {
        const spent = categoryTotals[b.category] || 0;
        const effectiveBudget = b.budgetType === 'rollover' 
          ? b.monthlyLimit + (b.rolloverBalance || 0)
          : b.monthlyLimit;
        const percentage = effectiveBudget > 0 ? (spent / effectiveBudget) * 100 : 0;
        const threshold = b.alertThreshold || 80;
        return {
          ...b,
          spent,
          effectiveBudget,
          percentage,
          isOverThreshold: percentage >= threshold,
          isOverBudget: percentage >= 100,
          remaining: effectiveBudget - spent,
        };
      }) || [];

      const overBudgetCategories = budgetStatus.filter((b: any) => b.isOverThreshold);
      const underBudgetCategories = budgetStatus.filter((b: any) => b.remaining > 50 && b.percentage < 70);
      const totalPotentialSavings = underBudgetCategories.reduce((s: number, b: any) => s + b.remaining, 0);

      // Calculate goal progress
      const totalGoalTarget = goals?.reduce((s: number, g: any) => s + g.targetAmount, 0) || 0;
      const totalGoalSaved = goals?.reduce((s: number, g: any) => s + g.savedAmount, 0) || 0;
      const goalsProgress = totalGoalTarget > 0 ? (totalGoalSaved / totalGoalTarget) * 100 : 0;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a friendly AI financial coach for couples. Analyze their spending and BUDGET data to provide helpful, actionable insights to help them save money and reach their goals together.

IMPORTANT: Use their budget settings to make smart recommendations:
- Categories with "rollover" budgets carry unused money forward - suggest moving rollover to goals!
- Categories near their alert threshold need gentle warnings
- Categories well under budget = potential savings to redirect to goals

Be warm, supportive, and specific. Focus on:
1. Identifying savings opportunities from under-budget categories
2. Suggesting moving rollover/surplus amounts toward goals
3. Celebrating wins when they're under budget
4. Gentle nudges when approaching budget thresholds
5. Connecting budget performance directly to goal progress

Generate 2-4 insights. Prioritize:
- HIGH priority for budget-to-goal opportunities (if they have surplus that could go to goals)
- MEDIUM for spending alerts and trends
- LOW for general tips

Each insight should be:
- Personalized to their actual budget and spending data
- Actionable (specific amounts to save or move to goals)
- Encouraging (focus on opportunity, not criticism)
- Brief (1-2 sentences max)

Respond in JSON format:
{
  "insights": [
    {
      "type": "saving_tip" | "spending_alert" | "goal_nudge" | "trend_analysis",
      "title": "Brief catchy title",
      "message": "The insight message",
      "priority": "low" | "medium" | "high",
      "category": "optional category name if relevant",
      "amount": optional number if relevant (use this for savings amounts),
      "actionType": "add_to_goal" | "view_category" | "review_spending" | "dismiss",
      "actionText": "Short CTA like 'Move $50 to Dream' or 'View Details'"
    }
  ]
}`,
          },
          {
            role: "user",
            content: `Here's our financial data:

SPENDING SUMMARY:
- This month's total: $${thisMonthTotal.toFixed(2)}
- Last month's total: $${lastMonthTotal.toFixed(2)}
- Change: ${thisMonthTotal > lastMonthTotal ? '+' : ''}$${(thisMonthTotal - lastMonthTotal).toFixed(2)}

BUDGET STATUS (with types):
${budgetStatus.map((b: any) => `- ${b.category} (${b.budgetType}): $${b.spent.toFixed(0)} / $${b.effectiveBudget.toFixed(0)} (${b.percentage.toFixed(0)}%) ${b.rolloverBalance > 0 ? `[+$${b.rolloverBalance} rollover]` : ''} ${b.isOverThreshold ? '⚠️' : '✓'}`).join('\n')}

POTENTIAL SAVINGS THIS MONTH: $${totalPotentialSavings.toFixed(0)}
Categories with surplus:
${underBudgetCategories.map((b: any) => `- ${b.category}: $${b.remaining.toFixed(0)} under budget`).join('\n') || 'None yet'}

TOP MERCHANTS:
${Object.entries(merchantTotals).slice(0, 5).map(([name, data]) => `- ${name}: $${data.total.toFixed(2)} (${data.count} visits)`).join('\n')}

SAVINGS GOALS:
${goals?.map((g: any) => `- ${g.name}: $${g.savedAmount} / $${g.targetAmount} (${((g.savedAmount / g.targetAmount) * 100).toFixed(0)}%)`).join('\n') || 'No goals set yet'}
Overall goal progress: ${goalsProgress.toFixed(0)}%

Please analyze our budgets and spending to provide personalized insights. Focus on how we can move surplus/rollover money toward our goals!`,
          },
        ],
        max_completion_tokens: 800,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return res.status(500).json({ error: "Failed to generate insights" });
      }

      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return res.json(parsed);
        }
        return res.status(500).json({ error: "Failed to parse insights" });
      } catch (parseError) {
        return res.status(500).json({ error: "Failed to parse insights" });
      }
    } catch (error: any) {
      console.error("AI insights error:", error);
      return res.status(500).json({ 
        error: error.message || "Failed to generate insights" 
      });
    }
  });

  // Quick expense parsing - parse natural language expense input
  app.post("/api/parse-expense", async (req, res) => {
    try {
      const { text } = req.body;

      if (!text) {
        return res.status(400).json({ error: "Text is required" });
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a helpful assistant that parses natural language expense descriptions into structured data.

Extract:
1. Amount (number)
2. Merchant name (if mentioned)
3. Description
4. Category (one of: food, groceries, transport, utilities, internet, entertainment, shopping, health, travel, home, restaurants, subscriptions, pets, gifts, personal, other)

Examples:
- "$45.50 at Trader Joe's for groceries" → { amount: 45.50, merchant: "Trader Joe's", description: "Groceries", category: "groceries" }
- "Uber ride $23" → { amount: 23, merchant: "Uber", description: "Ride", category: "transport" }
- "Netflix subscription 15.99" → { amount: 15.99, merchant: "Netflix", description: "Monthly subscription", category: "subscriptions" }

Respond in JSON format:
{
  "amount": number,
  "merchant": "string or null",
  "description": "string",
  "category": "string"
}`,
          },
          {
            role: "user",
            content: text,
          },
        ],
        max_completion_tokens: 200,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return res.status(500).json({ error: "Failed to parse expense" });
      }

      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return res.json(parsed);
        }
        return res.status(500).json({ error: "Failed to parse expense" });
      } catch (parseError) {
        return res.status(500).json({ error: "Failed to parse expense" });
      }
    } catch (error: any) {
      console.error("Parse expense error:", error);
      return res.status(500).json({ 
        error: error.message || "Failed to parse expense" 
      });
    }
  });

  // Ego Spend Detection - identifies luxury/status purchases for "Vanish" nudges
  app.post("/api/detect-ego-spends", async (req, res) => {
    try {
      const { expenses } = req.body;

      if (!expenses || !Array.isArray(expenses)) {
        return res.status(400).json({ error: "Expenses array is required" });
      }

      // Only analyze recent expenses (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const recentExpenses = expenses.filter((e: any) => {
        const d = new Date(e.date);
        return d >= thirtyDaysAgo;
      });

      if (recentExpenses.length === 0) {
        return res.json({ egoSpends: [] });
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a behavioral finance analyst for a couples savings app. Your job is to identify "Ego Spends" - purchases driven by status, impulse, or lifestyle inflation rather than genuine need.

Ego Spends are NOT:
- Essential groceries, utilities, rent, healthcare
- Reasonable transportation
- Basic household items

Ego Spends ARE:
- Luxury goods and premium upgrades
- Impulse purchases at certain merchants (coffee shops, fast fashion)
- Status-driven purchases (designer items, premium subscriptions)
- Convenience spending that could be avoided (daily takeout, ride shares for short trips)
- Entertainment that's become habitual rather than intentional

For each Ego Spend identified, provide:
1. A gentle, non-judgmental "nudge" message suggesting redirecting to Dreams
2. The "vanish potential" - how much could be saved monthly by reducing this spending

Be kind and supportive - focus on opportunity, not criticism. Use "we" language.

Respond in JSON:
{
  "egoSpends": [
    {
      "expenseId": "string",
      "nudgeMessage": "Friendly suggestion to redirect this to Dreams",
      "vanishPotential": number (estimated monthly savings if reduced),
      "egoCategory": "luxury" | "impulse" | "convenience" | "status" | "habitual"
    }
  ]
}

Only flag the top 3-5 most impactful Ego Spends. Don't flag everything.`,
          },
          {
            role: "user",
            content: `Analyze these recent expenses and identify Ego Spends:

${recentExpenses.map((e: any) => `ID: ${e.id} | $${e.amount} | ${e.merchant || 'Unknown'} | ${e.description} | Category: ${e.category}`).join('\n')}

Identify the expenses that represent "Ego Spending" (status/luxury/impulse) that could be redirected to savings goals.`,
          },
        ],
        max_completion_tokens: 600,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return res.status(500).json({ error: "Failed to analyze expenses" });
      }

      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return res.json(parsed);
        }
        return res.status(500).json({ error: "Failed to parse ego spend data" });
      } catch (parseError) {
        return res.status(500).json({ error: "Failed to parse ego spend data" });
      }
    } catch (error: any) {
      console.error("Ego spend detection error:", error);
      return res.status(500).json({ 
        error: error.message || "Failed to detect ego spends" 
      });
    }
  });

  // ===== DATA SYNC API ENDPOINTS =====

  // Get or create couple
  app.get("/api/couple/:coupleId", async (req, res) => {
    try {
      const { coupleId } = req.params;
      let [couple] = await db.select().from(couples).where(eq(couples.id, coupleId));
      
      if (!couple) {
        [couple] = await db.insert(couples).values({
          id: coupleId,
          partner1Name: "You",
          partner2Name: "Partner",
        }).returning();
      }
      
      res.json(couple);
    } catch (error: any) {
      console.error("Get couple error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update couple
  app.put("/api/couple/:coupleId", async (req, res) => {
    try {
      const { coupleId } = req.params;
      const updates = req.body;
      
      const [couple] = await db.update(couples)
        .set(updates)
        .where(eq(couples.id, coupleId))
        .returning();
      
      res.json(couple);
    } catch (error: any) {
      console.error("Update couple error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get all expenses for a couple
  app.get("/api/expenses/:coupleId", async (req, res) => {
    try {
      const { coupleId } = req.params;
      const result = await db.select().from(expenses)
        .where(eq(expenses.coupleId, coupleId))
        .orderBy(desc(expenses.createdAt));
      res.json(result);
    } catch (error: any) {
      console.error("Get expenses error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get line items for an expense
  app.get("/api/expenses/:coupleId/:expenseId/line-items", async (req, res) => {
    try {
      const { expenseId } = req.params;
      const result = await db.select().from(lineItems)
        .where(eq(lineItems.expenseId, expenseId))
        .orderBy(lineItems.createdAt);
      res.json(result);
    } catch (error: any) {
      console.error("Get line items error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Add expense
  app.post("/api/expenses/:coupleId", async (req, res) => {
    try {
      const { coupleId } = req.params;
      const expenseData = req.body;
      
      const [expense] = await db.insert(expenses).values({
        ...expenseData,
        coupleId,
      }).returning();
      
      res.json(expense);
    } catch (error: any) {
      console.error("Add expense error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update expense
  app.put("/api/expenses/:coupleId/:expenseId", async (req, res) => {
    try {
      const { coupleId, expenseId } = req.params;
      const updates = req.body;
      
      const [expense] = await db.update(expenses)
        .set(updates)
        .where(and(eq(expenses.id, expenseId), eq(expenses.coupleId, coupleId)))
        .returning();
      
      res.json(expense);
    } catch (error: any) {
      console.error("Update expense error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete expense
  app.delete("/api/expenses/:coupleId/:expenseId", async (req, res) => {
    try {
      const { coupleId, expenseId } = req.params;
      
      await db.delete(expenses)
        .where(and(eq(expenses.id, expenseId), eq(expenses.coupleId, coupleId)));
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete expense error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get all goals for a couple
  app.get("/api/goals/:coupleId", async (req, res) => {
    try {
      const { coupleId } = req.params;
      const goalsResult = await db.select().from(goals)
        .where(eq(goals.coupleId, coupleId))
        .orderBy(desc(goals.createdAt));
      
      const goalsWithContributions = await Promise.all(
        goalsResult.map(async (goal) => {
          const contributions = await db.select().from(goalContributions)
            .where(eq(goalContributions.goalId, goal.id))
            .orderBy(desc(goalContributions.createdAt));
          return { ...goal, contributions };
        })
      );
      
      res.json(goalsWithContributions);
    } catch (error: any) {
      console.error("Get goals error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Add goal
  app.post("/api/goals/:coupleId", async (req, res) => {
    try {
      const { coupleId } = req.params;
      const goalData = req.body;
      
      const [goal] = await db.insert(goals).values({
        ...goalData,
        coupleId,
        savedAmount: 0,
      }).returning();
      
      res.json({ ...goal, contributions: [] });
    } catch (error: any) {
      console.error("Add goal error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update goal
  app.put("/api/goals/:coupleId/:goalId", async (req, res) => {
    try {
      const { coupleId, goalId } = req.params;
      const updates = req.body;
      
      const [goal] = await db.update(goals)
        .set(updates)
        .where(and(eq(goals.id, goalId), eq(goals.coupleId, coupleId)))
        .returning();
      
      res.json(goal);
    } catch (error: any) {
      console.error("Update goal error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete goal
  app.delete("/api/goals/:coupleId/:goalId", async (req, res) => {
    try {
      const { coupleId, goalId } = req.params;
      
      await db.delete(goals)
        .where(and(eq(goals.id, goalId), eq(goals.coupleId, coupleId)));
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete goal error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Add goal contribution
  app.post("/api/goals/:coupleId/:goalId/contribute", async (req, res) => {
    try {
      const { coupleId, goalId } = req.params;
      const { amount, contributor, date } = req.body;
      
      const [contribution] = await db.insert(goalContributions).values({
        goalId,
        amount,
        contributor,
        date,
      }).returning();
      
      const [goal] = await db.select().from(goals).where(eq(goals.id, goalId));
      if (goal) {
        await db.update(goals)
          .set({ savedAmount: goal.savedAmount + amount })
          .where(eq(goals.id, goalId));
      }
      
      res.json(contribution);
    } catch (error: any) {
      console.error("Add contribution error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get category budgets
  app.get("/api/budgets/:coupleId", async (req, res) => {
    try {
      const { coupleId } = req.params;
      const result = await db.select().from(categoryBudgets)
        .where(eq(categoryBudgets.coupleId, coupleId));
      res.json(result);
    } catch (error: any) {
      console.error("Get budgets error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Add or update category budget
  app.post("/api/budgets/:coupleId", async (req, res) => {
    try {
      const { coupleId } = req.params;
      const budgetData = req.body;
      
      const [existing] = await db.select().from(categoryBudgets)
        .where(and(
          eq(categoryBudgets.coupleId, coupleId),
          eq(categoryBudgets.category, budgetData.category)
        ));
      
      let result;
      if (existing) {
        [result] = await db.update(categoryBudgets)
          .set(budgetData)
          .where(eq(categoryBudgets.id, existing.id))
          .returning();
      } else {
        [result] = await db.insert(categoryBudgets).values({
          ...budgetData,
          coupleId,
        }).returning();
      }
      
      res.json(result);
    } catch (error: any) {
      console.error("Update budget error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get custom categories
  app.get("/api/categories/:coupleId", async (req, res) => {
    try {
      const { coupleId } = req.params;
      const result = await db.select().from(customCategories)
        .where(eq(customCategories.coupleId, coupleId));
      res.json(result);
    } catch (error: any) {
      console.error("Get categories error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Add custom category
  app.post("/api/categories/:coupleId", async (req, res) => {
    try {
      const { coupleId } = req.params;
      const { name, icon, color } = req.body;
      
      const [category] = await db.insert(customCategories).values({
        coupleId,
        name,
        icon,
        color,
      }).returning();
      
      res.json(category);
    } catch (error: any) {
      console.error("Add category error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete custom category
  app.delete("/api/categories/:coupleId/:categoryId", async (req, res) => {
    try {
      const { coupleId, categoryId } = req.params;
      
      await db.delete(customCategories)
        .where(and(eq(customCategories.id, categoryId), eq(customCategories.coupleId, coupleId)));
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete category error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Add settlement
  app.post("/api/settlements/:coupleId", async (req, res) => {
    try {
      const { coupleId } = req.params;
      const settlementData = req.body;
      
      const [settlement] = await db.insert(settlements).values({
        ...settlementData,
        coupleId,
      }).returning();
      
      if (settlementData.expenseIds?.length) {
        for (const expenseId of settlementData.expenseIds) {
          await db.update(expenses)
            .set({ isSettled: true })
            .where(eq(expenses.id, expenseId));
        }
      }
      
      res.json(settlement);
    } catch (error: any) {
      console.error("Add settlement error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get settlements
  app.get("/api/settlements/:coupleId", async (req, res) => {
    try {
      const { coupleId } = req.params;
      const result = await db.select().from(settlements)
        .where(eq(settlements.coupleId, coupleId))
        .orderBy(desc(settlements.createdAt));
      res.json(result);
    } catch (error: any) {
      console.error("Get settlements error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Sync all data for a couple (for initial load)
  app.get("/api/sync/:coupleId", async (req, res) => {
    try {
      const { coupleId } = req.params;
      
      let [couple] = await db.select().from(couples).where(eq(couples.id, coupleId));
      if (!couple) {
        [couple] = await db.insert(couples).values({
          id: coupleId,
          partner1Name: "You",
          partner2Name: "Partner",
        }).returning();
      }
      
      const expensesData = await db.select().from(expenses)
        .where(eq(expenses.coupleId, coupleId))
        .orderBy(desc(expenses.createdAt));
      
      const goalsData = await db.select().from(goals)
        .where(eq(goals.coupleId, coupleId));
      
      const goalsWithContributions = await Promise.all(
        goalsData.map(async (goal) => {
          const contributions = await db.select().from(goalContributions)
            .where(eq(goalContributions.goalId, goal.id));
          return { ...goal, contributions };
        })
      );
      
      const budgetsData = await db.select().from(categoryBudgets)
        .where(eq(categoryBudgets.coupleId, coupleId));
      
      const categoriesData = await db.select().from(customCategories)
        .where(eq(customCategories.coupleId, coupleId));
      
      const settlementsData = await db.select().from(settlements)
        .where(eq(settlements.coupleId, coupleId));
      
      res.json({
        couple,
        expenses: expensesData,
        goals: goalsWithContributions,
        categoryBudgets: budgetsData,
        customCategories: categoriesData,
        settlements: settlementsData,
      });
    } catch (error: any) {
      console.error("Sync error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update family profile
  app.put("/api/family/:coupleId", async (req, res) => {
    try {
      const { coupleId } = req.params;
      const { numAdults, numKidsUnder5, numKids5to12, numTeens, city, country } = req.body;
      
      const [couple] = await db.update(couples)
        .set({ numAdults, numKidsUnder5, numKids5to12, numTeens, city, country })
        .where(eq(couples.id, coupleId))
        .returning();
      
      res.json(couple);
    } catch (error: any) {
      console.error("Update family error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Save line items for an expense
  app.post("/api/expenses/:coupleId/:expenseId/line-items", async (req, res) => {
    try {
      const { expenseId } = req.params;
      const { items } = req.body;
      
      if (items && items.length > 0) {
        const insertedItems = await db.insert(lineItems).values(
          items.map((item: any) => ({
            expenseId,
            name: item.name,
            quantity: item.quantity || 1,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            classification: item.classification || "other",
            isEssential: item.isEssential ?? true,
          }))
        ).returning();
        
        res.json(insertedItems);
      } else {
        res.json([]);
      }
    } catch (error: any) {
      console.error("Save line items error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get line items for an expense
  app.get("/api/expenses/:coupleId/:expenseId/line-items", async (req, res) => {
    try {
      const { expenseId } = req.params;
      const items = await db.select().from(lineItems)
        .where(eq(lineItems.expenseId, expenseId));
      res.json(items);
    } catch (error: any) {
      console.error("Get line items error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get spending benchmarks
  app.get("/api/benchmarks", async (req, res) => {
    try {
      const { familySize, hasKids, country } = req.query;
      let query = db.select().from(spendingBenchmarks);
      
      if (familySize) {
        query = query.where(eq(spendingBenchmarks.familySize, parseInt(familySize as string)));
      }
      
      const benchmarks = await query;
      res.json(benchmarks);
    } catch (error: any) {
      console.error("Get benchmarks error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // AI-powered spending insights with benchmarks and caching
  app.post("/api/spending-insights/:coupleId", async (req, res) => {
    try {
      const { coupleId } = req.params;
      const forceRefresh = req.body?.forceRefresh === true;
      
      const [couple] = await db.select().from(couples).where(eq(couples.id, coupleId));
      const expensesData = await db.select().from(expenses)
        .where(eq(expenses.coupleId, coupleId))
        .orderBy(desc(expenses.createdAt));
      
      // Calculate time context for projections
      const now = new Date();
      const dayOfMonth = now.getDate();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const monthProgress = dayOfMonth / daysInMonth;
      
      // Filter current month expenses for projection
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const currentMonthExpenses = expensesData.filter(e => new Date(e.date) >= currentMonthStart);
      const currentMonthTotal = currentMonthExpenses.reduce((sum, e) => sum + e.amount, 0);
      
      // Project monthly spending based on current pace
      const projectedMonthlyTotal = dayOfMonth > 0 ? (currentMonthTotal / dayOfMonth) * daysInMonth : 0;
      
      // Create data hash for caching
      const dataForHash = {
        expenseCount: expensesData.length,
        currentMonthTotal: Math.round(currentMonthTotal * 100),
        dayOfMonth,
        familyProfile: {
          adults: couple?.numAdults,
          kids: (couple?.numKidsUnder5 || 0) + (couple?.numKids5to12 || 0) + (couple?.numTeens || 0),
        }
      };
      const dataHash = crypto.createHash('md5').update(JSON.stringify(dataForHash)).digest('hex');
      
      // Check cache first (unless force refresh)
      if (!forceRefresh) {
        const [cached] = await db.select().from(cachedInsights)
          .where(eq(cachedInsights.coupleId, coupleId));
        
        if (cached && cached.dataHash === dataHash && new Date(cached.expiresAt) > now) {
          return res.json({
            overallHealthScore: cached.healthScore,
            insights: cached.insights,
            spendingBreakdown: cached.spendingBreakdown,
            monthlyProjected: cached.monthlyProjected,
            dayOfMonth: cached.dayOfMonth,
            daysInMonth: cached.daysInMonth,
            cached: true,
          });
        }
      }
      
      const familySize = (couple?.numAdults || 2) + (couple?.numKidsUnder5 || 0) + (couple?.numKids5to12 || 0) + (couple?.numTeens || 0);
      const hasKids = (couple?.numKidsUnder5 || 0) + (couple?.numKids5to12 || 0) + (couple?.numTeens || 0) > 0;
      
      const allLineItems = await Promise.all(
        expensesData.slice(0, 50).map(async (expense) => {
          const items = await db.select().from(lineItems)
            .where(eq(lineItems.expenseId, expense.id));
          return { expense, items };
        })
      );
      
      // Calculate spending by category for current month only
      const currentMonthByCategory: Record<string, number> = {};
      currentMonthExpenses.forEach(e => {
        currentMonthByCategory[e.category] = (currentMonthByCategory[e.category] || 0) + e.amount;
      });
      
      // Project each category to full month
      const projectedByCategory: Record<string, number> = {};
      Object.entries(currentMonthByCategory).forEach(([cat, amount]) => {
        projectedByCategory[cat] = dayOfMonth > 0 ? Math.round((amount / dayOfMonth) * daysInMonth) : 0;
      });
      
      const benchmarksData = await db.select().from(spendingBenchmarks)
        .where(eq(spendingBenchmarks.familySize, familySize));
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a friendly financial wellness coach for couples. Analyze their spending patterns and provide gentle, supportive insights.

CRITICAL CONTEXT - TIME-AWARE ANALYSIS:
- Today is day ${dayOfMonth} of ${daysInMonth} days in this month (${Math.round(monthProgress * 100)}% through the month)
- Current month actual spending: $${currentMonthTotal.toFixed(2)}
- Projected full-month spending at current pace: $${projectedMonthlyTotal.toFixed(2)}
- When comparing to monthly benchmarks, ALWAYS use the projected monthly amount, NOT the actual spend so far
- If we're early in the month (< 50%), be especially careful about projections - mention data is limited
- Express comparisons as "On track to spend $X this month" or "At current pace, you'll spend $X"

IMPORTANT PRINCIPLES:
- Never shame spending. People work hard and deserve to enjoy their money.
- Use social proof: "Families like yours typically spend..." 
- Focus on unusual patterns, not all spending
- If they have kids, normalize snacks and treats
- Celebrate mindful choices
- Only flag truly unusual spending compared to benchmarks
- If spending data is limited (few expenses), acknowledge this and be conservative

Family context:
- Family size: ${familySize} people
- Has kids: ${hasKids}
- Kids under 5: ${couple?.numKidsUnder5 || 0}
- Kids 5-12: ${couple?.numKids5to12 || 0}
- Teens: ${couple?.numTeens || 0}
- Location: ${couple?.city || "Unknown"}, ${couple?.country || "US"}

Respond in JSON:
{
  "overallHealthScore": number (1-100),
  "insights": [
    {
      "type": "celebration" | "observation" | "suggestion",
      "category": "string",
      "title": "string (short, friendly)",
      "message": "string (supportive, max 2 sentences, reference projected monthly when comparing to benchmarks)",
      "benchmarkComparison": "below" | "average" | "above" | null,
      "potentialSavings": number | null
    }
  ],
  "spendingBreakdown": {
    "essential": number (percentage),
    "discretionary": number (percentage),
    "treats": number (percentage)
  }
}`
          },
          {
            role: "user",
            content: `Analyze this spending data:

Current month spending (actual so far): ${JSON.stringify(currentMonthByCategory)}
Projected full-month spending at current pace: ${JSON.stringify(projectedByCategory)}
Number of expenses this month: ${currentMonthExpenses.length}

Monthly benchmarks for similar families: ${JSON.stringify(benchmarksData.map(b => ({
              category: b.category,
              monthlyAverage: b.monthlyAverage,
              range: `$${b.lowRange}-$${b.highRange}`
            })))}

Recent line items from receipts: ${JSON.stringify(allLineItems.slice(0, 15).map(({ expense, items }) => ({
              merchant: expense.merchant,
              category: expense.category,
              items: items.map(i => ({ name: i.name, price: i.totalPrice, classification: i.classification }))
            })))}`
          }
        ],
        max_completion_tokens: 1500,
      });

      const content = response.choices[0]?.message?.content;
      if (content) {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const insights = JSON.parse(jsonMatch[0]);
          
          // Cache the results (expires in 6 hours or when data changes)
          const expiresAt = new Date(now.getTime() + 6 * 60 * 60 * 1000);
          
          await db.delete(cachedInsights).where(eq(cachedInsights.coupleId, coupleId));
          await db.insert(cachedInsights).values({
            coupleId,
            dataHash,
            insights: insights.insights,
            healthScore: insights.overallHealthScore,
            spendingBreakdown: insights.spendingBreakdown,
            monthlyProjected: projectedMonthlyTotal,
            daysInMonth,
            dayOfMonth,
            expiresAt,
          });
          
          return res.json({
            ...insights,
            monthlyProjected: projectedMonthlyTotal,
            dayOfMonth,
            daysInMonth,
            cached: false,
          });
        }
      }
      
      res.status(500).json({ error: "Failed to generate insights" });
    } catch (error: any) {
      console.error("Spending insights error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Seed default spending benchmarks (run once)
  app.post("/api/benchmarks/seed", async (req, res) => {
    try {
      const defaultBenchmarks = [
        { category: "groceries", familySize: 2, hasKids: false, country: "US", monthlyAverage: 550, lowRange: 400, highRange: 750, source: "BLS 2024" },
        { category: "groceries", familySize: 3, hasKids: true, country: "US", monthlyAverage: 750, lowRange: 550, highRange: 1000, source: "BLS 2024" },
        { category: "groceries", familySize: 4, hasKids: true, country: "US", monthlyAverage: 950, lowRange: 700, highRange: 1300, source: "BLS 2024" },
        { category: "groceries", familySize: 5, hasKids: true, country: "US", monthlyAverage: 1100, lowRange: 850, highRange: 1500, source: "BLS 2024" },
        { category: "restaurants", familySize: 2, hasKids: false, country: "US", monthlyAverage: 350, lowRange: 150, highRange: 600, source: "BLS 2024" },
        { category: "restaurants", familySize: 3, hasKids: true, country: "US", monthlyAverage: 400, lowRange: 200, highRange: 700, source: "BLS 2024" },
        { category: "restaurants", familySize: 4, hasKids: true, country: "US", monthlyAverage: 500, lowRange: 250, highRange: 850, source: "BLS 2024" },
        { category: "entertainment", familySize: 2, hasKids: false, country: "US", monthlyAverage: 250, lowRange: 100, highRange: 500, source: "BLS 2024" },
        { category: "entertainment", familySize: 4, hasKids: true, country: "US", monthlyAverage: 350, lowRange: 150, highRange: 600, source: "BLS 2024" },
        { category: "transport", familySize: 2, hasKids: false, country: "US", monthlyAverage: 400, lowRange: 200, highRange: 700, source: "BLS 2024" },
        { category: "transport", familySize: 4, hasKids: true, country: "US", monthlyAverage: 550, lowRange: 300, highRange: 900, source: "BLS 2024" },
        { category: "utilities", familySize: 2, hasKids: false, country: "US", monthlyAverage: 200, lowRange: 120, highRange: 350, source: "BLS 2024" },
        { category: "utilities", familySize: 4, hasKids: true, country: "US", monthlyAverage: 280, lowRange: 180, highRange: 450, source: "BLS 2024" },
        { category: "health", familySize: 2, hasKids: false, country: "US", monthlyAverage: 300, lowRange: 100, highRange: 600, source: "BLS 2024" },
        { category: "health", familySize: 4, hasKids: true, country: "US", monthlyAverage: 450, lowRange: 200, highRange: 800, source: "BLS 2024" },
        { category: "shopping", familySize: 2, hasKids: false, country: "US", monthlyAverage: 200, lowRange: 50, highRange: 500, source: "BLS 2024" },
        { category: "shopping", familySize: 4, hasKids: true, country: "US", monthlyAverage: 350, lowRange: 100, highRange: 700, source: "BLS 2024" },
        { category: "groceries", familySize: 2, hasKids: false, country: "CA", monthlyAverage: 650, lowRange: 450, highRange: 900, source: "StatsCan 2024" },
        { category: "groceries", familySize: 4, hasKids: true, country: "CA", monthlyAverage: 1100, lowRange: 800, highRange: 1500, source: "StatsCan 2024" },
      ];
      
      for (const benchmark of defaultBenchmarks) {
        await db.insert(spendingBenchmarks).values(benchmark).onConflictDoNothing();
      }
      
      res.json({ success: true, count: defaultBenchmarks.length });
    } catch (error: any) {
      console.error("Seed benchmarks error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
