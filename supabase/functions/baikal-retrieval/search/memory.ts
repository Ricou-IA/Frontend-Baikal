// ============================================================================
// baikal-retrieval - Search: QA Memory
// ============================================================================

import type { Supabase, LibrarianConfig, QAMemoryResult } from "../types.ts"

// ============================================================================
// SEARCH QA MEMORY
// ============================================================================

export async function searchQAMemory(
  supabase: Supabase,
  queryEmbedding: number[],
  orgId: string,
  projectId: string | undefined,
  config: LibrarianConfig,
): Promise<QAMemoryResult | null> {
  try {
    const { data, error } = await supabase.schema('rag').rpc('search_qa_memory', {
      p_query_embedding: queryEmbedding,
      p_org_id: orgId,
      p_project_id: projectId || null,
      p_similarity_threshold: config.qa_memory_similarity_threshold,
      p_limit: config.qa_memory_max_results,
    })

    if (error || !data || data.length === 0) return null

    const best = data[0]
    const isUsable = best.is_expert_faq || best.trust_score >= 3
    if (!isUsable) return null

    console.log(`[retrieval] Memory hit: similarity=${best.similarity.toFixed(3)}, trust=${best.trust_score}`)
    return best
  } catch {
    return null
  }
}

// ============================================================================
// INCREMENT USAGE
// ============================================================================

export async function incrementQAUsage(
  supabase: Supabase,
  qaId: string,
): Promise<void> {
  try {
    await supabase.schema('rag').rpc('increment_qa_usage', { p_qa_id: qaId })
  } catch {
    // silent
  }
}
