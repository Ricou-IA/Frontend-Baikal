// ============================================================================
// generate-document v2 — Construction des prompts LLM
// ============================================================================

import type {
  CollectedData,
  MeetingContext,
  EnrichedMeetingItem,
  IntervenantContext,
  RagDocumentChunk,
} from "./types.ts";

// ============================================================================
// SYSTEM PROMPTS
// ============================================================================

const SYSTEM_PROMPT_MEMO = `Tu es un assistant spécialisé dans la conduite de travaux BTP.
Génère un mémo de chantier au format Markdown structuré.

DONNÉES FOURNIES :
- Informations projet et organisation
- Les N dernières réunions (résumés, dates)
- Les items extraits des réunions (décisions, actions, problèmes)
- Pour certains items, un contexte contractuel issu des pièces marché (CCTP, etc.)

RÈGLES DE RÉDACTION :
1. Synthétiser l'avancement global dans "Situation générale"
2. Pour chaque décision/action/problème qui dispose d'un contexte contractuel (rag_context),
   ajouter une ligne de référence : 📄 *Réf. : {source_file_name}, p.{page_start} — "{excerpt court}"*
3. La référence contractuelle est OPTIONNELLE — ne l'afficher que si elle existe dans les données fournies
4. Ne JAMAIS inventer de référence contractuelle
5. L'extrait doit être court (1 phrase, ~100 caractères max) et fidèle au document source
6. Format de la référence : nom du fichier + page si disponible
7. Les items de type 'info' n'ont pas de contexte contractuel, c'est normal
8. Dates au format DD/MM/YYYY
9. Sois factuel et concis. Pas de formules de politesse ni de bavardage.
10. Si une information manque, indique "[Information non disponible]"

FORMAT DE SORTIE (JSON) :
{
  "markdown_content": "...",
  "title": "..."
}

Tu DOIS retourner un JSON valide avec ces deux champs exactement.`;

const SYSTEM_PROMPT_FICHE_LOT = `Tu es un assistant spécialisé dans la conduite de travaux BTP.
Génère une fiche de suivi lot au format Markdown structuré.

DONNÉES FOURNIES :
- Informations projet et organisation
- Intervenant(s) du lot
- Prescriptions contractuelles (CCTP) filtrées pour ce lot
- Items des réunions filtrés pour ce lot (décisions, actions, problèmes)
- Pour certains items, un contexte contractuel enrichi (rag_context)

RÈGLES DE RÉDACTION :
1. La section "Prescriptions contractuelles" résume les extraits CCTP fournis
2. Pour chaque décision/action/problème avec un contexte contractuel (rag_context),
   ajouter : 📄 *Réf. : {source_file_name}, p.{page_start} — "{excerpt court}"*
3. Ne JAMAIS inventer de référence contractuelle
4. L'extrait doit être court (1 phrase, ~100 caractères max) et fidèle
5. Dates au format DD/MM/YYYY
6. Sois factuel et concis
7. Si une information manque, indique "[Information non disponible]"

FORMAT DE SORTIE (JSON) :
{
  "markdown_content": "...",
  "title": "..."
}

Tu DOIS retourner un JSON valide avec ces deux champs exactement.`;

export const SYSTEM_PROMPTS: Record<string, string> = {
  memo_chantier: SYSTEM_PROMPT_MEMO,
  fiche_lot: SYSTEM_PROMPT_FICHE_LOT,
};

// ============================================================================
// DATE HELPERS
// ============================================================================

const MOIS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/** "2026-02-07T..." → "7 février 2026" */
function formatDateFR(isoDate: string): string {
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return isoDate;
  return `${d.getUTCDate()} ${MOIS_FR[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Extrait la date de la réunion la plus récente (hors __older_actions__) */
function getLatestMeetingDate(meetings: MeetingContext[]): string {
  const realMeetings = meetings.filter(m => m.id !== "__older_actions__" && m.meeting_date);
  if (realMeetings.length === 0) return formatDateFR(new Date().toISOString());
  // Les meetings sont triés chronologiquement (oldest first), donc le dernier = le plus récent
  const latest = realMeetings[realMeetings.length - 1];
  return formatDateFR(latest.meeting_date);
}

/** Retourne la plage de dates formatée "3 janvier 2026 → 7 février 2026" */
function getDateRangeFR(meetings: MeetingContext[]): string {
  const realMeetings = meetings.filter(m => m.id !== "__older_actions__" && m.meeting_date);
  if (realMeetings.length === 0) return "Non disponible";
  const first = formatDateFR(realMeetings[0].meeting_date);
  const last = formatDateFR(realMeetings[realMeetings.length - 1].meeting_date);
  return `${first} → ${last}`;
}

// ============================================================================
// USER PROMPT FORMATTERS
// ============================================================================

function formatItemForPrompt(item: EnrichedMeetingItem): string {
  let line = `  - [${item.item_type.toUpperCase()}] **${item.subject}**`;
  if (item.content) line += `: ${item.content}`;
  if (item.lot_reference) line += ` (Lot: ${item.lot_reference})`;
  if (item.responsible) line += ` → Responsable: ${item.responsible}`;
  if (item.due_date) line += ` | Échéance: ${item.due_date}`;
  if (item.status && item.status !== "open") line += ` | Statut: ${item.status}`;
  if (item.location) line += ` | Lieu: ${item.location}`;

  // Contexte contractuel RAG
  if (item.rag_context && item.rag_context.length > 0) {
    for (const ref of item.rag_context) {
      const page = ref.page_start ? `, p.${ref.page_start}` : "";
      const excerpt = ref.excerpt ? ` — "${ref.excerpt.substring(0, 100)}"` : "";
      line += `\n    📄 Contexte contractuel : ${ref.source_file_name}${page}${excerpt} (similarité: ${ref.similarity.toFixed(2)})`;
    }
  }

  return line;
}

function formatMeetingsForPrompt(meetings: MeetingContext[]): string {
  if (meetings.length === 0) return "Aucune réunion disponible.";

  return meetings
    .filter(m => m.id !== "__older_actions__")
    .map((m) => {
      const items = m.items.length > 0
        ? m.items.map(formatItemForPrompt).join("\n")
        : "  Aucun point extrait.";

      const header = `### Réunion : ${m.meeting_title || "Sans titre"} — ${m.meeting_date}`;
      const summary = m.summary ? `Résumé : ${m.summary}` : "";

      return [header, summary, "Points extraits :", items].filter(Boolean).join("\n");
    })
    .join("\n\n---\n\n");
}

function formatOlderOpenActions(meetings: MeetingContext[]): string {
  const olderActions = meetings.find(m => m.id === "__older_actions__");
  if (!olderActions || olderActions.items.length === 0) return "";

  return `### Actions ouvertes (réunions antérieures)
${olderActions.items.map(formatItemForPrompt).join("\n")}`;
}

function formatIntervenantsForPrompt(intervenants: IntervenantContext[]): string {
  if (intervenants.length === 0) return "Aucun intervenant enregistré.";

  return intervenants
    .map((i) => {
      let line = `- ${i.name}`;
      if (i.company) line += ` (${i.company})`;
      if (i.role || i.role_in_project) line += ` — ${i.role_in_project || i.role}`;
      if (i.lot_reference) line += ` — Lot : ${i.lot_reference}`;
      if (i.specialty) line += ` — Spécialité : ${i.specialty}`;
      return line;
    })
    .join("\n");
}

function formatLotRagChunks(chunks: RagDocumentChunk[]): string {
  if (chunks.length === 0) return "Aucune prescription contractuelle trouvée pour ce lot.";

  return chunks
    .map((c) => {
      const meta = c.metadata || {};
      const page = meta.page_start ? ` (p.${meta.page_start})` : "";
      const source = c.source_file_name || "Document inconnu";
      return `- **${source}**${page} :\n  ${c.content.substring(0, 300)}`;
    })
    .join("\n\n");
}

// ============================================================================
// PROMPT BUILDERS
// ============================================================================

function buildMemoChantierPrompt(data: CollectedData): string {
  const realMeetings = data.meetings.filter(m => m.id !== "__older_actions__");
  const dateRange = getDateRangeFR(data.meetings);
  const latestDate = getLatestMeetingDate(data.meetings);
  const todayFR = formatDateFR(new Date().toISOString());

  return `Génère un MÉMO DE CHANTIER pour le projet "${data.project.project_name}".

## Informations projet
- Organisation : ${data.project.org_name}
- Projet : ${data.project.project_name}
- Description : ${data.project.project_description || "Non précisée"}
- Type de marché : ${data.project.market_type || "Non précisé"}
- Type de projet : ${data.project.project_type || "Non précisé"}

## Dates clés
- Date de la réunion la plus récente : ${latestDate}
- Période couverte : ${dateRange}
- Date de génération du document : ${todayFR}

## Intervenants du projet
${formatIntervenantsForPrompt(data.intervenants)}

## Réunions analysées (${realMeetings.length}) — Période : ${dateRange}
${formatMeetingsForPrompt(data.meetings)}

${formatOlderOpenActions(data.meetings)}

## Structure Markdown attendue

# MÉMO DE CHANTIER — ${data.project.project_name}

**Date** : ${latestDate}
**Projet** : ${data.project.project_name}
**Entreprise** : ${data.project.org_name}
**Réunions analysées** : ${realMeetings.length} (${dateRange})

---

## Situation générale
{Synthèse de l'avancement global}

## Décisions récentes
- **{date de la décision}** — {sujet}
  {description}
  📄 *Réf. : {source_file}, p.{page} — "{extrait}"* (si contexte contractuel disponible)

## Actions en cours
| Action | Responsable | Échéance | Statut | Réf. contractuelle |
|--------|-------------|----------|--------|-------------------|

## Points de vigilance
- ⚠️ **{sujet}** — {description}
  📄 *Réf. : {source_file}, p.{page} — "{clause}"* (si disponible)

## Prochaines échéances
{Dates clés}

---
*Généré par ARPET le ${todayFR} — Synthèse basée sur ${realMeetings.length} réunions, croisée avec les pièces marché du projet*`;
}

function buildFicheLotPrompt(data: CollectedData): string {
  const lot = data.lot_filter || "NON SPÉCIFIÉ";

  // Filter intervenants for this lot
  const lotIntervenants = data.intervenants.filter(
    (i) => i.lot_reference === lot || !i.lot_reference
  );

  const latestDate = getLatestMeetingDate(data.meetings);
  const todayFR = formatDateFR(new Date().toISOString());

  return `Génère une FICHE LOT pour le lot "${lot}" du projet "${data.project.project_name}".

## Informations projet
- Organisation : ${data.project.org_name}
- Projet : ${data.project.project_name}
- Lot : ${lot}

## Dates clés
- Date de la réunion la plus récente : ${latestDate}
- Date de génération du document : ${todayFR}

## Intervenant(s) du lot
${formatIntervenantsForPrompt(lotIntervenants)}

## Prescriptions contractuelles (CCTP) — Lot ${lot}
${formatLotRagChunks(data.lot_rag_chunks)}

## Réunions (items filtrés pour le lot ${lot})
${formatMeetingsForPrompt(data.meetings)}

${formatOlderOpenActions(data.meetings)}

## Structure Markdown attendue

# FICHE LOT — ${lot}

**Projet** : ${data.project.project_name}
**Entreprise** : ${data.project.org_name}
**Intervenant** : {nom_intervenant} ({company})
**Date** : ${latestDate}

---

## Prescriptions contractuelles (CCTP)
{Résumé des prescriptions du CCTP pour ce lot}

## Décisions prises en réunion
{Décisions concernant ce lot, avec dates et réf. contractuelles si disponibles}
📄 *Réf. : {source_file}, p.{page} — "{extrait}"* (si disponible)

## Actions en cours
| Action | Responsable | Échéance | Statut |
|--------|-------------|----------|--------|

## Points de vigilance
{Issues spécifiques à ce lot}

## Historique des discussions
{Chronologie des sujets abordés en réunion pour ce lot}

---
*Généré par ARPET le ${todayFR} — Synthèse automatique*`;
}

// ============================================================================
// PROMPT ROUTER
// ============================================================================

export function buildPrompt(
  documentType: string,
  data: CollectedData,
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = SYSTEM_PROMPTS[documentType];
  if (!systemPrompt) {
    throw new Error(`Type de document non supporté: ${documentType}`);
  }

  let userPrompt: string;
  switch (documentType) {
    case "memo_chantier":
      userPrompt = buildMemoChantierPrompt(data);
      break;
    case "fiche_lot":
      userPrompt = buildFicheLotPrompt(data);
      break;
    default:
      throw new Error(`Type de document non supporté: ${documentType}`);
  }

  return { systemPrompt, userPrompt };
}
