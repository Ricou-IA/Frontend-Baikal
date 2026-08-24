// ============================================================================
// baikal-retrieval - Logging: persistance des métriques par requête (Sprint 0)
// ============================================================================
//
// Une ligne dans rag.query_logs par requête, écrite en fin de pipeline.
// logQuery() n'émet JAMAIS d'exception et ne modifie aucun comportement :
// en cas d'échec d'insertion, un warn console et on continue.
// Spec : Frontend-ARPET/docs/SPEC_RAG_OPTIM_V1.md §4.5
// ============================================================================

import type { Supabase } from "./types.ts"

// ============================================================================
// TYPES
// ============================================================================

export interface QueryLogEntry {
  conversation_id?: string | null
  user_id: string
  org_id?: string | null
  project_id?: string | null
  app_id: string
  query: string
  rewritten_query?: string | null
  intent?: string
  answer_format?: string
  fast_path?: boolean
  generation_mode?: string
  model?: string | null
  memory_hit?: boolean
  reranked?: boolean
  agentic?: {
    triggered: boolean
    iterations?: number
    timed_out?: boolean
    steps?: unknown[]
  } | null
  counts?: Record<string, number>
  top_similarities?: number[]
  match_sources?: string[]
  sources?: unknown[]
  timings?: Record<string, number>
  processing_time_ms?: number
  error?: string | null
}

// ============================================================================
// HELPERS — extraction allégée depuis les objets du pipeline
// ============================================================================

const MAX_LOGGED_ITEMS = 20

/** Réduit SourceItem[] (ou équivalent) au strict utile pour l'analyse. */
export function slimSources(sources: unknown[]): unknown[] {
  if (!Array.isArray(sources)) return []
  return sources.slice(0, MAX_LOGGED_ITEMS).map(s => {
    const src = s as Record<string, unknown>
    return {
      chunk_id: src.id ?? null,
      file_id: src.source_file_id ?? src.file_id ?? null,
      document_name: src.document_name ?? src.original_filename ?? null,
      page: src.page ?? null,
      section: src.section_title ?? null,
      score: src.score ?? src.similarity ?? null,
      layer: src.layer ?? null,
      type: src.type ?? null,
    }
  })
}

/** Similarités + provenances des chunks retournés (ordre du ranking). */
export function chunkStats(
  chunks: Array<{ similarity?: number; match_source?: string }>,
): { top_similarities: number[]; match_sources: string[] } {
  const top = chunks.slice(0, MAX_LOGGED_ITEMS)
  return {
    top_similarities: top.map(c =>
      typeof c.similarity === 'number' ? Number(c.similarity.toFixed(4)) : 0,
    ),
    match_sources: top.map(c => c.match_source || 'unknown'),
  }
}

// ============================================================================
// INSERT (awaitable, jamais d'exception)
// ============================================================================

export async function logQuery(supabase: Supabase, entry: QueryLogEntry): Promise<void> {
  try {
    const { error } = await supabase
      .schema('rag')
      .from('query_logs')
      .insert(entry)
    if (error) {
      console.warn('[logging] query_logs insert error:', error.message)
    }
  } catch (err) {
    console.warn('[logging] query_logs error:', err)
  }
}
