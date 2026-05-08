/**
 * Task #23 — merchant rule learning + application.
 *
 * The pain we're solving: Plaid keeps sending the same Starbucks/Spotify/Uber
 * row every week, and the user keeps pressing Accept on it with the same
 * tags. After two consistent accepts we should learn that pattern, auto-
 * apply it on next sync, and stop adding the row to the pending queue at
 * all. Same for Ignore — after two ignores the user shouldn't keep seeing
 * "internal transfer" rows.
 *
 * The signature is the join key. Plaid's `merchant_name` is usually clean
 * but `name` carries store numbers, dates, and processor noise we have to
 * strip before two transactions from the same merchant collide.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { merchantRules, type MerchantRule } from "../../shared/schema";

/**
 * Auto-accept safety cap. Two accepts is enough confidence for the small,
 * recurring stuff this is meant to handle (Spotify, Starbucks, transit) but
 * NOT for broad merchants where a learned coffee category could swallow a
 * surprise $400 marketplace splurge. So we keep the per-tx cap conservative
 * ($250) until the rule has proven itself across 5 consistent accepts;
 * after that we trust it up to $5,000. Anything bigger always falls through
 * to the pending queue with the rule's tags pre-filled (tag_only).
 */
const AUTO_ACCEPT_AMOUNT_CAP_LOW = 250;
const AUTO_ACCEPT_AMOUNT_CAP_HIGH = 5000;
const AUTO_ACCEPT_AMOUNT_CAP_LIFT_AFTER = 5;

export type PlaidTxLike = {
  amount: number;
  merchantName?: string | null;
  merchant_name?: string | null;
  name?: string | null;
};

/**
 * Build a stable signature for a Plaid transaction. The goal is that
 * "STARBUCKS #2718 SEATTLE WA 04/12" and "STARBUCKS #4501 SEATTLE WA
 * 04/19" both hash to "starbucks". Conservative: when nothing useful
 * survives normalization we fall back to the raw lowercase string so two
 * weird-but-identical descriptors still group together.
 */
export function merchantSignature(tx: PlaidTxLike): string {
  const raw = (tx.merchantName ?? tx.merchant_name ?? tx.name ?? "").toString();
  if (!raw) return "unknown";
  let s = raw.toLowerCase();
  // Strip URLs and email-like processor decorations
  s = s.replace(/https?:\/\/\S+/g, " ");
  s = s.replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, " ");
  // Drop store numbers and reference codes ("#2718", "store 4501", "ref 8821")
  s = s.replace(/#\s*\d+/g, " ");
  s = s.replace(/\b(?:store|loc|locn|location|ref|reference|order|ord|inv|invoice|tx|txn|trxn|auth|conf|confirmation)[\s#:]*[\w-]+/gi, " ");
  // Drop dates / times that sometimes ride in the descriptor
  s = s.replace(/\b\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\b/g, " ");
  s = s.replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, " ");
  // Drop standalone state codes ("ca", "wa", "ny") — but only when surrounded
  // by spaces, so "Walmart" still keeps its "wa". Two-letter US state list
  // covers the common Plaid noise.
  s = s.replace(/\b(al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy)\b/g, " ");
  // Drop common processor prefixes
  s = s.replace(/\b(sq|sq\*|tst\*|paypal\s*\*|pp\*|ach|pos|debit|credit|purchase|payment|deposit|withdrawal|atm|chk|chq|fee)\b\s*/g, " ");
  // Strip punctuation, collapse whitespace, drop trailing digits
  s = s.replace(/[^a-z0-9\s]+/g, " ");
  s = s.replace(/\s+\d+\s*$/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return raw.toLowerCase().trim() || "unknown";
  return s;
}

/** Look up a saved rule for this signature, or null. */
export async function findRule(
  coupleId: string,
  signature: string,
): Promise<MerchantRule | null> {
  const [row] = await db
    .select()
    .from(merchantRules)
    .where(and(eq(merchantRules.coupleId, coupleId), eq(merchantRules.signature, signature)))
    .limit(1);
  return row ?? null;
}

export type AcceptInput = {
  coupleId: string;
  plaidTx: PlaidTxLike;
  category: string | null;
  tags: string[] | null;
  note: string | null;
  source?: "learned" | "asked" | "bulk";
};

/**
 * Record (or strengthen) a rule from a user accept. The first accept just
 * memoizes the user's choice. The second accept of the same signature
 * with a consistent category flips `auto_accept` so the next Plaid sync
 * skips the pending queue. If the user changes their mind (different
 * category this time), we DON'T lift auto_accept — we update the defaults
 * and reset the counter so we don't auto-apply a contested rule.
 */
export async function upsertRuleFromAccept(input: AcceptInput): Promise<MerchantRule> {
  const { coupleId, plaidTx, category, tags, note, source = "learned" } = input;
  const signature = merchantSignature(plaidTx);
  const display = (plaidTx.merchantName ?? plaidTx.merchant_name ?? plaidTx.name ?? signature).toString();

  const existing = await findRule(coupleId, signature);
  const now = new Date();
  const cleanTags = Array.isArray(tags) && tags.length ? tags : null;
  const cleanNote = note && note.trim() ? note.trim() : null;
  const cleanCat = category && category.trim() && category !== "other" ? category.trim() : (existing?.category ?? null);

  if (!existing) {
    const [row] = await db.insert(merchantRules).values({
      coupleId,
      signature,
      lastMerchant: display,
      category: cleanCat,
      defaultTags: cleanTags,
      defaultNote: cleanNote,
      autoAccept: false,
      autoIgnore: false,
      hitCount: 1,
      ignoreCount: 0,
      source,
      lastAppliedAt: now,
      createdAt: now,
      updatedAt: now,
    }).returning();
    return row;
  }

  // Same category as before? Strengthen the rule.
  const sameCategory = !cleanCat || !existing.category || cleanCat === existing.category;
  const nextHits = existing.hitCount + 1;
  const flipAutoAccept = sameCategory && nextHits >= 2;

  const [row] = await db
    .update(merchantRules)
    .set({
      lastMerchant: display,
      category: cleanCat ?? existing.category,
      defaultTags: cleanTags ?? existing.defaultTags,
      defaultNote: cleanNote ?? existing.defaultNote,
      autoAccept: flipAutoAccept,
      autoIgnore: false, // any accept clears ignore
      hitCount: sameCategory ? nextHits : 1, // category flip resets streak
      lastAppliedAt: now,
      updatedAt: now,
    })
    .where(eq(merchantRules.id, existing.id))
    .returning();
  return row;
}

export async function upsertIgnoreRule(
  coupleId: string,
  plaidTx: PlaidTxLike,
): Promise<MerchantRule> {
  const signature = merchantSignature(plaidTx);
  const display = (plaidTx.merchantName ?? plaidTx.merchant_name ?? plaidTx.name ?? signature).toString();
  const existing = await findRule(coupleId, signature);
  const now = new Date();

  if (!existing) {
    const [row] = await db.insert(merchantRules).values({
      coupleId,
      signature,
      lastMerchant: display,
      autoAccept: false,
      autoIgnore: false, // first ignore: memoize but don't auto-suppress yet
      hitCount: 0,
      ignoreCount: 1,
      source: "learned",
      lastAppliedAt: now,
      createdAt: now,
      updatedAt: now,
    }).returning();
    return row;
  }

  const nextIgnores = existing.ignoreCount + 1;
  // Auto-ignore once user has ignored ≥ 2 times AND never accepted this merchant.
  const flipAutoIgnore = nextIgnores >= 2 && existing.hitCount === 0;
  const [row] = await db
    .update(merchantRules)
    .set({
      lastMerchant: display,
      ignoreCount: nextIgnores,
      autoIgnore: flipAutoIgnore,
      autoAccept: false,
      lastAppliedAt: now,
      updatedAt: now,
    })
    .where(eq(merchantRules.id, existing.id))
    .returning();
  return row;
}

export type ApplyResult =
  | { kind: "auto_accept"; category: string; tags: string[] | null; note: string | null; ruleId: string }
  | { kind: "auto_ignore"; ruleId: string }
  | { kind: "tag_only"; category: string | null; tags: string[] | null; note: string | null; ruleId: string }
  | { kind: "none" };

/**
 * Decide what to do with a freshly synced Plaid transaction given any
 * learned rule. Returns:
 *   - auto_accept: skip pending queue, write expense with these defaults
 *   - auto_ignore: insert as ignored
 *   - tag_only:   queue as pending but pre-fill defaults
 *   - none:       no rule yet
 */
export function applyRuleToPlaidTx(plaidTx: PlaidTxLike, rule: MerchantRule | null): ApplyResult {
  if (!rule) return { kind: "none" };
  const tags = Array.isArray(rule.defaultTags) ? rule.defaultTags : null;
  if (rule.autoIgnore) return { kind: "auto_ignore", ruleId: rule.id };
  if (rule.autoAccept) {
    const amt = Math.abs(plaidTx.amount);
    const cap = rule.hitCount >= AUTO_ACCEPT_AMOUNT_CAP_LIFT_AFTER
      ? AUTO_ACCEPT_AMOUNT_CAP_HIGH
      : AUTO_ACCEPT_AMOUNT_CAP_LOW;
    if (amt <= cap) {
      return {
        kind: "auto_accept",
        category: rule.category ?? "other",
        tags,
        note: rule.defaultNote,
        ruleId: rule.id,
      };
    }
    // Over cap with low confidence — fall through and pre-fill instead.
  }
  return {
    kind: "tag_only",
    category: rule.category,
    tags,
    note: rule.defaultNote,
    ruleId: rule.id,
  };
}

/** Pretty display name for a signature — falls back to titlecasing the signature. */
export function displayMerchant(rule: { lastMerchant?: string | null; signature: string }): string {
  if (rule.lastMerchant && rule.lastMerchant.trim()) return rule.lastMerchant.trim();
  return rule.signature
    .split(" ")
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Look up many rules at once for a list of signatures. */
export async function findRules(
  coupleId: string,
  signatures: string[],
): Promise<Map<string, MerchantRule>> {
  if (signatures.length === 0) return new Map();
  const rows = await db
    .select()
    .from(merchantRules)
    .where(
      and(
        eq(merchantRules.coupleId, coupleId),
        sql`${merchantRules.signature} = ANY(${signatures}::text[])`,
      ),
    );
  return new Map(rows.map((r) => [r.signature, r]));
}
