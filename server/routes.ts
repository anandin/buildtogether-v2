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

      // Find over-budget categories
      const overBudgetCategories = categoryBudgets?.filter((b: any) => {
        const spent = categoryTotals[b.category] || 0;
        return spent > b.monthlyLimit * 0.8; // Alert at 80%
      }) || [];

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a friendly AI financial coach for couples. Analyze their spending data and provide helpful, actionable insights to help them save money and reach their goals together.

Be warm, supportive, and specific. Focus on:
1. Identifying spending patterns and potential savings
2. Celebrating wins when they're under budget
3. Gentle nudges when overspending
4. Progress toward shared goals
5. Specific merchant/category trends

Generate 2-3 insights. Each insight should be:
- Personalized to their actual spending data
- Actionable (specific things they can do)
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
      "amount": optional number if relevant
    }
  ]
}`,
          },
          {
            role: "user",
            content: `Here's our spending data:

This month's total: $${thisMonthTotal.toFixed(2)}
Last month's total: $${lastMonthTotal.toFixed(2)}

Spending by category this month:
${Object.entries(categoryTotals).map(([cat, amt]) => `- ${cat}: $${(amt as number).toFixed(2)}`).join('\n')}

Top merchants:
${Object.entries(merchantTotals).slice(0, 5).map(([name, data]) => `- ${name}: $${data.total.toFixed(2)} (${data.count} visits)`).join('\n')}

Our savings goals:
${goals?.map((g: any) => `- ${g.name}: $${g.savedAmount} / $${g.targetAmount}`).join('\n') || 'No goals set yet'}

Categories over 80% of budget:
${overBudgetCategories.map((b: any) => `- ${b.category}: $${categoryTotals[b.category]?.toFixed(2) || 0} / $${b.monthlyLimit}`).join('\n') || 'None! Great job!'}

Please provide personalized insights to help us save together.`,
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

  const httpServer = createServer(app);

  return httpServer;
}
