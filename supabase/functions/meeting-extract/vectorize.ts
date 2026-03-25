// meeting-extract/vectorize.ts — Vectorisation directe des CR meeting V3
// Stratégie de chunking :
//   L0 (hierarchy_level=0) : résumé + en-tête CR → pour recherches synthesis/comparison
//   L1 (hierarchy_level=1) : chaque item (décision/action/issue/info) → pour recherches factual/citation
// Embedding : text-embedding-3-small (1536 dims) — identique à ingest-documents
// Colonnes QQOQCCP : remplies depuis l'extraction GPT-4o pour cohérence avec le RAG

import { createClient } from "jsr:@supabase/supabase-js@2";
import type { MeetingRecord, MeetingStats } from "./types.ts";

const EMBEDDING_MODEL = "text-embedding-3-small";
const MIN_CHUNK_LENGTH = 30;

interface MeetingItemForVectorize {
  id: string;
  item_type: string;
  subject: string;
  content: string;
  lot_reference?: string | null;
  responsible?: string | null;
  due_date?: string | null;
}

interface QQOQCCP {
  qui?: string[];
  quoi?: string[];
  ou?: string[];
  quand?: string[];
  comment?: string[];
  combien?: string[];
  pourquoi?: string[];
}

interface ChunkToVectorize {
  content: string;
  hierarchy_level: number;
  metadata: Record<string, unknown>;
  // Colonnes QQOQCCP (top-level dans rag.documents)
  quand_date: string | null;
  quand_phase: string | null;
  qui_lots: string[];
  comment_normes: string[];
  contenu_types: string[];
  qqoqccp: QQOQCCP | null;
}

// ---------------------------------------------------------------------------
// Build chunks from meeting data
// ---------------------------------------------------------------------------

export function buildMeetingChunks(
  meeting: MeetingRecord,
  formattedReport: string,
  items: MeetingItemForVectorize[],
  stats: MeetingStats,
  qqoqccp: QQOQCCP | null,
): ChunkToVectorize[] {
  const chunks: ChunkToVectorize[] = [];
  const participantsList = (meeting.participants || [])
    .map((p: { name: string; role?: string }) => p.role ? `${p.name} (${p.role})` : p.name)
    .join(", ");

  const baseMeta = {
    source_type: "meeting_transcript",
    content_type: "meeting_transcript",
    meeting_id: meeting.id,
    meeting_title: meeting.meeting_title,
    meeting_date: meeting.meeting_date,
    participants: participantsList,
    project_id: meeting.project_id,
    org_id: meeting.org_id,
  };

  // Extraire les lots depuis les items pour qui_lots
  const allLots = [...new Set(
    items
      .map((i) => i.lot_reference)
      .filter((lot): lot is string => !!lot),
  )];

  // Déduire contenu_types depuis les item_types présents
  const contenuTypes = [...new Set(items.map((i) => i.item_type))];

  // QQOQCCP partagé (extraction globale)
  const sharedQQOQCCP: QQOQCCP | null = qqoqccp && Object.keys(qqoqccp).length > 0
    ? qqoqccp
    : null;

  // ---- L0 : Résumé + en-tête du CR (pour synthesis/comparison) ----
  const l0Content = buildL0Content(meeting, formattedReport, stats);
  if (l0Content.length >= MIN_CHUNK_LENGTH) {
    chunks.push({
      content: l0Content,
      hierarchy_level: 0,
      metadata: {
        ...baseMeta,
        chunk_type: "meeting_summary",
        section_title: `Réunion ${meeting.meeting_date} - Résumé`,
        enrichment: {
          hierarchy: { level: 0, parent_local_id: null },
        },
      },
      quand_date: meeting.meeting_date || null,
      quand_phase: null,
      qui_lots: allLots,
      comment_normes: [],
      contenu_types: contenuTypes,
      qqoqccp: sharedQQOQCCP,
    });
  }

  // ---- L1 : Chaque item comme chunk individuel (pour factual/citation) ----
  for (const item of items) {
    const l1Content = buildL1Content(item, meeting);
    if (l1Content.length >= MIN_CHUNK_LENGTH) {
      // QQOQCCP spécifique au chunk L1
      const itemQQOQCCP: QQOQCCP = {
        qui: item.responsible ? [item.responsible] : [],
        quoi: [item.subject],
        ou: [],
        quand: item.due_date ? [item.due_date] : [],
        comment: [],
        combien: [],
        pourquoi: [],
      };

      chunks.push({
        content: l1Content,
        hierarchy_level: 1,
        metadata: {
          ...baseMeta,
          chunk_type: `meeting_${item.item_type}`,
          section_title: item.subject,
          item_type: item.item_type,
          lot_reference: item.lot_reference || null,
          responsible: item.responsible || null,
          due_date: item.due_date || null,
          meeting_item_id: item.id,
          enrichment: {
            hierarchy: { level: 1, parent_local_id: null },
          },
        },
        quand_date: item.due_date || meeting.meeting_date || null,
        quand_phase: null,
        qui_lots: item.lot_reference ? [item.lot_reference] : [],
        comment_normes: [],
        contenu_types: [item.item_type],
        qqoqccp: itemQQOQCCP,
      });
    }
  }

  console.log(`[vectorize] Built ${chunks.length} chunks (1 L0 + ${chunks.length - 1} L1)`);
  return chunks;
}

/**
 * L0 : contenu de synthèse pour les recherches globales.
 * Inclut : titre, date, participants, résumé, stats.
 */
function buildL0Content(
  meeting: MeetingRecord,
  _formattedReport: string,
  stats: MeetingStats,
): string {
  const participantsList = (meeting.participants || [])
    .map((p: { name: string; role?: string }) => p.role ? `${p.name} (${p.role})` : p.name)
    .join(", ");

  let content = `RÉUNION DE CHANTIER — ${meeting.meeting_date}\n`;
  content += `Titre : ${meeting.meeting_title}\n`;
  content += `Participants : ${participantsList || "Non spécifiés"}\n\n`;

  if (meeting.summary) {
    content += `Résumé : ${meeting.summary}\n\n`;
  }

  content += `Bilan : ${stats.total_items} points traités`;
  if (stats.decisions > 0) content += `, ${stats.decisions} décision(s)`;
  if (stats.actions > 0) content += `, ${stats.actions} action(s)`;
  if (stats.issues > 0) content += `, ${stats.issues} point(s) d'attention`;
  if (stats.infos > 0) content += `, ${stats.infos} information(s)`;
  content += ".";

  return content;
}

/**
 * L1 : contenu détaillé par item pour les recherches précises.
 * Chaque chunk est auto-suffisant (contient le contexte de la réunion).
 */
function buildL1Content(
  item: MeetingItemForVectorize,
  meeting: MeetingRecord,
): string {
  const typeLabels: Record<string, string> = {
    decision: "DÉCISION",
    action: "ACTION",
    issue: "POINT D'ATTENTION",
    info: "INFORMATION",
  };

  let content = `[${typeLabels[item.item_type] || item.item_type.toUpperCase()}] `;
  content += `Réunion du ${meeting.meeting_date} — ${meeting.meeting_title}\n`;
  content += `${item.subject}\n`;
  content += item.content;

  if (item.lot_reference) {
    content += `\nLot : ${item.lot_reference}`;
  }
  if (item.responsible) {
    content += `\nResponsable : ${item.responsible}`;
  }
  if (item.due_date) {
    content += `\nÉchéance : ${item.due_date}`;
  }

  return content;
}

// ---------------------------------------------------------------------------
// Generate embeddings in batch
// ---------------------------------------------------------------------------

async function generateEmbeddings(
  texts: string[],
  openaiApiKey: string,
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts.map((t) => t.trim()),
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Embedding API error: ${JSON.stringify(error)}`);
  }

  const data = await response.json();
  return data.data.map((d: { embedding: number[] }) => d.embedding);
}

// ---------------------------------------------------------------------------
// Insert into rag.documents
// ---------------------------------------------------------------------------

export async function vectorizeMeeting(
  supabase: ReturnType<typeof createClient>,
  meeting: MeetingRecord,
  formattedReport: string,
  items: MeetingItemForVectorize[],
  stats: MeetingStats,
  openaiApiKey: string,
  qqoqccp?: QQOQCCP | null,
): Promise<{ chunks_inserted: number; vectorize_ms: number }> {
  const startTime = Date.now();

  // 1. Construire les chunks (avec colonnes QQOQCCP)
  const chunks = buildMeetingChunks(meeting, formattedReport, items, stats, qqoqccp || null);

  if (chunks.length === 0) {
    console.warn("[vectorize] No chunks to vectorize");
    return { chunks_inserted: 0, vectorize_ms: Date.now() - startTime };
  }

  // 2. Générer les embeddings en batch
  const texts = chunks.map((c) => c.content);
  const embeddings = await generateEmbeddings(texts, openaiApiKey);

  console.log(`[vectorize] Generated ${embeddings.length} embeddings`);

  // 3. Préparer les rows pour rag.documents (schéma identique à ingest-documents)
  const now = new Date().toISOString();
  const rows = chunks.map((chunk, idx) => ({
    content: chunk.content,
    embedding: embeddings[idx],
    target_apps: ["arpet"],
    target_projects: meeting.project_id ? [meeting.project_id] : [],
    org_id: meeting.org_id,
    created_by: meeting.created_by,
    source_file_id: null,
    source_meeting_id: meeting.id,
    layer: "project",
    status: "approved",
    quality_level: "standard",
    hierarchy_level: chunk.hierarchy_level,
    // Colonnes QQOQCCP (v8.0.0)
    quand_date: chunk.quand_date,
    quand_phase: chunk.quand_phase,
    qui_lots: chunk.qui_lots,
    comment_normes: chunk.comment_normes,
    contenu_types: chunk.contenu_types,
    qqoqccp: chunk.qqoqccp,
    metadata: chunk.metadata,
    created_at: now,
    updated_at: now,
  }));

  // 4. Supprimer les anciens chunks de ce meeting (idempotence pour ré-extraction)
  const { error: deleteErr } = await supabase
    .schema("rag")
    .from("documents")
    .delete()
    .eq("source_meeting_id", meeting.id);

  if (deleteErr) {
    console.warn(`[vectorize] Failed to delete old chunks: ${deleteErr.message}`);
  }

  // 5. Insérer les nouveaux chunks
  const { data: insertedDocs, error: insertErr } = await supabase
    .schema("rag")
    .from("documents")
    .insert(rows)
    .select("id");

  if (insertErr) {
    throw new Error(`Vectorization insert failed: ${insertErr.message}`);
  }

  const vectorizeMs = Date.now() - startTime;
  const count = insertedDocs?.length || 0;

  console.log(`[vectorize] Inserted ${count} chunks in ${vectorizeMs}ms (1 L0 + ${count - 1} L1)`);

  return { chunks_inserted: count, vectorize_ms: vectorizeMs };
}
