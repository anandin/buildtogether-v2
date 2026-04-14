import type { Express } from "express";
import { createServer, type Server } from "node:http";
import OpenAI from "openai";
import bcrypt from "bcryptjs";
import { eq, and, desc, inArray } from "drizzle-orm";
import { requireAuth, requireCoupleAccess } from "./middleware/auth";
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
  users,
  sessions,
  partnerInvites,
  guardianInsights,
  guardianRecommendations,
  savingsConfirmations,
  savingsStreaks,
  dailyAnalysis,
  partnerNudgePreferences,
  nudgeEscalation,
  behavioralLearningHistory,
  aiPrompts,
  aiLogs,
  commitments,
  spendingPatterns,
  feedback,
  activityFeed,
  guardianConversations,
} from "../shared/schema";
import { detectPatterns, savePatterns, createNudgeFromPattern, getActivePatterns, getPendingNudges } from "./pattern-detection";
import { buildDailyAnalysisPrompt, buildFeedbackLearningPrompt } from "./prompts";

const DEFAULT_CATEGORY_BUDGETS = [
  { category: "groceries", monthlyLimit: 600, budgetType: "recurring" },
  { category: "restaurants", monthlyLimit: 300, budgetType: "recurring" },
  { category: "utilities", monthlyLimit: 200, budgetType: "recurring" },
  { category: "internet", monthlyLimit: 100, budgetType: "recurring" },
  { category: "transport", monthlyLimit: 200, budgetType: "rollover" },
  { category: "entertainment", monthlyLimit: 150, budgetType: "rollover" },
  { category: "shopping", monthlyLimit: 200, budgetType: "rollover" },
  { category: "health", monthlyLimit: 100, budgetType: "rollover" },
  { category: "subscriptions", monthlyLimit: 100, budgetType: "recurring" },
];
import crypto from "crypto";

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  // If using OpenRouter, these headers improve rankings (optional)
  defaultHeaders: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL?.includes("openrouter.ai")
    ? {
        "HTTP-Referer": "https://buildtogether-v2.vercel.app",
        "X-Title": "BuildTogether V2",
      }
    : undefined,
});

// Model name helper — prefixes with "openai/" when using OpenRouter
const AI_MODEL = (() => {
  const baseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "";
  const isOpenRouter = baseUrl.includes("openrouter.ai");
  return isOpenRouter ? "openai/gpt-4o-mini" : "gpt-4o-mini";
})();

async function getAIPrompt(promptName: string): Promise<{
  promptTemplate: string;
  modelId: string;
  temperature: number;
} | null> {
  try {
    const [prompt] = await db
      .select()
      .from(aiPrompts)
      .where(and(eq(aiPrompts.name, promptName), eq(aiPrompts.isActive, true)))
      .limit(1);
    if (prompt) {
      return {
        promptTemplate: prompt.promptTemplate,
        modelId: prompt.modelId || "gpt-4o",
        temperature: prompt.temperature ?? 0.5,
      };
    }
  } catch (error) {
    console.error(`Error fetching prompt ${promptName}:`, error);
  }
  return null;
}

function fillPromptTemplate(template: string, variables: Record<string, string | number>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(value));
  }
  return result;
}

async function logAICall(data: {
  promptName: string;
  coupleId?: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  tokensUsed?: number;
  latencyMs?: number;
}): Promise<void> {
  try {
    await db.insert(aiLogs).values({
      promptName: data.promptName,
      coupleId: data.coupleId || null,
      inputData: data.input,
      outputData: data.output || null,
      status: data.error ? "error" : "success",
      errorMessage: data.error || null,
      tokensUsed: data.tokensUsed || null,
      latencyMs: data.latencyMs || null,
    });
  } catch (error) {
    console.error("Error logging AI call:", error);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // ==================== AUTHENTICATION ENDPOINTS ====================

  // Apple Sign-In - verify identity token and create/update user
  app.post("/api/auth/apple", async (req, res) => {
    try {
      const { appleId, email, fullName, identityToken } = req.body;

      if (!appleId) {
        return res.status(400).json({ error: "Apple ID is required" });
      }

      // Check if user exists by Apple ID
      let user = await db.query.users.findFirst({
        where: eq(users.appleId, appleId),
      });

      if (user) {
        // Update last login
        await db.update(users)
          .set({ lastLoginAt: new Date() })
          .where(eq(users.id, user.id));
      } else {
        // Create new user and couple
        const [newCouple] = await db.insert(couples).values({
          partner1Name: fullName || "You",
          partner2Name: "Partner",
          hasCompletedOnboarding: false,
        }).returning();

        const [newUser] = await db.insert(users).values({
          appleId,
          email: email || null,
          name: fullName || null,
          coupleId: newCouple.id,
          partnerRole: "partner1",
        }).returning();

        user = newUser;
      }

      // Create session
      const token = generateSessionToken();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      await db.insert(sessions).values({
        userId: user.id,
        token,
        expiresAt,
      });

      res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          coupleId: user.coupleId,
          partnerRole: user.partnerRole,
        },
        token,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (error: any) {
      console.error("Apple auth error:", error);
      res.status(500).json({ error: error.message || "Authentication failed" });
    }
  });

  // Email/Password Registration
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password, name } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }

      // Check if user already exists
      const existingUser = await db.query.users.findFirst({
        where: eq(users.email, email.toLowerCase()),
      });

      if (existingUser) {
        return res.status(400).json({ error: "An account with this email already exists" });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // Create couple and user
      const [newCouple] = await db.insert(couples).values({
        partner1Name: name || "You",
        partner2Name: "Partner",
        hasCompletedOnboarding: false,
      }).returning();

      const [newUser] = await db.insert(users).values({
        email: email.toLowerCase(),
        name: name || null,
        passwordHash,
        coupleId: newCouple.id,
        partnerRole: "partner1",
      }).returning();

      // Create session
      const token = generateSessionToken();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await db.insert(sessions).values({
        userId: newUser.id,
        token,
        expiresAt,
      });

      res.json({
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
          coupleId: newUser.coupleId,
          partnerRole: newUser.partnerRole,
        },
        token,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (error: any) {
      console.error("Registration error:", error);
      res.status(500).json({ error: error.message || "Registration failed" });
    }
  });

  // Email/Password Login
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      const user = await db.query.users.findFirst({
        where: eq(users.email, email.toLowerCase()),
      });

      if (!user || !user.passwordHash) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const isValidPassword = await bcrypt.compare(password, user.passwordHash);
      if (!isValidPassword) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      // Update last login
      await db.update(users)
        .set({ lastLoginAt: new Date() })
        .where(eq(users.id, user.id));

      // Create session
      const token = generateSessionToken();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await db.insert(sessions).values({
        userId: user.id,
        token,
        expiresAt,
      });

      res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          coupleId: user.coupleId,
          partnerRole: user.partnerRole,
        },
        token,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (error: any) {
      console.error("Login error:", error);
      res.status(500).json({ error: error.message || "Login failed" });
    }
  });

  // Google Sign-In
  app.post("/api/auth/google", async (req, res) => {
    try {
      const { googleId, email, name, idToken } = req.body;

      if (!googleId) {
        return res.status(400).json({ error: "Google ID is required" });
      }

      // Check if user exists by Google ID
      let user = await db.query.users.findFirst({
        where: eq(users.googleId, googleId),
      });

      if (user) {
        // Update last login
        await db.update(users)
          .set({ lastLoginAt: new Date() })
          .where(eq(users.id, user.id));
      } else {
        // Check if user exists with same email (from another provider)
        const existingEmailUser = email ? await db.query.users.findFirst({
          where: eq(users.email, email.toLowerCase()),
        }) : null;

        if (existingEmailUser) {
          // Link Google ID to existing account
          await db.update(users)
            .set({ googleId, lastLoginAt: new Date() })
            .where(eq(users.id, existingEmailUser.id));
          user = { ...existingEmailUser, googleId };
        } else {
          // Create new user and couple
          const [newCouple] = await db.insert(couples).values({
            partner1Name: name || "You",
            partner2Name: "Partner",
            hasCompletedOnboarding: false,
          }).returning();

          const [newUser] = await db.insert(users).values({
            googleId,
            email: email?.toLowerCase() || null,
            name: name || null,
            coupleId: newCouple.id,
            partnerRole: "partner1",
          }).returning();

          user = newUser;
        }
      }

      // Create session
      const token = generateSessionToken();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await db.insert(sessions).values({
        userId: user.id,
        token,
        expiresAt,
      });

      res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          coupleId: user.coupleId,
          partnerRole: user.partnerRole,
        },
        token,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (error: any) {
      console.error("Google auth error:", error);
      res.status(500).json({ error: error.message || "Authentication failed" });
    }
  });

  // Validate session token
  app.get("/api/auth/session", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "No token provided" });
      }

      const token = authHeader.split(" ")[1];
      const session = await db.query.sessions.findFirst({
        where: eq(sessions.token, token),
      });

      if (!session || new Date(session.expiresAt) < new Date()) {
        return res.status(401).json({ error: "Invalid or expired session" });
      }

      const user = await db.query.users.findFirst({
        where: eq(users.id, session.userId),
      });

      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          coupleId: user.coupleId,
          partnerRole: user.partnerRole,
        },
      });
    } catch (error: any) {
      console.error("Session validation error:", error);
      res.status(500).json({ error: "Session validation failed" });
    }
  });

  // Logout - delete session
  app.post("/api/auth/logout", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.split(" ")[1];
        await db.delete(sessions).where(eq(sessions.token, token));
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error("Logout error:", error);
      res.status(500).json({ error: "Logout failed" });
    }
  });

  // Delete account - Required for Apple App Store compliance
  app.delete("/api/auth/account", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "No token provided" });
      }

      const token = authHeader.split(" ")[1];
      const session = await db.query.sessions.findFirst({
        where: eq(sessions.token, token),
      });

      if (!session || new Date(session.expiresAt) < new Date()) {
        return res.status(401).json({ error: "Invalid or expired session" });
      }

      const user = await db.query.users.findFirst({
        where: eq(users.id, session.userId),
      });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Delete all user sessions
      await db.delete(sessions).where(eq(sessions.userId, user.id));

      // If user is partner1, we need to handle the couple data
      // For now, we'll delete the user but leave couple data for partner2
      // If partner2, just unlink from couple
      if (user.coupleId) {
        const couple = await db.query.couples.findFirst({
          where: eq(couples.id, user.coupleId),
        });

        if (couple) {
          // Check if there's another user linked to this couple
          const otherUsers = await db.select().from(users)
            .where(and(
              eq(users.coupleId, user.coupleId),
              eq(users.id, user.id)
            ));

          // If this user is the only one, delete all couple data
          if (otherUsers.length <= 1) {
            // Delete couple-related data
            await db.delete(expenses).where(eq(expenses.coupleId, user.coupleId));
            await db.delete(goals).where(eq(goals.coupleId, user.coupleId));
            await db.delete(categoryBudgets).where(eq(categoryBudgets.coupleId, user.coupleId));
            await db.delete(customCategories).where(eq(customCategories.coupleId, user.coupleId));
            await db.delete(settlements).where(eq(settlements.coupleId, user.coupleId));
            await db.delete(partnerInvites).where(eq(partnerInvites.coupleId, user.coupleId));
            await db.delete(couples).where(eq(couples.id, user.coupleId));
          }
        }
      }

      // Delete the user
      await db.delete(users).where(eq(users.id, user.id));

      res.json({ success: true, message: "Account deleted successfully" });
    } catch (error: any) {
      console.error("Delete account error:", error);
      res.status(500).json({ error: "Failed to delete account" });
    }
  });

  // Create partner invite
  app.post("/api/invite/create", requireAuth, async (req, res) => {
    try {
      const { coupleId, userId, email } = req.body;

      if (!coupleId || !userId) {
        return res.status(400).json({ error: "Couple ID and user ID required" });
      }

      // Generate unique invite code
      let inviteCode = generateInviteCode();
      let attempts = 0;
      while (attempts < 10) {
        const existing = await db.query.partnerInvites.findFirst({
          where: eq(partnerInvites.inviteCode, inviteCode),
        });
        if (!existing) break;
        inviteCode = generateInviteCode();
        attempts++;
      }

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const [invite] = await db.insert(partnerInvites).values({
        coupleId,
        invitedBy: userId,
        inviteCode,
        invitedEmail: email || null,
        expiresAt,
      }).returning();

      res.json({
        inviteCode: invite.inviteCode,
        expiresAt: invite.expiresAt,
      });
    } catch (error: any) {
      console.error("Create invite error:", error);
      res.status(500).json({ error: "Failed to create invite" });
    }
  });

  // Accept partner invite
  app.post("/api/invite/accept", requireAuth, async (req, res) => {
    try {
      const { inviteCode, userId } = req.body;

      if (!inviteCode || !userId) {
        return res.status(400).json({ error: "Invite code and user ID required" });
      }

      const invite = await db.query.partnerInvites.findFirst({
        where: and(
          eq(partnerInvites.inviteCode, inviteCode.toUpperCase()),
          eq(partnerInvites.status, "pending")
        ),
      });

      if (!invite) {
        return res.status(404).json({ error: "Invite not found or already used" });
      }

      if (new Date(invite.expiresAt) < new Date()) {
        return res.status(400).json({ error: "Invite has expired" });
      }

      // Update user to join the couple
      await db.update(users)
        .set({ 
          coupleId: invite.coupleId, 
          partnerRole: "partner2" 
        })
        .where(eq(users.id, userId));

      // Mark invite as accepted
      await db.update(partnerInvites)
        .set({ 
          status: "accepted", 
          acceptedBy: userId 
        })
        .where(eq(partnerInvites.id, invite.id));

      // Update couple connected status
      await db.update(couples)
        .set({ connectedSince: new Date().toISOString() })
        .where(eq(couples.id, invite.coupleId));

      res.json({ 
        success: true, 
        coupleId: invite.coupleId,
        message: "Successfully connected with your partner!",
        skipOnboarding: true  // Partner B should skip onboarding since they're joining existing couple
      });
    } catch (error: any) {
      console.error("Accept invite error:", error);
      res.status(500).json({ error: "Failed to accept invite" });
    }
  });

  // Get current invite for a couple
  app.get("/api/invite/:coupleId", requireAuth, requireCoupleAccess, async (req, res) => {
    try {
      const { coupleId } = req.params;

      const invite = await db.query.partnerInvites.findFirst({
        where: and(
          eq(partnerInvites.coupleId, coupleId),
          eq(partnerInvites.status, "pending")
        ),
      });

      if (!invite || new Date(invite.expiresAt) < new Date()) {
        return res.json({ hasActiveInvite: false });
      }

      res.json({
        hasActiveInvite: true,
        inviteCode: invite.inviteCode,
        expiresAt: invite.expiresAt,
      });
    } catch (error: any) {
      console.error("Get invite error:", error);
      res.status(500).json({ error: "Failed to get invite" });
    }
  });

  // ==================== EXISTING ENDPOINTS ====================

  // Receipt scanning endpoint - enhanced with line item extraction
  app.post("/api/scan-receipt", requireAuth, async (req, res) => {
    try {
      const { image } = req.body;

      if (!image) {
        return res.status(400).json({ error: "Image is required" });
      }

      const response = await openai.chat.completions.create({
        model: AI_MODEL,
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
  app.post("/api/ai-insights", requireAuth, async (req, res) => {
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
        model: AI_MODEL,
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

  // ==================== GUARDIAN QUICK-ADD (Agent-First Expense Entry) ====================
  app.post("/api/guardian/quick-add", requireAuth, async (req, res) => {
    try {
      const { text, coupleId } = req.body;

      if (!text || !coupleId) {
        return res.status(400).json({ error: "Text and coupleId are required" });
      }

      // Verify couple access
      if (req.user?.coupleId !== coupleId) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Gather context for smart parsing — now includes recent conversation (Phase 4)
      const [couple, recentExpenses, budgets, recentConversation] = await Promise.all([
        db.query.couples.findFirst({ where: eq(couples.id, coupleId) }),
        db.select().from(expenses)
          .where(eq(expenses.coupleId, coupleId))
          .orderBy(desc(expenses.createdAt))
          .limit(30),
        db.select().from(categoryBudgets)
          .where(eq(categoryBudgets.coupleId, coupleId)),
        db.select().from(guardianConversations)
          .where(eq(guardianConversations.coupleId, coupleId))
          .orderBy(desc(guardianConversations.createdAt))
          .limit(6),
      ]);

      if (!couple) {
        return res.status(404).json({ error: "Couple not found" });
      }

      const isSoloMode = !couple.partner2Name || couple.partner2Name === "Partner" || couple.partner2Name === "";

      // Extract recent merchants (deduplicated)
      const recentMerchants = [...new Set(
        recentExpenses
          .map(e => e.merchant)
          .filter((m): m is string => !!m)
      )].slice(0, 15);

      // Determine default split from recent behavior
      const splitCounts: Record<string, number> = {};
      recentExpenses.slice(0, 10).forEach(e => {
        splitCounts[e.splitMethod] = (splitCounts[e.splitMethod] || 0) + 1;
      });
      const defaultSplitMethod = Object.entries(splitCounts)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || "even";

      // Calculate current month budget status
      const now = new Date();
      const currentMonthExpenses = recentExpenses.filter(e => {
        const d = new Date(e.date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });

      const spentByCategory: Record<string, number> = {};
      currentMonthExpenses.forEach(e => {
        spentByCategory[e.category] = (spentByCategory[e.category] || 0) + e.amount;
      });

      const budgetStatus = budgets.map(b => ({
        category: b.category,
        spent: spentByCategory[b.category] || 0,
        limit: b.monthlyLimit,
      }));

      const categories = [
        "groceries", "restaurants", "transport", "utilities", "internet",
        "entertainment", "shopping", "health", "subscriptions", "personal",
        "education", "gifts", "other",
      ];

      const { buildQuickAddPrompt } = await import("./prompts");

      // Pass most recent 6 conversation messages in chronological order for multi-turn context
      const conversationTurns = recentConversation
        .slice()
        .reverse()
        .map((m: any) => ({ role: m.role as "user" | "guardian", content: m.content }));

      const prompt = buildQuickAddPrompt({
        partner1Name: couple.partner1Name,
        partner2Name: couple.partner2Name,
        currentUserRole: req.user?.partnerRole || "partner1",
        recentMerchants,
        defaultSplitMethod: isSoloMode ? "joint" : defaultSplitMethod,
        categories,
        budgetStatus,
        isSoloMode,
        recentConversation: conversationTurns,
      });

      const response = await openai.chat.completions.create({
        model: AI_MODEL,
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: text },
        ],
        max_completion_tokens: 400,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return res.status(500).json({ error: "Failed to parse expense" });
      }

      const parsed = JSON.parse(content);

      // Add budget alert if approaching limit
      let budgetAlert: string | undefined;
      if (parsed.amount && parsed.category) {
        const budget = budgetStatus.find(b => b.category === parsed.category);
        if (budget) {
          const projectedSpent = budget.spent + parsed.amount;
          const pct = Math.round((projectedSpent / budget.limit) * 100);
          if (pct >= 100) {
            budgetAlert = `This puts you over your ${parsed.category} budget ($${budget.limit}/mo). You'd be at ${pct}%.`;
          } else if (pct >= 80) {
            budgetAlert = `You're at ${pct}% of your ${parsed.category} budget ($${budget.limit}/mo) after this.`;
          }
        }
      }

      // Determine if we should auto-save (small, high-confidence expenses)
      const autoSave = parsed.amount && parsed.amount < 15 && parsed.confidence >= 0.9 && !parsed.clarificationQuestion;

      let savedExpense = null;
      if (autoSave) {
        const today = new Date().toISOString().split("T")[0];
        const [expense] = await db.insert(expenses).values({
          coupleId,
          amount: parsed.amount,
          description: parsed.description || "",
          merchant: parsed.merchant || null,
          category: parsed.category,
          date: today,
          paidBy: parsed.paidBy || req.user?.partnerRole || "partner1",
          splitMethod: parsed.splitMethod || (isSoloMode ? "joint" : defaultSplitMethod),
        }).returning();
        savedExpense = expense;

        // Phase 3: record activity for auto-saved expenses
        db.insert(activityFeed).values({
          coupleId,
          userId: req.user?.id,
          activityType: "expense_added",
          entityId: expense.id,
          summary: `${req.user?.name || "Someone"} auto-logged $${expense.amount} at ${expense.merchant || expense.category} via Guardian`,
          metadata: { amount: expense.amount, category: expense.category, merchant: expense.merchant, source: "guardian_auto" },
        }).catch((err: any) => console.error("Activity feed insert failed:", err));
      }

      // Phase 4: save conversation turn (user message + guardian response)
      db.insert(guardianConversations).values([
        {
          coupleId,
          userId: req.user?.id,
          role: "user",
          content: text,
          intent: "expense",
        },
        {
          coupleId,
          userId: req.user?.id,
          role: "guardian",
          content: parsed.guardianMessage || (parsed.clarificationQuestion || ""),
          intent: parsed.clarificationQuestion ? "clarification" : "expense",
          metadata: { parsed, autoSaved: !!savedExpense, budgetAlert },
        },
      ]).catch((err: any) => console.error("Conversation save failed:", err));

      res.json({
        parsed: {
          amount: parsed.amount,
          merchant: parsed.merchant,
          category: parsed.category,
          description: parsed.description,
          paidBy: parsed.paidBy,
          splitMethod: parsed.splitMethod,
        },
        confidence: parsed.confidence || 0.5,
        guardianMessage: parsed.guardianMessage || "Got it!",
        clarificationQuestion: parsed.clarificationQuestion || null,
        budgetAlert: budgetAlert || null,
        autoSaved: !!savedExpense,
        savedExpense,
      });
    } catch (error: any) {
      console.error("Guardian quick-add error:", error);
      res.status(500).json({ error: error.message || "Failed to process expense" });
    }
  });

  // Quick expense parsing - parse natural language expense input
  app.post("/api/parse-expense", requireAuth, async (req, res) => {
    try {
      const { text } = req.body;

      if (!text) {
        return res.status(400).json({ error: "Text is required" });
      }

      const response = await openai.chat.completions.create({
        model: AI_MODEL,
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
  app.post("/api/detect-ego-spends", requireAuth, async (req, res) => {
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
        model: AI_MODEL,
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
  app.get("/api/couple/:coupleId", requireAuth, requireCoupleAccess, async (req, res) => {
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
  app.put("/api/couple/:coupleId", requireAuth, requireCoupleAccess, async (req, res) => {
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
  app.get("/api/expenses/:coupleId", requireAuth, requireCoupleAccess, async (req, res) => {
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
  app.get("/api/expenses/:coupleId/:expenseId/line-items", requireAuth, requireCoupleAccess, async (req, res) => {
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
  app.post("/api/expenses/:coupleId", requireAuth, requireCoupleAccess, async (req, res) => {
    try {
      const { coupleId } = req.params;
      const expenseData = req.body;

      const [expense] = await db.insert(expenses).values({
        ...expenseData,
        coupleId,
      }).returning();

      // Phase 3: record activity (non-blocking)
      db.insert(activityFeed).values({
        coupleId,
        userId: req.user?.id,
        activityType: "expense_added",
        entityId: expense.id,
        summary: `${req.user?.name || "Someone"} logged $${expense.amount} at ${expense.merchant || expense.category}`,
        metadata: { amount: expense.amount, category: expense.category, merchant: expense.merchant },
      }).catch((err: any) => console.error("Activity feed insert failed:", err));

      res.json(expense);
    } catch (error: any) {
      console.error("Add expense error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update expense
  app.put("/api/expenses/:coupleId/:expenseId", requireAuth, requireCoupleAccess, async (req, res) => {
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
  app.delete("/api/expenses/:coupleId/:expenseId", requireAuth, requireCoupleAccess, async (req, res) => {
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
  app.get("/api/goals/:coupleId", requireAuth, requireCoupleAccess, async (req, res) => {
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
  app.post("/api/goals/:coupleId", requireAuth, requireCoupleAccess, async (req, res) => {
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
  app.put("/api/goals/:coupleId/:goalId", requireAuth, requireCoupleAccess, async (req, res) => {
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
  app.delete("/api/goals/:coupleId/:goalId", requireAuth, requireCoupleAccess, async (req, res) => {
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
  app.post("/api/goals/:coupleId/:goalId/contribute", requireAuth, requireCoupleAccess, async (req, res) => {
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
  app.get("/api/budgets/:coupleId", requireAuth, requireCoupleAccess, async (req, res) => {
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
  app.post("/api/budgets/:coupleId", requireAuth, requireCoupleAccess, async (req, res) => {
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

  // AI-powered budget generation based on city and family composition
  app.post("/api/budgets/:coupleId/generate", requireAuth, requireCoupleAccess, async (req, res) => {
    try {
      const { coupleId } = req.params;
      const { city, numAdults = 2, numKidsUnder5 = 0, numKids5to12 = 0, numTeens = 0 } = req.body;
      
      const totalKids = numKidsUnder5 + numKids5to12 + numTeens;
      const familySize = numAdults + totalKids;
      const cityName = city?.trim() || "average US city";
      
      const startTime = Date.now();
      let budgetRecommendations: Record<string, number | string> = {};
      let usedModel = "gpt-4o";
      
      try {
        const promptConfig = await getAIPrompt("budget_generation");
        let promptContent: string;
        
        if (promptConfig) {
          promptContent = fillPromptTemplate(promptConfig.promptTemplate, {
            city: cityName,
            numAdults,
            numKidsUnder5,
            numKids5to12,
            numTeens,
            familySize,
          });
          usedModel = promptConfig.modelId;
        } else {
          promptContent = `You are a financial planning expert. Generate realistic monthly budget recommendations for a family living in ${cityName}.

Family composition:
- ${numAdults} adults
- ${numKidsUnder5} children under 5
- ${numKids5to12} children aged 5-12  
- ${numTeens} teenagers (13+)
- Total family size: ${familySize}

Based on current cost of living data for ${cityName}, provide monthly budget amounts in USD for these categories:
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
}`;
        }
        
        const completion = await openai.chat.completions.create({
          model: usedModel,
          messages: [{ role: "user", content: promptContent }],
          response_format: { type: "json_object" },
          temperature: promptConfig?.temperature ?? 0.3,
        });
        
        const content = completion.choices[0]?.message?.content;
        if (content) {
          budgetRecommendations = JSON.parse(content);
        }
        
        await logAICall({
          promptName: "budget_generation",
          coupleId,
          input: { city: cityName, numAdults, numKidsUnder5, numKids5to12, numTeens, familySize, model: usedModel },
          output: budgetRecommendations as Record<string, unknown>,
          tokensUsed: completion.usage?.total_tokens,
          latencyMs: Date.now() - startTime,
        });
      } catch (aiError) {
        console.error("AI budget generation error:", aiError);
        
        await logAICall({
          promptName: "budget_generation",
          coupleId,
          input: { city: cityName, numAdults, numKidsUnder5, numKids5to12, numTeens, familySize },
          error: String(aiError),
          latencyMs: Date.now() - startTime,
        });
        // Fallback to default calculations with family adjustments
        const baseMultiplier = familySize > 2 ? 1 + (familySize - 2) * 0.25 : 1;
        budgetRecommendations = {
          groceries: Math.round(600 * baseMultiplier),
          restaurants: Math.round(300 * (1 + totalKids * 0.1)),
          utilities: Math.round(200 * (1 + familySize * 0.1)),
          internet: 100,
          transport: Math.round(200 * (1 + totalKids * 0.15)),
          entertainment: Math.round(150 * (1 + totalKids * 0.2)),
          shopping: Math.round(200 * baseMultiplier),
          health: Math.round(100 * (1 + totalKids * 0.3)),
          subscriptions: 100,
        };
      }
      
      // Delete existing budgets for this couple
      await db.delete(categoryBudgets).where(eq(categoryBudgets.coupleId, coupleId));
      
      // Create new budgets based on AI recommendations
      const budgetCategories = ["groceries", "restaurants", "utilities", "internet", "transport", "entertainment", "shopping", "health", "subscriptions"];
      const budgetTypes: Record<string, string> = {
        groceries: "recurring",
        restaurants: "recurring",
        utilities: "recurring",
        internet: "recurring",
        transport: "rollover",
        entertainment: "rollover",
        shopping: "rollover",
        health: "rollover",
        subscriptions: "recurring",
      };
      
      const budgetsToInsert = budgetCategories.map((category) => {
        const rec = budgetRecommendations[category];
        const monthlyLimit = typeof rec === 'number' ? rec : (DEFAULT_CATEGORY_BUDGETS.find(b => b.category === category)?.monthlyLimit || 200);
        return {
          coupleId,
          category,
          monthlyLimit,
          budgetType: budgetTypes[category],
          alertThreshold: 80,
          rolloverBalance: 0,
        };
      });
      
      const insertedBudgets = await db.insert(categoryBudgets).values(budgetsToInsert).returning();
      
      res.json({ 
        budgets: insertedBudgets,
        reasoning: budgetRecommendations.reasoning || `Budget personalized for ${cityName} with family of ${familySize}`,
      });
    } catch (error: any) {
      console.error("Generate budget error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get custom categories
  app.get("/api/categories/:coupleId", requireAuth, requireCoupleAccess, async (req, res) => {
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
  app.post("/api/categories/:coupleId", requireAuth, requireCoupleAccess, async (req, res) => {
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
  app.delete("/api/categories/:coupleId/:categoryId", requireAuth, requireCoupleAccess, async (req, res) => {
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
  app.post("/api/settlements/:coupleId", requireAuth, requireCoupleAccess, async (req, res) => {
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
  app.get("/api/settlements/:coupleId", requireAuth, requireCoupleAccess, async (req, res) => {
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
  app.get("/api/sync/:coupleId", requireAuth, requireCoupleAccess, async (req, res) => {
    try {
      const { coupleId } = req.params;
      
      let [couple] = await db.select().from(couples).where(eq(couples.id, coupleId));
      let isNewCouple = false;
      if (!couple) {
        [couple] = await db.insert(couples).values({
          id: coupleId,
          partner1Name: "You",
          partner2Name: "Partner",
        }).returning();
        isNewCouple = true;
      }
      
      const [expensesData, goalsData, allContributions, budgetsData, categoriesData, settlementsData] = await Promise.all([
        db.select().from(expenses)
          .where(eq(expenses.coupleId, coupleId))
          .orderBy(desc(expenses.createdAt)),
        db.select().from(goals)
          .where(eq(goals.coupleId, coupleId)),
        db.select().from(goalContributions)
          .where(inArray(
            goalContributions.goalId,
            db.select({ id: goals.id }).from(goals).where(eq(goals.coupleId, coupleId))
          )),
        db.select().from(categoryBudgets)
          .where(eq(categoryBudgets.coupleId, coupleId)),
        db.select().from(customCategories)
          .where(eq(customCategories.coupleId, coupleId)),
        db.select().from(settlements)
          .where(eq(settlements.coupleId, coupleId)),
      ]);
      
      const contributionsByGoal = new Map<string, typeof allContributions>();
      for (const c of allContributions) {
        const list = contributionsByGoal.get(c.goalId) || [];
        list.push(c);
        contributionsByGoal.set(c.goalId, list);
      }
      const goalsWithContributions = goalsData.map(goal => ({
        ...goal,
        contributions: contributionsByGoal.get(goal.id) || [],
      }));
      
      let finalBudgets = budgetsData;
      if (budgetsData.length === 0) {
        const defaultBudgetsToInsert = DEFAULT_CATEGORY_BUDGETS.map((b) => ({
          coupleId,
          category: b.category,
          monthlyLimit: b.monthlyLimit,
          budgetType: b.budgetType,
          alertThreshold: 80,
          rolloverBalance: 0,
        }));
        finalBudgets = await db.insert(categoryBudgets).values(defaultBudgetsToInsert).returning();
      }
      
      res.json({
        couple,
        expenses: expensesData,
        goals: goalsWithContributions,
        categoryBudgets: finalBudgets,
        customCategories: categoriesData,
        settlements: settlementsData,
      });
    } catch (error: any) {
      console.error("Sync error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update family profile
  app.put("/api/family/:coupleId", requireAuth, requireCoupleAccess, async (req, res) => {
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
  app.post("/api/expenses/:coupleId/:expenseId/line-items", requireAuth, requireCoupleAccess, async (req, res) => {
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

  // Get line items for an expense (alternate)
  app.get("/api/expenses/:coupleId/:expenseId/line-items", requireAuth, requireCoupleAccess, async (req, res) => {
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

  // Update a line item (for reclassification)
  app.put("/api/line-items/:itemId", requireAuth, async (req, res) => {
    try {
      const { itemId } = req.params;
      const { classification, isEssential } = req.body;
      
      const [updated] = await db.update(lineItems)
        .set({ 
          classification,
          isEssential,
        })
        .where(eq(lineItems.id, itemId))
        .returning();
      
      res.json(updated);
    } catch (error: any) {
      console.error("Update line item error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get spending benchmarks
  app.get("/api/benchmarks", async (req, res) => {
    try {
      const { familySize, hasKids, country } = req.query;
      
      let benchmarks;
      if (familySize) {
        benchmarks = await db.select().from(spendingBenchmarks)
          .where(eq(spendingBenchmarks.familySize, parseInt(familySize as string)));
      } else {
        benchmarks = await db.select().from(spendingBenchmarks);
      }
      res.json(benchmarks);
    } catch (error: any) {
      console.error("Get benchmarks error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // AI-powered spending insights with benchmarks and caching
  app.post("/api/spending-insights/:coupleId", requireAuth, requireCoupleAccess, async (req, res) => {
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
        model: AI_MODEL,
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
  app.post("/api/benchmarks/seed", requireAuth, async (req, res) => {
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

  // ==================== GUARDIAN MEMORY SYSTEM ====================

  // Get all Guardian insights for a couple
  app.get("/api/guardian/insights/:coupleId", requireAuth, requireCoupleAccess, async (req, res) => {
    try {
      const { coupleId } = req.params;
      const insights = await db
        .select()
        .from(guardianInsights)
        .where(and(eq(guardianInsights.coupleId, coupleId), eq(guardianInsights.isActive, true)))
        .orderBy(desc(guardianInsights.createdAt));
      res.json(insights);
    } catch (error: any) {
      console.error("Get guardian insights error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Store a new Guardian insight
  app.post("/api/guardian/insights/:coupleId", requireAuth, requireCoupleAccess, async (req, res) => {
    try {
      const { coupleId } = req.params;
      const { insightType, category, title, description, confidence, metadata } = req.body;
      
      const [insight] = await db
        .insert(guardianInsights)
        .values({
          coupleId,
          insightType,
          category,
          title,
          description,
          confidence: confidence || 0.5,
          metadata,
        })
        .returning();
      
      res.json(insight);
    } catch (error: any) {
      console.error("Create guardian insight error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get recommendations for a couple (with optional status filter)
  app.get("/api/guardian/recommendations/:coupleId", requireAuth, requireCoupleAccess, async (req, res) => {
    try {
      const { coupleId } = req.params;
      const { status } = req.query;
      
      let query = db
        .select()
        .from(guardianRecommendations)
        .where(eq(guardianRecommendations.coupleId, coupleId))
        .orderBy(desc(guardianRecommendations.createdAt));
      
      const recommendations = await query;
      
      // Filter by status if provided
      const filtered = status 
        ? recommendations.filter(r => r.status === status)
        : recommendations;
      
      res.json(filtered);
    } catch (error: any) {
      console.error("Get guardian recommendations error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Create a new recommendation
  app.post("/api/guardian/recommendations/:coupleId", requireAuth, requireCoupleAccess, async (req, res) => {
    try {
      const { coupleId } = req.params;
      const { insightId, recommendationType, title, message, suggestedAction, targetAmount, category } = req.body;
      
      const [recommendation] = await db
        .insert(guardianRecommendations)
        .values({
          coupleId,
          insightId,
          recommendationType,
          title,
          message,
          suggestedAction,
          targetAmount,
          category,
          status: "pending",
        })
        .returning();
      
      res.json(recommendation);
    } catch (error: any) {
      console.error("Create guardian recommendation error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update recommendation status (shown, acted, dismissed)
  app.put("/api/guardian/recommendations/:coupleId/:recommendationId", requireAuth, requireCoupleAccess, async (req, res) => {
    try {
      const { coupleId, recommendationId } = req.params;
      const { status, userFeedback } = req.body;
      
      const updateData: any = { status };
      
      if (status === "shown") {
        updateData.shownAt = new Date();
      } else if (status === "acted") {
        updateData.actedAt = new Date();
      } else if (status === "dismissed") {
        updateData.dismissedAt = new Date();
      }
      
      if (userFeedback) {
        updateData.userFeedback = userFeedback;
      }
      
      const [updated] = await db
        .update(guardianRecommendations)
        .set(updateData)
        .where(
          and(
            eq(guardianRecommendations.id, recommendationId),
            eq(guardianRecommendations.coupleId, coupleId)
          )
        )
        .returning();
      
      res.json(updated);
    } catch (error: any) {
      console.error("Update guardian recommendation error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get savings confirmations for a couple
  app.get("/api/guardian/savings/:coupleId", requireAuth, requireCoupleAccess, async (req, res) => {
    try {
      const { coupleId } = req.params;
      const confirmations = await db
        .select()
        .from(savingsConfirmations)
        .where(eq(savingsConfirmations.coupleId, coupleId))
        .orderBy(desc(savingsConfirmations.createdAt));
      res.json(confirmations);
    } catch (error: any) {
      console.error("Get savings confirmations error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Confirm a savings deposit
  app.post("/api/guardian/savings/:coupleId", requireAuth, requireCoupleAccess, async (req, res) => {
    try {
      const { coupleId } = req.params;
      const { goalId, amount, confirmationType, note, triggeredBy, recommendationId, confirmationDate } = req.body;
      
      // Create savings confirmation
      const [confirmation] = await db
        .insert(savingsConfirmations)
        .values({
          coupleId,
          goalId,
          amount,
          confirmationType: confirmationType || "bank_transfer",
          note,
          triggeredBy,
          recommendationId,
          confirmationDate: confirmationDate || new Date().toISOString().split("T")[0],
        })
        .returning();
      
      // Update savings streak
      const [existingStreak] = await db
        .select()
        .from(savingsStreaks)
        .where(eq(savingsStreaks.coupleId, coupleId));
      
      const today = new Date();
      const todayStr = today.toISOString().split("T")[0];
      
      if (existingStreak) {
        // Calculate if we're within the streak window (7 days for weekly streaks)
        const lastDate = existingStreak.lastConfirmationDate 
          ? new Date(existingStreak.lastConfirmationDate)
          : null;
        
        let newStreak = existingStreak.currentStreak;
        let streakBroken = false;
        
        if (lastDate) {
          const daysSinceLastConfirmation = Math.floor(
            (today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
          );
          
          if (daysSinceLastConfirmation <= 7) {
            // Within weekly window, increment streak
            newStreak += 1;
          } else {
            // Streak broken, reset to 1
            newStreak = 1;
            streakBroken = true;
          }
        } else {
          newStreak = 1;
        }
        
        await db
          .update(savingsStreaks)
          .set({
            currentStreak: newStreak,
            longestStreak: Math.max(existingStreak.longestStreak, newStreak),
            lastConfirmationDate: todayStr,
            totalConfirmations: existingStreak.totalConfirmations + 1,
            totalAmountSaved: existingStreak.totalAmountSaved + amount,
            streakBrokenCount: streakBroken 
              ? (existingStreak.streakBrokenCount || 0) + 1 
              : (existingStreak.streakBrokenCount || 0),
            updatedAt: new Date(),
          })
          .where(eq(savingsStreaks.coupleId, coupleId));
      } else {
        // Create new streak record
        await db.insert(savingsStreaks).values({
          coupleId,
          currentStreak: 1,
          longestStreak: 1,
          lastConfirmationDate: todayStr,
          totalConfirmations: 1,
          totalAmountSaved: amount,
        });
      }
      
      // If this was triggered by a recommendation, mark it as acted
      if (recommendationId) {
        await db
          .update(guardianRecommendations)
          .set({ status: "acted", actedAt: new Date() })
          .where(eq(guardianRecommendations.id, recommendationId));
      }
      
      res.json(confirmation);
    } catch (error: any) {
      console.error("Create savings confirmation error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get savings streak for a couple
  app.get("/api/guardian/streak/:coupleId", requireAuth, requireCoupleAccess, async (req, res) => {
    try {
      const { coupleId } = req.params;
      const [streak] = await db
        .select()
        .from(savingsStreaks)
        .where(eq(savingsStreaks.coupleId, coupleId));
      
      if (!streak) {
        // Return default streak data
        return res.json({
          coupleId,
          currentStreak: 0,
          longestStreak: 0,
          lastConfirmationDate: null,
          totalConfirmations: 0,
          totalAmountSaved: 0,
          streakBrokenCount: 0,
        });
      }
      
      res.json(streak);
    } catch (error: any) {
      console.error("Get savings streak error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get Guardian memory context (combined insights, recommendations, streak for AI prompts)
  app.get("/api/guardian/memory/:coupleId", requireAuth, requireCoupleAccess, async (req, res) => {
    try {
      const { coupleId } = req.params;
      
      // Get all relevant data in parallel
      const [insights, recommendations, streak, couple, recentExpenses] = await Promise.all([
        db.select().from(guardianInsights)
          .where(and(eq(guardianInsights.coupleId, coupleId), eq(guardianInsights.isActive, true)))
          .orderBy(desc(guardianInsights.createdAt)),
        db.select().from(guardianRecommendations)
          .where(eq(guardianRecommendations.coupleId, coupleId))
          .orderBy(desc(guardianRecommendations.createdAt)),
        db.select().from(savingsStreaks)
          .where(eq(savingsStreaks.coupleId, coupleId)),
        db.select().from(couples)
          .where(eq(couples.id, coupleId)),
        db.select().from(expenses)
          .where(eq(expenses.coupleId, coupleId))
          .orderBy(desc(expenses.createdAt)),
      ]);
      
      // Calculate recommendation effectiveness
      const actedRecommendations = recommendations.filter(r => r.status === "acted");
      const shownRecommendations = recommendations.filter(r => r.status === "shown" || r.status === "acted" || r.status === "dismissed");
      const effectivenessRate = shownRecommendations.length > 0 
        ? actedRecommendations.length / shownRecommendations.length 
        : 0;
      
      // Get family profile from couple
      const familyProfile = couple[0] ? {
        numAdults: couple[0].numAdults || 2,
        numKidsUnder5: couple[0].numKidsUnder5 || 0,
        numKids5to12: couple[0].numKids5to12 || 0,
        numTeens: couple[0].numTeens || 0,
        city: couple[0].city,
        country: couple[0].country || "US",
        partner1Name: couple[0].partner1Name,
        partner2Name: couple[0].partner2Name,
      } : null;
      
      // Fetch learning history for transparency
      const learningHistoryData = await db.select().from(behavioralLearningHistory)
        .where(eq(behavioralLearningHistory.coupleId, coupleId))
        .orderBy(desc(behavioralLearningHistory.createdAt))
        .limit(10);
      
      // Fetch recent analyses with rationale for transparency
      const recentAnalyses = await db.select().from(dailyAnalysis)
        .where(eq(dailyAnalysis.coupleId, coupleId))
        .orderBy(desc(dailyAnalysis.createdAt))
        .limit(10);
      
      // Get nudge preferences for "What AI knows about you"
      const [nudgePrefs] = await db.select().from(partnerNudgePreferences)
        .where(eq(partnerNudgePreferences.coupleId, coupleId));
      
      res.json({
        insights: insights.slice(0, 10), // Last 10 active insights
        recentRecommendations: recommendations.slice(0, 5), // Last 5 recommendations
        streak: streak[0] || null,
        effectivenessRate,
        familyProfile,
        totalExpenses: recentExpenses.length,
        recentExpenseCount: recentExpenses.filter(e => {
          const expDate = new Date(e.date);
          const weekAgo = new Date();
          weekAgo.setDate(weekAgo.getDate() - 7);
          return expDate >= weekAgo;
        }).length,
        // AI Transparency additions
        learningHistory: learningHistoryData.map(lh => ({
          id: lh.id,
          createdAt: lh.createdAt,
          aiObservation: lh.aiObservation,
          recommendedApproach: lh.recommendedApproach,
          effectiveTechniques: lh.effectiveTechniques,
          ineffectiveTechniques: lh.ineffectiveTechniques,
          nudgesAnalyzed: lh.nudgesAnalyzed,
          scores: {
            lossAversion: lh.lossAversionScore,
            gainFraming: lh.gainFramingScore,
            progress: lh.progressScore,
            urgency: lh.urgencyScore,
          }
        })),
        recentNudgesWithRationale: recentAnalyses
          .filter(a => a.dailyNudge)
          .map(a => ({
            id: a.id,
            date: a.analysisDate,
            message: a.dailyNudge,
            rationale: a.rationale,
            evidenceData: a.evidenceData,
            behavioralTechnique: a.behavioralTechnique,
            userResponse: a.userResponse,
          })),
        nudgePreferences: nudgePrefs ? {
          lossAversionScore: nudgePrefs.lossAversionScore,
          gainFramingScore: nudgePrefs.gainFramingScore,
          progressScore: nudgePrefs.progressScore,
          urgencyScore: nudgePrefs.urgencyScore,
          totalNudgesReceived: nudgePrefs.totalNudgesReceived,
          nudgesActedOn: nudgePrefs.nudgesActedOn,
          totalSavedFromNudges: nudgePrefs.totalSavedFromNudges,
        } : null,
      });
    } catch (error: any) {
      console.error("Get guardian memory error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get AI learning history with full transparency
  app.get("/api/guardian/learning-history/:coupleId", requireAuth, requireCoupleAccess, async (req, res) => {
    try {
      const { coupleId } = req.params;
      
      const [learningHistory, nudgePrefs, recentNudges] = await Promise.all([
        db.select().from(behavioralLearningHistory)
          .where(eq(behavioralLearningHistory.coupleId, coupleId))
          .orderBy(desc(behavioralLearningHistory.createdAt))
          .limit(20),
        db.select().from(partnerNudgePreferences)
          .where(eq(partnerNudgePreferences.coupleId, coupleId)),
        db.select().from(dailyAnalysis)
          .where(eq(dailyAnalysis.coupleId, coupleId))
          .orderBy(desc(dailyAnalysis.createdAt))
          .limit(20),
      ]);
      
      const prefs = nudgePrefs[0];
      
      // Calculate habit tracking stats
      const nudgesWithResponses = recentNudges.filter(n => n.userResponse);
      const actedCount = nudgesWithResponses.filter(n => n.userResponse === 'acted').length;
      const dismissedCount = nudgesWithResponses.filter(n => n.userResponse === 'dismissed').length;
      const ignoredCount = nudgesWithResponses.filter(n => n.userResponse === 'ignored').length;
      
      res.json({
        // Current AI understanding of this user
        currentProfile: prefs ? {
          lossAversionScore: prefs.lossAversionScore,
          gainFramingScore: prefs.gainFramingScore,
          socialProofScore: prefs.socialProofScore,
          progressScore: prefs.progressScore,
          urgencyScore: prefs.urgencyScore,
          totalNudgesReceived: prefs.totalNudgesReceived,
          nudgesActedOn: prefs.nudgesActedOn,
          nudgesDismissed: prefs.nudgesDismissed,
          totalSavedFromNudges: prefs.totalSavedFromNudges,
          effectivenessRate: (prefs.totalNudgesReceived || 0) > 0 
            ? (prefs.nudgesActedOn || 0) / (prefs.totalNudgesReceived || 1) 
            : 0,
        } : null,
        
        // Learning events over time (shows AI evolving its understanding)
        learningEvents: learningHistory.map(lh => ({
          id: lh.id,
          date: lh.createdAt,
          triggerEvent: lh.triggerEvent,
          nudgesAnalyzed: lh.nudgesAnalyzed,
          aiObservation: lh.aiObservation,
          recommendedApproach: lh.recommendedApproach,
          effectiveTechniques: lh.effectiveTechniques,
          ineffectiveTechniques: lh.ineffectiveTechniques,
          scoresAtTime: {
            lossAversion: lh.lossAversionScore,
            gainFraming: lh.gainFramingScore,
            progress: lh.progressScore,
            urgency: lh.urgencyScore,
          }
        })),
        
        // Habit tracking: how user responds to suggestions
        habitTracking: {
          totalNudges: nudgesWithResponses.length,
          actedOn: actedCount,
          dismissed: dismissedCount,
          ignored: ignoredCount,
          acceptanceRate: nudgesWithResponses.length > 0 
            ? actedCount / nudgesWithResponses.length 
            : 0,
          recentTrend: nudgesWithResponses.slice(0, 5).map(n => ({
            date: n.analysisDate,
            response: n.userResponse,
            nudgeType: n.nudgeType,
          })),
        },
        
        // Recent nudges with full rationale for transparency
        recentNudgesWithContext: recentNudges
          .filter(n => n.dailyNudge)
          .slice(0, 10)
          .map(n => ({
            id: n.id,
            date: n.analysisDate,
            message: n.dailyNudge,
            rationale: n.rationale,
            evidenceData: n.evidenceData,
            behavioralTechnique: n.behavioralTechnique,
            userResponse: n.userResponse,
            priority: n.nudgePriority,
          })),
      });
    } catch (error: any) {
      console.error("Get learning history error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== DAILY AI ANALYSIS ENDPOINT ====================
  // This is the proactive AI that analyzes spending and generates nudges
  
  app.post("/api/guardian/daily-analysis/:coupleId", requireAuth, requireCoupleAccess, async (req, res) => {
    try {
      const { coupleId } = req.params;
      const today = new Date().toISOString().split('T')[0];
      
      // Check if we already analyzed today
      const existingAnalysis = await db.select().from(dailyAnalysis)
        .where(and(eq(dailyAnalysis.coupleId, coupleId), eq(dailyAnalysis.analysisDate, today)));
      
      if (existingAnalysis.length > 0 && existingAnalysis[0].dailyNudge) {
        // Return existing analysis
        return res.json(existingAnalysis[0]);
      }
      
      // Gather all context for the AI
      const [
        coupleData,
        allExpenses,
        goalsData,
        streakData,
        nudgePrefs,
        escalations,
        recentAnalyses,
        savingsData
      ] = await Promise.all([
        db.select().from(couples).where(eq(couples.id, coupleId)),
        db.select().from(expenses).where(eq(expenses.coupleId, coupleId)).orderBy(desc(expenses.date)),
        db.select().from(goals).where(eq(goals.coupleId, coupleId)),
        db.select().from(savingsStreaks).where(eq(savingsStreaks.coupleId, coupleId)),
        db.select().from(partnerNudgePreferences).where(eq(partnerNudgePreferences.coupleId, coupleId)),
        db.select().from(nudgeEscalation).where(eq(nudgeEscalation.coupleId, coupleId)),
        db.select().from(dailyAnalysis)
          .where(eq(dailyAnalysis.coupleId, coupleId))
          .orderBy(desc(dailyAnalysis.analysisDate))
          .limit(10),
        db.select().from(savingsConfirmations).where(eq(savingsConfirmations.coupleId, coupleId))
      ]);
      
      const couple = coupleData[0];
      if (!couple) {
        return res.status(404).json({ error: "Couple not found" });
      }
      
      // Calculate today's spending
      const todayExpenses = allExpenses.filter(e => e.date === today);
      const todaySpending = todayExpenses.reduce((sum, e) => sum + e.amount, 0);
      const todayCategories: Record<string, number> = {};
      todayExpenses.forEach(e => {
        todayCategories[e.category] = (todayCategories[e.category] || 0) + e.amount;
      });
      
      // Calculate weekly average
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weeklyExpenses = allExpenses.filter(e => new Date(e.date) >= weekAgo);
      const weeklyTotal = weeklyExpenses.reduce((sum, e) => sum + e.amount, 0);
      
      // Monthly total
      const thisMonth = today.substring(0, 7);
      const monthlyExpenses = allExpenses.filter(e => e.date.startsWith(thisMonth));
      const monthlyTotal = monthlyExpenses.reduce((sum, e) => sum + e.amount, 0);
      
      // Days without deposit
      const lastConfirmationDate = streakData[0]?.lastConfirmationDate;
      const daysWithoutDeposit = lastConfirmationDate 
        ? Math.floor((new Date().getTime() - new Date(lastConfirmationDate).getTime()) / (1000 * 60 * 60 * 24))
        : 999;
      
      // Get closest goal
      let closestGoal = null;
      if (goalsData.length > 0) {
        const sortedGoals = goalsData
          .filter(g => g.savedAmount < g.targetAmount)
          .sort((a, b) => (b.savedAmount / b.targetAmount) - (a.savedAmount / a.targetAmount));
        
        if (sortedGoals.length > 0) {
          const g = sortedGoals[0];
          closestGoal = {
            name: g.name,
            emoji: g.emoji,
            progress: Math.round((g.savedAmount / g.targetAmount) * 100),
            amountLeft: g.targetAmount - g.savedAmount
          };
        }
      }
      
      // Find current escalation level
      const currentEscalation = escalations.find(e => !e.resolvedAt);
      const escalationLevel = currentEscalation?.currentLevel || 1;
      
      // Get last nudge info
      const lastAnalysis = recentAnalyses.find(a => a.dailyNudge);
      const lastNudgeType = lastAnalysis?.nudgeType || null;
      const lastNudgeActedOn = lastAnalysis?.userResponse === 'acted';
      
      // Build context for AI
      const context = {
        todaySpending,
        todayCategories,
        weeklyAverage: weeklyTotal,
        monthlyTotal,
        daysWithoutDeposit,
        currentStreakWeeks: streakData[0]?.currentStreak || 0,
        longestStreak: streakData[0]?.longestStreak || 0,
        totalSavedToDate: savingsData.reduce((sum, s) => sum + s.amount, 0),
        closestGoal,
        escalationLevel,
        lastNudgeType,
        lastNudgeActedOn
      };
      
      const familyProfile = {
        numAdults: couple.numAdults || 2,
        numKidsUnder5: couple.numKidsUnder5 || 0,
        numKids5to12: couple.numKids5to12 || 0,
        numTeens: couple.numTeens || 0,
        city: couple.city,
        country: couple.country || "US",
        partner1Name: couple.partner1Name,
        partner2Name: couple.partner2Name
      };
      
      // Get partner preferences
      const prefs = nudgePrefs[0];
      const partnerPreferences = prefs ? {
        partnerRole: prefs.partnerRole,
        lossAversionScore: prefs.lossAversionScore || 0.5,
        gainFramingScore: prefs.gainFramingScore || 0.5,
        socialProofScore: prefs.socialProofScore || 0.5,
        progressScore: prefs.progressScore || 0.5,
        urgencyScore: prefs.urgencyScore || 0.5,
        weaknessCategories: (prefs.weaknessCategories as string[]) || [],
        totalNudgesReceived: prefs.totalNudgesReceived || 0,
        nudgesActedOn: prefs.nudgesActedOn || 0
      } : null;
      
      // Build goals for prompt
      const goalsForPrompt = goalsData.map(g => ({
        name: g.name,
        emoji: g.emoji,
        targetAmount: g.targetAmount,
        savedAmount: g.savedAmount
      }));
      
      // Generate AI insight
      const prompt = buildDailyAnalysisPrompt(familyProfile, partnerPreferences, context, goalsForPrompt);
      
      console.log("\n========== AI DAILY ANALYSIS ==========");
      console.log("📊 Context being sent to AI:");
      console.log(JSON.stringify({
        todaySpending: context.todaySpending,
        daysWithoutDeposit: context.daysWithoutDeposit,
        streakWeeks: context.currentStreakWeeks,
        closestGoal: context.closestGoal,
        escalationLevel: context.escalationLevel,
        familyProfile: { adults: familyProfile.numAdults, kids: familyProfile.numKidsUnder5 + familyProfile.numKids5to12 + familyProfile.numTeens },
        partnerPreferences: partnerPreferences ? {
          lossAversion: partnerPreferences.lossAversionScore,
          gainFraming: partnerPreferences.gainFramingScore,
          progress: partnerPreferences.progressScore,
          urgency: partnerPreferences.urgencyScore,
        } : "No preferences yet"
      }, null, 2));
      
      const analysisStartTime = Date.now();
      const completion = await openai.chat.completions.create({
        model: AI_MODEL,
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: `Today is ${today}. Generate a daily insight for this couple.` }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
      });
      
      const responseText = completion.choices[0].message.content;
      let aiResponse;
      try {
        aiResponse = JSON.parse(responseText || "{}");
      } catch {
        aiResponse = { shouldNudge: false, message: "Keep up the great work!" };
      }
      
      // Log AI call for admin dashboard visibility
      await logAICall({
        promptName: "daily_analysis",
        coupleId,
        input: { context, familyProfile, partnerPreferences },
        output: aiResponse,
        tokensUsed: completion.usage?.total_tokens,
        latencyMs: Date.now() - analysisStartTime,
      });
      
      console.log("\n🤖 AI Response:");
      console.log(JSON.stringify({
        shouldNudge: aiResponse.shouldNudge,
        message: aiResponse.message?.substring(0, 100) + "...",
        nudgeType: aiResponse.nudgeType,
        behavioralTechnique: aiResponse.behavioralTechnique,
        rationale: aiResponse.rationale?.substring(0, 100) + "...",
        evidenceData: aiResponse.evidenceData,
      }, null, 2));
      console.log("========================================\n");
      
      // Save the analysis
      const [newAnalysis] = await db.insert(dailyAnalysis).values({
        coupleId,
        analysisDate: today,
        expensesAnalyzed: todayExpenses.length,
        totalSpentToday: todaySpending,
        topCategoryToday: Object.keys(todayCategories).sort((a, b) => todayCategories[b] - todayCategories[a])[0] || null,
        dailyNudge: aiResponse.shouldNudge ? aiResponse.message : null,
        nudgeType: aiResponse.nudgeType || null,
        nudgePriority: aiResponse.priority || "medium",
        suggestedAction: aiResponse.suggestedAction || null,
        targetGoalId: goalsData.find(g => g.emoji === aiResponse.targetGoalEmoji)?.id || null,
        rationale: aiResponse.rationale || null,
        evidenceData: aiResponse.evidenceData || null,
        behavioralTechnique: aiResponse.behavioralTechnique || null,
        daysWithoutDeposit,
        currentStreakDays: (streakData[0]?.currentStreak || 0) * 7,
        spendingVsAverage: weeklyTotal > 0 ? todaySpending / (weeklyTotal / 7) : 1,
      }).returning();
      
      // Update escalation if needed
      if (daysWithoutDeposit > 7 && !currentEscalation) {
        await db.insert(nudgeEscalation).values({
          coupleId,
          topic: "no_deposits",
          currentLevel: 1,
          level1SentAt: new Date(),
        });
      } else if (currentEscalation && daysWithoutDeposit > 14 && (currentEscalation.currentLevel || 1) < 5) {
        // Escalate
        const newLevel = Math.min((currentEscalation.currentLevel || 1) + 1, 5);
        const levelField = `level${newLevel}SentAt` as keyof typeof currentEscalation;
        await db.update(nudgeEscalation)
          .set({ 
            currentLevel: newLevel, 
            lastEscalationDate: today,
            [levelField]: new Date()
          })
          .where(eq(nudgeEscalation.id, currentEscalation.id));
      }
      
      res.json({
        ...newAnalysis,
        aiResponse,
        context: {
          todaySpending,
          daysWithoutDeposit,
          closestGoal,
          monthlyTotal
        }
      });
    } catch (error: any) {
      console.error("Daily analysis error:", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Get latest daily nudge for a couple
  app.get("/api/guardian/daily-nudge/:coupleId", requireAuth, requireCoupleAccess, async (req, res) => {
    try {
      const { coupleId } = req.params;
      const today = new Date().toISOString().split('T')[0];
      
      // Get most recent unshown nudge or today's nudge
      const [analysis] = await db.select().from(dailyAnalysis)
        .where(eq(dailyAnalysis.coupleId, coupleId))
        .orderBy(desc(dailyAnalysis.analysisDate))
        .limit(1);
      
      if (!analysis || !analysis.dailyNudge) {
        return res.json({ hasNudge: false });
      }
      
      // Mark as shown if not already
      if (!analysis.wasShown) {
        await db.update(dailyAnalysis)
          .set({ wasShown: true, shownAt: new Date() })
          .where(eq(dailyAnalysis.id, analysis.id));
      }
      
      res.json({
        hasNudge: true,
        nudge: {
          id: analysis.id,
          message: analysis.dailyNudge,
          type: analysis.nudgeType,
          priority: analysis.nudgePriority,
          suggestedAction: analysis.suggestedAction,
          targetGoalId: analysis.targetGoalId,
          date: analysis.analysisDate,
          daysWithoutDeposit: analysis.daysWithoutDeposit,
        }
      });
    } catch (error: any) {
      console.error("Get daily nudge error:", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Record user response to a nudge
  app.post("/api/guardian/nudge-response/:coupleId/:analysisId", requireAuth, requireCoupleAccess, async (req, res) => {
    try {
      const { coupleId, analysisId } = req.params;
      const { response, savedAmount, nudgeType } = req.body; // response: 'acted' | 'dismissed' | 'ignored'
      
      console.log("\n========== NUDGE RESPONSE RECORDED ==========");
      console.log(`📝 User Response: ${response}`);
      console.log(`💰 Saved Amount: $${savedAmount || 0}`);
      console.log(`📊 Nudge Type: ${nudgeType}`);
      
      // Get the analysis to know which behavioral technique was used
      const [analysisRecord] = await db.select().from(dailyAnalysis)
        .where(eq(dailyAnalysis.id, analysisId));
      
      await db.update(dailyAnalysis)
        .set({ 
          userResponse: response,
          respondedAt: new Date()
        })
        .where(and(eq(dailyAnalysis.id, analysisId), eq(dailyAnalysis.coupleId, coupleId)));
      
      // Update partner nudge preferences based on response
      const [prefs] = await db.select().from(partnerNudgePreferences)
        .where(eq(partnerNudgePreferences.coupleId, coupleId));
      
      let newTotalNudges = 1;
      
      if (prefs) {
        newTotalNudges = (prefs.totalNudgesReceived || 0) + 1;
        const updates: any = {
          totalNudgesReceived: newTotalNudges,
          updatedAt: new Date()
        };
        
        if (response === 'acted') {
          updates.nudgesActedOn = (prefs.nudgesActedOn || 0) + 1;
          updates.totalSavedFromNudges = (prefs.totalSavedFromNudges || 0) + (savedAmount || 0);
        } else if (response === 'dismissed') {
          updates.nudgesDismissed = (prefs.nudgesDismissed || 0) + 1;
        }
        
        await db.update(partnerNudgePreferences)
          .set(updates)
          .where(eq(partnerNudgePreferences.id, prefs.id));
      } else {
        // Create initial preferences
        await db.insert(partnerNudgePreferences).values({
          coupleId,
          partnerRole: "partner1",
          totalNudgesReceived: 1,
          nudgesActedOn: response === 'acted' ? 1 : 0,
          nudgesDismissed: response === 'dismissed' ? 1 : 0,
          totalSavedFromNudges: response === 'acted' ? (savedAmount || 0) : 0,
        });
      }
      
      // If they acted, resolve any escalation
      if (response === 'acted') {
        await db.update(nudgeEscalation)
          .set({ resolvedAt: new Date(), resolutionType: 'user_acted' })
          .where(and(
            eq(nudgeEscalation.coupleId, coupleId),
            eq(nudgeEscalation.resolvedAt, null as any)
          ));
      }
      
      // LEARNING ALGORITHM: Trigger AI learning after every 5 nudge responses
      if (newTotalNudges > 0 && newTotalNudges % 5 === 0) {
        console.log("\n🧠 LEARNING ALGORITHM TRIGGERED!");
        console.log(`📈 Total nudges: ${newTotalNudges} (every 5 triggers learning)`);
        
        try {
          // Fetch recent nudges with their responses (dailyNudge is text, check if not null)
          const recentAnalyses = await db.select().from(dailyAnalysis)
            .where(eq(dailyAnalysis.coupleId, coupleId))
            .orderBy(desc(dailyAnalysis.analysisDate))
            .limit(10);
          
          const recentNudges = recentAnalyses
            .filter(a => a.userResponse)
            .map(a => ({
              nudgeType: a.nudgeType || 'general',
              message: a.dailyNudge ? 'nudge sent' : '',
              userResponse: a.userResponse as 'acted' | 'dismissed' | 'ignored',
              amountSaved: null as number | null
            }));
          
          console.log(`📊 Analyzing ${recentNudges.length} recent nudge responses...`);
          
          if (recentNudges.length >= 5) {
            // Call AI to analyze patterns and learn
            const learningPrompt = buildFeedbackLearningPrompt(
              prefs?.partnerRole || 'partner1',
              recentNudges
            );
            
            const learningCompletion = await openai.chat.completions.create({
              model: AI_MODEL,
              messages: [
                { role: "system", content: learningPrompt },
                { role: "user", content: `Analyze these ${recentNudges.length} nudge responses and update the behavioral preference scores.` }
              ],
              response_format: { type: "json_object" },
              temperature: 0.3,
            });
            
            const learningResult = JSON.parse(learningCompletion.choices[0].message.content || "{}");
            
            console.log("\n🎯 AI LEARNING RESULTS:");
            console.log(JSON.stringify({
              lossAversionScore: learningResult.lossAversionScore,
              gainFramingScore: learningResult.gainFramingScore,
              progressScore: learningResult.progressScore,
              urgencyScore: learningResult.urgencyScore,
              observation: learningResult.observation?.substring(0, 100) + "...",
              recommendedApproach: learningResult.recommendedApproach?.substring(0, 100) + "..."
            }, null, 2));
            console.log("==========================================\n");
            
            // Update the preference scores based on AI analysis
            if (learningResult.lossAversionScore !== undefined) {
              const [currentPrefs] = await db.select().from(partnerNudgePreferences)
                .where(eq(partnerNudgePreferences.coupleId, coupleId));
              
              if (currentPrefs) {
                await db.update(partnerNudgePreferences)
                  .set({
                    lossAversionScore: learningResult.lossAversionScore,
                    gainFramingScore: learningResult.gainFramingScore,
                    socialProofScore: learningResult.socialProofScore,
                    progressScore: learningResult.progressScore,
                    urgencyScore: learningResult.urgencyScore,
                    updatedAt: new Date()
                  })
                  .where(eq(partnerNudgePreferences.id, currentPrefs.id));
              }
              
              // Record the learning event in history for transparency
              await db.insert(behavioralLearningHistory).values({
                coupleId,
                partnerRole: currentPrefs?.partnerRole || 'partner1',
                lossAversionScore: learningResult.lossAversionScore,
                gainFramingScore: learningResult.gainFramingScore,
                socialProofScore: learningResult.socialProofScore,
                progressScore: learningResult.progressScore,
                urgencyScore: learningResult.urgencyScore,
                triggerEvent: 'periodic_analysis',
                nudgesAnalyzed: recentNudges.length,
                aiObservation: learningResult.observations || null,
                recommendedApproach: learningResult.recommendedApproach || null,
                effectiveTechniques: learningResult.effectiveTechniques || [],
                ineffectiveTechniques: learningResult.ineffectiveTechniques || [],
              });
              
              console.log(`AI Learning updated for couple ${coupleId}:`, learningResult);
            }
          }
        } catch (learningError) {
          console.error("AI Learning error (non-blocking):", learningError);
          // Don't fail the main request if learning fails
        }
      }
      
      res.json({ success: true, learningTriggered: newTotalNudges % 5 === 0 });
    } catch (error: any) {
      console.error("Record nudge response error:", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Trigger daily analysis after expense is added (called by frontend after expense creation)
  app.post("/api/guardian/trigger-analysis/:coupleId", requireAuth, requireCoupleAccess, async (req, res) => {
    try {
      const { coupleId } = req.params;
      
      // Just trigger the daily analysis endpoint
      const response = await fetch(`http://localhost:5000/api/guardian/daily-analysis/${coupleId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error("Trigger analysis error:", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Get historical analysis for insights screen
  app.get("/api/guardian/history/:coupleId", requireAuth, requireCoupleAccess, async (req, res) => {
    try {
      const { coupleId } = req.params;
      const { months = 6 } = req.query;
      
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - Number(months));
      const cutoffStr = cutoffDate.toISOString().split('T')[0];
      
      const analyses = await db.select().from(dailyAnalysis)
        .where(eq(dailyAnalysis.coupleId, coupleId))
        .orderBy(desc(dailyAnalysis.analysisDate));
      
      // Filter and aggregate by month
      const monthlyData: Record<string, { 
        totalSpent: number; 
        nudgesGiven: number; 
        nudgesActedOn: number;
        topCategories: Record<string, number>;
      }> = {};
      
      analyses.filter(a => a.analysisDate >= cutoffStr).forEach(a => {
        const month = a.analysisDate.substring(0, 7);
        if (!monthlyData[month]) {
          monthlyData[month] = { totalSpent: 0, nudgesGiven: 0, nudgesActedOn: 0, topCategories: {} };
        }
        monthlyData[month].totalSpent += a.totalSpentToday || 0;
        if (a.dailyNudge) {
          monthlyData[month].nudgesGiven++;
          if (a.userResponse === 'acted') {
            monthlyData[month].nudgesActedOn++;
          }
        }
        if (a.topCategoryToday) {
          monthlyData[month].topCategories[a.topCategoryToday] = 
            (monthlyData[month].topCategories[a.topCategoryToday] || 0) + (a.totalSpentToday || 0);
        }
      });
      
      res.json({
        monthlyData,
        recentNudges: analyses.filter(a => a.dailyNudge).slice(0, 10),
        totalNudgesGiven: analyses.filter(a => a.dailyNudge).length,
        totalActedOn: analyses.filter(a => a.userResponse === 'acted').length,
      });
    } catch (error: any) {
      console.error("Get history error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // AI feedback for expense entry - immediate reaction
  app.post("/api/guardian/expense-feedback", requireAuth, async (req, res) => {
    try {
      const { coupleId, expense, budgetStatus, monthlyTotal, partnerName } = req.body;
      
      if (!coupleId || !expense) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      const amount = expense.amount;
      const category = expense.category;
      const merchant = expense.merchant || expense.description;
      
      // Determine feedback type based on budget impact
      let feedbackType: "celebration" | "insight" | "warning" | "suggestion" = "insight";
      let title = "Tracked!";
      let message = "";
      let actionLabel: string | undefined;
      let actionType: string | undefined;
      
      if (budgetStatus) {
        const percentUsed = (budgetStatus.spent / budgetStatus.limit) * 100;
        const remaining = budgetStatus.limit - budgetStatus.spent;
        
        if (percentUsed >= 100) {
          feedbackType = "warning";
          title = "Over Budget";
          message = `${category} is now $${Math.abs(remaining).toFixed(0)} over budget. Consider redirecting future ${category} spending to your dreams!`;
          actionLabel = "Move to Dream";
          actionType = "redirect_to_dream";
        } else if (percentUsed >= 85) {
          feedbackType = "warning";
          title = "Budget Alert";
          message = `Only $${remaining.toFixed(0)} left for ${category} this month. You're doing great tracking - just a heads up!`;
        } else if (percentUsed <= 50 && amount > 20) {
          feedbackType = "celebration";
          title = "Smart Spending!";
          message = `This keeps ${category} at ${Math.round(percentUsed)}% of budget. Still $${remaining.toFixed(0)} to go!`;
        } else {
          feedbackType = "insight";
          title = "Got it!";
          message = `${category} is now at ${Math.round(percentUsed)}% of budget. $${remaining.toFixed(0)} remaining this month.`;
        }
      } else {
        // No budget set for this category
        feedbackType = "insight";
        title = "Logged!";
        message = `$${amount.toFixed(2)} at ${merchant} recorded. Consider setting a ${category} budget to track better!`;
        actionLabel = "Set Budget";
        actionType = "set_budget";
      }
      
      // Check for patterns (spending frequency)
      const frequencyNote = monthlyTotal > amount * 3 
        ? ` You've spent $${monthlyTotal.toFixed(0)} on ${category} this month.`
        : "";
      
      if (frequencyNote && feedbackType !== "warning") {
        message += frequencyNote;
      }
      
      res.json({
        feedbackType,
        title,
        message,
        actionLabel,
        actionType,
        learnedPattern: frequencyNote ? `${partnerName || "You"} frequently spend on ${category}` : null,
      });
    } catch (error: any) {
      console.error("Expense feedback error:", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // AI feedback for dream deposit - celebration
  app.post("/api/guardian/deposit-feedback", requireAuth, async (req, res) => {
    try {
      const { coupleId, amount, goalName, goalProgress, streakDays, previousDeposit } = req.body;
      
      if (!coupleId || !amount) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      let feedbackType: "celebration" | "insight" = "celebration";
      let title = "Dream Deposit!";
      let message = "";
      
      // Calculate days closer to goal
      const daysCloser = goalProgress?.averageDailyRate > 0 
        ? Math.round(amount / goalProgress.averageDailyRate)
        : null;
      
      // Streak celebration
      if (streakDays && streakDays >= 7) {
        title = `${streakDays} Day Streak!`;
        message = `Amazing consistency! You're ${daysCloser ? `${daysCloser} days closer to ` : "getting closer to "}${goalName}.`;
      } else if (streakDays && streakDays >= 3) {
        title = "Streak Building!";
        message = `${streakDays} deposits in a row! ${daysCloser ? `${daysCloser} days closer to ${goalName}.` : `Keep the momentum going!`}`;
      } else if (daysCloser) {
        message = `You just moved ${daysCloser} days closer to ${goalName}. At this pace, you're doing great!`;
      } else {
        message = `$${amount.toFixed(0)} added to ${goalName}. Every bit gets you closer!`;
      }
      
      // Compare to previous deposit
      if (previousDeposit && amount > previousDeposit) {
        message += ` That's more than your last deposit!`;
      }
      
      // Goal progress milestone
      if (goalProgress) {
        const percentComplete = (goalProgress.current / goalProgress.target) * 100;
        if (percentComplete >= 75 && percentComplete < 100) {
          message += ` You're in the home stretch - ${Math.round(percentComplete)}% complete!`;
        } else if (percentComplete >= 50 && percentComplete < 75) {
          message += ` Halfway there at ${Math.round(percentComplete)}%!`;
        }
      }
      
      res.json({
        feedbackType,
        title,
        message,
        streakDays,
        daysCloser,
      });
    } catch (error: any) {
      console.error("Deposit feedback error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Personalized app-open greeting based on time, context, and history
  app.get("/api/guardian/greeting/:coupleId", requireAuth, requireCoupleAccess, async (req, res) => {
    try {
      const { coupleId } = req.params;
      
      // Fetch couple and partner names
      const couple = await db.query.couples.findFirst({
        where: eq(couples.id, coupleId),
      });
      
      if (!couple) {
        return res.status(404).json({ error: "Couple not found" });
      }
      
      const partnerName = couple.partner1Name || "friend";
      
      const hour = new Date().getHours();
      let timeGreeting = "Hey";
      if (hour >= 5 && hour < 12) {
        timeGreeting = "Good morning";
      } else if (hour >= 12 && hour < 17) {
        timeGreeting = "Good afternoon";
      } else if (hour >= 17 && hour < 21) {
        timeGreeting = "Good evening";
      } else {
        timeGreeting = "Late night dreams";
      }
      
      const [recentExpenses, recentDeposits, userGoals, streak] = await Promise.all([
        db.query.expenses.findMany({
          where: eq(expenses.coupleId, coupleId),
          orderBy: desc(expenses.date),
          limit: 5,
        }),
        db.query.savingsConfirmations.findMany({
          where: eq(savingsConfirmations.coupleId, coupleId),
          orderBy: desc(savingsConfirmations.confirmationDate),
          limit: 3,
        }),
        db.query.goals.findMany({
          where: eq(goals.coupleId, coupleId),
        }),
        db.query.savingsStreaks.findFirst({
          where: eq(savingsStreaks.coupleId, coupleId),
        }),
      ]);
      
      // Calculate context metrics
      const hasRecentExpenses = recentExpenses.length > 0;
      const hasRecentDeposits = recentDeposits.length > 0;
      const hasGoals = userGoals.length > 0;
      const currentStreak = streak?.currentStreak || 0;
      const totalSaved = userGoals.reduce((sum, g) => sum + Number(g.savedAmount || 0), 0);
      
      // Find closest goal to completion
      let closestGoal = null;
      let closestProgress = 0;
      for (const goal of userGoals) {
        const progress = Number(goal.savedAmount || 0) / Number(goal.targetAmount);
        if (progress > closestProgress && progress < 1) {
          closestProgress = progress;
          closestGoal = goal;
        }
      }
      
      // Generate contextual message
      let greeting = `${timeGreeting}, ${partnerName}!`;
      let message = "";
      let suggestion = "";
      let mood: "celebrate" | "encourage" | "gentle-nudge" | "welcome" = "encourage";
      
      // Priority-based message selection
      if (!hasGoals) {
        mood = "welcome";
        message = "Ready to start dreaming together?";
        suggestion = "Create your first shared dream to get started!";
      } else if (closestGoal && closestProgress >= 0.9) {
        mood = "celebrate";
        message = `You're so close to "${closestGoal.name}"! Just ${Math.round((1 - closestProgress) * 100)}% to go.`;
        suggestion = "One more push and this dream becomes reality!";
      } else if (currentStreak >= 7) {
        mood = "celebrate";
        message = `${currentStreak} day streak! You're on fire.`;
        suggestion = "Your consistency is paying off. Keep it going!";
      } else if (currentStreak >= 3) {
        mood = "encourage";
        message = `${currentStreak} days strong! Building great habits.`;
        suggestion = "Let's keep the momentum going today.";
      } else if (hasRecentDeposits && recentDeposits.length > 0) {
        const lastDeposit = recentDeposits[0];
        const daysSince = Math.floor((Date.now() - new Date(lastDeposit.confirmationDate).getTime()) / (1000 * 60 * 60 * 24));
        if (daysSince <= 1) {
          mood = "celebrate";
          message = `Great save yesterday! $${totalSaved.toFixed(0)} total in your dreams.`;
          suggestion = "Every little bit adds up to something big.";
        } else if (daysSince > 7) {
          mood = "gentle-nudge";
          message = `It's been ${daysSince} days since your last dream deposit.`;
          suggestion = "Your dreams are waiting! Even a small amount helps.";
        } else {
          mood = "encourage";
          message = `$${totalSaved.toFixed(0)} saved toward your dreams so far.`;
          suggestion = "Ready to add a little more today?";
        }
      } else if (hasRecentExpenses && recentExpenses.length > 0) {
        const todayTotal = recentExpenses
          .filter(e => new Date(e.date).toDateString() === new Date().toDateString())
          .reduce((sum, e) => sum + Number(e.amount), 0);
        if (todayTotal > 0) {
          mood = "encourage";
          message = `$${todayTotal.toFixed(0)} tracked today. Nice work staying on top!`;
          suggestion = "Awareness is the first step to better habits.";
        } else {
          mood = "encourage";
          message = "Let's make today count!";
          suggestion = hasGoals 
            ? `Your "${userGoals[0].name}" dream is waiting.`
            : "Track expenses to see where your money goes.";
        }
      } else {
        mood = "encourage";
        message = "Ready to build something beautiful together?";
        suggestion = "Start by tracking an expense or saving toward a dream.";
      }
      
      res.json({
        greeting,
        message,
        suggestion,
        mood,
        context: {
          timeOfDay: hour >= 5 && hour < 12 ? "morning" : hour >= 12 && hour < 17 ? "afternoon" : hour >= 17 && hour < 21 ? "evening" : "night",
          currentStreak,
          totalSaved,
          goalsCount: userGoals.length,
          closestGoalProgress: closestProgress > 0 ? Math.round(closestProgress * 100) : null,
        },
      });
    } catch (error: any) {
      console.error("Greeting error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // === PATTERN DETECTION & NUDGES ===
  
  app.post("/api/patterns/detect", requireAuth, async (req, res) => {
    try {
      const { coupleId } = req.body;
      if (!coupleId) {
        return res.status(400).json({ error: "coupleId is required" });
      }

      const patterns = await detectPatterns(coupleId);
      const savedIds = await savePatterns(coupleId, patterns);
      
      res.json({ 
        patterns: patterns.map((p, i) => ({ ...p, id: savedIds[i] })),
        count: patterns.length,
        habitualCount: patterns.filter(p => p.isHabitual).length,
      });
    } catch (error: any) {
      console.error("Pattern detection error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/patterns/:coupleId", requireAuth, requireCoupleAccess, async (req, res) => {
    try {
      const { coupleId } = req.params;
      const patterns = await getActivePatterns(coupleId);
      res.json(patterns);
    } catch (error: any) {
      console.error("Get patterns error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/nudges/:coupleId", requireAuth, requireCoupleAccess, async (req, res) => {
    try {
      const { coupleId } = req.params;
      const nudges = await getPendingNudges(coupleId);
      res.json(nudges);
    } catch (error: any) {
      console.error("Get nudges error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/nudges/generate", requireAuth, async (req, res) => {
    try {
      const { coupleId, patternId } = req.body;
      if (!coupleId || !patternId) {
        return res.status(400).json({ error: "coupleId and patternId are required" });
      }

      const [pattern] = await db
        .select()
        .from(spendingPatterns)
        .where(eq(spendingPatterns.id, patternId))
        .limit(1);

      if (!pattern) {
        return res.status(404).json({ error: "Pattern not found" });
      }

      const learningHistory = await db
        .select()
        .from(behavioralLearningHistory)
        .where(eq(behavioralLearningHistory.coupleId, coupleId))
        .orderBy(sql`${behavioralLearningHistory.createdAt} DESC`)
        .limit(10);

      const historyContext = learningHistory.length > 0
        ? `\n\nGuardian Memory (past user feedback):\n${learningHistory.map(h => 
            `- ${h.triggerEvent}: ${h.aiObservation}\n  Lesson learned: ${h.recommendedApproach}`
          ).join('\n')}`
        : "";

      const prompt = await getAIPrompt("nudge_generation");
      let nudgeTitle = `Save on ${pattern.category || pattern.merchant}`;
      let nudgeMessage = pattern.aiSummary || "We noticed a spending pattern you might want to address.";
      let suggestedAction = pattern.suggestedAction || "Set a budget limit";
      let rationale = `Based on ${pattern.occurrenceCount} transactions averaging $${pattern.averageAmount?.toFixed(2)}`;
      let technique = "loss_aversion";

      if (prompt) {
        try {
          const filledPrompt = fillPromptTemplate(prompt.promptTemplate, {
            patternType: pattern.patternType,
            merchant: pattern.merchant || "various merchants",
            category: pattern.category || "spending",
            frequency: pattern.frequency || "regularly",
            averageAmount: pattern.averageAmount?.toFixed(2) || "0",
            totalSpent: pattern.totalSpent?.toFixed(2) || "0",
            occurrenceCount: pattern.occurrenceCount,
            potentialSavings: pattern.potentialMonthlySavings?.toFixed(2) || "0",
            alternativeSuggestion: pattern.alternativeSuggestion || "",
          }) + historyContext;

          const response = await openai.chat.completions.create({
            model: prompt.modelId,
            temperature: prompt.temperature,
            messages: [{ role: "user", content: filledPrompt }],
            response_format: { type: "json_object" },
          });

          const result = JSON.parse(response.choices[0]?.message?.content || "{}");
          nudgeTitle = result.title || nudgeTitle;
          nudgeMessage = result.message || nudgeMessage;
          suggestedAction = result.suggestedAction || suggestedAction;
          rationale = result.rationale || rationale;
          technique = result.behavioralTechnique || technique;

          await logAICall({
            promptName: "nudge_generation",
            coupleId,
            input: { pattern },
            output: result,
            tokensUsed: response.usage?.total_tokens,
            latencyMs: 0,
          });
        } catch (aiError: any) {
          console.error("AI nudge generation error:", aiError);
          await logAICall({
            promptName: "nudge_generation",
            coupleId,
            input: { pattern },
            output: undefined,
            error: aiError.message,
            tokensUsed: 0,
            latencyMs: 0,
          });
        }
      }

      const nudgeId = await createNudgeFromPattern(
        coupleId,
        patternId,
        nudgeMessage,
        nudgeTitle,
        suggestedAction,
        rationale,
        technique
      );

      res.json({ 
        nudgeId,
        title: nudgeTitle,
        message: nudgeMessage,
        suggestedAction,
        rationale,
        behavioralTechnique: technique,
      });
    } catch (error: any) {
      console.error("Generate nudge error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/nudges/:nudgeId/respond", requireAuth, async (req, res) => {
    try {
      const { nudgeId } = req.params;
      const { response, feedback } = req.body;

      const [nudge] = await db
        .select()
        .from(guardianRecommendations)
        .where(eq(guardianRecommendations.id, nudgeId))
        .limit(1);

      if (!nudge) {
        return res.status(404).json({ error: "Nudge not found" });
      }

      const updateData: any = {
        status: response,
        userFeedback: feedback,
      };

      if (response === "acted") {
        updateData.actedAt = new Date();
      } else if (response === "dismissed") {
        updateData.dismissedAt = new Date();
      }

      await db
        .update(guardianRecommendations)
        .set(updateData)
        .where(eq(guardianRecommendations.id, nudgeId));

      res.json({ success: true });
    } catch (error: any) {
      console.error("Nudge response error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // === COMMITMENTS ===
  
  app.get("/api/commitments/:coupleId", requireAuth, requireCoupleAccess, async (req, res) => {
    try {
      const { coupleId } = req.params;
      const { status } = req.query;
      
      let query = db
        .select()
        .from(commitments)
        .where(eq(commitments.coupleId, coupleId));
      
      if (status) {
        query = db
          .select()
          .from(commitments)
          .where(and(
            eq(commitments.coupleId, coupleId),
            eq(commitments.status, status as string)
          ));
      }
      
      const results = await query.orderBy(desc(commitments.createdAt));
      res.json(results);
    } catch (error: any) {
      console.error("Get commitments error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/commitments", requireAuth, async (req, res) => {
    try {
      const {
        coupleId,
        title,
        description,
        commitmentType,
        category,
        merchant,
        alternativeMerchant,
        targetAmount,
        currentAmount,
        reductionPercent,
        sourceNudgeId,
        sourcePatternId,
      } = req.body;

      if (!coupleId || !title || !commitmentType) {
        return res.status(400).json({ error: "coupleId, title, and commitmentType are required" });
      }

      const [commitment] = await db
        .insert(commitments)
        .values({
          coupleId,
          title,
          description,
          commitmentType,
          category,
          merchant,
          alternativeMerchant,
          targetAmount,
          currentAmount,
          reductionPercent,
          sourceNudgeId,
          sourcePatternId,
          status: "active",
          startDate: new Date().toISOString().split("T")[0],
        })
        .returning();

      if (sourceNudgeId) {
        await db
          .update(guardianRecommendations)
          .set({ status: "acted", actedAt: new Date() })
          .where(eq(guardianRecommendations.id, sourceNudgeId));
      }

      if (sourcePatternId) {
        await db
          .update(spendingPatterns)
          .set({ status: "commitment_made", updatedAt: new Date() })
          .where(eq(spendingPatterns.id, sourcePatternId));
      }

      res.json(commitment);
    } catch (error: any) {
      console.error("Create commitment error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/commitments/:commitmentId", requireAuth, async (req, res) => {
    try {
      const { commitmentId } = req.params;
      const { status, rationale, targetAmount, reductionPercent, budgetLimit } = req.body;

      const [existing] = await db
        .select()
        .from(commitments)
        .where(eq(commitments.id, commitmentId))
        .limit(1);

      if (!existing) {
        return res.status(404).json({ error: "Commitment not found" });
      }

      const updateData: any = { updatedAt: new Date() };

      if (status) {
        updateData.status = status;
        if (status === "cancelled" && rationale) {
          updateData.cancellationRationale = rationale;
          
          await db.insert(behavioralLearningHistory).values({
            coupleId: existing.coupleId,
            triggerEvent: "commitment_cancelled",
            aiObservation: `User cancelled commitment. Rationale: ${rationale}`,
            recommendedApproach: "Consider this feedback for future nudges",
          });
        }
      }

      if (targetAmount !== undefined) {
        const history = (existing.modificationHistory as any[]) || [];
        history.push({
          date: new Date().toISOString(),
          change: `Target amount changed from $${existing.targetAmount} to $${targetAmount}`,
          rationale: rationale || "No reason provided",
        });
        updateData.targetAmount = targetAmount;
        updateData.modificationHistory = history;
      }

      if (budgetLimit !== undefined) {
        const oldBudget = existing.budgetLimit;
        const history = (existing.modificationHistory as any[]) || [];
        history.push({
          date: new Date().toISOString(),
          change: `Budget limit changed from $${oldBudget} to $${budgetLimit}`,
          rationale: rationale || "No reason provided",
        });
        updateData.budgetLimit = budgetLimit;
        updateData.modificationHistory = history;

        if (rationale) {
          await db.insert(behavioralLearningHistory).values({
            coupleId: existing.coupleId,
            triggerEvent: "commitment_modified",
            aiObservation: `User modified budget limit from $${oldBudget} to $${budgetLimit}. Rationale: ${rationale}`,
            recommendedApproach: oldBudget > budgetLimit 
              ? "User is tightening budget - they may be motivated to save more"
              : "User needed more flexibility - consider suggesting more realistic targets",
          });
        }
      }

      if (reductionPercent !== undefined) {
        const history = (existing.modificationHistory as any[]) || [];
        history.push({
          date: new Date().toISOString(),
          change: `Reduction percent changed from ${existing.reductionPercent}% to ${reductionPercent}%`,
          rationale: rationale || "No reason provided",
        });
        updateData.reductionPercent = reductionPercent;
        updateData.modificationHistory = history;
      }

      const [updated] = await db
        .update(commitments)
        .set(updateData)
        .where(eq(commitments.id, commitmentId))
        .returning();

      res.json(updated);
    } catch (error: any) {
      console.error("Update commitment error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/commitments/:commitmentId", requireAuth, async (req, res) => {
    try {
      const { commitmentId } = req.params;
      const { rationale } = req.body;

      const [existing] = await db
        .select()
        .from(commitments)
        .where(eq(commitments.id, commitmentId))
        .limit(1);

      if (!existing) {
        return res.status(404).json({ error: "Commitment not found" });
      }

      if (rationale) {
        await db.insert(behavioralLearningHistory).values({
          coupleId: existing.coupleId,
          triggerEvent: "commitment_deleted",
          aiObservation: `User deleted commitment: "${existing.title}". Rationale: ${rationale}`,
          recommendedApproach: "Learn from this feedback for future recommendations",
        });
      }

      await db.delete(commitments).where(eq(commitments.id, commitmentId));

      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete commitment error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== PHASE 3: ACTIVITY FEED ====================

  app.get("/api/activity/:coupleId", requireAuth, requireCoupleAccess, async (req, res) => {
    try {
      const { coupleId } = req.params;
      const since = req.query.since as string | undefined;
      const limit = Math.min(parseInt((req.query.limit as string) || "50"), 100);

      let query = db.select().from(activityFeed)
        .where(eq(activityFeed.coupleId, coupleId))
        .orderBy(desc(activityFeed.createdAt))
        .limit(limit);

      const items = await query;
      const filtered = since
        ? items.filter((i: any) => new Date(i.createdAt) > new Date(since))
        : items;

      res.json(filtered);
    } catch (error: any) {
      console.error("Get activity error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== PHASE 4: GUARDIAN CONVERSATION HISTORY ====================

  app.get("/api/guardian/conversation-history/:coupleId", requireAuth, requireCoupleAccess, async (req, res) => {
    try {
      const { coupleId } = req.params;
      const limit = Math.min(parseInt((req.query.limit as string) || "20"), 50);

      const messages = await db.select().from(guardianConversations)
        .where(eq(guardianConversations.coupleId, coupleId))
        .orderBy(desc(guardianConversations.createdAt))
        .limit(limit);

      // Return in chronological order (oldest first)
      res.json(messages.reverse());
    } catch (error: any) {
      console.error("Get conversation history error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== FEEDBACK ENDPOINTS ====================

  app.post("/api/feedback", requireAuth, async (req, res) => {
    try {
      const { coupleId, userId, type, title, description, platform, appVersion } = req.body;

      if (!type || !title || !description) {
        return res.status(400).json({ error: "Type, title, and description are required" });
      }

      const validTypes = ["feedback", "issue", "idea"];
      if (!validTypes.includes(type)) {
        return res.status(400).json({ error: "Type must be one of: feedback, issue, idea" });
      }

      const [newFeedback] = await db.insert(feedback).values({
        coupleId: coupleId || null,
        userId: userId || null,
        type,
        title,
        description,
        platform: platform || null,
        appVersion: appVersion || null,
      }).returning();

      res.json(newFeedback);
    } catch (error: any) {
      console.error("Submit feedback error:", error);
      res.status(500).json({ error: error.message || "Failed to submit feedback" });
    }
  });

  app.get("/api/feedback/:coupleId", requireAuth, requireCoupleAccess, async (req, res) => {
    try {
      const { coupleId } = req.params;

      const submissions = await db
        .select()
        .from(feedback)
        .where(eq(feedback.coupleId, coupleId))
        .orderBy(desc(feedback.createdAt));

      res.json(submissions);
    } catch (error: any) {
      console.error("Get feedback error:", error);
      res.status(500).json({ error: error.message || "Failed to get feedback" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
