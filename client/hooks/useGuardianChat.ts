import { useState, useCallback } from "react";
import { apiRequest } from "@/lib/query-client";
import { useAuth } from "@/context/AuthContext";
import { useApp } from "@/context/AppContext";
import { addExpense as cloudAddExpense } from "@/lib/cloudStorage";

export interface GuardianMessage {
  id: string;
  role: "guardian" | "user";
  content: string;
  type?: "greeting" | "confirmation" | "nudge" | "alert" | "celebration" | "error";
  timestamp: number;
  parsedExpense?: ParsedExpense | null;
  budgetAlert?: string | null;
  autoSaved?: boolean;
  savedExpense?: any;
}

export interface ParsedExpense {
  amount: number | null;
  merchant: string | null;
  category: string;
  description: string;
  paidBy: string;
  splitMethod: string;
}

interface QuickAddResponse {
  parsed: ParsedExpense;
  confidence: number;
  guardianMessage: string;
  clarificationQuestion: string | null;
  budgetAlert: string | null;
  autoSaved: boolean;
  savedExpense: any;
}

export function useGuardianChat() {
  const [messages, setMessages] = useState<GuardianMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingExpense, setPendingExpense] = useState<ParsedExpense | null>(null);
  const { user } = useAuth();
  const { refreshData } = useApp();

  const addMessage = useCallback((msg: Omit<GuardianMessage, "id" | "timestamp">) => {
    const message: GuardianMessage = {
      ...msg,
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev.slice(-4), message]); // Keep last 5 messages
    return message;
  }, []);

  const setGreeting = useCallback((greeting: string) => {
    setMessages(prev => {
      // Replace existing greeting or add new one
      const withoutGreeting = prev.filter(m => m.type !== "greeting");
      return [{
        id: "greeting",
        role: "guardian" as const,
        content: greeting,
        type: "greeting" as const,
        timestamp: Date.now(),
      }, ...withoutGreeting.slice(-3)];
    });
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || !user?.coupleId) return;

    // Add user message
    addMessage({ role: "user", content: text.trim() });

    setIsProcessing(true);
    try {
      const response = await apiRequest("POST", "/api/guardian/quick-add", {
        text: text.trim(),
        coupleId: user.coupleId,
      });

      const data: QuickAddResponse = await response.json();

      if (data.clarificationQuestion) {
        // Guardian needs more info
        addMessage({
          role: "guardian",
          content: data.clarificationQuestion,
          type: "confirmation",
        });
        setPendingExpense(null);
      } else if (data.autoSaved) {
        // Small expense auto-saved
        addMessage({
          role: "guardian",
          content: data.guardianMessage,
          type: "celebration",
          autoSaved: true,
          savedExpense: data.savedExpense,
          budgetAlert: data.budgetAlert,
        });
        setPendingExpense(null);
        refreshData();
      } else {
        // Show confirmation for larger expenses
        const confirmMsg = data.budgetAlert
          ? `${data.guardianMessage}\n\n${data.budgetAlert}`
          : data.guardianMessage;

        addMessage({
          role: "guardian",
          content: confirmMsg,
          type: "confirmation",
          parsedExpense: data.parsed,
          budgetAlert: data.budgetAlert,
        });
        setPendingExpense(data.parsed);
      }
    } catch (error: any) {
      addMessage({
        role: "guardian",
        content: "Hmm, I couldn't process that. Try something like \"$45 groceries at Trader Joe's\"",
        type: "error",
      });
    } finally {
      setIsProcessing(false);
    }
  }, [user, addMessage, refreshData]);

  const confirmExpense = useCallback(async () => {
    if (!pendingExpense || !user?.coupleId) return;

    try {
      const today = new Date().toISOString().split("T")[0];
      await cloudAddExpense({
        amount: pendingExpense.amount || 0,
        description: pendingExpense.description,
        merchant: pendingExpense.merchant || undefined,
        category: pendingExpense.category as any,
        date: today,
        paidBy: pendingExpense.paidBy as any,
        splitMethod: pendingExpense.splitMethod as any,
        isSettled: false,
      });

      // Update the last guardian message to celebration
      setMessages(prev => {
        const updated = [...prev];
        const lastGuardianIdx = updated.findLastIndex(m => m.role === "guardian");
        if (lastGuardianIdx >= 0) {
          updated[lastGuardianIdx] = {
            ...updated[lastGuardianIdx],
            type: "celebration",
            content: "Saved! " + updated[lastGuardianIdx].content.split("\n")[0],
            parsedExpense: null,
          };
        }
        return updated;
      });

      setPendingExpense(null);
      refreshData();
    } catch (error) {
      addMessage({
        role: "guardian",
        content: "Couldn't save that expense. Please try again.",
        type: "error",
      });
    }
  }, [pendingExpense, user, addMessage, refreshData]);

  const dismissExpense = useCallback(() => {
    setPendingExpense(null);
    setMessages(prev => {
      const updated = [...prev];
      const lastGuardianIdx = updated.findLastIndex(m => m.role === "guardian");
      if (lastGuardianIdx >= 0) {
        updated[lastGuardianIdx] = {
          ...updated[lastGuardianIdx],
          parsedExpense: null,
        };
      }
      return updated;
    });
  }, []);

  const undoAutoSave = useCallback(async (expenseId: string) => {
    if (!user?.coupleId) return;
    try {
      await apiRequest("DELETE", `/api/expenses/${user.coupleId}/${expenseId}`);
      setMessages(prev => prev.filter(m => m.savedExpense?.id !== expenseId));
      refreshData();
    } catch (error) {
      console.error("Failed to undo expense:", error);
    }
  }, [user, refreshData]);

  return {
    messages,
    isProcessing,
    pendingExpense,
    sendMessage,
    confirmExpense,
    dismissExpense,
    undoAutoSave,
    setGreeting,
  };
}
