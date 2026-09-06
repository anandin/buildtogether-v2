/**
 * Daily brief — generates the BTHome hero copy.
 *
 * Routes through the configured LLMClient. The numeric copy is templated
 * deterministically; only `greeting`, `bodyLine`, and `tillyInvite` come
 * from the model.
 */
import { z } from "zod";

import { getLLM } from "./llm/factory";
import type { IncomeConfidence } from "./income-review";
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
  /** Tilly-authored 2-3 sentence interpretation of today's money picture
   * using everything she knows — cadence, pace, leverage point,
   * upcoming bills, multi-month trend. Rendered as the top paragraph
   * of the home hero so the user feels Tilly speaking, not a static
   * template. Optional — falls back to template when LLM unavailable. */
  heroNarrative?: string;
};

export type ForwardLookSnapshot = {
  daysIntoMonth: number;
  daysInMonth: number;
  dailyPace: number;
  projectedClose: number;
  variableSoFar: number;
  fixedSoFar: number;
  incomeProjected?: number;
  /** e.g. "From 2 paychecks this month. Not counting 1 large deposit
   * ($86,748) that doesn't look like a paycheck — confirm if real
   * income." Lets the narrative explain a conservative income number. */
  incomeNote?: string;
  incomeProjection?: {
    projectedRemaining: number;
    cadence: string;
    typicalAmount: number;
    nextPaycheckDate: string | null;
  };
  leverageInsight?: { kind: string; text: string; amount: number } | null;
  observations?: Array<{ kind: string; [k: string]: unknown }>;
  /** Settled projection accuracy — "within $X on average over N months". */
  trackRecord?: {
    months: number;
    avgAbsErrorDollars: number;
    lastMonth: { month: string; predicted: number; actual: number } | null;
  } | null;
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
  // What's actually waiting in their pending queue right now — gives the
  // LLM something concrete to anchor the greeting / invite around so it
  // stops sounding like a generic "anything you want to think through?"
  // Empty / null when there's nothing pending.
  pendingSummary?: {
    count: number;
    totalAmount: number;
    topCategories: Array<{ category: string; count: number; amount: number }>;
  } | null;
  /** Everything computeMonthFlow learned this turn — cadence, projected
   * close, decomposition, observations from the 11 detectors. The
   * narrative is anchored on these so it stops sounding generic and
   * actually reflects what's known about the user's patterns. */
  forwardLook?: ForwardLookSnapshot | null;
  /** Verdict on the income denominator. When this blocks, the hero may
   * not assert surplus/room/affordability — see the income guard below. */
  incomeConfidence?: IncomeConfidence | null;
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
      "ONE sentence sub-headline anchored on the user's monthly surplus (income − spent − committed). Editorial-fintech voice, italicize the key number with single asterisks (e.g. '*$2,340* surplus this month — that's room for the Switch 2 dream and dinner out.'). If surplus is 0 or negative, lean compassionate not alarmist ('Tight month — let's see what's still movable.'). NO emoji, NO 'budget' as a verb.",
    ),
  tillyInvite: z
    .string()
    .describe(
      "Italic invite at the bottom of Home. 1 short sentence ending the student wants to tap. e.g. 'Anything you want to think through?' / 'Tell me what's on your mind.' Tone-appropriate.",
    ),
  heroNarrative: z
    .string()
    .describe(
      "ONE SENTENCE (max two, only if absolutely necessary) Tilly-voice insight at the TOP of the home card. The card already shows the numbers. Your job is to add the ONE insight that helps the user act — the leverage point, the upcoming pressure, the pattern that explains a heavy number. Do NOT recite math the card already shows. Do NOT list everything you see. Pick the highest-leverage observation and name it. Examples (notice the brevity): 'May 18 CRA bill is the pressure point — next paycheck lands 10 days after.' / 'Heavier month, but $4,908 of it is a one-off tax instalment, not a pattern.' / 'Sub load crept up $34/mo since Jan — worth pruning.' Plain prose, no markdown, no emoji, no math repetition.",
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

  const pendingContext = input.pendingSummary && input.pendingSummary.count > 0
    ? `\n\nWhat's waiting in their pending queue right now (use this in the invite when it's the most useful thing to mention — concrete is better than generic):
- ${input.pendingSummary.count} transactions waiting, $${input.pendingSummary.totalAmount.toFixed(0)} total
${input.pendingSummary.topCategories
  .slice(0, 3)
  .map((c) => `- ${c.category}: ${c.count} rows, $${c.amount.toFixed(0)}`)
  .join("\n")}`
    : "";

  // ForwardLook context — the smart-Tilly observations + projection
  // shape. Without this, the hero narrative defaults to generic
  // "tight month" copy that ignores everything the detectors found.
  // Pass as JSON; the LLM is instructed to use values verbatim.
  const forwardLookContext = input.forwardLook
    ? `\n\nWhat you've observed about THIS user (use verbatim, don't invent numbers):
${JSON.stringify(
        {
          dayInMonth: `${input.forwardLook.daysIntoMonth} of ${input.forwardLook.daysInMonth}`,
          dailyPace: input.forwardLook.dailyPace,
          projectedClose: input.forwardLook.projectedClose,
          variableSoFar: input.forwardLook.variableSoFar,
          fixedSoFar: input.forwardLook.fixedSoFar,
          incomeProjected: input.forwardLook.incomeProjected,
          incomeNote: input.forwardLook.incomeNote,
          incomeCadence: input.forwardLook.incomeProjection?.cadence,
          nextPaycheckDate: input.forwardLook.incomeProjection?.nextPaycheckDate,
          typicalPaycheck: input.forwardLook.incomeProjection?.typicalAmount,
          leverageInsight: input.forwardLook.leverageInsight?.text,
          projectionTrackRecord: input.forwardLook.trackRecord
            ? `past projections landed within $${input.forwardLook.trackRecord.avgAbsErrorDollars} on average over ${input.forwardLook.trackRecord.months} settled month(s) — cite this when the user might doubt a forward number`
            : undefined,
          observations: (input.forwardLook.observations ?? []).map((o) => ({
            kind: o.kind,
            preview: JSON.stringify(o).slice(0, 220),
          })),
        },
        null,
        2,
      )}`
    : "";

  const userContent = `Compose the home-screen phrasing for ${input.name} right now.

Time: ${input.now} (use "${dayLabel(input.now)}" as the day label context).
Tone: ${input.tone}.${incomeGuardContext(input.incomeConfidence)}

The student's numbers (already computed — DO NOT recompute, just reference accurately):
- monthly surplus (income − spent − committed): $${input.numbers.breathing.toFixed(0)}
- month math summary: "${input.numbers.paycheckCopy}"${memContext}${pendingContext}${forwardLookContext}

Return four fields:
1. greeting — tone-appropriate, 1 line.
2. bodyLine — the editorial sub-headline that surfaces the breathing-room number with italics around it (markdown asterisks).
3. tillyInvite — italic prompt at the bottom of Home, inviting the student into chat. When pending queue context is provided above, prefer an invite that references something concrete in it ("Want to talk about your $4K in loan payments?" beats "Anything you want to think through?"). Keep it 1 sentence. Stay in tone.
4. heroNarrative — 2-3 sentence Tilly-voice interpretation rendered at TOP of the home card. Anchor on the forwardLook + observations data above. Lead with what's most useful for THIS user right now (cadence/projection if biweekly, leverage if there's a clear cut, trend if multi-month_trend fired, etc.). Use real numbers verbatim. Plain prose, no markdown, no emoji.`;

  const systemPrompts = await buildSystemPrompts(input.tone);
  const llm = await getLLM();

  // Fabrication guard — the $173k hero bug taught us the narrative layer
  // is exactly where wrong numbers reach the user, and the chat validator
  // doesn't cover this surface. Every dollar figure in the phrasing must
  // exist in (or be a simple combination of) the data we handed the LLM.
  // One retry with a sterner instruction; a second failure drops the
  // narrative and falls back to the deterministic bodyLine.
  const allowed = harvestAllowedNumbers(input);
  let phrasing = await llm.structuredOutput<z.infer<typeof PhrasingSchema>>({
    systemPrompts,
    messages: [{ role: "user", content: userContent }],
    schema: PhrasingSchema,
    schemaName: "home_phrasing",
    meta: { userId: input.userId, route: "brief" },
  });
  if (!briefNumbersValid(phrasing, allowed)) {
    console.warn(
      `[daily-brief] phrasing used a $ figure not present in the data (user ${input.userId}) — retrying once`,
    );
    try {
      phrasing = await llm.structuredOutput<z.infer<typeof PhrasingSchema>>({
        systemPrompts,
        messages: [
          {
            role: "user",
            content:
              userContent +
              `\n\nIMPORTANT: your previous attempt referenced dollar figures that do not exist in the data above. Use ONLY the exact numbers provided — never compute, extrapolate, or invent a figure.`,
          },
        ],
        schema: PhrasingSchema,
        schemaName: "home_phrasing",
        meta: { userId: input.userId, route: "brief-retry" },
      });
    } catch {
      // fall through to the degrade path below
    }
    if (!briefNumbersValid(phrasing, allowed)) {
      console.warn(`[daily-brief] retry still fabricated — degrading to template (user ${input.userId})`);
      phrasing = {
        greeting: phrasing.greeting ?? `Hey ${input.name}.`,
        bodyLine: `*$${Math.round(input.numbers.breathing).toLocaleString()}* of breathing room this month.`,
        tillyInvite: "Anything you want to think through?",
        heroNarrative: "",
      };
    }
  }

  // Income guard — the abundance denominator. Instructions alone are not
  // a guarantee (same lesson as the fabrication guard above), so the
  // claim is checked after generation and degraded deterministically.
  // A missing abundance claim costs far less trust than a false one.
  if (input.incomeConfidence?.blocksSurplusClaims && !briefRespectsIncomeGuard(phrasing)) {
    console.warn(
      `[daily-brief] surplus claim on unverified income (user ${input.userId}) — degrading to the income question`,
    );
    phrasing = {
      greeting: phrasing.greeting ?? `Hey ${input.name}.`,
      bodyLine: "*Some of your income isn't counted yet* — I'd rather check than guess at what's spare.",
      tillyInvite: "Want to sort out which deposits are actually income?",
      heroNarrative: "",
    };
  }

  return {
    greeting: phrasing.greeting,
    dayLabel: dayLabel(input.now),
    breathing: input.numbers.breathing,
    afterRent: input.numbers.afterRent,
    paycheckCopy: input.numbers.paycheckCopy,
    subscriptionTile: input.subscriptionTile,
    dreamTile: input.dreamTile,
    tillyInvite: phrasing.tillyInvite,
    heroNarrative: phrasing.heroNarrative || undefined,
  };
}

// ── Income guard helpers (pure, unit-tested) ─────────────────────────
//
// Phase 0 of the commitment-layer PRD. Every "you have room" claim is an
// underwritten guarantee — true only if the income side is right. The
// 2026-05-16 audit found the live account projecting off ~$6,745/mo
// against a real ~$15k+, so the hero was confidently wrong in the doom
// direction. Until the denominator is user-verified, the hero asks
// instead of asserting.

/** Phrases that assert spare capacity. Deliberately narrow — this
 * suppresses copy, so a false positive costs a useful sentence. */
const SURPLUS_CLAIM_PATTERNS: RegExp[] = [
  /\bsurplus\b/i,
  /\bbreathing room\b/i,
  /\broom (?:for|to|left)\b/i,
  /\byou can afford\b/i,
  /\bcan comfortably\b/i,
  /\b(?:left ?over|leftover)\b/i,
  /\bto spare\b/i,
  /\bspare cash\b/i,
  /\bfree to spend\b/i,
  /\byou'?ve earned\b/i,
  /\btreat yourself\b/i,
  /\bgo (?:ahead|enjoy)\b/i,
  /\bplenty\b/i,
];

/** True when the text asserts spare capacity. */
export function assertsSurplus(text: string): boolean {
  return SURPLUS_CLAIM_PATTERNS.some((re) => re.test(text));
}

/** True when no generated field claims surplus. Checked only when the
 * income confidence verdict blocks; see `assessIncomeConfidence`. */
export function briefRespectsIncomeGuard(phrasing: {
  bodyLine?: string;
  heroNarrative?: string;
  tillyInvite?: string;
}): boolean {
  return ![phrasing.bodyLine, phrasing.heroNarrative, phrasing.tillyInvite]
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .some(assertsSurplus);
}

/** Prompt-side half of the guard. Empty string when income is trusted. */
export function incomeGuardContext(confidence?: IncomeConfidence | null): string {
  if (!confidence?.blocksSurplusClaims) return "";
  return `

INCOME IS NOT VERIFIED — HARD CONSTRAINT. ${confidence.reasons.join(" ")}
The surplus figure below is therefore unreliable in BOTH directions and may be badly wrong.
- Do NOT say the user has surplus, breathing room, room for anything, spare cash, or that they can afford / have earned something.
- Do NOT reassure them that they are fine, and do NOT warn them that they are short. Both are guesses right now.
- DO name, plainly and without blame, that some income isn't counted yet, and invite them to sort it out. That is the single most useful thing you can say today.`;
}

// ── Fabrication guard helpers (pure, unit-tested) ───────────────────

/** Every $-prefixed figure in a string, rounded to whole dollars. */
export function dollarFiguresIn(text: string): number[] {
  return [...text.matchAll(/\$([\d,]+(?:\.\d{1,2})?)/g)].map((m) =>
    Math.round(parseFloat(m[1].replace(/,/g, ""))),
  );
}

/** Recursively harvest every numeric value in the brief input, plus
 * floor/round/ceil and pairwise sums/differences of the headline
 * numbers — "$X spent + $Y committed" style phrasing is legitimate. */
export function harvestAllowedNumbers(input: DailyBriefInput): Set<number> {
  const found: number[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === "number" && isFinite(v)) {
      found.push(Math.abs(v));
    } else if (typeof v === "string") {
      for (const n of dollarFiguresIn(v)) found.push(n);
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (v && typeof v === "object") {
      Object.values(v as Record<string, unknown>).forEach(walk);
    }
  };
  walk(input.numbers);
  walk(input.forwardLook ?? {});
  walk(input.subscriptionTile ?? {});
  walk(input.dreamTile ?? {});
  walk(input.pendingSummary ?? {});
  walk(input.recentMemorySnippets);

  const allowed = new Set<number>();
  const add = (n: number) => {
    if (!isFinite(n)) return;
    allowed.add(Math.floor(n));
    allowed.add(Math.round(n));
    allowed.add(Math.ceil(n));
  };
  for (const n of found) add(n);
  // Pairwise combinations of the headline numbers only (full pairwise
  // over every harvested value would let almost anything through).
  const fl = input.forwardLook;
  const headline = [
    input.numbers.breathing,
    fl?.projectedClose,
    fl?.incomeProjected,
    fl?.variableSoFar,
    fl?.fixedSoFar,
    fl?.incomeProjection?.typicalAmount,
  ].filter((n): n is number => typeof n === "number" && isFinite(n));
  for (let i = 0; i < headline.length; i++) {
    for (let j = 0; j < headline.length; j++) {
      if (i === j) continue;
      add(Math.abs(headline[i] + headline[j]));
      add(Math.abs(headline[i] - headline[j]));
    }
  }
  return allowed;
}

/** True when the phrasing has no IMPLAUSIBLE dollar figure.
 *
 * The original guard rejected any figure not in the harvested allowed
 * set — too strict. The brief LLM legitimately sees numbers we don't
 * harvest into `allowed` (a single category total, a specific upcoming
 * bill inside an observation), so demanding an exact match degraded
 * perfectly good narratives (the whole hero went blank on June's real
 * numbers). And the systematic error that caused the $173k hero is now
 * fixed upstream in the income path — the guard is defense-in-depth, not
 * the primary fix.
 *
 * So we only catch the CATASTROPHIC class: a figure wildly larger than
 * anything real (the "$173,496 when nothing tops ~$14k" signature). A
 * figure passes if it's tiny (< $10 colour), exactly matches a real
 * number, OR sits within 1.5× of the largest legitimate number. Only a
 * figure that clears that ceiling AND isn't explained gets the narrative
 * rejected. */
export function briefNumbersValid(
  phrasing: { bodyLine?: string; heroNarrative?: string; tillyInvite?: string },
  allowed: Set<number>,
): boolean {
  const figures = [
    ...dollarFiguresIn(phrasing.bodyLine ?? ""),
    ...dollarFiguresIn(phrasing.heroNarrative ?? ""),
    ...dollarFiguresIn(phrasing.tillyInvite ?? ""),
  ];
  if (figures.length === 0) return true;
  let maxAllowed = 0;
  for (const n of allowed) if (n > maxAllowed) maxAllowed = n;
  const ceiling = Math.max(maxAllowed * 1.5, 100);
  return figures.every((n) => n < 10 || allowed.has(n) || n <= ceiling);
}
