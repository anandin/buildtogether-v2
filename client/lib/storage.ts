import AsyncStorage from "@react-native-async-storage/async-storage";
import { v4 as uuidv4 } from "uuid";
import type {
  AppData,
  Expense,
  Goal,
  Budget,
  GoalContribution,
  SettlementRecord,
  CategoryBudget,
  CustomCategory,
  AIInsight,
} from "@/types";
import { DEFAULT_CATEGORY_BUDGETS } from "@/types";

const STORAGE_KEY = "@build_together_data";

const defaultCategoryBudgets: CategoryBudget[] = DEFAULT_CATEGORY_BUDGETS.map((b) => ({
  id: uuidv4(),
  category: b.category,
  monthlyLimit: b.limit,
  budgetType: b.budgetType,
  alertThreshold: 80,
  rolloverBalance: 0,
  lastResetDate: new Date().toISOString(),
}));

const defaultData: AppData = {
  expenses: [],
  goals: [],
  budget: null,
  categoryBudgets: defaultCategoryBudgets,
  customCategories: [],
  aiInsights: [],
  partners: {
    partner1: {
      id: "partner1",
      name: "You",
      avatar: "avatar-preset-1",
      color: "#FF9AA2",
    },
    partner2: {
      id: "partner2",
      name: "Partner",
      avatar: "avatar-preset-2",
      color: "#C7CEEA",
    },
  },
  settlements: [],
  connectedSince: null,
  lastInsightCheck: undefined,
  hasCompletedOnboarding: false,
};

export async function loadAppData(): Promise<AppData> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      return {
        ...defaultData,
        ...parsed,
        categoryBudgets: parsed.categoryBudgets?.length ? parsed.categoryBudgets : defaultCategoryBudgets,
        customCategories: parsed.customCategories || [],
        aiInsights: parsed.aiInsights || [],
        partners: {
          ...defaultData.partners,
          ...parsed.partners,
          partner1: { ...defaultData.partners.partner1, ...parsed.partners?.partner1 },
          partner2: { ...defaultData.partners.partner2, ...parsed.partners?.partner2 },
        },
      };
    }
    return defaultData;
  } catch (error) {
    console.error("Error loading app data:", error);
    return defaultData;
  }
}

export async function saveAppData(data: AppData): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error("Error saving app data:", error);
  }
}

export async function addExpense(
  expense: Omit<Expense, "id" | "createdAt">
): Promise<Expense> {
  const data = await loadAppData();
  const newExpense: Expense = {
    ...expense,
    id: uuidv4(),
    createdAt: new Date().toISOString(),
  };
  data.expenses.unshift(newExpense);
  await saveAppData(data);
  return newExpense;
}

export async function updateExpense(expense: Expense): Promise<void> {
  const data = await loadAppData();
  const index = data.expenses.findIndex((e) => e.id === expense.id);
  if (index !== -1) {
    data.expenses[index] = expense;
    await saveAppData(data);
  }
}

export async function deleteExpense(id: string): Promise<void> {
  const data = await loadAppData();
  data.expenses = data.expenses.filter((e) => e.id !== id);
  await saveAppData(data);
}

export async function settleExpenses(
  expenseIds: string[],
  from: "partner1" | "partner2",
  to: "partner1" | "partner2",
  amount: number
): Promise<void> {
  const data = await loadAppData();
  
  expenseIds.forEach((id) => {
    const expense = data.expenses.find((e) => e.id === id);
    if (expense) {
      expense.isSettled = true;
    }
  });

  const settlement: SettlementRecord = {
    id: uuidv4(),
    date: new Date().toISOString(),
    amount,
    from,
    to,
    expenses: expenseIds,
  };
  data.settlements.push(settlement);
  
  await saveAppData(data);
}

export async function addGoal(
  goal: Omit<Goal, "id" | "createdAt" | "contributions" | "savedAmount">
): Promise<Goal> {
  const data = await loadAppData();
  const newGoal: Goal = {
    ...goal,
    id: uuidv4(),
    savedAmount: 0,
    contributions: [],
    createdAt: new Date().toISOString(),
  };
  data.goals.push(newGoal);
  await saveAppData(data);
  return newGoal;
}

export async function updateGoal(goal: Goal): Promise<void> {
  const data = await loadAppData();
  const index = data.goals.findIndex((g) => g.id === goal.id);
  if (index !== -1) {
    data.goals[index] = goal;
    await saveAppData(data);
  }
}

export async function deleteGoal(id: string): Promise<void> {
  const data = await loadAppData();
  data.goals = data.goals.filter((g) => g.id !== id);
  await saveAppData(data);
}

export async function addGoalContribution(
  goalId: string,
  amount: number,
  contributor: "partner1" | "partner2"
): Promise<void> {
  const data = await loadAppData();
  const goal = data.goals.find((g) => g.id === goalId);
  if (goal) {
    const contribution: GoalContribution = {
      id: uuidv4(),
      amount,
      date: new Date().toISOString(),
      contributor,
    };
    goal.contributions.push(contribution);
    goal.savedAmount += amount;
    await saveAppData(data);
  }
}

export async function setBudget(monthlyLimit: number): Promise<Budget> {
  const data = await loadAppData();
  const now = new Date();
  const budget: Budget = {
    id: uuidv4(),
    monthlyLimit,
    month: now.toLocaleString("default", { month: "long" }),
    year: now.getFullYear(),
  };
  data.budget = budget;
  await saveAppData(data);
  return budget;
}

export async function updateCategoryBudget(
  category: string,
  updates: Partial<Omit<CategoryBudget, "id" | "category">>
): Promise<CategoryBudget> {
  const data = await loadAppData();
  const existing = data.categoryBudgets.find((b) => b.category === category);
  
  if (existing) {
    Object.assign(existing, updates);
    await saveAppData(data);
    return existing;
  } else {
    const newBudget: CategoryBudget = {
      id: uuidv4(),
      category,
      monthlyLimit: updates.monthlyLimit || 100,
      budgetType: updates.budgetType || "recurring",
      alertThreshold: updates.alertThreshold || 80,
      rolloverBalance: updates.rolloverBalance || 0,
      endDate: updates.endDate,
      isCustom: true,
      lastResetDate: new Date().toISOString(),
    };
    data.categoryBudgets.push(newBudget);
    await saveAppData(data);
    return newBudget;
  }
}

export async function processMonthlyRollover(): Promise<void> {
  const data = await loadAppData();
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  
  for (const budget of data.categoryBudgets) {
    const lastReset = budget.lastResetDate ? new Date(budget.lastResetDate) : null;
    const needsReset = !lastReset || 
      lastReset.getMonth() !== currentMonth || 
      lastReset.getFullYear() !== currentYear;
    
    if (needsReset) {
      const lastMonthExpenses = data.expenses.filter(e => {
        const d = new Date(e.date);
        const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
        return d.getMonth() === prevMonth && d.getFullYear() === prevYear && e.category === budget.category;
      });
      const lastMonthSpent = lastMonthExpenses.reduce((sum, e) => sum + e.amount, 0);
      const unused = Math.max(0, budget.monthlyLimit + budget.rolloverBalance - lastMonthSpent);
      
      if (budget.budgetType === "rollover") {
        budget.rolloverBalance = unused;
      } else if (budget.budgetType === "recurring") {
        budget.rolloverBalance = 0;
      }
      
      budget.lastResetDate = now.toISOString();
    }
  }
  
  await saveAppData(data);
}

export function getEffectiveBudget(budget: CategoryBudget): number {
  if (budget.budgetType === "rollover") {
    return budget.monthlyLimit + budget.rolloverBalance;
  }
  return budget.monthlyLimit;
}

export function getBudgetSavingsOpportunity(
  expenses: Expense[],
  categoryBudgets: CategoryBudget[]
): { totalSavings: number; categorySavings: { category: string; amount: number }[] } {
  const monthlyExpenses = getCurrentMonthExpenses(expenses);
  const spendingByCategory = getSpendingByCategory(monthlyExpenses);
  
  const categorySavings: { category: string; amount: number }[] = [];
  let totalSavings = 0;
  
  for (const budget of categoryBudgets) {
    const spent = spendingByCategory[budget.category] || 0;
    const effectiveBudget = getEffectiveBudget(budget);
    const remaining = Math.max(0, effectiveBudget - spent);
    
    if (remaining > 0) {
      categorySavings.push({ category: budget.category, amount: remaining });
      totalSavings += remaining;
    }
  }
  
  return { totalSavings, categorySavings: categorySavings.sort((a, b) => b.amount - a.amount) };
}

export async function addCustomCategory(
  name: string,
  icon: string,
  color: string
): Promise<CustomCategory> {
  const data = await loadAppData();
  const newCategory: CustomCategory = {
    id: uuidv4(),
    name: name.toLowerCase().replace(/\s+/g, "_"),
    icon,
    color,
  };
  data.customCategories.push(newCategory);
  await saveAppData(data);
  return newCategory;
}

export async function deleteCustomCategory(id: string): Promise<void> {
  const data = await loadAppData();
  data.customCategories = data.customCategories.filter((c) => c.id !== id);
  await saveAppData(data);
}

export async function addAIInsight(insight: Omit<AIInsight, "id" | "createdAt" | "isRead" | "isDismissed">): Promise<AIInsight> {
  const data = await loadAppData();
  const newInsight: AIInsight = {
    ...insight,
    id: uuidv4(),
    createdAt: new Date().toISOString(),
    isRead: false,
    isDismissed: false,
  };
  data.aiInsights.unshift(newInsight);
  data.lastInsightCheck = new Date().toISOString();
  await saveAppData(data);
  return newInsight;
}

export async function markInsightRead(id: string): Promise<void> {
  const data = await loadAppData();
  const insight = data.aiInsights.find((i) => i.id === id);
  if (insight) {
    insight.isRead = true;
    await saveAppData(data);
  }
}

export async function dismissInsight(id: string): Promise<void> {
  const data = await loadAppData();
  const insight = data.aiInsights.find((i) => i.id === id);
  if (insight) {
    insight.isDismissed = true;
    await saveAppData(data);
  }
}

export async function clearOldInsights(): Promise<void> {
  const data = await loadAppData();
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  
  data.aiInsights = data.aiInsights.filter((i) => {
    const createdAt = new Date(i.createdAt);
    return createdAt > oneWeekAgo || !i.isDismissed;
  });
  await saveAppData(data);
}

export async function updatePartnerName(
  partnerId: "partner1" | "partner2",
  name: string
): Promise<void> {
  const data = await loadAppData();
  data.partners[partnerId].name = name;
  await saveAppData(data);
}

export async function setConnectedSince(date: string): Promise<void> {
  const data = await loadAppData();
  data.connectedSince = date;
  await saveAppData(data);
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

export function getTotalSpent(expenses: Expense[]): number {
  return expenses.reduce((sum, expense) => sum + expense.amount, 0);
}

export function getSpendingByCategory(expenses: Expense[]): Record<string, number> {
  const spending: Record<string, number> = {};
  expenses.forEach((expense) => {
    spending[expense.category] = (spending[expense.category] || 0) + expense.amount;
  });
  return spending;
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

export function getExpensesByDate(
  expenses: Expense[],
  year: number,
  month: number
): Record<string, Expense[]> {
  const grouped: Record<string, Expense[]> = {};
  
  expenses.forEach((expense) => {
    const date = new Date(expense.date);
    if (date.getFullYear() === year && date.getMonth() === month) {
      const day = date.getDate().toString();
      if (!grouped[day]) {
        grouped[day] = [];
      }
      grouped[day].push(expense);
    }
  });
  
  return grouped;
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

export function calculateOwedAmounts(
  expenses: Expense[],
  partners: AppData["partners"]
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

export function getUnsettledExpenses(expenses: Expense[]): Expense[] {
  return expenses.filter((e) => !e.isSettled);
}

export async function completeOnboarding(): Promise<void> {
  const data = await loadAppData();
  data.hasCompletedOnboarding = true;
  if (!data.connectedSince) {
    data.connectedSince = new Date().toISOString();
  }
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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
