import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import type { AppData, Expense, Goal, CategoryBudget, CustomCategory, SettlementRecord, LineItem } from "@/types";
import { DEFAULT_CATEGORY_BUDGETS } from "@/types";
import { v4 as uuidv4 } from "uuid";

const COUPLE_ID_KEY = "@couple_id";
const LOCAL_CACHE_KEY = "@app_data_cache";

let cachedCoupleId: string | null = null;

export async function setCoupleId(coupleId: string): Promise<void> {
  cachedCoupleId = coupleId;
  await AsyncStorage.setItem(COUPLE_ID_KEY, coupleId);
}

export async function clearCoupleId(): Promise<void> {
  cachedCoupleId = null;
  await AsyncStorage.removeItem(COUPLE_ID_KEY);
  await AsyncStorage.removeItem(LOCAL_CACHE_KEY);
}

async function getCoupleId(): Promise<string> {
  if (cachedCoupleId) {
    return cachedCoupleId;
  }
  let coupleId = await AsyncStorage.getItem(COUPLE_ID_KEY);
  if (!coupleId) {
    coupleId = uuidv4();
    await AsyncStorage.setItem(COUPLE_ID_KEY, coupleId);
  }
  cachedCoupleId = coupleId;
  return coupleId;
}

export async function loadAppData(): Promise<AppData> {
  try {
    const coupleId = await getCoupleId();
    const response = await apiRequest("GET", `/api/sync/${coupleId}`);
    const syncData = await response.json();
    
    const appData: AppData = {
      expenses: syncData.expenses.map((e: any) => ({
        ...e,
        createdAt: e.createdAt || new Date().toISOString(),
      })),
      goals: syncData.goals.map((g: any) => ({
        ...g,
        createdAt: g.createdAt || new Date().toISOString(),
        contributions: g.contributions || [],
      })),
      budget: null,
      categoryBudgets: syncData.categoryBudgets.length > 0 
        ? syncData.categoryBudgets.map((b: any) => ({
            id: b.id,
            category: b.category,
            monthlyLimit: b.monthlyLimit,
            budgetType: b.budgetType || "recurring",
            alertThreshold: b.alertThreshold || 80,
            rolloverBalance: b.rolloverBalance || 0,
            endDate: b.endDate,
            lastResetDate: b.lastResetDate,
          }))
        : DEFAULT_CATEGORY_BUDGETS.map((b) => ({
            id: uuidv4(),
            category: b.category,
            monthlyLimit: b.limit,
            budgetType: b.budgetType,
            alertThreshold: 80,
            rolloverBalance: 0,
            lastResetDate: new Date().toISOString(),
          })),
      customCategories: syncData.customCategories || [],
      aiInsights: [],
      partners: {
        partner1: {
          id: "partner1",
          name: syncData.couple?.partner1Name || "You",
          avatar: "avatar-preset-1",
          color: syncData.couple?.partner1Color || "#FF9AA2",
        },
        partner2: {
          id: "partner2",
          name: syncData.couple?.partner2Name || "Partner",
          avatar: "avatar-preset-2",
          color: syncData.couple?.partner2Color || "#C7CEEA",
        },
      },
      settlements: syncData.settlements || [],
      connectedSince: syncData.couple?.connectedSince || null,
      lastInsightCheck: undefined,
      hasCompletedOnboarding: syncData.couple?.hasCompletedOnboarding || false,
    };
    
    await AsyncStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(appData));
    return appData;
  } catch (error) {
    console.error("Error loading from cloud, falling back to cache:", error);
    const cached = await AsyncStorage.getItem(LOCAL_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
    
    return {
      expenses: [],
      goals: [],
      budget: null,
      categoryBudgets: DEFAULT_CATEGORY_BUDGETS.map((b) => ({
        id: uuidv4(),
        category: b.category,
        monthlyLimit: b.limit,
        budgetType: b.budgetType,
        alertThreshold: 80,
        rolloverBalance: 0,
        lastResetDate: new Date().toISOString(),
      })),
      customCategories: [],
      aiInsights: [],
      partners: {
        partner1: { id: "partner1", name: "You", avatar: "avatar-preset-1", color: "#FF9AA2" },
        partner2: { id: "partner2", name: "Partner", avatar: "avatar-preset-2", color: "#C7CEEA" },
      },
      settlements: [],
      connectedSince: null,
      lastInsightCheck: undefined,
      hasCompletedOnboarding: false,
    };
  }
}

export async function addExpense(expense: Omit<Expense, "id" | "createdAt">): Promise<Expense> {
  const coupleId = await getCoupleId();
  const { lineItems, ...expenseData } = expense;
  
  const response = await apiRequest("POST", `/api/expenses/${coupleId}`, {
    ...expenseData,
    date: expense.date || new Date().toISOString().split("T")[0],
  });
  const newExpense = await response.json();
  
  if (lineItems && lineItems.length > 0) {
    try {
      await apiRequest("POST", `/api/expenses/${coupleId}/${newExpense.id}/line-items`, {
        items: lineItems,
      });
    } catch (err) {
      console.error("Failed to save line items:", err);
    }
  }
  
  return {
    ...newExpense,
    lineItems,
    createdAt: newExpense.createdAt || new Date().toISOString(),
  };
}

export async function updateExpense(expense: Expense): Promise<void> {
  const coupleId = await getCoupleId();
  await apiRequest("PUT", `/api/expenses/${coupleId}/${expense.id}`, expense);
}

export async function deleteExpense(id: string): Promise<void> {
  const coupleId = await getCoupleId();
  await apiRequest("DELETE", `/api/expenses/${coupleId}/${id}`);
}

export async function settleExpenses(
  expenseIds: string[],
  from: "partner1" | "partner2",
  to: "partner1" | "partner2",
  amount: number
): Promise<void> {
  const coupleId = await getCoupleId();
  await apiRequest("POST", `/api/settlements/${coupleId}`, {
    expenseIds,
    from,
    to,
    amount,
    date: new Date().toISOString().split("T")[0],
  });
}

export async function addGoal(goal: Omit<Goal, "id" | "createdAt" | "contributions" | "savedAmount">): Promise<Goal> {
  const coupleId = await getCoupleId();
  const response = await apiRequest("POST", `/api/goals/${coupleId}`, goal);
  const newGoal = await response.json();
  return {
    ...newGoal,
    savedAmount: newGoal.savedAmount || 0,
    contributions: newGoal.contributions || [],
    createdAt: newGoal.createdAt || new Date().toISOString(),
  };
}

export async function updateGoal(goal: Goal): Promise<void> {
  const coupleId = await getCoupleId();
  await apiRequest("PUT", `/api/goals/${coupleId}/${goal.id}`, goal);
}

export async function deleteGoal(id: string): Promise<void> {
  const coupleId = await getCoupleId();
  await apiRequest("DELETE", `/api/goals/${coupleId}/${id}`);
}

export async function addGoalContribution(
  goalId: string,
  amount: number,
  contributor: "partner1" | "partner2"
): Promise<void> {
  const coupleId = await getCoupleId();
  await apiRequest("POST", `/api/goals/${coupleId}/${goalId}/contribute`, {
    amount,
    contributor,
    date: new Date().toISOString().split("T")[0],
  });
}

export async function setBudget(monthlyLimit: number): Promise<any> {
  return { id: uuidv4(), monthlyLimit, month: new Date().toISOString().slice(0, 7), year: new Date().getFullYear() };
}

export async function updateCategoryBudget(
  category: string,
  updates: Partial<Omit<CategoryBudget, "id" | "category">>
): Promise<CategoryBudget> {
  const coupleId = await getCoupleId();
  const response = await apiRequest("POST", `/api/budgets/${coupleId}`, {
    category,
    ...updates,
  });
  const budget = await response.json();
  return budget;
}

export async function processMonthlyRollover(): Promise<void> {
  // This will be handled server-side eventually
}

export async function addCustomCategory(name: string, icon: string, color: string): Promise<CustomCategory> {
  const coupleId = await getCoupleId();
  const response = await apiRequest("POST", `/api/categories/${coupleId}`, {
    name,
    icon,
    color,
  });
  return await response.json();
}

export async function deleteCustomCategory(id: string): Promise<void> {
  const coupleId = await getCoupleId();
  await apiRequest("DELETE", `/api/categories/${coupleId}/${id}`);
}

export async function addAIInsight(insight: any): Promise<any> {
  const id = uuidv4();
  return { ...insight, id, createdAt: new Date().toISOString(), isRead: false, isDismissed: false };
}

export async function markInsightRead(id: string): Promise<void> {}

export async function dismissInsight(id: string): Promise<void> {}

export async function updatePartnerName(partnerId: "partner1" | "partner2", name: string): Promise<void> {
  const coupleId = await getCoupleId();
  const updates = partnerId === "partner1" ? { partner1Name: name } : { partner2Name: name };
  await apiRequest("PUT", `/api/couple/${coupleId}`, updates);
}

export async function completeOnboarding(): Promise<void> {
  const coupleId = await getCoupleId();
  await apiRequest("PUT", `/api/couple/${coupleId}`, { hasCompletedOnboarding: true });
}

export function getCurrentMonthExpenses(expenses: Expense[]): Expense[] {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  
  return expenses.filter((expense) => {
    const expenseDate = new Date(expense.date);
    return (
      expenseDate.getMonth() === currentMonth &&
      expenseDate.getFullYear() === currentYear
    );
  });
}

export function getSpendingByCategory(expenses: Expense[]): Record<string, number> {
  return expenses.reduce((acc, expense) => {
    acc[expense.category] = (acc[expense.category] || 0) + expense.amount;
    return acc;
  }, {} as Record<string, number>);
}

export function getEffectiveBudget(budget: CategoryBudget): number {
  if (budget.budgetType === "rollover") {
    return budget.monthlyLimit + (budget.rolloverBalance || 0);
  }
  return budget.monthlyLimit;
}

export function getTotalSpent(expenses: Expense[]): number {
  return expenses.reduce((sum, expense) => sum + expense.amount, 0);
}

export function getUnsettledExpenses(expenses: Expense[]): Expense[] {
  return expenses.filter((e) => !e.isSettled);
}

export function calculateOwedAmounts(
  expenses: Expense[],
  partners: { partner1: { id: string; name: string }; partner2: { id: string; name: string } }
): { partner1Owes: number; partner2Owes: number } {
  let partner1Owes = 0;
  let partner2Owes = 0;

  const unsettledExpenses = expenses.filter((e) => !e.isSettled);

  unsettledExpenses.forEach((expense) => {
    if (expense.splitMethod === "joint" || expense.paidBy === "joint") {
      return;
    }

    const partner1Share = expense.splitAmounts?.partner1 ?? expense.amount / 2;
    const partner2Share = expense.splitAmounts?.partner2 ?? expense.amount / 2;

    if (expense.paidBy === "partner1") {
      partner2Owes += partner2Share;
    } else if (expense.paidBy === "partner2") {
      partner1Owes += partner1Share;
    }
  });

  return { partner1Owes, partner2Owes };
}

export function getMerchantSpending(expenses: Expense[]): Record<string, { total: number; count: number }> {
  const merchants: Record<string, { total: number; count: number }> = {};
  expenses.forEach((expense) => {
    if (expense.merchant) {
      if (!merchants[expense.merchant]) {
        merchants[expense.merchant] = { total: 0, count: 0 };
      }
      merchants[expense.merchant].total += expense.amount;
      merchants[expense.merchant].count += 1;
    }
  });
  return merchants;
}

export function getDailyTotals(
  expenses: Expense[],
  year: number,
  month: number
): Record<number, number> {
  const totals: Record<number, number> = {};
  
  expenses.forEach((expense) => {
    const date = new Date(expense.date);
    if (date.getFullYear() === year && date.getMonth() === month) {
      const day = date.getDate();
      totals[day] = (totals[day] || 0) + expense.amount;
    }
  });
  
  return totals;
}

export function getCategoryBudgetStatus(
  expenses: Expense[],
  categoryBudgets: CategoryBudget[]
): { category: string; spent: number; limit: number; percentage: number }[] {
  const monthlyExpenses = getCurrentMonthExpenses(expenses);
  const spendingByCategory = getSpendingByCategory(monthlyExpenses);
  
  return categoryBudgets.map((budget) => {
    const spent = spendingByCategory[budget.category] || 0;
    return {
      category: budget.category,
      spent,
      limit: budget.monthlyLimit,
      percentage: budget.monthlyLimit > 0 ? (spent / budget.monthlyLimit) * 100 : 0,
    };
  });
}
