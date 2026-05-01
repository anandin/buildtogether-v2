import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import type { NotificationPreferences } from "@/types/notifications";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/types/notifications";
import { apiRequest } from "@/lib/query-client";

const NOTIFICATION_PREFS_KEY = "@notification_preferences";
const EXPO_PUSH_TOKEN_KEY = "@expo_push_token_synced";

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

/**
 * Register for an Expo Push Token and sync it to the server. Idempotent
 * — only POSTs to the server when the token actually changes since the
 * last sync (cached in AsyncStorage).
 *
 * Tilly's fire-reminders cron uses this token to deliver push pings at
 * each reminder's fireAt time. Returns the token on success, null when
 * push is unavailable (web, simulator, denied permission, missing
 * project id).
 */
export async function registerForExpoPushToken(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  // Simulators / emulators can't receive real push tokens — Expo's
  // getExpoPushTokenAsync throws there, which we swallow below. We
  // don't gate explicitly on isDevice (would need expo-device dep)
  // because the try/catch handles it cleanly.
  const granted = await requestNotificationPermissions();
  if (!granted) return null;

  // Android needs an explicit channel before we can show foreground
  // notifications. Idempotent — re-creating with the same id is a no-op.
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#7C3AED",
    });
  }

  // Expo's push service requires the EAS project id so it knows which
  // project to route to. Pulled from app.json -> expo.extra.eas.projectId
  // (which Constants exposes at runtime).
  const projectId =
    (Constants?.expoConfig as any)?.extra?.eas?.projectId ??
    (Constants as any)?.easConfig?.projectId ??
    undefined;

  let token: string;
  try {
    const result = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    token = result.data;
  } catch (err) {
    console.warn("[push] getExpoPushTokenAsync failed:", err);
    return null;
  }
  if (!token) return null;

  // Skip the network round trip if the token hasn't changed.
  try {
    const cached = await AsyncStorage.getItem(EXPO_PUSH_TOKEN_KEY);
    if (cached === token) return token;
  } catch {
    // ignore cache errors — we'll just send.
  }

  try {
    await apiRequest("PUT", "/api/tilly/me/push-token", { token });
    await AsyncStorage.setItem(EXPO_PUSH_TOKEN_KEY, token);
  } catch (err) {
    console.warn("[push] failed to sync token to server:", err);
    return null;
  }
  return token;
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
