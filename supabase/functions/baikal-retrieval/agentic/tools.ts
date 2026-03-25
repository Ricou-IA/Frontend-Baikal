// ============================================================================
// baikal-retrieval v2.0 - Agentic: Tool Definitions & Execution
// ============================================================================
//
// Three tools available for the LLM orchestrator:
// 1. search_documents  - Standard hybrid search (reuses executeSearch)
// 2. list_project_files - List available files in the project
// 3. search_in_file    - Search within a specific file (for cross-doc)
// ============================================================================

import type {
  Supabase, LibrarianConfig, FeatureFlags, IntentStrategy,
  SearchConfig, ChunkResult, FileInfo, SearchResult, ToolResult,
  AgentContext, DocumentCle,
} from "../types.ts"
import { executeSearch } from "../search/retrieval.ts"
import { generateEmbedding } from "../search/embedding.ts"
import { getIntentStrategy } from "../config.ts"

// ============================================================================
// GEMINI FUNCTION DECLARATIONS (for API)
// ============================================================================

export const TOOL_DECLARATIONS = [
  {
    name: "search_documents",
    description: "Recherche hybride dans tous les documents du projet. Utilise la recherche vectorielle + full-text + GraphRAG. Reformule la query pour obtenir de meilleurs résultats si la première recherche n'a pas suffi.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "La requête de recherche. Doit être précise et contextuelle. Reformule si les résultats précédents étaient insuffisants.",
        },
        max_results: {
          type: "integer",
          description: "Nombre maximum de chunks à retourner (défaut: 8, max: 15)",
        },
        min_similarity: {
          type: "number",
          description: "Seuil minimum de similarité (défaut: 0.35, range: 0.2-0.7)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "list_project_files",
    description: "Liste les fichiers/documents disponibles dans le projet. Utilise cet outil quand tu as besoin de savoir quels documents existent avant de chercher dedans, ou quand l'utilisateur demande 'quels documents sont disponibles'.",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: "Filtrer par catégorie de document (ex: 'marche', 'technique', 'administratif'). Optionnel.",
        },
      },
      required: [],
    },
  },
  {
    name: "search_in_file",
    description: "Recherche dans un fichier spécifique. Essentiel pour les comparaisons entre documents : cherche d'abord dans le document A, puis dans le document B, puis compare les résultats.",
    parameters: {
      type: "object",
      properties: {
        file_name: {
          type: "string",
          description: "Nom ou partie du nom du fichier dans lequel chercher (ex: 'CCAP', 'CCTP', 'DPGF'). Sera matché de façon flexible.",
        },
        query: {
          type: "string",
          description: "La requête de recherche dans ce fichier spécifique.",
        },
        max_results: {
          type: "integer",
          description: "Nombre maximum de chunks à retourner (défaut: 6)",
        },
      },
      required: ["file_name", "query"],
    },
  },
]

// ============================================================================
// TOOL EXECUTION
// ============================================================================

export interface ToolExecutionContext {
  supabase: Supabase
  queryEmbedding: number[]  // Original query embedding (reused if query unchanged)
  userId: string
  effectiveOrgId: string | null
  projectId: string | undefined
  effectiveAppId: string
  config: LibrarianConfig
  features: FeatureFlags
  layerFlags: { app: boolean; org: boolean; project: boolean; user: boolean }
  filterSourceTypes: string[] | undefined
  openaiApiKey: string
  documentsCles: DocumentCle[]
}

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<ToolResult> {
  switch (toolName) {
    case 'search_documents':
      return executeSearchDocumentsTool(args, ctx)
    case 'list_project_files':
      return executeListProjectFilesTool(args, ctx)
    case 'search_in_file':
      return executeSearchInFileTool(args, ctx)
    default:
      return {
        name: toolName,
        chunks: [],
        files: [],
        summary: `Outil inconnu: ${toolName}`,
      }
  }
}

// ============================================================================
// TOOL: search_documents
// ============================================================================

async function executeSearchDocumentsTool(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<ToolResult> {
  const query = args.query as string
  const maxResults = Math.min(args.max_results as number || 8, 15)
  const minSimilarity = args.min_similarity as number || 0.35

  // Generate embedding for the new query
  const embedding = await generateEmbedding(query, ctx.openaiApiKey)

  const searchConfig: SearchConfig = {
    scope: 'broad',
    max_files: 5,
    min_similarity: minSimilarity,
    boost_documents: [],
    file_filter: null,
  }

  const intentStrategy: IntentStrategy = {
    hierarchy_levels: [0, 1],   // Both levels for maximum coverage
    include_children: true,
    mode: 'chunks',
  }

  const result = await executeSearch(
    ctx.supabase, embedding, query, ctx.userId, ctx.effectiveOrgId,
    ctx.projectId, ctx.effectiveAppId, ctx.config,
    ctx.layerFlags, ctx.filterSourceTypes,
    searchConfig, 'factual', intentStrategy, ctx.features,
  )

  // Limit to maxResults
  const chunks = result.chunks.slice(0, maxResults)

  return {
    name: 'search_documents',
    chunks,
    files: result.files,
    summary: `Recherche "${query.substring(0, 50)}": ${chunks.length} résultats dans ${result.files.length} fichier(s)`,
  }
}

// ============================================================================
// TOOL: list_project_files
// ============================================================================

async function executeListProjectFilesTool(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<ToolResult> {
  const category = args.category as string | undefined

  // Query sources.files scoped to project + org (security: never leak cross-org data)
  let query = ctx.supabase
    .schema('sources')
    .from('files')
    .select('id, original_filename, document_category, total_pages, mime_type, processing_status')
    .eq('processing_status', 'completed')

  if (ctx.projectId) {
    query = query.eq('project_id', ctx.projectId)
  }
  if (ctx.effectiveOrgId) {
    query = query.eq('org_id', ctx.effectiveOrgId)
  }
  if (category) {
    query = query.ilike('document_category', `%${category}%`)
  }

  const { data, error } = await query.order('original_filename').limit(50)

  if (error) {
    return { name: 'list_project_files', chunks: [], files: [], summary: `Erreur: ${error.message}` }
  }

  const fileList = (data || []).map((f: Record<string, unknown>) => ({
    file_id: f.id as string,
    name: f.original_filename as string,
    category: f.document_category as string || 'non classé',
    pages: f.total_pages as number || 0,
  }))

  // Build a synthetic chunk with the file list for the LLM
  const listText = fileList.map(f =>
    `- ${f.name} (${f.category}, ${f.pages} pages) [ID: ${f.file_id}]`
  ).join('\n')

  const syntheticChunk: ChunkResult = {
    chunk_id: -1,
    content: `Documents disponibles dans le projet:\n${listText}`,
    similarity: 1.0,
    metadata: { synthetic: true },
    layer: 'project',
    source_file_id: null,
    matched_concepts: [],
    rank_score: 1.0,
    match_source: 'list_project_files',
    filter_applied: false,
    file_storage_path: null,
    file_storage_bucket: null,
    file_original_filename: null,
    file_mime_type: null,
    file_total_pages: 0,
    file_max_similarity: null,
    file_chunk_count: null,
    hierarchy_level: 1,
    parent_chunk_id: null,
    retrieval_role: 'primary',
    section_title: null,
  }

  return {
    name: 'list_project_files',
    chunks: [syntheticChunk],
    files: [],
    summary: `${fileList.length} document(s) trouvé(s) dans le projet`,
  }
}

// ============================================================================
// TOOL: search_in_file
// ============================================================================

async function executeSearchInFileTool(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<ToolResult> {
  const fileName = args.file_name as string
  const query = args.query as string
  const maxResults = Math.min(args.max_results as number || 6, 12)

  // Resolve file_name to file_id(s) using flexible matching
  const fileIds = await resolveFileIds(ctx.supabase, fileName, ctx.projectId, ctx.effectiveOrgId)

  if (fileIds.length === 0) {
    return {
      name: 'search_in_file',
      chunks: [],
      files: [],
      summary: `Aucun fichier trouvé correspondant à "${fileName}"`,
    }
  }

  // Generate embedding for the query
  const embedding = await generateEmbedding(query, ctx.openaiApiKey)

  // Search with file filter
  const { data, error } = await ctx.supabase.schema('rag').rpc('match_documents_v14', {
    query_embedding: embedding,
    query_text: query,
    p_user_id: ctx.userId,
    p_org_id: ctx.effectiveOrgId,
    p_project_id: ctx.projectId || null,
    p_app_id: ctx.effectiveAppId,
    match_count: maxResults,
    similarity_threshold: 0.25,  // Lower threshold for targeted file search
    include_app_layer: true,
    include_org_layer: true,
    include_project_layer: true,
    include_user_layer: false,
    filter_source_types: ctx.filterSourceTypes || null,
    filter_file_ids: fileIds,
    filter_filenames: null,
    enable_concept_expansion: ctx.config.enable_concept_expansion,
    p_hierarchy_levels: [0, 1],
    p_include_children: true,
  })

  if (error) {
    return { name: 'search_in_file', chunks: [], files: [], summary: `Erreur recherche: ${error.message}` }
  }

  const chunks = mapSearchResults(data || []).slice(0, maxResults)
  const matchedFileName = chunks[0]?.file_original_filename || fileName

  return {
    name: 'search_in_file',
    chunks,
    files: [],
    summary: `Recherche "${query.substring(0, 40)}" dans ${matchedFileName}: ${chunks.length} résultats`,
  }
}

// ============================================================================
// HELPERS
// ============================================================================

async function resolveFileIds(
  supabase: Supabase,
  fileName: string,
  projectId: string | undefined,
  orgId: string | null,
): Promise<string[]> {
  // Step 1: Try project-scoped matching first (most restrictive)
  if (projectId) {
    const { data } = await supabase
      .schema('sources')
      .from('files')
      .select('id')
      .eq('processing_status', 'completed')
      .eq('project_id', projectId)
      .ilike('original_filename', `%${fileName}%`)
      .limit(5)

    if (data && data.length > 0) {
      return data.map((f: Record<string, unknown>) => f.id as string)
    }
  }

  // Step 2: Fallback to org-scoped (for org-level / app-level docs like DTUs)
  // Security: ALWAYS filter by org_id — never search globally
  if (orgId) {
    const { data } = await supabase
      .schema('sources')
      .from('files')
      .select('id')
      .eq('processing_status', 'completed')
      .eq('org_id', orgId)
      .ilike('original_filename', `%${fileName}%`)
      .limit(5)

    return (data || []).map((f: Record<string, unknown>) => f.id as string)
  }

  // No org_id available — cannot safely resolve files
  return []
}

function mapSearchResults(data: Record<string, unknown>[]): ChunkResult[] {
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
