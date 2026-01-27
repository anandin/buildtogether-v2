import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import type { NotificationPreferences } from "@/types/notifications";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/types/notifications";

const NOTIFICATION_PREFS_KEY = "@notification_preferences";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === "web") {
    return false;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    return false;
  }

  return true;
}

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  try {
    const stored = await AsyncStorage.getItem(NOTIFICATION_PREFS_KEY);
    if (stored) {
      return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...JSON.parse(stored) };
    }
  } catch (error) {
    console.error("Error loading notification preferences:", error);
  }
  return DEFAULT_NOTIFICATION_PREFERENCES;
}

export async function saveNotificationPreferences(prefs: NotificationPreferences): Promise<void> {
  try {
    await AsyncStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(prefs));
  } catch (error) {
    console.error("Error saving notification preferences:", error);
  }
}

export async function scheduleBudgetAlert(
  categoryName: string,
  percentUsed: number,
  amountSpent: number,
  budgetLimit: number
): Promise<string | null> {
  const prefs = await getNotificationPreferences();
  if (!prefs.enabled || !prefs.budgetAlerts) return null;

  const isOverBudget = percentUsed >= 100;
  const title = isOverBudget 
    ? `Budget exceeded: ${categoryName}`
    : `Budget alert: ${categoryName}`;
  const body = isOverBudget
    ? `You've spent $${amountSpent.toFixed(0)} of your $${budgetLimit.toFixed(0)} budget`
    : `You've used ${percentUsed.toFixed(0)}% of your ${categoryName} budget`;

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: { type: "budget_alert", category: categoryName },
    },
    trigger: null, // Immediate
  });

  return id;
}

export async function scheduleSettlementReminder(
  owingPersonName: string,
  owedPersonName: string,
  amount: number
): Promise<string | null> {
  const prefs = await getNotificationPreferences();
  if (!prefs.enabled || !prefs.settlementReminders) return null;

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: "Time to settle up!",
      body: `${owingPersonName} owes ${owedPersonName} $${amount.toFixed(2)}`,
      data: { type: "settlement_reminder" },
    },
    trigger: null,
  });

  return id;
}

export async function scheduleDreamDepositReminder(
  dreamName: string,
  daysSinceDeposit: number
): Promise<string | null> {
  const prefs = await getNotificationPreferences();
  if (!prefs.enabled || !prefs.dreamDepositReminders) return null;

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: "Your dream misses you!",
      body: `It's been ${daysSinceDeposit} days since you contributed to "${dreamName}". Even $5 helps!`,
      data: { type: "dream_reminder", dreamName },
    },
    trigger: null,
  });

  return id;
}

export async function scheduleWeeklySummary(
  totalSpent: number,
  budgetRemaining: number,
  topCategory: string
): Promise<string | null> {
  const prefs = await getNotificationPreferences();
  if (!prefs.enabled || !prefs.weeklySummary) return null;

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: "Your weekly spending recap",
      body: `You spent $${totalSpent.toFixed(0)} this week. Top category: ${topCategory}. Budget remaining: $${budgetRemaining.toFixed(0)}`,
      data: { type: "weekly_summary" },
    },
    trigger: null,
  });

  return id;
}

export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function getScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
  return await Notifications.getAllScheduledNotificationsAsync();
}
