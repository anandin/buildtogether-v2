import { Express, Request, Response, NextFunction } from "express";
import { db } from "./db";
import { adminUsers, aiPrompts, aiLogs, aiCorrections, benchmarkConfigs, couples, expenses, goals } from "@shared/schema";
import { eq, desc, count, sql, and, gte } from "drizzle-orm";
import * as bcrypt from "bcryptjs";
import * as jwt from "jsonwebtoken";
import path from "path";

const JWT_SECRET = process.env.SESSION_SECRET || "admin-secret-key-change-in-production";

interface AdminRequest extends Request {
  adminUser?: { id: string; email: string };
}

function authenticateAdmin(req: AdminRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string };
    req.adminUser = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

export function registerAdminRoutes(app: Express) {
  app.get("/admin", (req, res) => {
    res.sendFile(path.join(__dirname, "templates", "admin-dashboard.html"));
  });

  app.post("/api/admin/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      
      const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.email, email));
      
      if (!admin) {
        if (email === "admin@buildtogether.app" && password === "admin123") {
          const passwordHash = await bcrypt.hash(password, 10);
          const [newAdmin] = await db.insert(adminUsers).values({
            email,
            passwordHash,
            name: "Admin",
            role: "admin",
          }).returning();
          
          const token = jwt.sign({ id: newAdmin.id, email: newAdmin.email }, JWT_SECRET, { expiresIn: "7d" });
          return res.json({ token, admin: { id: newAdmin.id, email: newAdmin.email, name: newAdmin.name } });
        }
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      const validPassword = await bcrypt.compare(password, admin.passwordHash);
      if (!validPassword) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      const token = jwt.sign({ id: admin.id, email: admin.email }, JWT_SECRET, { expiresIn: "7d" });
      
      await db.update(adminUsers).set({ lastLoginAt: new Date() }).where(eq(adminUsers.id, admin.id));
      
      res.json({ token, admin: { id: admin.id, email: admin.email, name: admin.name } });
    } catch (error: any) {
      console.error("Admin login error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/prompts", authenticateAdmin, async (req: AdminRequest, res) => {
    try {
      const { category } = req.query;
      
      let prompts;
      if (category && category !== "all") {
        prompts = await db.select().from(aiPrompts)
          .where(eq(aiPrompts.category, category as string))
          .orderBy(desc(aiPrompts.updatedAt));
      } else {
        prompts = await db.select().from(aiPrompts).orderBy(desc(aiPrompts.updatedAt));
      }
      
      if (prompts.length === 0) {
        await seedDefaultPrompts();
        const seededPrompts = await db.select().from(aiPrompts).orderBy(desc(aiPrompts.updatedAt));
        return res.json({ prompts: seededPrompts });
      }
      
      res.json({ prompts });
    } catch (error: any) {
      console.error("Get prompts error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/prompts/:id", authenticateAdmin, async (req: AdminRequest, res) => {
    try {
      const promptId = req.params.id;
      const results = await db.select().from(aiPrompts).where(eq(aiPrompts.id, promptId));
      const prompt = results[0];
      if (!prompt) {
        return res.status(404).json({ error: "Prompt not found" });
      }
      res.json({ prompt });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/prompts", authenticateAdmin, async (req: AdminRequest, res) => {
    try {
      const { name, category, description, promptTemplate, modelId, temperature } = req.body;
      
      const [prompt] = await db.insert(aiPrompts).values({
        name,
        category,
        description,
        promptTemplate,
        modelId: modelId || "gpt-4o",
        temperature: temperature || 0.3,
      }).returning();
      
      res.json({ prompt });
    } catch (error: any) {
      console.error("Create prompt error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/admin/prompts/:id", authenticateAdmin, async (req: AdminRequest, res) => {
    try {
      const { name, category, description, promptTemplate, modelId, temperature, isActive } = req.body;
      
      const [existing] = await db.select().from(aiPrompts).where(eq(aiPrompts.id, req.params.id));
      if (!existing) {
        return res.status(404).json({ error: "Prompt not found" });
      }
      
      const [prompt] = await db.update(aiPrompts).set({
        name,
        category,
        description,
        promptTemplate,
        modelId,
        temperature,
        isActive,
        version: (existing.version || 1) + 1,
        updatedAt: new Date(),
      }).where(eq(aiPrompts.id, req.params.id)).returning();
      
      res.json({ prompt });
    } catch (error: any) {
      console.error("Update prompt error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/logs", authenticateAdmin, async (req: AdminRequest, res) => {
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const logs = await db.select().from(aiLogs)
        .orderBy(desc(aiLogs.createdAt))
        .limit(100);
      
      const [statsResult] = await db.select({
        totalCalls: count(),
        successCount: sql<number>`COUNT(*) FILTER (WHERE status = 'success')`,
        avgLatency: sql<number>`COALESCE(AVG(latency_ms), 0)`,
      }).from(aiLogs)
        .where(gte(aiLogs.createdAt, twentyFourHoursAgo));
      
      const totalCalls = Number(statsResult?.totalCalls || 0);
      const successCount = Number(statsResult?.successCount || 0);
      const successRate = totalCalls > 0 ? Math.round((successCount / totalCalls) * 100) : 100;
      
      res.json({
        logs,
        stats: {
          totalCalls,
          successRate,
          avgLatency: Math.round(Number(statsResult?.avgLatency || 0)),
          errors: totalCalls - successCount,
        },
      });
    } catch (error: any) {
      console.error("Get logs error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/corrections", authenticateAdmin, async (req: AdminRequest, res) => {
    try {
      const corrections = await db.select().from(aiCorrections)
        .orderBy(desc(aiCorrections.createdAt))
        .limit(100);
      
      res.json({ corrections });
    } catch (error: any) {
      console.error("Get corrections error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/benchmarks", authenticateAdmin, async (req: AdminRequest, res) => {
    try {
      let configs = await db.select().from(benchmarkConfigs);
      
      if (configs.length === 0) {
        await db.insert(benchmarkConfigs).values([
          {
            configKey: "default_budgets",
            configValue: {
              groceries: 600,
              restaurants: 300,
              utilities: 200,
              internet: 100,
              transport: 200,
              entertainment: 150,
              shopping: 200,
              health: 100,
              subscriptions: 100,
            },
            description: "Default category budgets for fallback",
          },
          {
            configKey: "family_multipliers",
            configValue: {
              perChildUnder5: 0.25,
              perChild5to12: 0.2,
              perTeen: 0.3,
            },
            description: "Budget multipliers based on family composition",
          },
        ]);
        configs = await db.select().from(benchmarkConfigs);
      }
      
      res.json({ configs });
    } catch (error: any) {
      console.error("Get benchmarks error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/benchmarks", authenticateAdmin, async (req: AdminRequest, res) => {
    try {
      const { defaultBudgets, familyMultipliers } = req.body;
      
      if (defaultBudgets) {
        await db.update(benchmarkConfigs)
          .set({ configValue: defaultBudgets, updatedAt: new Date() })
          .where(eq(benchmarkConfigs.configKey, "default_budgets"));
      }
      
      if (familyMultipliers) {
        await db.update(benchmarkConfigs)
          .set({ configValue: familyMultipliers, updatedAt: new Date() })
          .where(eq(benchmarkConfigs.configKey, "family_multipliers"));
      }
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Update benchmarks error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/stats", authenticateAdmin, async (req: AdminRequest, res) => {
    try {
      const [couplesCount] = await db.select({ count: count() }).from(couples);
      const [expensesCount] = await db.select({ count: count() }).from(expenses);
      const [goalsCount] = await db.select({ count: count() }).from(goals);
      const [promptsCount] = await db.select({ count: count() }).from(aiPrompts);
      
      res.json({
        couples: couplesCount?.count || 0,
        expenses: expensesCount?.count || 0,
        goals: goalsCount?.count || 0,
        prompts: promptsCount?.count || 0,
      });
    } catch (error: any) {
      console.error("Get stats error:", error);
      res.status(500).json({ error: error.message });
    }
  });
}

async function seedDefaultPrompts() {
  const defaultPrompts = [
    {
      name: "expense_categorization",
      category: "categorization",
      description: "Categorizes expenses based on merchant and description",
      promptTemplate: `You are a financial categorization expert. Analyze the following expense and categorize it.

Expense: {{description}}
Merchant: {{merchant}}
Amount: \${{amount}}

Available categories: groceries, restaurants, utilities, internet, transport, entertainment, shopping, health, subscriptions, other

Respond with JSON:
{
  "category": "selected_category",
  "confidence": 0.95,
  "isEssential": true,
  "reasoning": "Brief explanation"
}`,
      modelId: "gpt-4o",
      temperature: 0.2,
    },
    {
      name: "budget_generation",
      category: "budgeting",
      description: "Generates personalized budgets based on city and family",
      promptTemplate: `You are a financial planning expert. Generate realistic monthly budget recommendations for a family living in {{city}}.

Family composition:
- {{numAdults}} adults
- {{numKidsUnder5}} children under 5
- {{numKids5to12}} children aged 5-12  
- {{numTeens}} teenagers (13+)
- Total family size: {{familySize}}

Based on current cost of living data for {{city}}, provide monthly budget amounts in USD for these categories:
1. groceries - food and household essentials
2. restaurants - dining out and takeout
3. utilities - electricity, gas, water
4. internet - internet and phone plans
5. transport - gas, transit, rideshare
6. entertainment - streaming, activities, movies
7. shopping - clothing, household items
8. health - medical, pharmacy, wellness
9. subscriptions - software, memberships

Respond ONLY with valid JSON in this exact format:
{
  "groceries": 800,
  "restaurants": 300,
  "utilities": 200,
  "internet": 100,
  "transport": 250,
  "entertainment": 150,
  "shopping": 200,
  "health": 150,
  "subscriptions": 100,
  "reasoning": "Brief explanation of adjustments made for location and family"
}`,
      modelId: "gpt-4o",
      temperature: 0.3,
    },
    {
      name: "guardian_nudge",
      category: "nudges",
      description: "Generates personalized financial nudges",
      promptTemplate: `You are Dream Guardian, a caring and supportive AI financial coach for couples. Generate a brief, friendly nudge based on:

Couple: {{partner1Name}} & {{partner2Name}}
Recent spending pattern: {{spendingPattern}}
Dream goal: {{dreamName}} - \${{dreamAmount}} target
Current savings rate: {{savingsRate}}

Create a supportive, non-judgmental nudge that:
- Celebrates wins when appropriate
- Gently redirects if overspending
- References their dream to keep them motivated
- Uses warm, encouraging language

Keep it under 100 words. Be conversational, not preachy.`,
      modelId: "gpt-4o",
      temperature: 0.7,
    },
    {
      name: "spending_insights",
      category: "insights",
      description: "Analyzes spending patterns and generates insights",
      promptTemplate: `Analyze this couple's spending data and provide actionable insights.

Monthly spending by category:
{{spendingByCategory}}

Budget limits:
{{budgetLimits}}

Family composition: {{familySize}} members
Location: {{city}}

Provide 3-5 specific, actionable insights. Consider:
- Categories over/under budget
- Unusual spending patterns
- Opportunities to save toward their dream
- Comparison to typical families in their area

Respond with JSON:
{
  "insights": [
    {
      "type": "warning|success|tip",
      "title": "Brief title",
      "description": "Detailed insight",
      "potentialSavings": 50
    }
  ],
  "healthScore": 75
}`,
      modelId: "gpt-4o",
      temperature: 0.4,
    },
    {
      name: "receipt_extraction",
      category: "receipt",
      description: "Extracts data from receipt images",
      promptTemplate: `Analyze this receipt image and extract all relevant information.

Extract:
1. Merchant name
2. Date
3. Total amount
4. Individual line items (name, quantity, price)
5. Tax amount if visible
6. Payment method if visible

Respond with JSON:
{
  "merchant": "Store Name",
  "date": "YYYY-MM-DD",
  "total": 45.67,
  "tax": 3.45,
  "lineItems": [
    {
      "name": "Item name",
      "quantity": 1,
      "price": 12.99,
      "category": "suggested_category"
    }
  ],
  "paymentMethod": "card",
  "confidence": 0.95
}`,
      modelId: "gpt-4o",
      temperature: 0.1,
    },
    {
      name: "ego_spend_detection",
      category: "categorization",
      description: "Detects ego spending vs essential purchases",
      promptTemplate: `Analyze if this expense is an "ego spend" (discretionary/impulse purchase) or essential.

Expense: {{description}}
Category: {{category}}
Amount: \${{amount}}
Merchant: {{merchant}}

Consider:
- Is this a want vs need?
- Is this above typical spending for this category?
- Could this be an impulse purchase?

Respond with JSON:
{
  "isEgoSpend": true,
  "confidence": 0.85,
  "egoScore": 7,
  "reasoning": "Brief explanation",
  "dreamImpact": "This amount could add X days to reaching your dream"
}`,
      modelId: "gpt-4o-mini",
      temperature: 0.3,
    },
  ];
  
  for (const prompt of defaultPrompts) {
    await db.insert(aiPrompts).values(prompt).onConflictDoNothing();
  }
}

export async function logAiCall(
  promptName: string,
  coupleId: string | null,
  inputData: any,
  outputData: any,
  status: "success" | "error",
  latencyMs: number,
  tokensUsed?: number,
  errorMessage?: string
) {
  try {
    await db.insert(aiLogs).values({
      promptName,
      coupleId,
      inputData,
      outputData,
      tokensUsed,
      latencyMs,
      status,
      errorMessage,
    });
  } catch (error) {
    console.error("Failed to log AI call:", error);
  }
}

export async function logAiCorrection(
  coupleId: string,
  expenseId: string | null,
  originalCategory: string,
  correctedCategory: string,
  aiConfidence?: number
) {
  try {
    await db.insert(aiCorrections).values({
      coupleId,
      expenseId,
      originalCategory,
      correctedCategory,
      aiConfidence,
    });
  } catch (error) {
    console.error("Failed to log AI correction:", error);
  }
}

export async function getPromptTemplate(promptName: string): Promise<{ template: string; modelId: string; temperature: number } | null> {
  try {
    const [prompt] = await db.select().from(aiPrompts)
      .where(and(eq(aiPrompts.name, promptName), eq(aiPrompts.isActive, true)));
    
    if (prompt) {
      return {
        template: prompt.promptTemplate,
        modelId: prompt.modelId || "gpt-4o",
        temperature: prompt.temperature || 0.3,
      };
    }
    return null;
  } catch (error) {
    console.error("Failed to get prompt template:", error);
    return null;
  }
}
