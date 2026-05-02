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

const ReminderDraftSchema = z.object({
  hasReminder: z
    .boolean()
    .describe("True only if Tilly explicitly promised to remind/ping/track."),
  fireAtIso: z
    .string()
    .nullable()
    .describe(
      "ISO-8601 timestamp when the reminder should fire. If Tilly named a specific day/time, use that. If 'tomorrow', use 19:00 local next day. Null if no reminder.",
    ),
  label: z
    .string()
    .nullable()
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
    .describe("Best-fit category for the reminder."),
});

export type ReminderDraft = {
  fireAt: Date;
  label: string;
  kind: string;
};

const SYSTEM = `You decide whether a financial agent named Tilly just promised the student a follow-up reminder.

Tilly does NOT have a reminder system unless YOU say so. Be conservative — flag only when she explicitly says she'll ping/track/remind/check-in/follow-up at a specific future time.

Examples that ARE reminders:
- "I'll ping you Friday morning before tickets drop." → fireAt = next Friday 09:00 local
- "Already on it. I'll track this and ping you before ticket day." → infer ~24h before ticket day
- "Want me to remind you tomorrow night? Yes" → tomorrow 19:00 local

Examples that are NOT reminders (don't flag):
- "You can do it." (advice, not a promise)
- "Want me to track this?" (offer, not a promise — only flag once she confirms or commits)
- "Let me know if you change your mind." (passive)
- "Set a $30 ceiling on Friday food" (a setting, not a reminder)

If unsure: hasReminder=false. False positives are worse than false negatives — students don't want surprise pings they didn't ask for.

Today is {NOW}. Resolve relative dates (tomorrow, Friday, "before ticket day") to ISO-8601 timestamps in the student's timezone (assume America/Toronto unless told otherwise).

Important: in the label field, use ASCII characters only. No em-dashes, no smart quotes, no curly apostrophes. Use plain "-" and "'" instead. The label is rendered through layers that don't always handle UTF-8 cleanly.`;

export async function extractReminderFromReply(
  tillyReply: string,
  userMessage: string,
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
