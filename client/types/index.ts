export interface Expense {
  id: string;
  amount: number;
  description: string;
  category: ExpenseCategory;
  date: string;
  paidBy: "partner1" | "partner2";
  splitMethod: "equal" | "custom" | "single";
  splitAmount?: number;
  receiptImage?: string;
  createdAt: string;
}

export type ExpenseCategory =
  | "food"
  | "transport"
  | "utilities"
  | "entertainment"
  | "shopping"
  | "health"
  | "travel"
  | "home"
  | "other";

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  savedAmount: number;
  emoji: string;
  color: string;
  createdAt: string;
  contributions: GoalContribution[];
}

export interface GoalContribution {
  id: string;
  amount: number;
  date: string;
  contributor: "partner1" | "partner2";
}

export interface Budget {
  id: string;
  monthlyLimit: number;
  month: string;
  year: number;
}

export interface Partner {
  id: "partner1" | "partner2";
  name: string;
  avatar: string;
}

export interface AppData {
  expenses: Expense[];
  goals: Goal[];
  budget: Budget | null;
  partners: {
    partner1: Partner;
    partner2: Partner;
  };
  connectedSince: string | null;
}

export const CATEGORY_ICONS: Record<ExpenseCategory, string> = {
  food: "coffee",
  transport: "navigation",
  utilities: "zap",
  entertainment: "film",
  shopping: "shopping-bag",
  health: "heart",
  travel: "map-pin",
  home: "home",
  other: "more-horizontal",
};

export const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  food: "#FF9AA2",
  transport: "#C7CEEA",
  utilities: "#FFDAC1",
  entertainment: "#B5EAD7",
  shopping: "#FFB7B2",
  health: "#E2F0CB",
  travel: "#C7CEEA",
  home: "#FFDAC1",
  other: "#D4D4D4",
};

export const GOAL_COLORS = [
  "#FF9AA2",
  "#C7CEEA",
  "#B5EAD7",
  "#FFDAC1",
  "#FFB7B2",
  "#E2F0CB",
  "#A2D2FF",
  "#CDB4DB",
];

export const GOAL_EMOJIS = [
  "home",
  "sun",
  "globe",
  "gift",
  "star",
  "heart",
  "award",
  "umbrella",
];
