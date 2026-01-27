import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import type { AppData, Expense, Goal, Budget } from "@/types";
import * as storage from "@/lib/storage";

interface AppContextType {
  data: AppData | null;
  loading: boolean;
  refreshData: () => Promise<void>;
  addExpense: (expense: Omit<Expense, "id" | "createdAt">) => Promise<Expense>;
  updateExpense: (expense: Expense) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  settleExpenses: (expenseIds: string[], from: "partner1" | "partner2", to: "partner1" | "partner2", amount: number) => Promise<void>;
  addGoal: (goal: Omit<Goal, "id" | "createdAt" | "contributions" | "savedAmount">) => Promise<Goal>;
  updateGoal: (goal: Goal) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  addGoalContribution: (goalId: string, amount: number, contributor: "partner1" | "partner2") => Promise<void>;
  setBudget: (monthlyLimit: number) => Promise<Budget>;
  updatePartnerName: (partnerId: "partner1" | "partner2", name: string) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshData = useCallback(async () => {
    const loadedData = await storage.loadAppData();
    setData(loadedData);
    setLoading(false);
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

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

  const updatePartnerName = useCallback(async (partnerId: "partner1" | "partner2", name: string) => {
    await storage.updatePartnerName(partnerId, name);
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
        updatePartnerName,
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
