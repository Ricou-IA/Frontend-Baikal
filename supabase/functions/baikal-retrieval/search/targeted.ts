// ============================================================================
// baikal-retrieval - Search: Recherche ciblée par document nommé (Sprint 2, T5)
// ============================================================================
// Quand la question nomme un document résolu sur les fichiers ingérés (T4),
// une recherche restreinte à ce fichier (filter_file_ids) tourne en parallèle
// de la recherche globale ; la fusion garantit des extraits de CHAQUE document
// nommé. Deux documents nommés = comparaison déterministe (S2.3) sans boucle
// agentique ; un seul = « dans le CCAP ? », « d'après le CR 41 ». Aucun LLM.
// ============================================================================

import type {
  Supabase, LibrarianConfig, IntentStrategy, SearchConfig, ChunkResult, SearchResult,
  NamedDocumentResolution, NamedDocumentLayer,
} from "../types.ts"
import { MATCH_DOCUMENTS_FN } from "../config.ts"
import { toFtsQuery, mapChunks, buildFileInfos } from "./retrieval.ts"

export interface NamedTarget {
  phrase: string
  names: string[]
  fileIds: string[]
  layer: NamedDocumentLayer
}

export interface TargetedResult {
  target: NamedTarget
  chunks: ChunkResult[]
}

// Constantes (pas de config DB : S2.5 est le seul réglage prévu ce sprint)
export const TARGETED_CHUNKS_PER_DOCUMENT = 6
export const TARGETED_SIMILARITY_THRESHOLD = 0.25   // seuil bas : le document est déjà désigné, comme search_in_file

export function buildNamedTargets(resolutions: NamedDocumentResolution[]): NamedTarget[] {
  const targets: NamedTarget[] = []
  const seen = new Set<string>()
  for (const r of resolutions) {
    if (r.status !== 'found' || r.found_file_ids.length === 0) continue
    const key = [...r.found_file_ids].sort().join(',')
    if (seen.has(key)) continue
    seen.add(key)
    targets.push({ phrase: r.phrase, names: r.found, fileIds: r.found_file_ids, layer: r.layer ?? 'project' })
  }
  return targets
}

/** Libellé des étapes SSE : le nom du fichier s'il est unique, sinon la mention de l'utilisateur. */
export function targetLabel(t: NamedTarget): string {
  return t.names.length === 1 ? t.names[0] : t.phrase
}

export async function executeTargetedSearches(
  supabase: Supabase,
  queryEmbedding: number[],
  queryText: string,
  userId: string,
  effectiveOrgId: string | null,
  projectId: string | undefined,
  effectiveAppId: string,
  config: LibrarianConfig,
  filterSourceTypes: string[] | undefined,
  intentStrategy: IntentStrategy,
  targets: NamedTarget[],
): Promise<TargetedResult[]> {
  if (targets.length === 0) return []
  const ftsQuery = toFtsQuery(queryText)
  return await Promise.all(targets.map(async (target): Promise<TargetedResult> => {
    try {
      const { data, error } = await supabase.schema('rag').rpc(MATCH_DOCUMENTS_FN, {
        query_embedding: queryEmbedding,
        query_text: ftsQuery,
        p_user_id: userId,
        p_org_id: effectiveOrgId,
        p_project_id: projectId || null,
        p_app_id: effectiveAppId,
        match_count: TARGETED_CHUNKS_PER_DOCUMENT,
        similarity_threshold: TARGETED_SIMILARITY_THRESHOLD,
        include_app_layer: true,
        include_org_layer: true,
        include_project_layer: true,
        include_user_layer: false,
        filter_source_types: filterSourceTypes || null,
        filter_file_ids: target.fileIds,
        filter_filenames: null,
        enable_concept_expansion: config.enable_concept_expansion,
        p_hierarchy_levels: intentStrategy.hierarchy_levels,
        p_include_children: intentStrategy.include_children,
        p_app_layer_weight: 1.0,          // le document est désigné : aucune pénalité de couche
        p_children_per_parent: 3,
      })
      if (error) {
        console.warn(`[targeted] ${targetLabel(target)}: ${error.message}`)
        return { target, chunks: [] }
      }
      const chunks = mapChunks(data || [])
      console.log(`[targeted] ${targetLabel(target)}: ${chunks.length} extraits`)
      return { target, chunks }
    } catch (err) {
      console.warn(`[targeted] ${targetLabel(target)} error:`, err)
      return { target, chunks: [] }
    }
  }))
}

/** Extraits ciblés d'abord (ordre des mentions), puis extraits globaux non déjà présents. */
export function mergeTargeted(
  global: SearchResult,
  targeted: TargetedResult[],
  config: LibrarianConfig,
  searchConfig: SearchConfig,
): SearchResult {
  const seen = new Set<number>()
  const merged: ChunkResult[] = []
  const push = (c: ChunkResult) => { if (!seen.has(c.chunk_id)) { seen.add(c.chunk_id); merged.push(c) } }
  for (const t of targeted) for (const c of t.chunks) push(c)
  for (const c of global.chunks) push(c)

  const meetingChunks = merged.filter(c => c.metadata?.source_type === 'meeting_transcript')
  const fileChunks = merged.filter(c => c.metadata?.source_type !== 'meeting_transcript')
  const files = buildFileInfos(fileChunks, searchConfig.boost_documents, config)
  const maxFiles = searchConfig.max_files || config.gemini_max_files
  const filteredFiles = files.slice(0, maxFiles)
  return {
    ...global,
    chunks: merged,
    files: filteredFiles,
    meetingChunks,
    totalPages: filteredFiles.reduce((sum, f) => sum + f.total_pages, 0),
    filterApplied: true,
  }
}

/** Trace par mention : combien d'extraits la recherche ciblée a ramenés (rag.query_logs.named_documents). */
export function annotateTargeted(resolutions: NamedDocumentResolution[], targeted: TargetedResult[]): void {
  for (const r of resolutions) {
    if (r.status !== 'found') continue
    const key = [...r.found_file_ids].sort().join(',')
    const hit = targeted.find(t => [...t.target.fileIds].sort().join(',') === key)
    if (hit) r.targeted_chunks = hit.chunks.length
  }
}

/** Forme envoyée au frontend dans l'événement `sources` (bouton « Approfondir », T8). */
export function slimNamedDocuments(resolutions: NamedDocumentResolution[]) {
  return resolutions
    .filter(r => r.status !== 'unknown')
    .map(r => ({
      phrase: r.phrase, status: r.status, found: r.found, file_ids: r.found_file_ids,
      layer: r.layer, targeted_chunks: r.targeted_chunks ?? 0,
    }))
}
