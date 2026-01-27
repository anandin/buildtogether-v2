import AsyncStorage from "@react-native-async-storage/async-storage";
import { v4 as uuidv4 } from "uuid";
import type {
  AppData,
  Expense,
  Goal,
  Budget,
  GoalContribution,
} from "@/types";

const STORAGE_KEY = "@build_together_data";

const defaultData: AppData = {
  expenses: [],
  goals: [],
  budget: null,
  partners: {
    partner1: {
      id: "partner1",
      name: "You",
      avatar: "avatar-preset-1",
    },
    partner2: {
      id: "partner2",
      name: "Partner",
      avatar: "avatar-preset-2",
    },
  },
  connectedSince: null,
};

export async function loadAppData(): Promise<AppData> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEY);
    if (data) {
      return { ...defaultData, ...JSON.parse(data) };
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
