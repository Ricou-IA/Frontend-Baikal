// ============================================================================
// baikal-retrieval - Routing: Analyse heuristique de la question (Sprint 2, T1)
// ============================================================================
// L'analyse LLM (analyzeQuery, OpenAI) n'était plus appelée depuis la v2.0 :
// supprimée. Ne reste que l'analyse par mots-clés, synchrone et sans I/O.
// L'intent détecté est CONSERVÉ : jusqu'à la v2.1.0, safeRequiresSearch le
// remplaçait par « factual » dès que la question contenait un mot interrogatif
// ou un « ? » — aucune comparaison n'atteignait la production (0 sur 576 requêtes
// journalisées en 30 jours). Les questions de suivi sont condensées en amont
// (routing/condenser.ts) avant d'arriver ici.
// ============================================================================

import type { AnalysisResult, AnswerFormat, DocumentCle } from "../types.ts"
import { detectIntentByKeywords, extractKeywords } from "./safety.ts"
import { detectCrossRef } from "./cross-ref.ts"

const SEARCH_CONFIGS: Record<string, AnalysisResult['search_config']> = {
  factual: { scope: 'narrow', max_files: 2, min_similarity: 0.42, boost_documents: [], file_filter: null },
  synthesis: { scope: 'broad', max_files: 5, min_similarity: 0.35, boost_documents: [], file_filter: null },
  comparison: { scope: 'broad', max_files: 5, min_similarity: 0.35, boost_documents: [], file_filter: null },
  citation: { scope: 'narrow', max_files: 1, min_similarity: 0.6, boost_documents: [], file_filter: null },
  conversational: { scope: 'narrow', max_files: 0, min_similarity: 0.5, boost_documents: [], file_filter: null },
}

const FORMATS: Record<string, AnswerFormat> = {
  factual: 'paragraph', synthesis: 'paragraph', comparison: 'table', citation: 'quote', conversational: 'paragraph',
}

export function buildFallbackAnalysis(
  query: string,
  documentsCles: DocumentCle[],
): AnalysisResult {
  const intent = detectIntentByKeywords(query)
  const requiresSearch = intent !== 'conversational'

  const q = query.toLowerCase()
  const detectedDocs = documentsCles
    .filter(d => q.includes(d.slug.toLowerCase()) || q.includes(d.label.toLowerCase()))
    .map(d => d.label)

  // Cross-ref heuristique (synchrone, 0 ms — aucun I/O)
  const crossRef = detectCrossRef(query)

  const result: AnalysisResult = {
    intent,
    requires_search: requiresSearch,
    rewritten_query: query,
    detected_documents: detectedDocs,
    search_config: SEARCH_CONFIGS[intent] || SEARCH_CONFIGS.factual,
    answer_format: FORMATS[intent] || 'paragraph',
    key_concepts: extractKeywords(query),
    reasoning: 'Analyse par mots-clés',
  }

  if (crossRef.is_cross_ref) {
    result.cross_ref = crossRef
    result.detected_documents = [...new Set([...result.detected_documents, ...crossRef.detected_documents])]
    result.requires_search = true
    console.log(`[retrieval] Cross-ref detected (heuristic): norms=[${crossRef.detected_norms.join(', ')}], docs=[${crossRef.detected_documents.join(', ')}], lot=${crossRef.detected_lot}`)
  }

  return result
}
