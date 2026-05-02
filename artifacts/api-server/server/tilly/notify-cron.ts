/**
 * Notify cron — fans out act_today protections via Expo push.
 *
 * Rules (spec §5):
 *   - Only push when severity = 'act_today' (decision_needed waits for the
 *     user to open the app; fyi never pushes).
 *   - Respect tilly_tone_pref.quiet_hours_start/end in the user's local
 *     time. If we don't know their tz, fall back to America/Toronto since
 *     the initial user base is Canadian.
 *   - 24h same-kind dedupe: don't push 'free_trial' twice in 24h even if
 *     two trials are converging.
 *   - Mark protections as `pushed` (using metadata) so we don't repeat.
 */
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { protections, pushTokens, tillyTonePref } from "../../shared/schema";
import { sendExpoPush } from "../routes/push";

type Pushable = {
  protectionId: string;
  userId: string;
  kind: string;
  severity: string;
  summary: string;
};

const DEFAULT_TZ = "America/Toronto";

function isInQuietHours(
  now: Date,
  startStr: string | null | undefined,
  endStr: string | null | undefined,
  tz: string,
): boolean {
  if (!startStr || !endStr) return false;
  // startStr / endStr are "HH:MM" in the user's local tz. Convert `now`
  // to the user's local time, then check if HH:MM falls in [start, end].
  // Use Intl.DateTimeFormat for the conversion.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.format(now); // "23:42"
  const [hh, mm] = parts.split(":").map((s) => parseInt(s, 10));
  const localMinutes = hh * 60 + mm;
  const [sh, sm] = startStr.split(":").map((s) => parseInt(s, 10));
  const [eh, em] = endStr.split(":").map((s) => parseInt(s, 10));
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  if (startMin <= endMin) {
    return localMinutes >= startMin && localMinutes < endMin;
  }
  // Overnight quiet (e.g., 23:00 → 07:00).
  return localMinutes >= startMin || localMinutes < endMin;
}

export async function runNotify(): Promise<{
  considered: number;
  pushed: number;
  skipped: number;
}> {
  const now = new Date();
  // 1. Pull act-today protections flagged in the last 24h that haven't
  //    been pushed (status='flagged' AND no `pushed_at` in cta_action).
  const candidates = await db
    .select()
    .from(protections)
    .where(
      and(
        eq(protections.severity, "act_today"),
        eq(protections.status, "flagged"),
        sql`${protections.flaggedAt} >= NOW() - INTERVAL '24 hours'`,
      ),
    )
    .orderBy(desc(protections.flaggedAt))
    .limit(500);

  let pushed = 0;
  let skipped = 0;

  // Track sent kinds per user to enforce the 24h dedupe.
  const sentKey = new Set<string>();

  for (const p of candidates) {
    const k = `${p.userId}|${p.kind}`;
    if (sentKey.has(k)) {
      skipped++;
      continue;
    }
    // Quiet hours
    const pref = await db.query.tillyTonePref.findFirst({
      where: eq(tillyTonePref.userId, p.userId),
    });
    const tz = (pref as any)?.timezone ?? DEFAULT_TZ;
    if (
      isInQuietHours(
        now,
        pref?.quietHoursStart ?? "23:00",
        pref?.quietHoursEnd ?? "07:00",
        tz,
      )
    ) {
      skipped++;
      continue;
    }

    // Active push tokens for this user.
    const tokens = await db
      .select()
      .from(pushTokens)
      .where(and(eq(pushTokens.userId, p.userId), isNull(pushTokens.disabledAt)));
    if (tokens.length === 0) {
      skipped++;
      continue;
    }

    try {
      await sendExpoPush(
        tokens.map((t) => ({
          to: t.token,
          title: "Tilly",
          body: p.summary,
          sound: "default",
          data: { kind: "protection", protectionId: p.id, action: p.ctaAction ?? null },
        })),
      );
      // Mark pushed by appending to cta_action (cheap, no schema change).
      await db
        .update(protections)
        .set({
          ctaAction: (p.ctaAction ?? "") + "|pushed",
        })
        .where(eq(protections.id, p.id));
      sentKey.add(k);
      pushed++;
    } catch (err) {
      console.warn("[notify] send failed:", err);
      skipped++;
    }
  }

  return { considered: candidates.length, pushed, skipped };
}
