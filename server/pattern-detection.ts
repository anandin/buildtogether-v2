import { db } from "./db";
import { expenses, spendingPatterns, guardianRecommendations } from "../shared/schema";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { format, subDays, differenceInDays, parseISO } from "date-fns";

interface ExpenseData {
  id: string;
  merchant: string | null;
  category: string;
  amount: number;
  date: string;
  description: string;
}

interface DetectedPattern {
  patternType: "habitual_merchant" | "category_spike" | "time_based" | "escalating";
  category: string | null;
  merchant: string | null;
  frequency: string | null;
  averageAmount: number;
  totalSpent: number;
  occurrenceCount: number;
  firstOccurrence: string;
  lastOccurrence: string;
  confidence: number;
  isHabitual: boolean;
  aiSummary: string;
  suggestedAction: string;
  alternativeSuggestion: string | null;
  potentialMonthlySavings: number;
}

const MERCHANT_ALTERNATIVES: Record<string, { alternative: string; savingsPerVisit: number }> = {
  "starbucks": { alternative: "Tim Hortons", savingsPerVisit: 2.50 },
  "mcdonald's": { alternative: "Subway", savingsPerVisit: 1.50 },
  "chipotle": { alternative: "Taco Bell", savingsPerVisit: 4.00 },
  "uber eats": { alternative: "cooking at home", savingsPerVisit: 15.00 },
  "doordash": { alternative: "cooking at home", savingsPerVisit: 15.00 },
  "grubhub": { alternative: "cooking at home", savingsPerVisit: 15.00 },
  "amazon": { alternative: "local stores or wait 48hrs", savingsPerVisit: 10.00 },
};

function normalizeMerchant(merchant: string | null): string | null {
  if (!merchant) return null;
  return merchant.toLowerCase().trim().replace(/[^a-z0-9\s]/g, "");
}

function calculateFrequency(dates: string[]): { frequency: string; avgDaysBetween: number } {
  if (dates.length < 2) return { frequency: "one-time", avgDaysBetween: 0 };
  
  const sortedDates = dates.map(d => parseISO(d)).sort((a, b) => a.getTime() - b.getTime());
  const gaps: number[] = [];
  
  for (let i = 1; i < sortedDates.length; i++) {
    gaps.push(differenceInDays(sortedDates[i], sortedDates[i - 1]));
  }
  
  const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  
  if (avgGap <= 1.5) return { frequency: "daily", avgDaysBetween: avgGap };
  if (avgGap <= 3.5) return { frequency: "every-other-day", avgDaysBetween: avgGap };
  if (avgGap <= 8) return { frequency: "weekly", avgDaysBetween: avgGap };
  if (avgGap <= 16) return { frequency: "bi-weekly", avgDaysBetween: avgGap };
  return { frequency: "monthly", avgDaysBetween: avgGap };
}

export async function detectPatterns(coupleId: string): Promise<DetectedPattern[]> {
  const thirtyDaysAgo = format(subDays(new Date(), 30), "yyyy-MM-dd");
  
  const recentExpenses = await db
    .select()
    .from(expenses)
    .where(and(
      eq(expenses.coupleId, coupleId),
      gte(expenses.date, thirtyDaysAgo)
    ))
    .orderBy(desc(expenses.date));

  const patterns: DetectedPattern[] = [];

  const merchantGroups = new Map<string, ExpenseData[]>();
  for (const expense of recentExpenses) {
    const normalized = normalizeMerchant(expense.merchant);
    if (normalized && normalized.length > 2) {
      const existing = merchantGroups.get(normalized) || [];
      existing.push({
        id: expense.id,
        merchant: expense.merchant,
        category: expense.category,
        amount: expense.amount,
        date: expense.date,
        description: expense.description,
      });
      merchantGroups.set(normalized, existing);
    }
  }

  for (const [normalizedMerchant, expenseList] of merchantGroups) {
    if (expenseList.length >= 3) {
      const dates = expenseList.map(e => e.date);
      const amounts = expenseList.map(e => e.amount);
      const totalSpent = amounts.reduce((a, b) => a + b, 0);
      const avgAmount = totalSpent / amounts.length;
      const { frequency, avgDaysBetween } = calculateFrequency(dates);
      
      const confidence = Math.min(0.9, 0.3 + (expenseList.length * 0.1));
      const isHabitual = expenseList.length >= 3 && avgDaysBetween <= 10;
      
      const originalMerchant = expenseList[0].merchant || normalizedMerchant;
      const category = expenseList[0].category;
      
      const altInfo = Object.entries(MERCHANT_ALTERNATIVES).find(
        ([key]) => normalizedMerchant.includes(key)
      );
      
      let aiSummary = `You visit ${originalMerchant} ${frequency === "daily" ? "almost every day" : frequency}, spending $${avgAmount.toFixed(0)} each time.`;
      let suggestedAction = `Set a weekly ${category} budget of $${(avgAmount * 2).toFixed(0)}`;
      let alternativeSuggestion: string | null = null;
      let monthlySavings = totalSpent * 0.3;
      
      if (altInfo) {
        const [, alt] = altInfo;
        alternativeSuggestion = `Switch to ${alt.alternative} and save ~$${alt.savingsPerVisit.toFixed(2)} per visit`;
        monthlySavings = alt.savingsPerVisit * (30 / avgDaysBetween);
      }

      patterns.push({
        patternType: "habitual_merchant",
        category,
        merchant: originalMerchant,
        frequency,
        averageAmount: avgAmount,
        totalSpent,
        occurrenceCount: expenseList.length,
        firstOccurrence: dates[dates.length - 1],
        lastOccurrence: dates[0],
        confidence,
        isHabitual,
        aiSummary,
        suggestedAction,
        alternativeSuggestion,
        potentialMonthlySavings: monthlySavings,
      });
    }
  }

  const categoryGroups = new Map<string, ExpenseData[]>();
  for (const expense of recentExpenses) {
    const existing = categoryGroups.get(expense.category) || [];
    existing.push({
      id: expense.id,
      merchant: expense.merchant,
      category: expense.category,
      amount: expense.amount,
      date: expense.date,
      description: expense.description,
    });
    categoryGroups.set(expense.category, existing);
  }

  for (const [category, expenseList] of categoryGroups) {
    if (expenseList.length >= 5) {
      const weeklyTotals: number[] = [];
      const weekGroups = new Map<string, number>();
      
      for (const expense of expenseList) {
        const weekKey = format(parseISO(expense.date), "yyyy-ww");
        weekGroups.set(weekKey, (weekGroups.get(weekKey) || 0) + expense.amount);
      }
      
      const weeks = Array.from(weekGroups.values());
      if (weeks.length >= 2) {
        const avgWeekly = weeks.slice(0, -1).reduce((a, b) => a + b, 0) / (weeks.length - 1);
        const currentWeek = weeks[weeks.length - 1];
        
        if (currentWeek > avgWeekly * 1.5 && currentWeek - avgWeekly > 20) {
          const spikeAmount = currentWeek - avgWeekly;
          patterns.push({
            patternType: "category_spike",
            category,
            merchant: null,
            frequency: "weekly",
            averageAmount: avgWeekly,
            totalSpent: currentWeek,
            occurrenceCount: expenseList.length,
            firstOccurrence: expenseList[expenseList.length - 1].date,
            lastOccurrence: expenseList[0].date,
            confidence: 0.75,
            isHabitual: false,
            aiSummary: `Your ${category} spending is ${((currentWeek / avgWeekly - 1) * 100).toFixed(0)}% higher than usual this week.`,
            suggestedAction: `Reduce ${category} spending to stay on track`,
            alternativeSuggestion: null,
            potentialMonthlySavings: spikeAmount * 4,
          });
        }
      }
    }
  }

  return patterns.sort((a, b) => {
    if (a.isHabitual && !b.isHabitual) return -1;
    if (!a.isHabitual && b.isHabitual) return 1;
    return b.potentialMonthlySavings - a.potentialMonthlySavings;
  });
}

export async function savePatterns(coupleId: string, patterns: DetectedPattern[]): Promise<string[]> {
  const savedIds: string[] = [];
  
  for (const pattern of patterns) {
    const existing = await db
      .select()
      .from(spendingPatterns)
      .where(and(
        eq(spendingPatterns.coupleId, coupleId),
        eq(spendingPatterns.patternType, pattern.patternType),
        pattern.merchant 
          ? eq(spendingPatterns.merchant, pattern.merchant)
          : eq(spendingPatterns.category, pattern.category || ""),
        eq(spendingPatterns.status, "detected")
      ))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(spendingPatterns)
        .set({
          occurrenceCount: pattern.occurrenceCount,
          averageAmount: pattern.averageAmount,
          totalSpent: pattern.totalSpent,
          lastOccurrence: pattern.lastOccurrence,
          confidence: pattern.confidence,
          isHabitual: pattern.isHabitual,
          aiSummary: pattern.aiSummary,
          suggestedAction: pattern.suggestedAction,
          alternativeSuggestion: pattern.alternativeSuggestion,
          potentialMonthlySavings: pattern.potentialMonthlySavings,
          updatedAt: new Date(),
        })
        .where(eq(spendingPatterns.id, existing[0].id));
      savedIds.push(existing[0].id);
    } else {
      const [inserted] = await db
        .insert(spendingPatterns)
        .values({
          coupleId,
          patternType: pattern.patternType,
          category: pattern.category,
          merchant: pattern.merchant,
          frequency: pattern.frequency,
          averageAmount: pattern.averageAmount,
          totalSpent: pattern.totalSpent,
          occurrenceCount: pattern.occurrenceCount,
          firstOccurrence: pattern.firstOccurrence,
          lastOccurrence: pattern.lastOccurrence,
          confidence: pattern.confidence,
          isHabitual: pattern.isHabitual,
          aiSummary: pattern.aiSummary,
          suggestedAction: pattern.suggestedAction,
          alternativeSuggestion: pattern.alternativeSuggestion,
          potentialMonthlySavings: pattern.potentialMonthlySavings,
          status: "detected",
        })
        .returning();
      savedIds.push(inserted.id);
    }
  }
  
  return savedIds;
}

export async function createNudgeFromPattern(
  coupleId: string,
  patternId: string,
  nudgeMessage: string,
  nudgeTitle: string,
  suggestedAction: string,
  rationale: string,
  behavioralTechnique: string
): Promise<string> {
  const [pattern] = await db
    .select()
    .from(spendingPatterns)
    .where(eq(spendingPatterns.id, patternId))
    .limit(1);

  if (!pattern) {
    throw new Error("Pattern not found");
  }

  const [recommendation] = await db
    .insert(guardianRecommendations)
    .values({
      coupleId,
      insightId: patternId,
      recommendationType: "savings_tip",
      title: nudgeTitle,
      message: nudgeMessage,
      suggestedAction,
      targetAmount: pattern.potentialMonthlySavings,
      category: pattern.category,
      status: "pending",
      rationale,
      evidenceData: {
        patternId,
        patternType: pattern.patternType,
        merchant: pattern.merchant,
        occurrenceCount: pattern.occurrenceCount,
        averageAmount: pattern.averageAmount,
        potentialSavings: pattern.potentialMonthlySavings,
      },
      behavioralTechnique,
    })
    .returning();

  await db
    .update(spendingPatterns)
    .set({
      status: "nudge_sent",
      nudgeSentAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(spendingPatterns.id, patternId));

  return recommendation.id;
}

export async function getActivePatterns(coupleId: string) {
  return db
    .select()
    .from(spendingPatterns)
    .where(and(
      eq(spendingPatterns.coupleId, coupleId),
      eq(spendingPatterns.isHabitual, true)
    ))
    .orderBy(desc(spendingPatterns.potentialMonthlySavings));
}

export async function getPendingNudges(coupleId: string) {
  return db
    .select()
    .from(guardianRecommendations)
    .where(and(
      eq(guardianRecommendations.coupleId, coupleId),
      eq(guardianRecommendations.status, "pending")
    ))
    .orderBy(desc(guardianRecommendations.createdAt))
    .limit(3);
}
