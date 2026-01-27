export interface Expense {
  id: string;
  amount: number;
  description: string;
  category: ExpenseCategory;
  date: string;
  paidBy: "partner1" | "partner2" | "joint";
  splitMethod: SplitMethod;
  splitRatio?: number;
  splitAmounts?: {
    partner1: number;
    partner2: number;
  };
  note?: string;
  isRecurring?: boolean;
  recurringFrequency?: "weekly" | "monthly" | "yearly";
  receiptImage?: string;
  isSettled: boolean;
  createdAt: string;
}

export type SplitMethod = "even" | "ratio" | "amount" | "joint" | "single";

export type ExpenseCategory =
  | "food"
  | "groceries"
  | "transport"
  | "utilities"
  | "internet"
  | "entertainment"
  | "shopping"
  | "health"
  | "travel"
  | "home"
  | "restaurants"
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
  color: string;
}

export interface SettlementRecord {
  id: string;
  date: string;
  amount: number;
  from: "partner1" | "partner2";
  to: "partner1" | "partner2";
  expenses: string[];
}

export interface AppData {
  expenses: Expense[];
  goals: Goal[];
  budget: Budget | null;
  partners: {
    partner1: Partner;
    partner2: Partner;
  };
  settlements: SettlementRecord[];
  connectedSince: string | null;
}

export const CATEGORY_ICONS: Record<ExpenseCategory, string> = {
  food: "coffee",
  groceries: "shopping-cart",
  transport: "navigation",
  utilities: "zap",
  internet: "wifi",
  entertainment: "film",
  shopping: "shopping-bag",
  health: "heart",
  travel: "map-pin",
  home: "home",
  restaurants: "utensils",
  other: "more-horizontal",
};

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  food: "Food & Dining",
  groceries: "Groceries",
  transport: "Transport",
  utilities: "Utilities",
  internet: "Internet",
  entertainment: "Entertainment",
  shopping: "Shopping",
  health: "Health",
  travel: "Travel",
  home: "Home improvement",
  restaurants: "Restaurants",
  other: "Other",
};

export const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  food: "#FF9AA2",
  groceries: "#B5EAD7",
  transport: "#C7CEEA",
  utilities: "#FFDAC1",
  internet: "#A2D2FF",
  entertainment: "#B5EAD7",
  shopping: "#FFB7B2",
  health: "#E2F0CB",
  travel: "#C7CEEA",
  home: "#D4A574",
  restaurants: "#FF9AA2",
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

export const SPLIT_METHODS: { key: SplitMethod; label: string }[] = [
  { key: "even", label: "Even" },
  { key: "ratio", label: "Ratio" },
  { key: "amount", label: "Amount" },
  { key: "joint", label: "Joint" },
];
