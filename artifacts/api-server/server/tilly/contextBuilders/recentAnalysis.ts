import { and, desc, eq, gte } from "drizzle-orm";

import { db } from "../../db";
import { guardianConversations } from "../../../shared/schema";

/** If the household ran an on-demand "Analyse my money flow" in the
 * last 24h, inject its rows + anomalies into chat context so a
 * follow-up ("what was that Doordash thing?") can drill in without
 * re-computing. */
export async function buildRecentAnalysisSection(
  householdId: string,
): Promise<string | null> {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rows = await db
      .select()
      .from(guardianConversations)
      .where(
        and(
          eq(guardianConversations.coupleId, householdId),
          eq(guardianConversations.intent, "analysis"),
          gte(guardianConversations.createdAt, cutoff),
        ),
      )
      .orderBy(desc(guardianConversations.createdAt))
      .limit(1);
    const ar = rows[0];
    if (!ar) return null;
    const meta =
      ar.metadata && typeof ar.metadata === "object"
        ? (ar.metadata as {
            title?: string;
            rows?: { label: string; amt: number; sign: "+" | "-" | "=" }[];
            note?: string;
            anomalies?: { merchant: string; total: number; reason: "spike" | "new"; baseline?: number }[];
            memoryLine?: string | null;
          })
        : null;
    // Only the on-demand money-flow analysis primes follow-ups;
    // other "analysis" intents (affordability) would confuse.
    const isMoneyFlow = meta && typeof meta.title === "string" && /money flow/i.test(meta.title);
    if (!isMoneyFlow || !meta || !Array.isArray(meta.rows) || meta.rows.length === 0) return null;
    const ageMin = Math.round((Date.now() - ar.createdAt.getTime()) / 60000);
    const rowLines = meta.rows
      .map((r) => `  ${r.label}: ${r.sign === "-" ? "-" : ""}$${Math.abs(r.amt).toFixed(2)}`)
      .join("\n");
    const anomLines = (meta.anomalies ?? [])
      .map((a) =>
        `  • ${a.merchant} $${a.total.toFixed(2)} ${
          a.reason === "new" ? "(new this month)" : `(usually ~$${(a.baseline ?? 0).toFixed(2)}/mo)`
        }`,
      )
      .join("\n");
    return (
      `Recent analysis you ran for them (${ageMin} min ago) — reference this if they ask a follow-up, don't re-derive:\n` +
      `${meta.title ?? "Money flow"}\n${rowLines}` +
      (anomLines ? `\nWorth a second look:\n${anomLines}` : "") +
      (meta.note ? `\nYour note: ${meta.note}` : "") +
      (meta.memoryLine ? `\n${meta.memoryLine}` : "")
    );
  } catch (err) {
    console.warn("[ctx-recent-analysis] failed:", err);
    return null;
  }
}
