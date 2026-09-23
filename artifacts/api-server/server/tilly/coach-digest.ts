/**
 * Coach automation loop.
 *
 * Hourly cron. For each household whose local time is in the morning
 * window (08:00–10:59) and who has not already received today's digest:
 *   - refresh recurring detection from transaction history
 *   - if a daily habit was missed yesterday, nudge
 *   - else if a bill lands in the next 3 days, nudge
 *   - else if the pending queue is a pile, nudge
 *   - else send a short morning digest
 *
 * Writes `coach_digests` (idempotent per user/day/kind), emits an L1
 * event, and pushes when a token exists and quiet hours allow it.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  coachDigests,
  plaidTransactions,
  subscriptions,
  tillyTonePref,
  users,
} from "../../shared/schema";
import { emitEventAsync } from "./event-emitter";
import { sendExpoPush } from "./expo-push";
import { listHabits, suggestHabits } from "./habits-service";
import { scanSubscriptions } from "./subscription-detect";
import { cityToTimezone, localDateString } from "./user-tz";

export type DigestRun = {
  considered: number;
  sent: number;
  quiet: number;
  skipped: number;
  scanned: number;
};

function localHour(now: Date, tz: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    hour12: false,
  });
  const h = parseInt(fmt.format(now), 10);
  return h === 24 ? 0 : h;
}

function localMinutes(now: Date, tz: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const [hh, mm] = fmt.format(now).split(":").map((s) => parseInt(s, 10));
  const hour = hh === 24 ? 0 : hh;
  return (hour ?? 0) * 60 + (mm ?? 0);
}

function inQuietHours(now: Date, start: string | null, end: string | null, tz: string): boolean {
  if (!start || !end) return false;
  const cur = localMinutes(now, tz);
  const [sh, sm] = start.split(":").map((s) => parseInt(s, 10));
  const [eh, em] = end.split(":").map((s) => parseInt(s, 10));
  const startMin = (sh ?? 0) * 60 + (sm ?? 0);
  const endMin = (eh ?? 0) * 60 + (em ?? 0);
  if (startMin <= endMin) return cur >= startMin && cur < endMin;
  return cur >= startMin || cur < endMin;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type Note = { kind: "morning" | "habit_break" | "bill_loom" | "anomaly"; title: string; body: string };

async function noteFor(userId: string, householdId: string, todayIso: string): Promise<Note> {
  const habits = await listHabits(householdId, userId);
  const broken = habits.find((h) => h.cadence === "daily" && h.due && h.currentStreak === 0 && h.bestStreak > 0);
  if (broken) {
    return {
      kind: "habit_break",
      title: `${broken.title} slipped`,
      body: `The streak reset. One check-in today starts it again.`,
    };
  }
  const due = habits.find((h) => h.due);
  if (due && due.cadence === "daily") {
    return {
      kind: "habit_break",
      title: due.title,
      body: due.currentStreak > 0
        ? `Day ${due.currentStreak + 1} is open. A check-in keeps the streak.`
        : `Still open today. A check-in is enough.`,
    };
  }

  const horizon = addDays(todayIso, 3);
  const subs = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.householdId, householdId), eq(subscriptions.status, "active")));
  const looming = subs
    .filter((s) => s.nextChargeAt && s.nextChargeAt.slice(0, 10) >= todayIso && s.nextChargeAt.slice(0, 10) <= horizon)
    .sort((a, b) => (a.nextChargeAt ?? "").localeCompare(b.nextChargeAt ?? ""));
  if (looming[0]) {
    const bill = looming[0];
    return {
      kind: "bill_loom",
      title: `${bill.merchant} is close`,
      body: `About $${Math.round(bill.amount)} posts ${bill.nextChargeAt?.slice(0, 10)}.`,
    };
  }

  const pending = await db
    .select({ id: plaidTransactions.id })
    .from(plaidTransactions)
    .where(
      and(
        eq(plaidTransactions.coupleId, householdId),
        eq(plaidTransactions.status, "pending_review"),
      ),
    );
  if (pending.length >= 5) {
    return {
      kind: "anomaly",
      title: `${pending.length} transactions need a look`,
      body: "I held back the ones I'm not sure about. A short review teaches the next sync.",
    };
  }

  const ideas = await suggestHabits(householdId, userId);
  if (habits.length === 0 && ideas[0]) {
    emitEventAsync({
      userId,
      householdId,
      kind: "habit_suggested",
      payload: { suggestions: ideas.map((s) => ({ kind: s.kind, title: s.title, reason: s.reason })) },
    });
    return {
      kind: "morning",
      title: ideas[0].title,
      body: ideas[0].reason,
    };
  }

  const open = due?.title;
  return {
    kind: "morning",
    title: "Morning money note",
    body: open
      ? `${open} is the one thing I'd do today.`
      : "Nothing is on fire. Glance at the week when you have a minute.",
  };
}

export async function runCoachDigests(now = new Date(), opts?: { force?: boolean }): Promise<DigestRun> {
  const summary: DigestRun = { considered: 0, sent: 0, quiet: 0, skipped: 0, scanned: 0 };
  const people = await db
    .select({
      id: users.id,
      coupleId: users.coupleId,
      expoPushToken: users.expoPushToken,
      city: users.city,
    })
    .from(users)
    .where(sql`${users.coupleId} IS NOT NULL`)
    .limit(200);

  const scannedHouseholds = new Set<string>();

  for (const person of people) {
    if (!person.coupleId) continue;
    summary.considered += 1;
    const tz = cityToTimezone(person.city);
    const hour = localHour(now, tz);
    if (!opts?.force && (hour < 8 || hour > 10)) {
      summary.skipped += 1;
      continue;
    }
    const todayIso = localDateString(now, tz);
    const already = await db
      .select({ id: coachDigests.id })
      .from(coachDigests)
      .where(and(eq(coachDigests.userId, person.id), eq(coachDigests.digestDate, todayIso)))
      .limit(1);
    if (already.length) {
      summary.skipped += 1;
      continue;
    }

    if (!scannedHouseholds.has(person.coupleId)) {
      scannedHouseholds.add(person.coupleId);
      try {
        await scanSubscriptions(person.coupleId, { includePlaidApi: false });
        summary.scanned += 1;
      } catch (err) {
        console.warn("[coach-digest] subscription scan failed:", err);
      }
    }

    let note: Note;
    try {
      note = await noteFor(person.id, person.coupleId, todayIso);
    } catch (err) {
      console.warn("[coach-digest] note failed:", err);
      summary.skipped += 1;
      continue;
    }

    const [pref] = await db
      .select()
      .from(tillyTonePref)
      .where(eq(tillyTonePref.userId, person.id))
      .limit(1);
    const quiet = inQuietHours(
      now,
      pref?.quietHoursStart ?? "23:00",
      pref?.quietHoursEnd ?? "07:00",
      tz,
    );

    let status: "sent" | "quiet" | "logged" = "logged";
    if (!quiet && person.expoPushToken) {
      const ticket = await sendExpoPush({
        to: person.expoPushToken,
        title: "Tilly",
        body: `${note.title}. ${note.body}`,
        data: { kind: note.kind, digestDate: todayIso },
      });
      status = ticket?.status === "ok" ? "sent" : "logged";
    } else if (quiet) {
      status = "quiet";
    }

    await db
      .insert(coachDigests)
      .values({
        householdId: person.coupleId,
        userId: person.id,
        digestDate: todayIso,
        kind: note.kind,
        title: note.title,
        body: note.body,
        status,
      })
      .onConflictDoNothing();

    emitEventAsync({
      userId: person.id,
      householdId: person.coupleId,
      kind: "coach_digest_sent",
      payload: { digestKind: note.kind, title: note.title, body: note.body, status },
      sourceTable: "coach_digests",
    });
    if (note.kind === "habit_break" || note.kind === "bill_loom" || note.kind === "anomaly") {
      emitEventAsync({
        userId: person.id,
        householdId: person.coupleId,
        kind: "automation_nudge",
        payload: { digestKind: note.kind, title: note.title },
      });
    }

    if (status === "quiet") summary.quiet += 1;
    else summary.sent += 1;
  }

  return summary;
}
