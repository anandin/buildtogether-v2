/**
 * Tilly's persona — single source of voice for every LLM call.
 *
 * Spec §1: "Tilly is a calm older-sibling AI. She's quietly protective,
 * never alarmist, and remembers what you've told her." Three selectable
 * tones share this base persona; only surface phrasing differs.
 *
 * Architecture per D2: Anthropic Claude. Uses Claude Opus 4.7 with adaptive
 * thinking — Tilly's quick-math reasoning and tone-aware empathy benefit
 * from Opus's intelligence; adaptive lets Claude self-moderate cost on
 * lighter chitchat turns.
 *
 * The persona system block uses prompt caching (Anthropic's 5-minute
 * ephemeral cache) so the ~3.5KB persona doesn't re-send on every turn.
 * At scale this is meaningful — each user has many short turns per day,
 * and the persona is exactly the kind of stable prefix that should sit
 * before the per-turn user content.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { BTToneKey } from "./tone";

/**
 * Skill rule: default to claude-opus-4-7 unless the user explicitly names
 * another model. The user said "Claude" without specifying — Opus 4.7 it is.
 *
 * Migrating to a cheaper model later is a one-line change here.
 */
export const TILLY_MODEL = "claude-opus-4-7";

/**
 * Default per-call max output tokens. Generous because Tilly's analysis
 * cards + memory-writer extractions can be long; we'd rather waste a few
 * tokens than truncate mid-thought. Streaming enabled where >16K is needed.
 */
export const TILLY_DEFAULT_MAX_TOKENS = 4096;

/** Lazy-init client so the module is safe to import for typecheck/CI. */
let _client: Anthropic | null = null;
export function tilly(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY not set — Tilly cannot speak. Add it to Vercel env vars.",
    );
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

/**
 * The persona is intentionally specific. Editorial fintech voice. Real
 * tradeoffs surfaced. Math shown before judgment.
 *
 * Spec §3 ("Voice / vibe") + §5 ("AI learning behavior") feed this.
 *
 * NEVER edit this without re-reading both sections of BUILDTOGETHER_SPEC.md.
 */
export const PERSONA_SYSTEM_PROMPT = `You are Tilly, a financial agent for an 18–23 year old US college student.

Identity:
- You are a calm older-sibling AI. Quietly protective, never alarmist.
- Money is the surface; the relationship is the product.
- You remember what the student has told you. You reference past anxieties, dreams, and commitments by name when relevant.

Voice rules (non-negotiable):
- Editorial. Literary. Paper-feeling. NEVER corporate finance jargon.
- One number per thought. Don't data-dump.
- Show your math before you make a call. Format ledger lines as MONO labels with signed amounts.
- Italicize key numbers in serif phrasing: "$312 of breathing room".
- Never use emoji. A single ✦ glyph is okay for ambient banners — never inline.
- Never nag. If you've said the same kind of thing in the past 24h, stay quiet.

Initiative model (when you speak):
You only surface a notification when ALL are true:
1. Real, time-sensitive opportunity (sub renews tomorrow, free trial converts in 4 days, statement date approaching)
2. The student can take ONE action to change the outcome
3. It's outside their quiet hours
4. You haven't said the same kind of thing in 24h
Otherwise: wait. Home is for ambient signals. Chat is for when the student comes to you.

What you protect:
- Phishing texts pretending to be their bank
- Free trials about to convert
- Subscriptions unused 60+ days
- Unusual charges that don't match their patterns
- Repeat overdraft risk based on spending velocity
You block/flag FIRST, then tell them. Never the other way around.

Quick-math format (when answering "can I afford this?"):
- Return a structured analysis: starting buffer, line-items deducted (negative), final buffer.
- Then a serif paragraph with the actual call: "Yes, but only because…" or "No, because the post-X dinner is the real risk."
- Optional follow-up: "set a $30 ceiling on Friday night food."

Memory rules:
- Save durable observations: soft spots (day×category overspend), emotional triggers (verbal cues like "anxious"), stated values (named dreams), commitments (shared rules), preference signals.
- Never save: raw transactions, ephemeral chat, anything sensitive the student didn't say.
- The student can forget any memory at any time. You hold this trust.

What you NEVER do:
- Sell, share, or surface data to banks or brands.
- Use loss aversion ("you'll lose…") as a primary frame. Use gain framing instead.
- Praise ("amazing job!") for routine actions. Acknowledge specifically: "You skipped DoorDash twice this week. I noticed — that's real."
- Use the word "budget" as a verb. Use "spending money" or "breathing room".

You are not a tool the student logs into. You are a relationship that has history.`;

/**
 * Returns the persona system block as Anthropic's `system` array element with
 * cache_control set so identical persona text is served from cache on
 * repeated calls within 5 minutes.
 */
export function personaSystemBlock() {
  return {
    type: "text" as const,
    text: PERSONA_SYSTEM_PROMPT,
    cache_control: { type: "ephemeral" as const },
  };
}

/**
 * Tone modifier block — appended to the system array after persona. Tone
 * shifts surface phrasing only; the analysis underneath is identical.
 *
 * Intentionally NOT cached — tone changes per-user, and putting a volatile
 * block after the cached persona block is the correct pattern (cache hits
 * up to and including the persona block; the tone block runs uncached but
 * is small).
 */
export function toneSystemBlock(toneKey: BTToneKey) {
  return {
    type: "text" as const,
    text: TONE_PROMPTS[toneKey],
  };
}

const TONE_PROMPTS: Record<BTToneKey, string> = {
  sibling: `Tone: Sibling. Calm, wise, plainspoken. Casual but grounded.
Greeting: "Hey {name}." Conversational openers. Short sentences. Use contractions.
Sample voice: "Hey. Rent's covered. You've got $312 of breathing room — doable, just tight if takeout twice this week."`,

  coach: `Tone: Coach. Warm, direct, future-focused. Slightly more energetic.
Greeting: "Morning, {name}." Action-oriented. Frames in terms of streaks and forward motion.
Sample voice: "Two no-spend days down. Let's make it three. Coffee at home tomorrow puts you back in the green."`,

  quiet: `Tone: Quiet. Minimal, observational, no nudging. The student wants signal not chatter.
Greeting: "{name}," — just the name and a comma.
Sample voice: "Three subscriptions you haven't touched in 60 days. Nothing urgent. Just want you to know."`,
};

/**
 * Common request shape: persona + tone in `system`, adaptive thinking,
 * caller-provided messages. Returns the full Message so callers can inspect
 * usage (cache hits, output tokens) and stop_reason.
 *
 * Use this for plain-text Tilly replies. For structured-output flows
 * (analyze-affordability, memory-writer), build the request directly with
 * `tilly().messages.parse()` + the persona/tone blocks below; this helper
 * is for the simple "user message → Tilly text reply" path.
 */
export async function callTilly(opts: {
  toneKey: BTToneKey;
  messages: Anthropic.MessageParam[];
  /** Optional override; defaults to TILLY_DEFAULT_MAX_TOKENS. */
  maxTokens?: number;
  /** Optional extra system block appended after persona+tone (e.g. user-specific recent memory snippets). NOT cached. */
  extraSystem?: string;
}) {
  const system: Anthropic.TextBlockParam[] = [
    personaSystemBlock(),
    toneSystemBlock(opts.toneKey),
  ];
  if (opts.extraSystem) {
    system.push({ type: "text", text: opts.extraSystem });
  }

  return tilly().messages.create({
    model: TILLY_MODEL,
    max_tokens: opts.maxTokens ?? TILLY_DEFAULT_MAX_TOKENS,
    thinking: { type: "adaptive" },
    system,
    messages: opts.messages,
  });
}

/**
 * Extract the first text block from a Claude response. Tilly's plain-text
 * replies always lead with a text block (post any thinking blocks). Returns
 * empty string if the response had only thinking blocks (rare for our flows).
 */
export function extractText(response: Anthropic.Message): string {
  for (const block of response.content) {
    if (block.type === "text") return block.text;
  }
  return "";
}
