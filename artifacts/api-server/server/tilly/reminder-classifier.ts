/**
 * Reminder classifier — runs after every Tilly chat reply to ask "did
 * Tilly just promise a follow-up?" If yes, return a structured reminder
 * draft. If no, return null.
 *
 * Why a separate call rather than inline tags in the chat reply: the
 * persona prompt is large and chat models (Sonnet/Opus) are inconsistent
 * about emitting structured markup mid-conversation. A dedicated cheap
 * call (Haiku 4.5) on the visible reply text is more reliable. ~250
 * input tokens + 50 output tokens per chat turn — small fraction of the
 * main reply cost.
 *
 * Returns null when nothing to schedule. Never throws.
 */
import { z } from "zod";
import { OpenRouterLLM } from "./llm/openrouter";

// All fields tolerate omission so Haiku's frequent "no-reminder ⇒ {}"
// or partial replies don't blow up validation. The downstream checks in
// extractReminderFromReply (`!result.hasReminder || !result.fireAtIso ||
// !result.label`) treat missing fields as "no reminder", which is the
// safe default — false negatives are fine, false positives ping the
// student about something they never asked for.
const ReminderDraftSchema = z.object({
  hasReminder: z
    .boolean()
    .optional()
    .default(false)
    .describe("True only if Tilly explicitly promised to remind/ping/track."),
  fireAtIso: z
    .string()
    .nullable()
    .optional()
    .describe(
      "ISO-8601 timestamp when the reminder should fire. If Tilly named a specific day/time, use that. If 'tomorrow', use 19:00 local next day. Null if no reminder.",
    ),
  label: z
    .string()
    .nullable()
    .optional()
    .describe(
      "Short notification body (~12 words). What Tilly will say when the reminder fires. Null if no reminder.",
    ),
  kind: z
    .enum([
      "ticket-day-check",
      "rent-due",
      "soft-spot-eve",
      "subscription-cancel",
      "free-trial-end",
      "generic",
    ])
    .optional()
    .default("generic")
    .describe("Best-fit category for the reminder."),
});

export type ReminderDraft = {
  fireAt: Date;
  label: string;
  kind: string;
};

const SYSTEM = `You decide whether a financial agent named Tilly just promised the student a follow-up reminder.

Rule of thumb: if Tilly's reply contains a first-person commitment to act at a future time — "I'll ping you", "I'll nudge you", "I'll remind you", "I'll check in", "I'll track this", "Already set", "Adjusted", "Locked in", "On it" combined with a time reference — then hasReminder=true. Resolve the time even if it's vague (e.g. "Wednesday afternoon" → 15:00 local that day; "Friday morning" → 09:00; "tomorrow evening" → 19:00; "before ticket day" → 24h before).

Examples that ARE reminders (return hasReminder=true):
- "I'll ping you Friday morning before tickets drop." → next Friday 09:00 local
- "I'll nudge you Wednesday afternoon." → next Wednesday 15:00 local
- "Adjusted - I'll ping you Wednesday evening specifically about food delivery." → next Wednesday 19:00 local
- "Already set. I'll nudge you Wednesday afternoon." → next Wednesday 15:00 local
- "Already on it. I'll track this and ping you before ticket day." → 24h before
- "Want me to remind you tomorrow night? Yes" → tomorrow 19:00 local
- "Locked in - I'll check in tomorrow morning." → tomorrow 09:00 local

Examples that are NOT reminders (return hasReminder=false):
- "You can do it." (advice, not a promise)
- "Want me to track this?" (offer asked but not yet accepted — wait for confirmation)
- "Let me know if you change your mind." (passive)
- "Set a $30 ceiling on Friday food" (a setting, not a reminder)
- "Skip Starbucks today." (in-the-moment instruction, no future commitment)

When in doubt about a clear "I'll ping/nudge/remind you [time]" phrase: flag it. Missing a real reminder is worse than capturing an extra one — students explicitly asked for these.

Today is {NOW}. Resolve relative dates (tomorrow, Friday, "before ticket day") to ISO-8601 timestamps in the student's timezone (assume America/Toronto unless told otherwise).

Important: in the label field, use ASCII characters only. No em-dashes, no smart quotes, no curly apostrophes. Use plain "-" and "'" instead. The label is rendered through layers that don't always handle UTF-8 cleanly.

Respond with EXACTLY this JSON shape — no markdown, no prose, no extra fields, no \`\`\`json fences. The field names must match exactly:

{
  "hasReminder": true,
  "fireAtIso": "2026-05-06T19:00:00-04:00",
  "label": "Check spending before dinner",
  "kind": "soft-spot-eve"
}

When there is no reminder, return:

{
  "hasReminder": false,
  "fireAtIso": null,
  "label": null,
  "kind": "generic"
}

"kind" must be one of: "ticket-day-check", "rent-due", "soft-spot-eve", "subscription-cancel", "free-trial-end", "generic".`;

export async function extractReminderFromReply(
  tillyReply: string,
  userMessage: string,
  meta?: { userId?: string | null },
): Promise<ReminderDraft | null> {
  if (!tillyReply.trim()) return null;
  // Cheap pre-filter — if the reply has no reminder-shaped phrases, skip the
  // LLM call entirely. Saves a token on every "yeah", "no", thank-you turn.
  if (
    !/\b(remind|ping|track|follow.up|check in|ping you|nudge you)\b/i.test(
      tillyReply,
    )
  ) {
    return null;
  }
  try {
    const llm = new OpenRouterLLM("anthropic/claude-haiku-4.5");
    const now = new Date();
    const result = await llm.structuredOutput<z.infer<typeof ReminderDraftSchema>>({
      systemPrompts: [SYSTEM.replace("{NOW}", now.toISOString())],
      messages: [
        {
          role: "user",
          content: `Student said: ${userMessage}\n\nTilly replied: ${tillyReply}\n\nDid Tilly promise a follow-up reminder?`,
        },
      ],
      schema: ReminderDraftSchema,
      schemaName: "reminder_draft",
      maxTokens: 200,
      meta: { userId: meta?.userId ?? null, route: "reminder" },
    });
    if (!result.hasReminder || !result.fireAtIso || !result.label) return null;
    const fireAt = new Date(result.fireAtIso);
    if (isNaN(fireAt.getTime())) return null;
    if (fireAt.getTime() < Date.now() - 60_000) return null; // past
    if (fireAt.getTime() > Date.now() + 90 * 24 * 60 * 60 * 1000) return null; // > 90d out
    return { fireAt, label: result.label, kind: result.kind };
  } catch (err) {
    console.warn("[reminder-classifier] failed, skipping:", err);
    return null;
  }
}
