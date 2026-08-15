// ============================================================================
// baikal-retrieval - Search: Cohere Reranker (feature-flagged)
// ============================================================================

import type { ChunkResult, FeatureFlags, SearchResult } from "../types.ts"

// ============================================================================
// RERANK
// ============================================================================

export async function rerankIfEnabled(
  searchResult: SearchResult,
  query: string,
  features: FeatureFlags,
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
    const rerankedPrimary = await callCohereRerank(
      primaryChunks,
      query,
      cohereApiKey,
      features.cohere_model,
      features.cohere_top_n,
    )

    // Build parent ID -> re-score map for children inheritance
    const parentScores = new Map<number, number>()
    for (const chunk of rerankedPrimary) {
      parentScores.set(chunk.chunk_id, chunk.similarity)
    }

    // Children inherit parent's new score
    const rerankedChildren = childChunks.map(child => {
      if (child.parent_chunk_id && parentScores.has(child.parent_chunk_id)) {
        return { ...child, similarity: parentScores.get(child.parent_chunk_id)! }
      }
      return child
    })

    // Merge: primaries first (by reranked order), then children
    const allChunks = [...rerankedPrimary, ...rerankedChildren]

    console.log(`[retrieval] Reranked: ${primaryChunks.length} primary chunks via ${features.cohere_model}`)

    return {
      ...searchResult,
      chunks: allChunks,
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
): Promise<ChunkResult[]> {
  const documents = chunks.map(c => c.content)

  const response = await fetch("https://api.cohere.com/v2/rerank", {
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
