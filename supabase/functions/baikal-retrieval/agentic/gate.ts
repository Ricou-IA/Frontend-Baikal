// ============================================================================
// baikal-retrieval - Agentic: Quality gate (Sprint 1, S1.5 — P5)
// ============================================================================
// Décide si le chemin rapide suffit. Seuls les chunks portés par une vraie
// similarité cosine (vector / intersection) comptent ; la décision repose sur
// leur NOMBRE et sur la MEILLEURE similarité, pas sur une moyenne mélangeant
// des échelles hétérogènes. La raison est tracée dans rag.query_logs.
// ============================================================================

import type { ChunkResult, AgenticConfig } from "../types.ts"

export type GateReason = 'disabled' | 'too_few_vector_chunks' | 'low_max_similarity' | 'fast_path_ok' | 'no_gemini_key'

export interface GateDecision {
  trigger: boolean
  reason: GateReason
  n_vector: number
  max_sim: number
  avg_sim: number
}

export function evaluateAgenticGate(chunks: ChunkResult[], cfg: AgenticConfig): GateDecision {
  const cosine = chunks.filter(c => c.match_source === 'vector' || c.match_source === 'intersection')
  const n_vector = cosine.length
  const max_sim = n_vector ? Math.max(...cosine.map(c => c.similarity)) : 0
  const avg_sim = n_vector ? cosine.reduce((s, c) => s + c.similarity, 0) / n_vector : 0

  if (!cfg.enabled) return { trigger: false, reason: 'disabled', n_vector, max_sim, avg_sim }
  if (n_vector < cfg.quality_threshold) return { trigger: true, reason: 'too_few_vector_chunks', n_vector, max_sim, avg_sim }
  if (max_sim < cfg.similarity_threshold) return { trigger: true, reason: 'low_max_similarity', n_vector, max_sim, avg_sim }
  return { trigger: false, reason: 'fast_path_ok', n_vector, max_sim, avg_sim }
}
