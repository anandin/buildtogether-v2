import { DossierContentSchema, formatDossierForPrompt, getLatestDossier } from "../dossier-rewriter";

/** S3 dossier — what Tilly believes about this student. Validated
 * through the Zod schema before formatting so a corrupt jsonb row
 * can't poison the prompt. */
export async function buildDossierSection(userId: string): Promise<string | null> {
  try {
    const row = await getLatestDossier(userId);
    if (!row) return null;
    const parsed = DossierContentSchema.safeParse(row.content);
    if (!parsed.success) return null;
    return formatDossierForPrompt(parsed.data);
  } catch (err) {
    console.warn("[ctx-dossier] failed:", err);
    return null;
  }
}
