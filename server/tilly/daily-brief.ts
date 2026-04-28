/**
 * Daily brief — generates the BTHome hero copy.
 *
 * Spec §4.1: "The number that matters today is *breathing room*, not balance."
 *
 * Output shape (consumed by GET /api/tilly/today):
 *   {
 *     greeting:        "Hey Maya.",
 *     dayLabel:        "Tuesday morning" | "Tuesday · 9:18 pm",
 *     breathing:       312,                 // post-rent, pre-paycheck buffer
 *     afterRent:       412.58,              // big serif number
 *     paycheckCopy:    "After Thursday rent · Friday paycheck +$612",
 *     subscriptionTile?: { merchant, amount, sub, cta },  // most-urgent unused sub
 *     dreamTile?:        { name, sub, saved, target },    // most-active dream
 *     tillyInvite:      "Anything you want to think through?",
 *   }
 *
 * The phrasing fields (`greeting`, `tillyInvite`) come from Claude Opus 4.7
 * with the persona+tone blocks. The numeric fields and `dayLabel` are
 * deterministic — computed from household ledger state, not generated.
 *
 * Phase 2 lands the Claude-generated greeting/invite + day label.
 * Numeric fields are pulled from data already in the schema; rich Plaid-
 * driven values (subscriptionTile from `subscriptions`, real balance from
 * `plaid_transactions`) light up in Phase 4.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import {
  TILLY_MODEL,
  TILLY_DEFAULT_MAX_TOKENS,
  personaSystemBlock,
  toneSystemBlock,
  tilly,
} from "./persona";
import type { BTToneKey } from "./tone";

// ─── Output shape ──────────────────────────────────────────────────────────

export type DailyBrief = {
  greeting: string;
  dayLabel: string;
  breathing: number;
  afterRent: number;
  paycheckCopy: string;
  subscriptionTile?: {
    merchant: string;
    amount: number;
    usageNote: string;
    ctaLabel: string;
    subscriptionId: string;
  };
  dreamTile?: {
    name: string;
    autoSaveCopy: string;
    saved: number;
    target: number;
  };
  tillyInvite: string;
};

// ─── Input shape ───────────────────────────────────────────────────────────

export type DailyBriefInput = {
  userId: string;
  householdId: string;
  /** Display name for the greeting ("Hey Maya."). */
  name: string;
  tone: BTToneKey;
  /** ISO timestamp; lets us compute morning/evening + day name. */
  now: string;
  /**
   * Already-computed ledger snapshot. The route handler is responsible for
   * pulling the right numbers from Plaid + bills + paycheck cadence; the
   * brief just renders them.
   */
  numbers: {
    /** Post-rent, pre-paycheck buffer (the headline). */
    breathing: number;
    /** Balance after the next bill clears. */
    afterRent: number;
    /** Paycheck copy line, e.g. "After Thursday rent · Friday paycheck +$612". */
    paycheckCopy: string;
  };
  /** Most-urgent unused subscription, if any. */
  subscriptionTile?: DailyBrief["subscriptionTile"];
  /** Most-active dream, if any. */
  dreamTile?: DailyBrief["dreamTile"];
  /** Recent memory snippets so Tilly can be specific in greeting. */
  recentMemorySnippets: string[];
};

// ─── Phrasing schema (the only Claude-generated bits) ─────────────────────

const PhrasingSchema = z.object({
  greeting: z
    .string()
    .describe(
      "Tone-appropriate greeting. Sibling: 'Hey {name}.'. Coach: 'Morning, {name}.' (or 'Evening, {name}.'). Quiet: '{name},'. 1 line, no emoji.",
    ),
  bodyLine: z
    .string()
    .describe(
      "ONE sentence sub-headline that puts the breathing-room number in editorial-fintech voice. Use the literal markdown italics around the number, e.g. 'You have *$312* of breathing room this week.' If the number is 0 or negative, say something gentler. NO emoji, NO 'budget' as a verb.",
    ),
  tillyInvite: z
    .string()
    .describe(
      "Italic invite at the bottom of Home. 1 short sentence ending the student wants to tap. e.g. 'Anything you want to think through?' / 'Tell me what's on your mind.' Tone-appropriate.",
    ),
});

// ─── Implementation ────────────────────────────────────────────────────────

function dayLabel(nowIso: string): string {
  const d = new Date(nowIso);
  const day = d.toLocaleDateString("en-US", { weekday: "long" });
  const hour = d.getHours();
  if (hour < 12) return `${day} morning`;
  if (hour < 18) return `${day} afternoon`;
  // "Friday · 9:18 pm" style
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${day} · ${time.toLowerCase()}`;
}

export async function buildDailyBrief(
  input: DailyBriefInput,
): Promise<DailyBrief> {
  const memContext = input.recentMemorySnippets.length
    ? `\n\nWhat you remember about them (in your voice):\n${input.recentMemorySnippets.map((s) => `- ${s}`).join("\n")}`
    : "";

  const userContent = `Compose the home-screen phrasing for ${input.name} right now.

Time: ${input.now} (use "${dayLabel(input.now)}" as the day label context).
Tone: ${input.tone}.

The student's numbers (already computed — DO NOT recompute, just reference accurately):
- breathing room this week: $${input.numbers.breathing.toFixed(0)}
- balance after next bill: $${input.numbers.afterRent.toFixed(2)}
- paycheck context: "${input.numbers.paycheckCopy}"${memContext}

Return three fields:
1. greeting — tone-appropriate, 1 line.
2. bodyLine — the editorial sub-headline that surfaces the breathing-room number with italics around it (markdown asterisks).
3. tillyInvite — italic prompt at the bottom of Home, inviting the student into chat.`;

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userContent },
  ];

  const response = await tilly().messages.parse({
    model: TILLY_MODEL,
    max_tokens: TILLY_DEFAULT_MAX_TOKENS,
    thinking: { type: "adaptive" },
    system: [personaSystemBlock(), toneSystemBlock(input.tone)],
    messages,
    output_config: { format: zodOutputFormat(PhrasingSchema) },
  });

  if (!response.parsed_output) {
    throw new Error(
      `buildDailyBrief: model returned no parseable output (stop_reason=${response.stop_reason})`,
    );
  }

  const phrasing = response.parsed_output;

  return {
    greeting: phrasing.greeting,
    dayLabel: dayLabel(input.now),
    breathing: input.numbers.breathing,
    afterRent: input.numbers.afterRent,
    paycheckCopy: input.numbers.paycheckCopy,
    subscriptionTile: input.subscriptionTile,
    dreamTile: input.dreamTile,
    // bodyLine isn't in the DailyBrief shape directly — BTHome composes the
    // sub-headline from `breathing` + accent. We surface bodyLine via
    // tillyInvite for now if the BT shape doesn't carry it; or pass it
    // through a future field. For Phase 2, BTHome continues to render its
    // own templated sub-headline; phrasing.bodyLine is reserved.
    tillyInvite: phrasing.tillyInvite,
  };
}
