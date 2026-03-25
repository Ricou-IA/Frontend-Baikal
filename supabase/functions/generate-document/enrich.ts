// ============================================================================
// generate-document v2 — Enrichissement RAG à la volée
// ============================================================================
//
// Enrichit les meeting_items (decision/action/issue) avec le contexte
// contractuel (pièces marché) via recherche RAG.
//
// - Batch embed (1 seul appel OpenAI) + recherches parallèles (Promise.all)
// - Graceful : si l'enrichissement échoue, retourne les items sans contexte
// ============================================================================

import OpenAI from "npm:openai@^4.0.0";
import { createClient } from "jsr:@supabase/supabase-js@2";
import type {
  MeetingItem,
  EnrichedMeetingItem,
  RagContext,
  MeetingContext,
} from "./types.ts";

/**
 * Enrichit les items de toutes les réunions avec le contexte contractuel
 * issu des pièces marché du projet (CCTP, plans, etc.).
 *
 * - Seuls les items decision/action/issue sont enrichis (pas info)
 * - Batch embed (1 appel OpenAI) + recherches parallèles (Promise.all)
 * - Graceful : si l'enrichissement échoue, retourne les meetings inchangées
 */
export async function enrichMeetingsWithRAG(
  meetings: MeetingContext[],
  userId: string,
  orgId: string,
  projectId: string,
  supabase: ReturnType<typeof createClient>,
  openai: OpenAI,
): Promise<MeetingContext[]> {

  // Collect all items to enrich across all meetings
  const toEnrich: { meetingIdx: number; itemIdx: number; item: EnrichedMeetingItem }[] = [];

  for (let mi = 0; mi < meetings.length; mi++) {
    for (let ii = 0; ii < meetings[mi].items.length; ii++) {
      const item = meetings[mi].items[ii];
      if (item.item_type !== "info") {
        toEnrich.push({ meetingIdx: mi, itemIdx: ii, item });
      }
    }
  }

  if (toEnrich.length === 0) {
    console.log("[enrich] No items to enrich (all info type)");
    return meetings;
  }

  try {
    // 1. Batch embed — 1 seul appel API pour tous les items
    const texts = toEnrich.map(e => `${e.item.subject}. ${e.item.content || ""}`);
    console.log(`[enrich] Batch embedding ${texts.length} items...`);

    const embedResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: texts,
      dimensions: 1536,
    });

    // 2. Recherche RAG parallèle
    console.log(`[enrich] Running ${toEnrich.length} parallel RAG searches...`);

    const ragResults = await Promise.all(
      toEnrich.map(async (entry, idx) => {
        try {
          const embedding = embedResponse.data[idx].embedding;

          const { data: matches, error: rpcError } = await supabase.rpc("match_documents_v14", {
            query_embedding: JSON.stringify(embedding),
            query_text: `${entry.item.subject}. ${entry.item.content || ""}`,
            p_user_id: userId,
            p_org_id: orgId,
            p_project_id: projectId,
            p_app_id: "arpet",
            match_count: 2,
            similarity_threshold: 0.45,
            include_app_layer: false,
            include_org_layer: false,
            include_project_layer: true,
            include_user_layer: false,
            enable_concept_expansion: false,
            p_hierarchy_levels: [1],
            p_include_children: false,
          });

          if (rpcError) {
            console.warn(`[enrich] RPC error for item "${entry.item.subject}":`, rpcError.message);
            return { ...entry, rag_context: [] as RagContext[] };
          }

          // Exclure les chunks issus de meetings
          const filtered = (matches || []).filter((m: any) => {
            const meta = m.out_metadata || {};
            return meta.source_type !== "meeting" && !meta.source_meeting_id;
          });

          const rag_context: RagContext[] = filtered.map((m: any) => ({
            source_file_name: m.out_file_original_filename || "Document inconnu",
            page_start: m.out_metadata?.page_start ? parseInt(m.out_metadata.page_start) : null,
            page_end: m.out_metadata?.page_end ? parseInt(m.out_metadata.page_end) : null,
            excerpt: (m.out_content || "").substring(0, 150),
            similarity: m.out_similarity,
            section_title: m.out_section_title || null,
          }));

          if (rag_context.length > 0) {
            console.log(`[enrich] Item "${entry.item.subject}" → ${rag_context.length} match(es): ${rag_context.map(r => r.source_file_name).join(", ")}`);
          }

          return { ...entry, rag_context };
        } catch (err) {
          console.warn(`[enrich] Error enriching item "${entry.item.subject}":`, err);
          return { ...entry, rag_context: [] as RagContext[] };
        }
      })
    );

    // 3. Attacher les résultats aux items dans les meetings (in-memory)
    const updatedMeetings = meetings.map(m => ({
      ...m,
      items: m.items.map(item => ({ ...item })),
    }));

    for (const result of ragResults) {
      updatedMeetings[result.meetingIdx].items[result.itemIdx] = {
        ...updatedMeetings[result.meetingIdx].items[result.itemIdx],
        rag_context: result.rag_context,
      };
    }

    const totalMatches = ragResults.reduce((sum, r) => sum + r.rag_context.length, 0);
    const enrichedCount = ragResults.filter(r => r.rag_context.length > 0).length;
    console.log(`[enrich] Done: ${enrichedCount}/${toEnrich.length} items enriched, ${totalMatches} total RAG matches`);

    return updatedMeetings;

  } catch (err) {
    // Graceful fallback : si le batch embed échoue, retourner sans enrichissement
    console.error("[enrich] Batch enrichment failed, returning items without RAG context:", err);
    return meetings;
  }
}
