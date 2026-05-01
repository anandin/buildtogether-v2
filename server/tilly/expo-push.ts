/**
 * Expo Push API client.
 *
 * Sends notifications to client devices via Expo's hosted push service:
 * https://docs.expo.dev/push-notifications/sending-notifications/
 *
 * No SDK — just a plain HTTPS POST to /--/api/v2/push/send. Expo
 * recommends batching up to 100 messages per request, but for our
 * fire-reminders cron we'll typically send single-digit pings per
 * tick so we keep it simple and send one-per-call.
 *
 * Auth: Expo Push works without an access token for the free tier
 * (rate-limited per project). Set EXPO_ACCESS_TOKEN in env to opt
 * into authenticated push (higher quota, required for production
 * volume).
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export interface ExpoPushMessage {
  to: string; // ExponentPushToken[xxxx]
  title?: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
  channelId?: string;
}

export interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * Send one push. Never throws — returns null on transport failure
 * with the error logged. The caller (cron) should still mark the
 * reminder as fired so we don't retry forever on a dead token.
 */
export async function sendExpoPush(
  msg: ExpoPushMessage,
): Promise<ExpoPushTicket | null> {
  if (!msg.to || !msg.to.startsWith("ExponentPushToken")) {
    console.warn(`[expo-push] invalid token: ${msg.to?.slice(0, 30)}`);
    return null;
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "Accept-Encoding": "gzip, deflate",
  };
  const accessToken = process.env.EXPO_ACCESS_TOKEN;
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        to: msg.to,
        title: msg.title,
        body: msg.body,
        data: msg.data ?? {},
        sound: msg.sound ?? "default",
        badge: msg.badge,
        channelId: msg.channelId,
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      console.warn(`[expo-push] ${res.status} ${text.slice(0, 300)}`);
      return null;
    }
    let json: { data?: ExpoPushTicket | ExpoPushTicket[] };
    try {
      json = JSON.parse(text);
    } catch {
      console.warn(`[expo-push] non-JSON response: ${text.slice(0, 200)}`);
      return null;
    }
    const ticket = Array.isArray(json.data) ? json.data[0] : json.data;
    return ticket ?? null;
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    console.warn(`[expo-push] threw: ${m}`);
    return null;
  }
}
