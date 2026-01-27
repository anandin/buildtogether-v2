import type { Express } from "express";
import { createServer, type Server } from "node:http";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Receipt scanning endpoint - enhanced with merchant extraction
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
2. Merchant name (the store/business name, e.g., "Whole Foods", "Starbucks", "Target")
3. A brief description of the purchase (e.g., "Weekly groceries", "Coffee and snacks")
4. Category (one of: food, groceries, transport, utilities, internet, entertainment, shopping, health, travel, home, restaurants, subscriptions, pets, gifts, personal, other)
5. Suggested split method based on the purchase type:
   - "even" for shared household items (groceries, utilities, rent)
   - "joint" if it looks like a joint purchase or date night
   - "single" for personal items

Respond in JSON format:
{
  "amount": number,
  "merchant": "string",
  "description": "string",
  "category": "string",
  "suggestedSplit": "even" | "joint" | "single"
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
                text: "Please analyze this receipt and extract the total amount, merchant name, description, category, and suggest a split method.",
              },
            ],
          },
        ],
        max_completion_tokens: 500,
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
      "amount": optional number if relevant,
      "actionType": "add_to_goal" | "view_category" | "review_spending" | "dismiss"
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

  const httpServer = createServer(app);

  return httpServer;
}
