import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import type { AppData, Expense, Goal, Budget, CategoryBudget, CustomCategory, AIInsight, BudgetType } from "@/types";
import * as storage from "@/lib/cloudStorage";
import type { GuardianNudge } from "@/lib/cloudStorage";

interface AppContextType {
  data: AppData | null;
  loading: boolean;
  refreshData: () => Promise<void>;
  addExpense: (expense: Omit<Expense, "id" | "createdAt">) => Promise<Expense & { guardianNudge?: GuardianNudge }>;
  updateExpense: (expense: Expense) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  settleExpenses: (expenseIds: string[], from: "partner1" | "partner2", to: "partner1" | "partner2", amount: number) => Promise<void>;
  addGoal: (goal: Omit<Goal, "id" | "createdAt" | "contributions" | "savedAmount">) => Promise<Goal>;
  updateGoal: (goal: Goal) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  addGoalContribution: (goalId: string, amount: number, contributor: "partner1" | "partner2") => Promise<void>;
  setBudget: (monthlyLimit: number) => Promise<Budget>;
  updateCategoryBudget: (category: string, updates: Partial<Omit<CategoryBudget, "id" | "category">>) => Promise<CategoryBudget>;
  processMonthlyRollover: () => Promise<void>;
  addCustomCategory: (name: string, icon: string, color: string) => Promise<CustomCategory>;
  deleteCustomCategory: (id: string) => Promise<void>;
  addAIInsight: (insight: Omit<AIInsight, "id" | "createdAt" | "isRead" | "isDismissed">) => Promise<AIInsight>;
  markInsightRead: (id: string) => Promise<void>;
  dismissInsight: (id: string) => Promise<void>;
  updatePartnerName: (partnerId: "partner1" | "partner2", name: string) => Promise<void>;
  completeOnboarding: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const initialLoadDone = useRef(false);

  const refreshData = useCallback(async () => {
    const loadedData = await storage.loadAppData();
    setData(loadedData);
    setLoading(false);
  }, []);

  useEffect(() => {
    const init = async () => {
      const cached = await storage.loadCachedAppData();
      if (cached) {
        setData(cached);
        setLoading(false);
        initialLoadDone.current = true;
      }
      const fresh = await storage.loadAppData();
      setData(fresh);
      setLoading(false);
      initialLoadDone.current = true;
    };
    init();
  }, []);

  const addExpense = useCallback(async (expense: Omit<Expense, "id" | "createdAt">) => {
    const newExpense = await storage.addExpense(expense);
    await refreshData();
    return newExpense;
  }, [refreshData]);

  const updateExpense = useCallback(async (expense: Expense) => {
    await storage.updateExpense(expense);
    await refreshData();
  }, [refreshData]);

  const deleteExpense = useCallback(async (id: string) => {
    await storage.deleteExpense(id);
    await refreshData();
  }, [refreshData]);

  const settleExpenses = useCallback(async (
    expenseIds: string[],
    from: "partner1" | "partner2",
    to: "partner1" | "partner2",
    amount: number
  ) => {
    await storage.settleExpenses(expenseIds, from, to, amount);
    await refreshData();
  }, [refreshData]);

  const addGoal = useCallback(async (goal: Omit<Goal, "id" | "createdAt" | "contributions" | "savedAmount">) => {
    const newGoal = await storage.addGoal(goal);
    await refreshData();
    return newGoal;
  }, [refreshData]);

  const updateGoal = useCallback(async (goal: Goal) => {
    await storage.updateGoal(goal);
    await refreshData();
  }, [refreshData]);

  const deleteGoal = useCallback(async (id: string) => {
    await storage.deleteGoal(id);
    await refreshData();
  }, [refreshData]);

  const addGoalContribution = useCallback(async (goalId: string, amount: number, contributor: "partner1" | "partner2") => {
    await storage.addGoalContribution(goalId, amount, contributor);
    await refreshData();
  }, [refreshData]);

  const setBudget = useCallback(async (monthlyLimit: number) => {
    const budget = await storage.setBudget(monthlyLimit);
    await refreshData();
    return budget;
  }, [refreshData]);

  const updateCategoryBudget = useCallback(async (category: string, updates: Partial<Omit<CategoryBudget, "id" | "category">>) => {
    const budget = await storage.updateCategoryBudget(category, updates);
    await refreshData();
    return budget;
  }, [refreshData]);

  const processMonthlyRollover = useCallback(async () => {
    await storage.processMonthlyRollover();
    await refreshData();
  }, [refreshData]);

  const addCustomCategory = useCallback(async (name: string, icon: string, color: string) => {
    const category = await storage.addCustomCategory(name, icon, color);
    await refreshData();
    return category;
  }, [refreshData]);

  const deleteCustomCategory = useCallback(async (id: string) => {
    await storage.deleteCustomCategory(id);
    await refreshData();
  }, [refreshData]);

  const addAIInsight = useCallback(async (insight: Omit<AIInsight, "id" | "createdAt" | "isRead" | "isDismissed">) => {
    const newInsight = await storage.addAIInsight(insight);
    await refreshData();
    return newInsight;
  }, [refreshData]);

  const markInsightRead = useCallback(async (id: string) => {
    await storage.markInsightRead(id);
    await refreshData();
  }, [refreshData]);

  const dismissInsight = useCallback(async (id: string) => {
    await storage.dismissInsight(id);
    await refreshData();
  }, [refreshData]);

  const updatePartnerName = useCallback(async (partnerId: "partner1" | "partner2", name: string) => {
    await storage.updatePartnerName(partnerId, name);
    await refreshData();
  }, [refreshData]);

  const completeOnboarding = useCallback(async () => {
    await storage.completeOnboarding();
    await refreshData();
  }, [refreshData]);

  return (
    <AppContext.Provider
      value={{
        data,
        loading,
        refreshData,
        addExpense,
        updateExpense,
        deleteExpense,
        settleExpenses,
        addGoal,
        updateGoal,
        deleteGoal,
        addGoalContribution,
        setBudget,
        updateCategoryBudget,
        processMonthlyRollover,
        addCustomCategory,
        deleteCustomCategory,
        addAIInsight,
        markInsightRead,
        dismissInsight,
        updatePartnerName,
        completeOnboarding,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
}
