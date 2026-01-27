export interface NotificationPreferences {
  enabled: boolean;
  budgetAlerts: boolean;
  settlementReminders: boolean;
  dreamDepositReminders: boolean;
  weeklySummary: boolean;
  dailyReminder: boolean;
  dailyReminderTime: string; // HH:MM format
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: true,
  budgetAlerts: true,
  settlementReminders: true,
  dreamDepositReminders: true,
  weeklySummary: true,
  dailyReminder: false,
  dailyReminderTime: "20:00",
};

export interface ScheduledNotification {
  id: string;
  type: "budget_alert" | "settlement_reminder" | "dream_reminder" | "weekly_summary" | "daily_reminder";
  title: string;
  body: string;
  scheduledTime: string;
  data?: Record<string, any>;
}
