export interface Expense {
  id: string;
  amount: number;
  description: string;
  merchant?: string;
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
  | "subscriptions"
  | "pets"
  | "gifts"
  | "personal"
  | "other"
  | string;

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

export interface CategoryBudget {
  id: string;
  category: string;
  monthlyLimit: number;
  isCustom?: boolean;
}

export interface AIInsight {
  id: string;
  type: "saving_tip" | "spending_alert" | "goal_nudge" | "trend_analysis";
  title: string;
  message: string;
  priority: "low" | "medium" | "high";
  actionText?: string;
  actionType?: "view_category" | "add_to_goal" | "review_spending" | "dismiss";
  category?: string;
  amount?: number;
  createdAt: string;
  isRead: boolean;
  isDismissed: boolean;
}

export interface CustomCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
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
  categoryBudgets: CategoryBudget[];
  customCategories: CustomCategory[];
  aiInsights: AIInsight[];
  partners: {
    partner1: Partner;
    partner2: Partner;
  };
  settlements: SettlementRecord[];
  connectedSince: string | null;
  lastInsightCheck?: string;
}

export const DEFAULT_CATEGORIES: ExpenseCategory[] = [
  "groceries",
  "restaurants",
  "utilities",
  "internet",
  "transport",
  "entertainment",
  "shopping",
  "health",
  "travel",
  "home",
  "subscriptions",
  "pets",
  "gifts",
  "personal",
  "food",
  "other",
];

export const CATEGORY_ICONS: Record<string, string> = {
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
  restaurants: "coffee",
  subscriptions: "repeat",
  pets: "heart",
  gifts: "gift",
  personal: "user",
  other: "more-horizontal",
};

export const CATEGORY_LABELS: Record<string, string> = {
  food: "Food & Dining",
  groceries: "Groceries",
  transport: "Transport",
  utilities: "Utilities",
  internet: "Internet",
  entertainment: "Entertainment",
  shopping: "Shopping",
  health: "Health",
  travel: "Travel",
  home: "Home",
  restaurants: "Restaurants",
  subscriptions: "Subscriptions",
  pets: "Pets",
  gifts: "Gifts",
  personal: "Personal Care",
  other: "Other",
};

export const CATEGORY_COLORS: Record<string, string> = {
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
  subscriptions: "#CDB4DB",
  pets: "#FFD93D",
  gifts: "#FF6B6B",
  personal: "#F8B4D9",
  other: "#D4D4D4",
};

export const DEFAULT_CATEGORY_BUDGETS: { category: string; limit: number }[] = [
  { category: "groceries", limit: 600 },
  { category: "restaurants", limit: 300 },
  { category: "utilities", limit: 200 },
  { category: "internet", limit: 100 },
  { category: "transport", limit: 200 },
  { category: "entertainment", limit: 150 },
  { category: "shopping", limit: 200 },
  { category: "health", limit: 100 },
  { category: "subscriptions", limit: 100 },
];

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

export const SPLIT_METHODS: { key: SplitMethod; label: string; description: string }[] = [
  { key: "even", label: "50/50", description: "Split evenly between both partners" },
  { key: "ratio", label: "Custom %", description: "Set custom percentages for each partner" },
  { key: "joint", label: "Joint", description: "Paid from joint account, no split needed" },
];
