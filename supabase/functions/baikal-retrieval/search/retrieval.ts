// ============================================================================
// baikal-retrieval - Search: Retrieval (match_documents_v14 + intersection boost)
// ============================================================================

import type {
  Supabase, LibrarianConfig, FeatureFlags, IntentStrategy,
  SearchConfig, ChunkResult, FileInfo, SearchResult, CrossRefAnalysis,
} from "../types.ts"
import { CROSS_REF_CONFIG } from "../config.ts"

// ============================================================================
// EXECUTE SEARCH
// ============================================================================

export async function executeSearch(
  supabase: Supabase,
  queryEmbedding: number[],
  queryText: string,
  userId: string,
  effectiveOrgId: string | null,
  projectId: string | undefined,
  effectiveAppId: string,
  config: LibrarianConfig,
  layerFlags: { app: boolean; org: boolean; project: boolean; user: boolean },
  filterSourceTypes: string[] | undefined,
  searchConfig: SearchConfig,
  intent: string | undefined,
  intentStrategy: IntentStrategy,
  features: FeatureFlags,
): Promise<SearchResult> {

  // v1.1.1: EXACT copy of librarian-v4 search logic
  const intentParams = intent ? (config.intent_config[intent] || null) : null
  const effectiveMatchCount = intentParams?.match_count || config.match_count
  const effectiveThreshold = intentParams?.min_similarity || config.match_threshold

  // Hard restriction: si l'analyse a explicitement detecte un filtre fichier
  // (ex: utilisateur dit "uniquement dans le CCAP"), restreindre la recherche
  // a ces noms. Sinon, laisser la recherche large et compter sur le boost
  // soft des boost_documents dans buildFileInfos.
  const effectiveFileFilter = (searchConfig.file_filter && searchConfig.file_filter.length > 0)
    ? searchConfig.file_filter
    : null

  console.log(`[retrieval] Search v14: match_count=${effectiveMatchCount}, threshold=${effectiveThreshold}`)
  console.log(`[retrieval] Hierarchy: levels=${JSON.stringify(intentStrategy.hierarchy_levels)}, include_children=${intentStrategy.include_children}`)
  if (effectiveFileFilter) {
    console.log(`[retrieval] Hard file filter applied: filenames=[${effectiveFileFilter.join(', ')}]`)
  }

  const { data, error } = await supabase.schema('rag').rpc('match_documents_v14', {
    query_embedding: queryEmbedding,
    query_text: queryText,
    p_user_id: userId,
    p_org_id: effectiveOrgId,
    p_project_id: projectId || null,
    p_app_id: effectiveAppId,
    match_count: effectiveMatchCount,
    similarity_threshold: effectiveThreshold,
    include_app_layer: layerFlags.app,
    include_org_layer: layerFlags.org,
    include_project_layer: layerFlags.project,
    include_user_layer: layerFlags.user,
    filter_source_types: filterSourceTypes || null,
    filter_file_ids: null,
    filter_filenames: effectiveFileFilter,
    enable_concept_expansion: config.enable_concept_expansion,
    p_hierarchy_levels: intentStrategy.hierarchy_levels,
    p_include_children: intentStrategy.include_children,
  })

  if (error) throw new Error(`Search error: ${error.message}`)

  // v1.1.1: Direct mapping like librarian-v4 (no adaptive threshold, no no-results detection)
  const chunks = mapChunks(data || [])

  // v4: Stats logging
  const l0 = chunks.filter(c => c.hierarchy_level === 0).length
  const l1 = chunks.filter(c => c.hierarchy_level === 1).length
  const children = chunks.filter(c => c.retrieval_role === 'child').length
  console.log(`[retrieval] Chunks: ${chunks.length} total (L0=${l0}, L1=${l1}, children=${children})`)

  const meetingChunks = chunks.filter(c => c.metadata?.source_type === 'meeting_transcript')
  const fileChunks = chunks.filter(c => c.metadata?.source_type !== 'meeting_transcript')

  // Build file info
  const files = buildFileInfos(fileChunks, searchConfig.boost_documents, config)

  // Improvement D: Use max_files from Brain's search_config
  const maxFiles = searchConfig.max_files || config.gemini_max_files
  const filteredFiles = files.slice(0, maxFiles)
  const totalPages = filteredFiles.reduce((sum, f) => sum + f.total_pages, 0)

  return {
    chunks,
    files: filteredFiles,
    meetingChunks,
    totalPages,
    filterApplied: effectiveFileFilter !== null,
    fallbackUsed: false,     // v1.1.1: match librarian-v4 interface
    reranked: false,
  }
}

// ============================================================================
// MAP RPC RESULTS -> ChunkResult[]
// ============================================================================

function mapChunks(data: Record<string, unknown>[]): ChunkResult[] {
  return data.map(d => ({
    chunk_id: d.out_chunk_id as number,
    content: d.out_content as string,
    similarity: d.out_similarity as number,
    metadata: d.out_metadata as Record<string, unknown>,
    layer: d.out_layer as string,
    source_file_id: d.out_source_file_id as string | null,
    matched_concepts: (d.out_matched_concepts as string[]) || [],
    rank_score: d.out_rank_score as number,
    match_source: d.out_match_source as string,
    filter_applied: d.out_filter_applied as boolean,
    file_storage_path: d.out_file_storage_path as string | null,
    file_storage_bucket: d.out_file_storage_bucket as string | null,
    file_original_filename: d.out_file_original_filename as string | null,
    file_mime_type: d.out_file_mime_type as string | null,
    file_total_pages: (d.out_file_total_pages as number) || 1,
    file_max_similarity: d.out_file_max_similarity as number | null,
    file_chunk_count: d.out_file_chunk_count as number | null,
    hierarchy_level: (d.out_hierarchy_level as number) ?? 1,
    parent_chunk_id: d.out_parent_chunk_id as number | null,
    retrieval_role: (d.out_retrieval_role as 'primary' | 'child') || 'primary',
    section_title: d.out_section_title as string | null,
  }))
}

// ============================================================================
// BUILD FILE INFOS
// ============================================================================

function buildFileInfos(
  chunks: ChunkResult[],
  boostDocuments: string[],
  config: LibrarianConfig,
): FileInfo[] {
  const filesMap = new Map<string, {
    info: Omit<FileInfo, 'score' | 'is_boosted' | 'avg_similarity'>
    similarities: number[]
    chunkCount: number
  }>()

  for (const chunk of chunks) {
    if (!chunk.source_file_id || !chunk.file_storage_path) continue

    if (!filesMap.has(chunk.source_file_id)) {
      filesMap.set(chunk.source_file_id, {
        info: {
          file_id: chunk.source_file_id,
          storage_path: chunk.file_storage_path,
          storage_bucket: chunk.file_storage_bucket || 'documents',
          original_filename: chunk.file_original_filename || 'Document',
          mime_type: chunk.file_mime_type || 'application/pdf',
          total_pages: chunk.file_total_pages,
          max_similarity: chunk.similarity,
          chunk_count: 0,
          layer: chunk.layer,
        },
        similarities: [],
        chunkCount: 0,
      })
    }

    const fd = filesMap.get(chunk.source_file_id)!
    fd.similarities.push(chunk.similarity)
    fd.chunkCount++
    if (chunk.similarity > fd.info.max_similarity) {
      fd.info.max_similarity = chunk.similarity
    }
  }

  const files: FileInfo[] = Array.from(filesMap.values()).map(({ info, similarities, chunkCount }) => {
    const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length
    const isBoosted = boostDocuments.some(doc =>
      info.original_filename.toLowerCase().includes(doc.toLowerCase())
    )
    const boostMultiplier = isBoosted ? config.boost_on_mention : 1.0
    const score = chunkCount * avgSimilarity * boostMultiplier * config.boost_factor

    return {
      ...info,
      avg_similarity: avgSimilarity,
      chunk_count: chunkCount,
      score,
      is_boosted: isBoosted,
    }
  })

  files.sort((a, b) => b.score - a.score)
  return files
}

// ============================================================================
// CROSS-REF DUAL-SCOPE SEARCH
// ============================================================================

export async function executeCrossRefSearch(
  supabase: Supabase,
  queryEmbedding: number[],
  queryText: string,
  userId: string,
  effectiveOrgId: string | null,
  projectId: string | undefined,
  effectiveAppId: string,
  config: LibrarianConfig,
  filterSourceTypes: string[] | undefined,
  searchConfig: SearchConfig,
  intent: string | undefined,
  intentStrategy: IntentStrategy,
  crossRef: CrossRefAnalysis,
): Promise<SearchResult> {
  const intentParams = intent ? (config.intent_config[intent] || null) : null
  const effectiveMatchCount = intentParams?.match_count || config.match_count
  const effectiveThreshold = intentParams?.min_similarity || config.match_threshold

  const { normBoost, maxChunksFused, appLayerLimit, projectLayerLimit } = CROSS_REF_CONFIG.search

  // Strategy 1: Explicit norms detected → dual-scope (project + app layer filtered by norm names)
  if (crossRef.detected_norms.length > 0) {
    console.log(`[retrieval] Cross-ref: dual-scope search (norms=[${crossRef.detected_norms.join(', ')}])`)

    const [projectResult, appResult] = await Promise.all([
      // Search 1: Project layer only
      supabase.schema('rag').rpc('match_documents_v14', {
        query_embedding: queryEmbedding,
        query_text: queryText,
        p_user_id: userId,
        p_org_id: effectiveOrgId,
        p_project_id: projectId || null,
        p_app_id: effectiveAppId,
        match_count: projectLayerLimit,
        similarity_threshold: effectiveThreshold,
        include_app_layer: false,
        include_org_layer: false,
        include_project_layer: true,
        include_user_layer: false,
        filter_source_types: filterSourceTypes || null,
        filter_file_ids: null,
        filter_filenames: null,
        enable_concept_expansion: config.enable_concept_expansion,
        p_hierarchy_levels: intentStrategy.hierarchy_levels,
        p_include_children: intentStrategy.include_children,
      }),
      // Search 2: App layer filtered by norm filenames
      supabase.schema('rag').rpc('match_documents_v14', {
        query_embedding: queryEmbedding,
        query_text: queryText,
        p_user_id: userId,
        p_org_id: effectiveOrgId,
        p_project_id: projectId || null,
        p_app_id: effectiveAppId,
        match_count: appLayerLimit,
        similarity_threshold: effectiveThreshold,
        include_app_layer: true,
        include_org_layer: false,
        include_project_layer: false,
        include_user_layer: false,
        filter_source_types: filterSourceTypes || null,
        filter_file_ids: null,
        filter_filenames: crossRef.detected_norms,
        enable_concept_expansion: config.enable_concept_expansion,
        p_hierarchy_levels: intentStrategy.hierarchy_levels,
        p_include_children: intentStrategy.include_children,
      }),
    ])

    if (projectResult.error) throw new Error(`Cross-ref project search error: ${projectResult.error.message}`)
    if (appResult.error) throw new Error(`Cross-ref app search error: ${appResult.error.message}`)

    const projectChunks = mapChunks(projectResult.data || [])
    const appChunks = mapChunks(appResult.data || [])

    console.log(`[retrieval] Cross-ref results: project=${projectChunks.length}, app=${appChunks.length}`)

    const fused = fuseCrossRefChunks(projectChunks, appChunks, crossRef.detected_norms, normBoost, maxChunksFused)
    return buildCrossRefResult(fused, searchConfig, config)
  }

  // Strategy 2: Project docs detected (no explicit norms) → single search filtered by doc names
  if (crossRef.detected_documents.length > 0 && crossRef.detected_norms.length === 0) {
    console.log(`[retrieval] Cross-ref: filtered search (docs=[${crossRef.detected_documents.join(', ')}])`)

    const { data, error } = await supabase.schema('rag').rpc('match_documents_v14', {
      query_embedding: queryEmbedding,
      query_text: queryText,
      p_user_id: userId,
      p_org_id: effectiveOrgId,
      p_project_id: projectId || null,
      p_app_id: effectiveAppId,
      match_count: effectiveMatchCount,
      similarity_threshold: effectiveThreshold,
      include_app_layer: true,
      include_org_layer: true,
      include_project_layer: true,
      include_user_layer: false,
      filter_source_types: filterSourceTypes || null,
      filter_file_ids: null,
      filter_filenames: crossRef.detected_documents,
      enable_concept_expansion: config.enable_concept_expansion,
      p_hierarchy_levels: intentStrategy.hierarchy_levels,
      p_include_children: intentStrategy.include_children,
    })

    if (error) throw new Error(`Cross-ref doc search error: ${error.message}`)

    const chunks = mapChunks(data || [])
    console.log(`[retrieval] Cross-ref doc search: ${chunks.length} chunks`)
    return buildCrossRefResult(chunks, searchConfig, config)
  }

  // Strategy 3: Implicit cross-ref (lot detected, no explicit norms)
  // Search project first, extract norms from chunks metadata, then search app layer
  console.log(`[retrieval] Cross-ref: implicit (lot=${crossRef.detected_lot})`)

  const { data: projectData, error: projectError } = await supabase.schema('rag').rpc('match_documents_v14', {
    query_embedding: queryEmbedding,
    query_text: queryText,
    p_user_id: userId,
    p_org_id: effectiveOrgId,
    p_project_id: projectId || null,
    p_app_id: effectiveAppId,
    match_count: projectLayerLimit,
    similarity_threshold: effectiveThreshold,
    include_app_layer: false,
    include_org_layer: false,
    include_project_layer: true,
    include_user_layer: false,
    filter_source_types: filterSourceTypes || null,
    filter_file_ids: null,
    filter_filenames: null,
    enable_concept_expansion: config.enable_concept_expansion,
    p_hierarchy_levels: intentStrategy.hierarchy_levels,
    p_include_children: intentStrategy.include_children,
  })

  if (projectError) throw new Error(`Cross-ref implicit project search error: ${projectError.message}`)

  const projectChunks = mapChunks(projectData || [])

  // Extract norms referenced in project chunks metadata (comment_normes)
  const extractedNorms = extractNormsFromChunks(projectChunks)
  console.log(`[retrieval] Cross-ref implicit: ${projectChunks.length} project chunks, extracted norms=[${extractedNorms.join(', ')}]`)

  if (extractedNorms.length === 0) {
    // No norms found in project chunks — return project results only
    return buildCrossRefResult(projectChunks, searchConfig, config)
  }

  // Search app layer with extracted norms
  const { data: appData, error: appError } = await supabase.schema('rag').rpc('match_documents_v14', {
    query_embedding: queryEmbedding,
    query_text: queryText,
    p_user_id: userId,
    p_org_id: effectiveOrgId,
    p_project_id: projectId || null,
    p_app_id: effectiveAppId,
    match_count: appLayerLimit,
    similarity_threshold: effectiveThreshold,
    include_app_layer: true,
    include_org_layer: false,
    include_project_layer: false,
    include_user_layer: false,
    filter_source_types: filterSourceTypes || null,
    filter_file_ids: null,
    filter_filenames: extractedNorms,
    enable_concept_expansion: config.enable_concept_expansion,
    p_hierarchy_levels: intentStrategy.hierarchy_levels,
    p_include_children: intentStrategy.include_children,
  })

  if (appError) throw new Error(`Cross-ref implicit app search error: ${appError.message}`)

  const appChunks = mapChunks(appData || [])
  console.log(`[retrieval] Cross-ref implicit: ${appChunks.length} app chunks from norms`)

  const fused = fuseCrossRefChunks(projectChunks, appChunks, extractedNorms, normBoost, maxChunksFused)
  return buildCrossRefResult(fused, searchConfig, config)
}

// ============================================================================
// FUSION: Interleave project + app chunks by rank_score with norm boost
// ============================================================================

function fuseCrossRefChunks(
  projectChunks: ChunkResult[],
  appChunks: ChunkResult[],
  norms: string[],
  normBoost: number,
  maxChunks: number,
): ChunkResult[] {
  // Boost app chunks that mention detected norms
  const boostedAppChunks = appChunks.map(chunk => {
    const content = chunk.content.toLowerCase()
    const mentionsNorm = norms.some(n => content.includes(n.toLowerCase()))
    if (mentionsNorm) {
      return { ...chunk, rank_score: chunk.rank_score * normBoost }
    }
    return chunk
  })

  // Also boost project chunks that mention the norms
  const boostedProjectChunks = projectChunks.map(chunk => {
    const content = chunk.content.toLowerCase()
    const mentionsNorm = norms.some(n => content.includes(n.toLowerCase()))
    if (mentionsNorm) {
      return { ...chunk, rank_score: chunk.rank_score * normBoost }
    }
    return chunk
  })

  // Merge and sort by rank_score descending
  const all = [...boostedProjectChunks, ...boostedAppChunks]
  all.sort((a, b) => b.rank_score - a.rank_score)

  return all.slice(0, maxChunks)
}

// ============================================================================
// EXTRACT NORMS FROM CHUNK METADATA (comment_normes field)
// ============================================================================

function extractNormsFromChunks(chunks: ChunkResult[]): string[] {
  const norms = new Set<string>()
  for (const chunk of chunks) {
    const commentNormes = chunk.metadata?.comment_normes
    if (Array.isArray(commentNormes)) {
      for (const norm of commentNormes) {
        if (typeof norm === 'string' && norm.trim()) {
          norms.add(norm.trim())
        }
      }
    }
  }
  return [...norms]
}

// ============================================================================
// BUILD CROSS-REF SEARCH RESULT
// ============================================================================

function buildCrossRefResult(
  chunks: ChunkResult[],
  searchConfig: SearchConfig,
  config: LibrarianConfig,
): SearchResult {
  const l0 = chunks.filter(c => c.hierarchy_level === 0).length
  const l1 = chunks.filter(c => c.hierarchy_level === 1).length
  const children = chunks.filter(c => c.retrieval_role === 'child').length
  console.log(`[retrieval] Cross-ref final: ${chunks.length} chunks (L0=${l0}, L1=${l1}, children=${children})`)

  const meetingChunks = chunks.filter(c => c.metadata?.source_type === 'meeting_transcript')
  const fileChunks = chunks.filter(c => c.metadata?.source_type !== 'meeting_transcript')

  const files = buildFileInfos(fileChunks, searchConfig.boost_documents, config)
  const maxFiles = searchConfig.max_files || config.gemini_max_files
  const filteredFiles = files.slice(0, maxFiles)
  const totalPages = filteredFiles.reduce((sum, f) => sum + f.total_pages, 0)

  return {
    chunks,
    files: filteredFiles,
    meetingChunks,
    totalPages,
    filterApplied: true,
    fallbackUsed: false,
    reranked: false,
  }
}
