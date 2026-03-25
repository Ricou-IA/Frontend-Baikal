// meeting-extract/templates.ts — CR template lookup & generation V3

import { createClient } from "jsr:@supabase/supabase-js@2";
import type { Participant, MeetingStats } from "./types.ts";

// ---------------------------------------------------------------------------
// Template lookup : cherche un modèle CR dans sources.files (org layer)
// ---------------------------------------------------------------------------

/**
 * Cherche un template de CR personnalisé dans sources.files
 * Filtre : layer='org' AND category='modeles' AND org_id
 * Retourne le contenu du template ou null (fallback ARPET)
 */
export async function lookupCRTemplate(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("files")
      .select("metadata, file_path")
      .eq("metadata->>layer", "org")
      .eq("metadata->>category", "modeles")
      .eq("metadata->>org_id", orgId)
      .ilike("file_path", "%compte%rendu%")
      .limit(1)
      .single();

    if (error || !data) {
      console.log("[templates] No custom CR template found for org, using ARPET fallback");
      return null;
    }

    console.log(`[templates] Found custom CR template: ${data.file_path}`);

    // Télécharger le contenu du template depuis Storage
    const bucket = data.metadata?.bucket || "premium-sources";
    const { data: fileData, error: dlError } = await supabase.storage
      .from(bucket)
      .download(data.file_path);

    if (dlError || !fileData) {
      console.warn("[templates] Failed to download template, using fallback");
      return null;
    }

    const templateContent = await fileData.text();
    return templateContent;
  } catch (e) {
    console.warn("[templates] Template lookup error:", e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fallback ARPET template
// ---------------------------------------------------------------------------

export const ARPET_CR_TEMPLATE = `# COMPTE-RENDU DE RÉUNION DE CHANTIER

**Date** : {meeting_date}
**Objet** : {meeting_title}
**Participants** : {participants}

---

## Résumé

{summary}

## Décisions

{decisions}

## Actions

{actions}

## Points d'attention

{issues}

## Informations

{infos}

---

**Prochaine réunion** : {next_meeting}

---
*CR généré automatiquement — ARPET Meeting V3*
`;

// ---------------------------------------------------------------------------
// Formatted report generator
// ---------------------------------------------------------------------------

interface FormatReportInput {
  meeting_title: string;
  meeting_date: string;
  participants: Participant[];
  summary: string | null;
  decisions: { subject: string; content: string; lot_reference?: string | null }[];
  actions: {
    subject: string;
    content: string;
    responsible?: string | null;
    due_date?: string | null;
    lot_reference?: string | null;
  }[];
  issues: { subject: string; content: string; lot_reference?: string | null }[];
  infos: { subject: string; content: string }[];
  next_meeting?: { date?: string; agenda_items?: string[] } | null;
  customTemplate?: string | null;
}

/**
 * Génère le CR formaté en markdown.
 * Si un template custom est fourni, essaye de l'utiliser.
 * Sinon, utilise le template ARPET par défaut.
 */
export function generateFormattedReport(input: FormatReportInput): string {
  const {
    meeting_title,
    meeting_date,
    participants,
    summary,
    decisions,
    actions,
    issues,
    infos,
    next_meeting,
    customTemplate,
  } = input;

  const participantsList =
    participants
      ?.map((p) => (p.role ? `${p.name} (${p.role})` : p.name))
      .join(", ") || "Non spécifiés";

  // Si template custom, tenter le remplacement simple
  if (customTemplate) {
    try {
      let report = customTemplate
        .replace(/\{meeting_date\}/g, meeting_date)
        .replace(/\{meeting_title\}/g, meeting_title)
        .replace(/\{participants\}/g, participantsList)
        .replace(/\{summary\}/g, summary || "Aucun résumé disponible");
      console.log("[templates] Custom template applied");
      return report;
    } catch {
      console.warn("[templates] Custom template failed, using fallback");
    }
  }

  // Template ARPET standard (markdown)
  let report = `# COMPTE-RENDU DE RÉUNION DE CHANTIER\n\n`;
  report += `**Date** : ${meeting_date}\n`;
  report += `**Objet** : ${meeting_title}\n`;
  report += `**Participants** : ${participantsList}\n\n`;
  report += `---\n\n`;

  if (summary) {
    report += `## Résumé\n\n${summary}\n\n`;
  }

  if (decisions.length > 0) {
    report += `## Décisions\n\n`;
    for (const d of decisions) {
      const lot = d.lot_reference ? ` *(${d.lot_reference})*` : "";
      report += `- **${d.subject}**${lot} : ${d.content}\n`;
    }
    report += "\n";
  }

  if (actions.length > 0) {
    report += `## Actions\n\n`;
    report += `| Action | Responsable | Échéance | Lot |\n`;
    report += `|--------|-------------|----------|-----|\n`;
    for (const a of actions) {
      report += `| ${a.subject} : ${a.content} | ${a.responsible || "À définir"} | ${a.due_date || "-"} | ${a.lot_reference || "-"} |\n`;
    }
    report += "\n";
  }

  if (issues.length > 0) {
    report += `## Points d'attention\n\n`;
    for (const i of issues) {
      const lot = i.lot_reference ? ` *(${i.lot_reference})*` : "";
      report += `- **${i.subject}**${lot} : ${i.content}\n`;
    }
    report += "\n";
  }

  if (infos.length > 0) {
    report += `## Informations\n\n`;
    for (const i of infos) {
      report += `- **${i.subject}** : ${i.content}\n`;
    }
    report += "\n";
  }

  report += `---\n\n`;

  if (next_meeting?.date || (next_meeting?.agenda_items && next_meeting.agenda_items.length > 0)) {
    report += `## Prochaine réunion\n\n`;
    if (next_meeting.date) report += `**Date** : ${next_meeting.date}\n`;
    if (next_meeting.agenda_items && next_meeting.agenda_items.length > 0) {
      report += `**Ordre du jour prévisionnel** :\n`;
      for (const item of next_meeting.agenda_items) {
        report += `- ${item}\n`;
      }
    }
    report += "\n";
  }

  report += `*CR généré automatiquement — ARPET Meeting V3*\n`;

  return report;
}
