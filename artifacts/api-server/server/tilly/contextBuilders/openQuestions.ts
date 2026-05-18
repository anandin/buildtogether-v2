import { and, desc, eq } from "drizzle-orm";

import { db } from "../../db";
import { tillyQuestions } from "../../../shared/schema";

/** Open sync-time questions Tilly has queued for the user. Surfaces
 * them so Tilly can naturally reference one in chat ("by the way, I
 * noticed Frank Bistro keeps coming up — is that a regular spot?")
 * instead of asking out of nowhere. */
export async function buildOpenQuestionsSection(
  householdId: string,
): Promise<string | null> {
  try {
    const open = await db
      .select()
      .from(tillyQuestions)
      .where(
        and(
          eq(tillyQuestions.householdId, householdId),
          eq(tillyQuestions.status, "open"),
        ),
      )
      .orderBy(desc(tillyQuestions.createdAt))
      .limit(3);
    if (!open.length) return null;
    const lines = open.map((q) => `- [${q.kind}] ${q.body}`);
    return (
      `Open questions you've already queued for them (don't re-ask all of them, but you can naturally reference one if it fits):\n${lines.join("\n")}`
    );
  } catch (err) {
    console.warn("[ctx-open-questions] failed:", err);
    return null;
  }
}
