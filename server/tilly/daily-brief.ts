/**
 * Daily brief — generates the BTHome hero copy.
 *
 * Routes through the configured LLMClient. The numeric copy is templated
 * deterministically; only `greeting`, `bodyLine`, and `tillyInvite` come
 * from the model.
 */
import { z } from "zod";

import { getLLM } from "./llm/factory";
import { buildSystemPrompts } from "./persona";
import type { BTToneKey } from "./tone";

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

export type DailyBriefInput = {
  userId: string;
  householdId: string;
  name: string;
  tone: BTToneKey;
  now: string;
  numbers: {
    breathing: number;
    afterRent: number;
    paycheckCopy: string;
  };
  subscriptionTile?: DailyBrief["subscriptionTile"];
  dreamTile?: DailyBrief["dreamTile"];
  recentMemorySnippets: string[];
};

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

function dayLabel(nowIso: string): string {
  const d = new Date(nowIso);
  const day = d.toLocaleDateString("en-US", { weekday: "long" });
  const hour = d.getHours();
  if (hour < 12) return `${day} morning`;
  if (hour < 18) return `${day} afternoon`;
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
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

  const systemPrompts = await buildSystemPrompts(input.tone);
  const llm = await getLLM();

  const phrasing = await llm.structuredOutput<z.infer<typeof PhrasingSchema>>({
    systemPrompts,
    messages: [{ role: "user", content: userContent }],
    schema: PhrasingSchema,
    schemaName: "home_phrasing",
  });

  return {
    greeting: phrasing.greeting,
    dayLabel: dayLabel(input.now),
    breathing: input.numbers.breathing,
    afterRent: input.numbers.afterRent,
    paycheckCopy: input.numbers.paycheckCopy,
    subscriptionTile: input.subscriptionTile,
    dreamTile: input.dreamTile,
    tillyInvite: phrasing.tillyInvite,
  };
}
