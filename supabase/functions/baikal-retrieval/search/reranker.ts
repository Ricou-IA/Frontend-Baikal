// ============================================================================
// baikal-retrieval - Search: Cohere Reranker (feature-flagged)
// ============================================================================

import type { ChunkResult, FeatureFlags, SearchResult } from "../types.ts"

// ============================================================================
// POOL DE CANDIDATS (Sprint 3, S3.3)
// ============================================================================

/** Élargit match_count quand le reranking est actif : Cohere a besoin d'un pool plus large que le fast path. */
export function candidateCount(base: number, features: FeatureFlags): number {
  return features.enable_reranking ? Math.max(base, features.cohere_candidates) : base
}

// ============================================================================
// RERANK
// ============================================================================

/** Les extraits ciblés (documents nommés) ne sont jamais perdus par la troncature Cohere. */
export function keepTargetedFirst(reranked: ChunkResult[], original: ChunkResult[], topN: number): ChunkResult[] {
  const inReranked = new Set(reranked.map(c => c.chunk_id))
  const targetedIds = new Set(original.filter(c => c.targeted).map(c => c.chunk_id))
  const targeted = [
    ...reranked.filter(c => targetedIds.has(c.chunk_id)),
    ...original.filter(c => c.targeted && !inReranked.has(c.chunk_id)),
  ]
  const others = reranked.filter(c => !targetedIds.has(c.chunk_id))
  if (targeted.length + others.length > topN) console.log(`[retrieval] Rerank: ${targeted.length} extrait(s) ciblé(s) conservé(s) au-delà de top_n=${topN}`)
  return [...targeted, ...others]
}

export async function rerankIfEnabled(
  searchResult: SearchResult,
  query: string,
  features: FeatureFlags,
  fetchFn: typeof fetch = fetch,
): Promise<SearchResult> {
  if (!features.enable_reranking) return searchResult

  const cohereApiKey = Deno.env.get("COHERE_API_KEY")
  if (!cohereApiKey) {
    console.warn('[retrieval] Reranking enabled but COHERE_API_KEY not set, skipping')
    return searchResult
  }

  if (searchResult.chunks.length === 0) return searchResult

  try {
    // Separate primary and child chunks
    const primaryChunks = searchResult.chunks.filter(c => c.retrieval_role === 'primary')
    const childChunks = searchResult.chunks.filter(c => c.retrieval_role === 'child')

    if (primaryChunks.length === 0) return searchResult

    // Rerank only primary chunks
    const reranked = await callCohereRerank(
      primaryChunks,
      query,
      cohereApiKey,
      features.cohere_model,
      features.cohere_top_n,
      fetchFn,
    )

    // Les extraits ciblés tronqués par Cohere sont réinjectés (S3.3)
    const primaries = keepTargetedFirst(reranked, primaryChunks, features.cohere_top_n)

    // Les enfants suivent leur parent (score hérité) ; un enfant dont le parent est sorti disparaît avec lui
    const ordered: ChunkResult[] = []
    for (const p of primaries) {
      ordered.push(p)
      for (const child of childChunks) {
        if (child.parent_chunk_id === p.chunk_id) ordered.push({ ...child, similarity: p.similarity })
      }
    }

    console.log(`[retrieval] Reranked: ${primaryChunks.length} primaires → ${primaries.length} via ${features.cohere_model} (ciblés préservés: ${primaries.filter(c => c.targeted).length})`)

    return {
      ...searchResult,
      chunks: ordered,
      reranked: true,
    }
  } catch (error) {
    console.error('[retrieval] Reranking failed, using original order:', error)
    return searchResult
  }
}

// ============================================================================
// COHERE API CALL
// ============================================================================

async function callCohereRerank(
  chunks: ChunkResult[],
  query: string,
  apiKey: string,
  model: string,
  topN: number,
  fetchFn: typeof fetch,
): Promise<ChunkResult[]> {
  const documents = chunks.map(c => c.content)

  const response = await fetchFn("https://api.cohere.com/v2/rerank", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      query,
      documents,
      top_n: Math.min(topN, documents.length),
    }),
    signal: AbortSignal.timeout(8_000),
  })

  if (!response.ok) {
    throw new Error(`Cohere rerank error: ${response.status} ${await response.text()}`)
  }

  const data = await response.json()
  const results = data.results as Array<{ index: number; relevance_score: number }>

  // Reorder chunks by Cohere relevance score
  return results.map(r => ({
    ...chunks[r.index],
    similarity: r.relevance_score,  // Replace vector similarity with rerank score
    rank_score: r.relevance_score,
  }))
}
