import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { AIFeedback, AIFeedbackType } from "@/components/AIFeedbackToast";

interface AIFeedbackContextType {
  currentFeedback: AIFeedback | null;
  showFeedback: (feedback: Omit<AIFeedback, "id">) => void;
  showCelebration: (title: string, message: string, actionLabel?: string, onAction?: () => void) => void;
  showInsight: (title: string, message: string, actionLabel?: string, onAction?: () => void) => void;
  showWarning: (title: string, message: string, actionLabel?: string, onAction?: () => void) => void;
  showSuggestion: (title: string, message: string, actionLabel?: string, onAction?: () => void) => void;
  showLearning: (title: string, message: string) => void;
  dismissFeedback: () => void;
}

const AIFeedbackContext = createContext<AIFeedbackContextType | undefined>(undefined);

let feedbackIdCounter = 0;

export function AIFeedbackProvider({ children }: { children: ReactNode }) {
  const [currentFeedback, setCurrentFeedback] = useState<AIFeedback | null>(null);
  const [queue, setQueue] = useState<AIFeedback[]>([]);

  const processQueue = useCallback(() => {
    setQueue((prevQueue) => {
      if (prevQueue.length > 0) {
        const [next, ...rest] = prevQueue;
        setCurrentFeedback(next);
        return rest;
      }
      return prevQueue;
    });
  }, []);

  const showFeedback = useCallback((feedback: Omit<AIFeedback, "id">) => {
    const newFeedback: AIFeedback = {
      ...feedback,
      id: `feedback-${++feedbackIdCounter}`,
      autoDismissMs: feedback.autoDismissMs || (feedback.actionLabel ? undefined : 5000),
    };

    if (currentFeedback) {
      setQueue((prev) => [...prev, newFeedback]);
    } else {
      setCurrentFeedback(newFeedback);
    }
  }, [currentFeedback]);

  const showCelebration = useCallback((
    title: string,
    message: string,
    actionLabel?: string,
    onAction?: () => void
  ) => {
    showFeedback({
      type: "celebration",
      title,
      message,
      actionLabel,
      onAction,
      autoDismissMs: actionLabel ? undefined : 4000,
    });
  }, [showFeedback]);

  const showInsight = useCallback((
    title: string,
    message: string,
    actionLabel?: string,
    onAction?: () => void
  ) => {
    showFeedback({
      type: "insight",
      title,
      message,
      actionLabel,
      onAction,
    });
  }, [showFeedback]);

  const showWarning = useCallback((
    title: string,
    message: string,
    actionLabel?: string,
    onAction?: () => void
  ) => {
    showFeedback({
      type: "warning",
      title,
      message,
      actionLabel,
      onAction,
    });
  }, [showFeedback]);

  const showSuggestion = useCallback((
    title: string,
    message: string,
    actionLabel?: string,
    onAction?: () => void
  ) => {
    showFeedback({
      type: "suggestion",
      title,
      message,
      actionLabel,
      onAction,
    });
  }, [showFeedback]);

  const showLearning = useCallback((title: string, message: string) => {
    showFeedback({
      type: "learning",
      title,
      message,
      autoDismissMs: 3000,
    });
  }, [showFeedback]);

  const dismissFeedback = useCallback(() => {
    setCurrentFeedback(null);
    setTimeout(processQueue, 300);
  }, [processQueue]);

  return (
    <AIFeedbackContext.Provider
      value={{
        currentFeedback,
        showFeedback,
        showCelebration,
        showInsight,
        showWarning,
        showSuggestion,
        showLearning,
        dismissFeedback,
      }}
    >
      {children}
    </AIFeedbackContext.Provider>
  );
}

export function useAIFeedback() {
  const context = useContext(AIFeedbackContext);
  if (!context) {
    throw new Error("useAIFeedback must be used within an AIFeedbackProvider");
  }
  return context;
}
