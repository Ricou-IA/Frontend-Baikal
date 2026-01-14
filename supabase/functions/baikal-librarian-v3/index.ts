// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  BAIKAL-LIBRARIAN v3.2.1 - Recherche & Génération Intelligente               ║
// ║  Edge Function Supabase                                                      ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  v3.2.0: Désactivation file_filter - Gemini fait le tri naturellement        ║
// ║  v3.2.1: Support intent_overrides pour paramètres génération par intent      ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts"

// ============================================================================
// CONFIGURATION
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const sseHeaders = {
  ...corsHeaders,
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  "Connection": "keep-alive",
}

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

// ============================================================================
// TYPES
// ============================================================================

interface IntentParams {
  max_files: number
  min_similarity: number
  match_count: number
}

// v3.2.1: Nouveaux types pour intent_overrides
interface GenerationOverride {
  gemini_model?: string
  temperature?: number
  max_tokens?: number
}

interface SearchConfig {
  scope: 'narrow' | 'broad'
  max_files: number
  min_similarity: number
  boost_documents: string[]
  file_filter: string[] | null
}

interface PreloadedContext {
  effective_org_id: string | null
  effective_app_id: string
  system_prompt: string | null
  gemini_system_prompt: string | null
  parameters: Record<string, unknown>
  config_source: string
  project_identity: Record<string, unknown> | null
  conversation_id: string
  conversation_summary: string | null
  conversation_first_message: string | null
  recent_messages: Array<{ role: string; content: string; created_at: string; sources?: unknown[] }>
  message_count: number
  previous_source_file_ids: string[]
  documents_cles: Array<{ slug: string; label: string }>
}

interface RequestBody {
  query: string
  user_id: string
  org_id?: string
  project_id?: string
  app_id?: string
  rewritten_query?: string
  intent?: 'synthesis' | 'factual' | 'comparison' | 'citation' | 'conversational'
  search_config?: SearchConfig
  answer_format?: 'paragraph' | 'list' | 'table' | 'quote'
  key_concepts?: string[]
  preloaded_context?: PreloadedContext
  generation_mode?: 'chunks' | 'gemini' | 'auto'
  stream?: boolean
  include_app_layer?: boolean
  include_org_layer?: boolean
  include_project_layer?: boolean
  include_user_layer?: boolean
  filter_source_types?: string[]
}

interface LibrarianConfig {
  match_count: number
  match_threshold: number
  vector_weight: number
  fulltext_weight: number
  boost_factor: number
  enable_concept_expansion: boolean
  enable_file_scoring: boolean
  min_file_score: number
  intent_config: Record<string, IntentParams>
  gemini_model: string
  gemini_max_files: number
  gemini_max_pages: number
  max_tokens: number
  temperature: number
  default_answer_format: string
  enable_format_detection: boolean
  intent_overrides: Record<string, GenerationOverride>  // v3.2.1: NOUVEAU
  system_prompt: string
  gemini_system_prompt: string
  identity: { name: string; role: string; personality: string }
  behavior: { citation_style: string; response_language: string; tone: string; verbosity: string }
  restrictions: { out_of_scope_message: string; no_data_message: string }
  cache_ttl_minutes: number
  enable_global_cache: boolean
  scoring_method: string
  boost_on_mention: number
  min_chunks_for_inclusion: number
  llm_model: string
  max_context_length: number
  google_file_ttl_hours: number
  qa_memory_similarity_threshold: number
  qa_memory_max_results: number
}

interface LibrarianContext {
  effectiveOrgId: string | null
  effectiveAppId: string
  systemPrompt: string | null
  geminiSystemPrompt: string | null
  parameters: Record<string, unknown>
  configSource: string
  projectIdentity: Record<string, unknown> | null
  conversationId: string
  conversationSummary: string | null
  conversationFirstMessage: string | null
  recentMessages: Array<{ role: string; content: string; created_at: string; sources?: unknown[] }>
  messageCount: number
  previousSourceFileIds: string[]
  documentsCles: Array<{ slug: string; label: string }>
}

interface ChunkResult {
  chunk_id: number
  content: string
  similarity: number
  metadata: Record<string, unknown>
  layer: string
  source_file_id: string | null
  matched_concepts: string[]
  rank_score: number
  match_source: string
  filter_applied: boolean
  file_storage_path: string | null
  file_storage_bucket: string | null
  file_original_filename: string | null
  file_mime_type: string | null
  file_total_pages: number
  file_max_similarity: number | null
  file_chunk_count: number | null
}

interface FileInfo {
  file_id: string
  storage_path: string
  storage_bucket: string
  original_filename: string
  mime_type: string
  total_pages: number
  max_similarity: number
  avg_similarity: number
  chunk_count: number
  layer: string
  score: number
  is_boosted: boolean
}

interface SearchResult {
  chunks: ChunkResult[]
  files: FileInfo[]
  meetingChunks: ChunkResult[]
  totalPages: number
  filterApplied: boolean
  fallbackUsed: boolean
}

interface SourceItem {
  id?: string | number
  type: string
  source_file_id: string | null
  document_name: string
  score: number
  layer: string
  content_preview: string | null
}

interface QAMemoryResult {
  id: string
  question_text: string
  answer_text: string
  similarity: number
  is_expert_faq: boolean
  expert_source: string | null
  trust_score: number
  usage_count: number
  source_file_ids: string[] | null
  created_by: string | null
  created_at: string
}

// v3.2.1: Interface pour les paramètres effectifs de génération
interface EffectiveGenerationParams {
  model: string
  temperature: number
  maxTokens: number
}

// ============================================================================
// CONSTANTES FALLBACK
// ============================================================================

const FALLBACK_CONFIG: Partial<LibrarianConfig> = {
  match_count: 8,
  match_threshold: 0.35,
  vector_weight: 0.8,
  fulltext_weight: 0.2,
  boost_factor: 1.5,
  enable_concept_expansion: true,
  enable_file_scoring: true,
  min_file_score: 0.3,
  gemini_model: "gemini-2.5-flash-lite",
  gemini_max_files: 5,
  gemini_max_pages: 450,
  max_tokens: 6400,
  temperature: 0.3,
  cache_ttl_minutes: 60,
  enable_global_cache: true,
  llm_model: "gpt-4o-mini",
  max_context_length: 12000,
  google_file_ttl_hours: 47,
  qa_memory_similarity_threshold: 0.85,
  qa_memory_max_results: 3,
  boost_on_mention: 2.0,
  min_chunks_for_inclusion: 1,
}

const FALLBACK_INTENT_CONFIG: Record<string, IntentParams> = {
  factual: { max_files: 2, min_similarity: 0.5, match_count: 6 },
  synthesis: { max_files: 5, min_similarity: 0.35, match_count: 10 },
  comparison: { max_files: 4, min_similarity: 0.4, match_count: 8 },
  citation: { max_files: 1, min_similarity: 0.6, match_count: 4 },
  conversational: { max_files: 0, min_similarity: 0.5, match_count: 0 },
}

const MODE_LABELS = {
  gemini: { internal: 'gemini', ui: 'Full Document', icon: '📄' },
  chunks: { internal: 'chunks', ui: 'RAG Chunks', icon: '🧩' },
  memory: { internal: 'memory', ui: 'Mémoire Collective', icon: '🧠' },
}

// ============================================================================
// HELPERS
// ============================================================================

function errorResponse(message: string, status: number = 400) {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  )
}

const sendSSE = (controller: ReadableStreamDefaultController, event: string, data: unknown) => {
  controller.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
}

async function hashFileIds(fileIds: string[]): Promise<string> {
  const sorted = [...fileIds].sort().join(',')
  const encoder = new TextEncoder()
  const data = encoder.encode(sorted)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hashPrompt(prompt: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(prompt)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32)
}

// ============================================================================
// v3.2.1: RÉSOLUTION DES PARAMÈTRES DE GÉNÉRATION PAR INTENT
// ============================================================================

function getEffectiveGenerationParams(
  config: LibrarianConfig,
  intent: string | undefined
): EffectiveGenerationParams {
  // Valeurs par défaut
  let model = config.gemini_model
  let temperature = config.temperature
  let maxTokens = config.max_tokens

  // Si intent spécifié et override existe, appliquer
  if (intent && config.intent_overrides && config.intent_overrides[intent]) {
    const override = config.intent_overrides[intent]
    
    if (override.gemini_model) {
      model = override.gemini_model
      console.log(`[lib-v3] 🎯 Intent "${intent}" → modèle: ${model}`)
    }
    if (override.temperature !== undefined) {
      temperature = override.temperature
      console.log(`[lib-v3] 🎯 Intent "${intent}" → température: ${temperature}`)
    }
    if (override.max_tokens) {
      maxTokens = override.max_tokens
      console.log(`[lib-v3] 🎯 Intent "${intent}" → max_tokens: ${maxTokens}`)
    }
  }

  return { model, temperature, maxTokens }
}

// ============================================================================
// v3.1.1: RÉSOLUTION NOMS DE FICHIERS → UUIDs (inclut app layer)
// ============================================================================

async function resolveFileNamesToUuids(
  supabase: ReturnType<typeof createClient>,
  fileNames: string[] | null,
  orgId: string | null,
  projectId: string | undefined
): Promise<string[] | null> {
  if (!fileNames || fileNames.length === 0) return null

  // Vérifier si ce sont déjà des UUIDs
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const allAreUuids = fileNames.every(name => uuidRegex.test(name))
  
  if (allAreUuids) {
    console.log(`[lib-v3] file_filter déjà en UUIDs: ${fileNames.join(', ')}`)
    return fileNames
  }

  console.log(`[lib-v3] Résolution noms → UUIDs: ${fileNames.join(', ')}`)

  // v3.1.1: Chercher dans TOUS les layers accessibles (app + org + project)
  // On ne filtre PAS par org_id pour inclure les fichiers du layer app
  let query = supabase
    .schema('sources')
    .from('files')
    .select('id, original_filename, org_id, project_id')

  // Si project_id spécifié, chercher dans project + org + app layers
  // Sinon si org_id, chercher dans org + app layers
  // Sinon chercher dans app layer uniquement
  if (projectId) {
    // Fichiers du projet OU de l'org OU app layer (org_id = null)
    query = query.or(`project_id.eq.${projectId},org_id.eq.${orgId},org_id.is.null`)
  } else if (orgId) {
    // Fichiers de l'org OU app layer (org_id = null)
    query = query.or(`org_id.eq.${orgId},org_id.is.null`)
  } else {
    // App layer uniquement
    query = query.is('org_id', null)
  }

  const { data: files, error } = await query

  if (error || !files) {
    console.warn(`[lib-v3] Erreur recherche fichiers: ${error?.message}`)
    return null
  }

  console.log(`[lib-v3] ${files.length} fichiers accessibles trouvés`)

  const matchedUuids: string[] = []
  
  for (const fileName of fileNames) {
    // Extraire UNIQUEMENT le premier mot significatif (>= 2 chars)
    const words = fileName
      .toLowerCase()
      .split(/[\s\-_]+/)
      .filter(word => word.length >= 2)
    
    const primaryKeyword = words[0]
    
    if (!primaryKeyword) {
      console.warn(`[lib-v3] Aucun mot-clé extrait de "${fileName}"`)
      continue
    }
    
    console.log(`[lib-v3] Keyword principal pour "${fileName}": "${primaryKeyword}"`)
    
    let foundMatch = false
    
    for (const file of files) {
      const originalName = (file.original_filename || '').toLowerCase()
      
      // Match STRICT sur le premier mot uniquement
      if (originalName.includes(primaryKeyword) && !matchedUuids.includes(file.id)) {
        matchedUuids.push(file.id)
        foundMatch = true
        console.log(`[lib-v3] ✅ Match: "${primaryKeyword}" → ${file.id} (${file.original_filename})`)
      }
    }
    
    // Fallback: essayer le 2ème mot si pas de match
    if (!foundMatch && words.length > 1) {
      const secondaryKeyword = words[1]
      console.log(`[lib-v3] Fallback sur mot secondaire: "${secondaryKeyword}"`)
      
      for (const file of files) {
        const originalName = (file.original_filename || '').toLowerCase()
        
        if (originalName.includes(secondaryKeyword) && !matchedUuids.includes(file.id)) {
          matchedUuids.push(file.id)
          console.log(`[lib-v3] ✅ Match (fallback): "${secondaryKeyword}" → ${file.id} (${file.original_filename})`)
        }
      }
    }
  }

  if (matchedUuids.length === 0) {
    console.warn(`[lib-v3] ⚠️ Aucun fichier trouvé pour: ${fileNames.join(', ')}`)
    return null
  }

  console.log(`[lib-v3] ${matchedUuids.length} fichier(s) résolu(s)`)
  return matchedUuids
}

// ============================================================================
// GET LIBRARIAN CONFIG
// ============================================================================

async function getLibrarianConfig(
  supabase: ReturnType<typeof createClient>,
  appId: string = 'arpet',
  orgId?: string
): Promise<LibrarianConfig> {
  console.log(`[lib-v3] Chargement config librarian_v3 (app=${appId}, org=${orgId || 'global'})...`)

  const { data, error } = await supabase
    .schema('config')
    .from('agent_prompts')
    .select('system_prompt, gemini_system_prompt, parameters')
    .eq('agent_type', 'librarian_v3')
    .eq('app_id', appId)
    .eq('is_active', true)
    .or(orgId ? `org_id.eq.${orgId},org_id.is.null` : 'org_id.is.null')
    .order('org_id', { ascending: false, nullsFirst: false })
    .limit(1)
    .single()

  if (error || !data) {
    console.warn('[lib-v3] Config DB non trouvée, utilisation fallback')
    return {
      ...FALLBACK_CONFIG,
      intent_config: FALLBACK_INTENT_CONFIG,
      intent_overrides: {},  // v3.2.1: Fallback vide
      system_prompt: '',
      gemini_system_prompt: '',
      identity: { name: 'Assistant', role: 'assistant documentaire', personality: 'professionnel' },
      behavior: { citation_style: 'inline', response_language: 'fr', tone: 'professional', verbosity: 'balanced' },
      restrictions: { out_of_scope_message: '', no_data_message: '' },
      default_answer_format: 'paragraph',
      enable_format_detection: true,
      scoring_method: 'chunks_weighted',
    } as LibrarianConfig
  }

  const params = data.parameters || {}
  const search = params.search || {}
  const generation = params.generation || {}
  const prompts = params.prompts || {}
  const cache = params.cache || {}
  const scoring = params.scoring || {}
  const legacy = params.legacy || {}

  return {
    match_count: search.match_count || FALLBACK_CONFIG.match_count!,
    match_threshold: search.match_threshold || FALLBACK_CONFIG.match_threshold!,
    vector_weight: search.vector_weight || FALLBACK_CONFIG.vector_weight!,
    fulltext_weight: search.fulltext_weight || FALLBACK_CONFIG.fulltext_weight!,
    boost_factor: search.boost_factor || FALLBACK_CONFIG.boost_factor!,
    enable_concept_expansion: search.enable_concept_expansion ?? FALLBACK_CONFIG.enable_concept_expansion!,
    enable_file_scoring: search.enable_file_scoring ?? FALLBACK_CONFIG.enable_file_scoring!,
    min_file_score: search.min_file_score || FALLBACK_CONFIG.min_file_score!,
    intent_config: search.intent_config || FALLBACK_INTENT_CONFIG,
    gemini_model: generation.gemini_model || FALLBACK_CONFIG.gemini_model!,
    gemini_max_files: generation.gemini_max_files || FALLBACK_CONFIG.gemini_max_files!,
    gemini_max_pages: generation.gemini_max_pages || FALLBACK_CONFIG.gemini_max_pages!,
    max_tokens: generation.max_tokens || FALLBACK_CONFIG.max_tokens!,
    temperature: generation.temperature ?? FALLBACK_CONFIG.temperature!,
    default_answer_format: generation.default_answer_format || 'paragraph',
    enable_format_detection: generation.enable_format_detection ?? true,
    intent_overrides: generation.intent_overrides || {},  // v3.2.1: Lecture intent_overrides
    system_prompt: data.system_prompt || '',
    gemini_system_prompt: data.gemini_system_prompt || '',
    identity: prompts.identity || { name: 'Assistant', role: 'assistant', personality: 'professionnel' },
    behavior: prompts.behavior || { citation_style: 'inline', response_language: 'fr', tone: 'professional', verbosity: 'balanced' },
    restrictions: prompts.restrictions || { out_of_scope_message: '', no_data_message: '' },
    cache_ttl_minutes: cache.ttl_minutes || FALLBACK_CONFIG.cache_ttl_minutes!,
    enable_global_cache: cache.enable_global_cache ?? FALLBACK_CONFIG.enable_global_cache!,
    scoring_method: scoring.method || 'chunks_weighted',
    boost_on_mention: scoring.boost_on_mention || FALLBACK_CONFIG.boost_on_mention!,
    min_chunks_for_inclusion: scoring.min_chunks_for_inclusion || FALLBACK_CONFIG.min_chunks_for_inclusion!,
    llm_model: FALLBACK_CONFIG.llm_model!,
    max_context_length: FALLBACK_CONFIG.max_context_length!,
    google_file_ttl_hours: FALLBACK_CONFIG.google_file_ttl_hours!,
    qa_memory_similarity_threshold: legacy.qa_memory_similarity_threshold || FALLBACK_CONFIG.qa_memory_similarity_threshold!,
    qa_memory_max_results: legacy.qa_memory_max_results || FALLBACK_CONFIG.qa_memory_max_results!,
  }
}

// ============================================================================
// GET AGENT CONTEXT
// ============================================================================

async function getAgentContext(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  orgId: string | undefined,
  projectId: string | undefined,
  appId: string | undefined,
  preloadedContext?: PreloadedContext
): Promise<LibrarianContext> {

  if (preloadedContext) {
    console.log(`[lib-v3] Contexte pré-chargé par Brain`)
    return {
      effectiveOrgId: preloadedContext.effective_org_id,
      effectiveAppId: preloadedContext.effective_app_id || 'arpet',
      systemPrompt: preloadedContext.system_prompt,
      geminiSystemPrompt: preloadedContext.gemini_system_prompt,
      parameters: preloadedContext.parameters || {},
      configSource: preloadedContext.config_source || 'preloaded',
      projectIdentity: preloadedContext.project_identity,
      conversationId: preloadedContext.conversation_id,
      conversationSummary: preloadedContext.conversation_summary,
      conversationFirstMessage: preloadedContext.conversation_first_message,
      recentMessages: preloadedContext.recent_messages || [],
      messageCount: preloadedContext.message_count || 0,
      previousSourceFileIds: preloadedContext.previous_source_file_ids || [],
      documentsCles: preloadedContext.documents_cles || [],
    }
  }

  const { data, error } = await supabase.schema('rag').rpc('get_agent_context', {
    p_user_id: userId,
    p_org_id: orgId || null,
    p_project_id: projectId || null,
    p_app_id: appId || null,
    p_agent_type: 'librarian_v3',
    p_conversation_timeout_minutes: 30,
    p_context_messages_count: 4,
  })

  if (error) throw new Error(`Context error: ${error.message}`)

  const ctx = data?.[0] || data
  let recentMessages = ctx.out_recent_messages || []
  if (typeof recentMessages === 'string') {
    try { recentMessages = JSON.parse(recentMessages) } catch { recentMessages = [] }
  }

  let documentsCles = ctx.out_documents_cles || []
  if (typeof documentsCles === 'string') {
    try { documentsCles = JSON.parse(documentsCles) } catch { documentsCles = [] }
  }

  return {
    effectiveOrgId: ctx.out_effective_org_id || null,
    effectiveAppId: ctx.out_effective_app_id || 'arpet',
    systemPrompt: ctx.out_system_prompt,
    geminiSystemPrompt: ctx.out_gemini_system_prompt,
    parameters: ctx.out_parameters || {},
    configSource: ctx.out_config_source || 'fallback',
    projectIdentity: ctx.out_project_identity || null,
    conversationId: ctx.out_conversation_id,
    conversationSummary: ctx.out_conversation_summary || null,
    conversationFirstMessage: ctx.out_conversation_first_message || null,
    recentMessages,
    messageCount: ctx.out_message_count || 0,
    previousSourceFileIds: ctx.out_previous_source_file_ids || [],
    documentsCles,
  }
}

// ============================================================================
// EMBEDDING
// ============================================================================

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text.trim(),
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`Embedding error: ${JSON.stringify(error)}`)
  }

  const data = await response.json()
  return data.data[0].embedding
}

// ============================================================================
// SEARCH WITH SCORING
// ============================================================================

async function executeSearch(
  supabase: ReturnType<typeof createClient>,
  queryEmbedding: number[],
  queryText: string,
  userId: string,
  effectiveOrgId: string | null,
  projectId: string | undefined,
  effectiveAppId: string,
  config: LibrarianConfig,
  layerFlags: { app: boolean; org: boolean; project: boolean; user: boolean },
  filterSourceTypes: string[] | undefined,
  fileFilterUuids: string[] | null,  // v3.0.1: Déjà résolu en UUIDs
  intent: string | undefined,
  boostDocuments: string[]
): Promise<SearchResult> {

  const intentParams = intent ? (config.intent_config[intent] || FALLBACK_INTENT_CONFIG[intent]) : null
  const effectiveMatchCount = fileFilterUuids && fileFilterUuids.length > 0
    ? Math.max(fileFilterUuids.length * 5, config.match_count)
    : intentParams?.match_count || config.match_count
  const effectiveThreshold = intentParams?.min_similarity || config.match_threshold

  console.log(`[lib-v3] Search: match_count=${effectiveMatchCount}, threshold=${effectiveThreshold}, file_filter=${fileFilterUuids?.length || 0} UUIDs`)

  const { data, error } = await supabase.schema('rag').rpc('match_documents_v12', {
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
    filter_file_ids: fileFilterUuids,  // v3.0.1: UUIDs uniquement
    filter_filenames: null,
    enable_concept_expansion: config.enable_concept_expansion,
  })

  if (error) throw new Error(`Search error: ${error.message}`)

  const chunks: ChunkResult[] = (data || []).map((d: Record<string, unknown>) => ({
    chunk_id: d.out_chunk_id as number,
    content: d.out_content as string,
    similarity: d.out_similarity as number,
    metadata: d.out_metadata as Record<string, unknown>,
    layer: d.out_layer as string,
    source_file_id: d.out_source_file_id as string | null,
    matched_concepts: d.out_matched_concepts as string[] || [],
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
  }))

  const meetingChunks = chunks.filter(c => c.metadata?.source_type === 'meeting_transcript')
  const fileChunks = chunks.filter(c => c.metadata?.source_type !== 'meeting_transcript')

  console.log(`[lib-v3] Chunks: ${chunks.length} total, ${meetingChunks.length} meetings, ${fileChunks.length} fichiers`)

  const filesMap = new Map<string, {
    info: Omit<FileInfo, 'score' | 'is_boosted' | 'avg_similarity'>
    similarities: number[]
    chunk_count: number
  }>()

  for (const chunk of fileChunks) {
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
        chunk_count: 0,
      })
    }

    const fileData = filesMap.get(chunk.source_file_id)!
    fileData.similarities.push(chunk.similarity)
    fileData.chunk_count++
    if (chunk.similarity > fileData.info.max_similarity) {
      fileData.info.max_similarity = chunk.similarity
    }
  }

  const files: FileInfo[] = Array.from(filesMap.entries()).map(([fileId, data]) => {
    const avgSimilarity = data.similarities.reduce((a, b) => a + b, 0) / data.similarities.length
    const isBoosted = boostDocuments.some(doc => 
      data.info.original_filename.toLowerCase().includes(doc.toLowerCase())
    )
    const boostMultiplier = isBoosted ? config.boost_on_mention : 1.0
    const score = data.chunk_count * avgSimilarity * boostMultiplier * config.boost_factor

    return {
      ...data.info,
      avg_similarity: avgSimilarity,
      chunk_count: data.chunk_count,
      score,
      is_boosted: isBoosted,
    }
  })

  files.sort((a, b) => b.score - a.score)
  
  // v3.0.1: Si file_filter actif, ne pas limiter davantage
  const maxFiles = fileFilterUuids && fileFilterUuids.length > 0
    ? files.length  // Garder tous les fichiers filtrés
    : intentParams?.max_files || config.gemini_max_files
  const filteredFiles = files.slice(0, maxFiles)

  console.log(`[lib-v3] Files: ${filteredFiles.map(f => `${f.original_filename}(${f.score.toFixed(2)})`).join(', ')}`)

  const totalPages = filteredFiles.reduce((sum, f) => sum + f.total_pages, 0)

  return {
    chunks,
    files: filteredFiles,
    meetingChunks,
    totalPages,
    filterApplied: fileFilterUuids !== null && fileFilterUuids.length > 0,
    fallbackUsed: false,
  }
}

// ============================================================================
// GOOGLE FILE URI CACHING
// ============================================================================

async function getOrUploadGoogleFile(
  supabase: ReturnType<typeof createClient>,
  file: FileInfo,
  ttlHours: number
): Promise<string> {
  const { data: dbFile } = await supabase
    .schema('sources')
    .from('files')
    .select('google_file_uri, google_uri_expires_at')
    .eq('id', file.file_id)
    .single()

  if (dbFile?.google_file_uri && dbFile.google_uri_expires_at) {
    const expiresAt = new Date(dbFile.google_uri_expires_at)
    if (expiresAt > new Date()) {
      console.log(`[lib-v3] Réutilisation Google URI: ${file.original_filename}`)
      return dbFile.google_file_uri
    }
  }

  console.log(`[lib-v3] Upload vers Google Files: ${file.original_filename}`)
  
  const { data: fileData, error: downloadError } = await supabase.storage
    .from(file.storage_bucket)
    .download(file.storage_path)

  if (downloadError || !fileData) {
    throw new Error(`Erreur téléchargement ${file.original_filename}: ${downloadError?.message}`)
  }

  const fileBuffer = await fileData.arrayBuffer()

  const initResponse = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": fileBuffer.byteLength.toString(),
        "X-Goog-Upload-Header-Content-Type": file.mime_type,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { display_name: file.original_filename } }),
    }
  )

  if (!initResponse.ok) {
    throw new Error(`Google Files init error: ${await initResponse.text()}`)
  }

  const uploadUrl = initResponse.headers.get("X-Goog-Upload-URL")
  if (!uploadUrl) throw new Error("Missing upload URL from Google Files API")

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "X-Goog-Upload-Command": "upload, finalize",
      "X-Goog-Upload-Offset": "0",
      "Content-Type": file.mime_type,
    },
    body: fileBuffer,
  })

  if (!uploadResponse.ok) {
    throw new Error(`Google Files upload error: ${await uploadResponse.text()}`)
  }

  const fileInfo = await uploadResponse.json()
  const googleFileUri = fileInfo.file?.uri || fileInfo.uri

  if (!googleFileUri) {
    throw new Error("No URI returned from Google Files API")
  }

  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString()
  await supabase
    .schema('sources')
    .from('files')
    .update({ google_file_uri: googleFileUri, google_uri_expires_at: expiresAt })
    .eq('id', file.file_id)

  return googleFileUri
}

// ============================================================================
// GLOBAL GEMINI CACHE
// v3.2.1: Utilise les paramètres effectifs (model peut varier selon intent)
// ============================================================================

async function getOrCreateGlobalCache(
  supabase: ReturnType<typeof createClient>,
  files: FileInfo[],
  googleUris: string[],
  systemPrompt: string,
  config: LibrarianConfig,
  orgId: string | null,
  appId: string,
  effectiveModel: string  // v3.2.1: Paramètre explicite
): Promise<{ cacheName: string; wasReused: boolean }> {
  
  const fileIds = files.map(f => f.file_id)
  const fileIdsHash = await hashFileIds(fileIds)
  const promptHash = await hashPrompt(systemPrompt)

  console.log(`[lib-v3] Cache lookup: hash=${fileIdsHash.substring(0, 16)}..., model=${effectiveModel}`)

  // v3.2.1: Inclure le modèle dans la recherche de cache
  const { data: existingCache } = await supabase
    .schema('rag')
    .from('gemini_caches')
    .select('cache_name, expires_at')
    .eq('file_ids_hash', fileIdsHash)
    .eq('system_prompt_hash', promptHash)
    .eq('model', effectiveModel)  // v3.2.1: Filtrer par modèle
    .or(orgId ? `org_id.eq.${orgId},org_id.is.null` : 'org_id.is.null')
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: false })
    .limit(1)
    .single()

  if (existingCache) {
    console.log(`[lib-v3] ✅ Cache GLOBAL réutilisé: ${existingCache.cache_name}`)
    
    await supabase
      .schema('rag')
      .from('gemini_caches')
      .update({ 
        last_used_at: new Date().toISOString(),
      })
      .eq('cache_name', existingCache.cache_name)
    
    return { cacheName: existingCache.cache_name, wasReused: true }
  }

  console.log(`[lib-v3] Création nouveau cache global (${files.length} fichiers, model=${effectiveModel})...`)

  const parts: Array<Record<string, unknown>> = []
  parts.push({ text: systemPrompt })
  
  for (let i = 0; i < googleUris.length; i++) {
    parts.push({
      fileData: {
        fileUri: googleUris[i],
        mimeType: files[i].mime_type || 'application/pdf',
      }
    })
  }

  const ttlSeconds = config.cache_ttl_minutes * 60

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: `models/${effectiveModel}`,  // v3.2.1: Utiliser le modèle effectif
        contents: [{ role: "user", parts }],
        ttl: `${ttlSeconds}s`,
      }),
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Gemini Cache creation error: ${errorText}`)
  }

  const cacheData = await response.json()
  const cacheName = cacheData.name
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString()

  await supabase
    .schema('rag')
    .from('gemini_caches')
    .insert({
      file_ids_hash: fileIdsHash,
      file_ids: fileIds,
      cache_name: cacheName,
      model: effectiveModel,  // v3.2.1: Stocker le modèle effectif
      org_id: orgId,
      app_id: appId,
      system_prompt_hash: promptHash,
      expires_at: expiresAt,
      total_tokens: cacheData.usageMetadata?.totalTokenCount || null,
      file_count: files.length,
    })

  console.log(`[lib-v3] Cache GLOBAL créé: ${cacheName}`)
  
  return { cacheName, wasReused: false }
}

// ============================================================================
// BUILD PROMPT
// ============================================================================

function buildFinalPrompt(
  configPrompt: string | null,
  projectIdentity: Record<string, unknown> | null,
  files: FileInfo[],
  intent: string | undefined,
  answerFormat: string | undefined,
  keyConcepts: string[] | undefined
): string {
  const parts: string[] = []

  if (configPrompt?.trim()) {
    parts.push(configPrompt.trim())
  }

  if (projectIdentity && Object.keys(projectIdentity).length > 0) {
    const details: string[] = []
    if (projectIdentity.market_type) details.push(`• Type de marché: ${projectIdentity.market_type}`)
    if (projectIdentity.project_type) details.push(`• Type de projet: ${projectIdentity.project_type}`)
    if (projectIdentity.description) details.push(`• Description: ${projectIdentity.description}`)
    if (projectIdentity.name) details.push(`• Nom du projet: ${projectIdentity.name}`)
    
    if (details.length > 0) {
      parts.push(`\n═══════════════════════════════════════════════════════════════\nCONTEXTE PROJET ACTIF\n═══════════════════════════════════════════════════════════════\n${details.join('\n')}\n═══════════════════════════════════════════════════════════════`)
    }
  }

  const docCatalog = files.length > 0
    ? files.map(f => `- ID: "${f.file_id}" | NOM: "${f.original_filename}" | PAGES: ${f.total_pages}`).join('\n')
    : 'Aucun document disponible.'

  parts.push(`\n═══════════════════════════════════════════════════════════════\nRÈGLES DE CITATION (OBLIGATOIRES)\n═══════════════════════════════════════════════════════════════\nPour chaque information citée, utilise ce format :\n<cite doc="ID_DU_DOCUMENT" page="NUMERO_PAGE">texte ou référence</cite>\n\n### Catalogue des documents disponibles\n${docCatalog}\n═══════════════════════════════════════════════════════════════`)

  if (answerFormat) {
    const formatInstructions: Record<string, string> = {
      paragraph: 'Réponds en paragraphes fluides et bien structurés.',
      list: 'Structure ta réponse sous forme de liste à puces claire et organisée.',
      table: 'Présente les informations dans un tableau markdown comparatif.',
      quote: 'Cite le texte exact entre guillemets avec la référence précise.',
    }
    if (formatInstructions[answerFormat]) {
      parts.push(`\n📝 FORMAT DEMANDÉ: ${formatInstructions[answerFormat]}`)
    }
  }

  if (keyConcepts && keyConcepts.length > 0) {
    parts.push(`\n🔑 CONCEPTS CLÉS à rechercher: ${keyConcepts.join(', ')}`)
  }

  const intentInstructions: Record<string, string> = {
    synthesis: `L'utilisateur demande une SYNTHÈSE. Identifie les points clés et croise les informations.`,
    factual: `L'utilisateur cherche une INFORMATION PRÉCISE. Va droit au but, cite l'article exact.`,
    comparison: `L'utilisateur veut COMPARER. Analyse systématiquement les DIFFÉRENCES et ÉCARTS entre les documents. Ne conclus JAMAIS "pas de différence" sans avoir vérifié point par point.`,
    citation: `L'utilisateur veut un EXTRAIT EXACT. Reproduis le texte exact entre guillemets.`,
  }
  if (intent && intentInstructions[intent]) {
    parts.push(`\n🎯 INTENTION: ${intentInstructions[intent]}`)
  }

  return parts.join('\n\n')
}

// ============================================================================
// GEMINI STREAMING
// v3.2.1: Utilise les paramètres effectifs
// ============================================================================

async function* generateWithGeminiStream(
  query: string,
  cacheName: string,
  effectiveParams: EffectiveGenerationParams,  // v3.2.1: Paramètres effectifs
  meetingContext: string = ''
): AsyncGenerator<string, string, undefined> {
  
  const fullQuery = meetingContext ? `${query}\n\n${meetingContext}` : query
  
  const requestBody = {
    cachedContent: cacheName,
    contents: [{ role: "user", parts: [{ text: fullQuery }] }],
    generationConfig: {
      temperature: effectiveParams.temperature,
      maxOutputTokens: effectiveParams.maxTokens,
    },
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${effectiveParams.model}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    }
  )

  if (!response.ok) {
    throw new Error(`Gemini streaming error: ${await response.text()}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error("No response body reader")

  const decoder = new TextDecoder()
  let fullContent = ''
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data: ')) continue

      try {
        const json = JSON.parse(trimmed.slice(6))
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text
        if (text) {
          fullContent += text
          yield text
        }
      } catch {
        // Ignore
      }
    }
  }

  return fullContent
}

// ============================================================================
// OPENAI STREAMING (fallback)
// ============================================================================

async function* generateWithOpenAIStream(
  query: string,
  context: string,
  systemPrompt: string,
  config: LibrarianConfig
): AsyncGenerator<string, string, undefined> {
  
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.llm_model,
      messages: [
        { role: "system", content: systemPrompt + '\n\n' + context },
        { role: "user", content: query }
      ],
      temperature: config.temperature,
      max_tokens: config.max_tokens,
      stream: true,
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI error: ${await response.text()}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error("No response body reader")

  const decoder = new TextDecoder()
  let fullContent = ''
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed === 'data: [DONE]' || !trimmed.startsWith('data: ')) continue

      try {
        const json = JSON.parse(trimmed.slice(6))
        const content = json.choices?.[0]?.delta?.content
        if (content) {
          fullContent += content
          yield content
        }
      } catch {
        // Ignore
      }
    }
  }

  return fullContent
}

// ============================================================================
// CONTEXT FORMATTER (mode chunks)
// ============================================================================

function formatContext(chunks: ChunkResult[], maxLength: number): string {
  if (chunks.length === 0) {
    return "CONTEXTE DOCUMENTAIRE:\nAucun document pertinent trouvé.\n"
  }

  const sections: Record<string, ChunkResult[]> = {}
  for (const chunk of chunks) {
    const layer = chunk.layer || 'unknown'
    if (!sections[layer]) sections[layer] = []
    sections[layer].push(chunk)
  }

  let context = "CONTEXTE DOCUMENTAIRE:\n\n"
  let currentLength = context.length

  const layerOrder = ['app', 'org', 'project', 'user']
  const layerLabels: Record<string, string> = {
    app: '📚 Base de connaissances',
    org: '🏢 Documents organisation',
    project: '📁 Documents projet',
    user: '👤 Documents personnels'
  }

  for (const layer of layerOrder) {
    const layerChunks = sections[layer]
    if (!layerChunks?.length) continue

    const header = `\n${layerLabels[layer] || layer}:\n`
    if (currentLength + header.length > maxLength) break

    context += header
    currentLength += header.length

    for (const chunk of layerChunks) {
      let docName = chunk.file_original_filename || 'Document'
      if (chunk.metadata?.source_type === 'meeting_transcript') {
        const meetingDate = chunk.metadata?.meeting_date || 'Date inconnue'
        const meetingTitle = chunk.metadata?.meeting_title || 'Réunion'
        docName = `📋 Réunion du ${meetingDate} - ${meetingTitle}`
      }
      
      const text = `\n--- ${docName} ---\n${chunk.content}\n`
      if (currentLength + text.length > maxLength) break

      context += text
      currentLength += text.length
    }
  }

  return context
}

// ============================================================================
// MEETING CONTEXT
// ============================================================================

function buildMeetingContext(meetingChunks: ChunkResult[]): string {
  if (meetingChunks.length === 0) return ''
  const header = `\n═══════════════════════════════════════════════════════════════\nCOMPTES-RENDUS DE RÉUNIONS DE CHANTIER\n═══════════════════════════════════════════════════════════════`
  const content = meetingChunks.map(chunk => chunk.content).join('\n\n---\n\n')
  return header + '\n' + content
}

// ============================================================================
// SOURCES
// ============================================================================

function buildSourcesFromFiles(files: FileInfo[]): SourceItem[] {
  return files.map(file => ({
    id: file.file_id,
    type: 'document',
    source_file_id: file.file_id,
    document_name: file.original_filename,
    score: file.max_similarity,
    layer: file.layer || 'app',
    content_preview: null,
  }))
}

function buildSourcesFromChunks(chunks: ChunkResult[]): SourceItem[] {
  const sourcesMap = new Map<string, SourceItem>()

  for (const chunk of chunks) {
    const key = chunk.source_file_id || chunk.chunk_id.toString()
    if (sourcesMap.has(key)) continue

    if (chunk.metadata?.source_type === 'meeting_transcript') {
      const meetingDate = chunk.metadata?.meeting_date || 'Date inconnue'
      const meetingTitle = chunk.metadata?.meeting_title || 'Réunion'
      sourcesMap.set(key, {
        id: chunk.chunk_id,
        type: 'meeting',
        source_file_id: null,
        document_name: `📋 Réunion du ${meetingDate} - ${meetingTitle}`,
        score: chunk.similarity,
        layer: chunk.layer,
        content_preview: chunk.content?.substring(0, 200) || null,
      })
    } else {
      sourcesMap.set(key, {
        id: chunk.chunk_id,
        type: 'document',
        source_file_id: chunk.source_file_id,
        document_name: chunk.file_original_filename || 'Document',
        score: chunk.similarity,
        layer: chunk.layer,
        content_preview: chunk.content?.substring(0, 200) || null,
      })
    }
  }

  return Array.from(sourcesMap.values())
}

function filterSourcesByCitation(sources: SourceItem[], response: string): SourceItem[] {
  if (!sources.length || !response.trim()) return sources

  const citedIds = [...response.matchAll(/doc="([^"]+)"/g)].map(m => m[1])
  
  const cited = sources.filter(s => 
    citedIds.includes(s.source_file_id || String(s.id)) || 
    response.toLowerCase().includes(s.document_name.toLowerCase())
  )

  const unique = new Map<string, SourceItem>()
  for (const source of cited) {
    const key = source.source_file_id || source.document_name
    if (!unique.has(key)) unique.set(key, source)
  }

  const result = Array.from(unique.values())
  console.log(`[lib-v3] Sources filtrées: ${sources.length} → ${result.length}`)

  return result.length > 0 ? result : sources.slice(0, 1)
}

// ============================================================================
// QA MEMORY
// ============================================================================

async function searchQAMemory(
  supabase: ReturnType<typeof createClient>,
  queryEmbedding: number[],
  orgId: string,
  projectId: string | undefined,
  config: LibrarianConfig
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
    
    console.log(`[lib-v3] Memory hit: similarity=${best.similarity.toFixed(3)}, trust=${best.trust_score}`)
    return best
  } catch {
    return null
  }
}

async function incrementQAUsage(supabase: ReturnType<typeof createClient>, qaId: string): Promise<void> {
  try {
    await supabase.schema('rag').rpc('increment_qa_usage', { p_qa_id: qaId })
  } catch {
    // Ignore
  }
}

// ============================================================================
// ADD MESSAGE
// ============================================================================

async function addMessage(
  supabase: ReturnType<typeof createClient>,
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  sources?: unknown[],
  generationMode?: string,
  processingTimeMs?: number
): Promise<void> {
  try {
    await supabase.schema('rag').rpc('add_message', {
      p_conversation_id: conversationId,
      p_role: role,
      p_content: content,
      p_sources: sources ? JSON.stringify(sources) : null,
      p_generation_mode: generationMode || null,
      p_processing_time_ms: processingTimeMs || null,
    })
  } catch (error) {
    console.warn('[lib-v3] Erreur add_message:', error)
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  const startTime = Date.now()
  const timings: Record<string, number> = {}
  const mark = (label: string) => {
    timings[label] = Date.now() - startTime
    console.log(`[lib-v3] ⏱️ ${label}: ${timings[label]}ms`)
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const body: RequestBody = await req.json()
    const {
      query,
      user_id,
      org_id,
      project_id,
      app_id = 'arpet',
      rewritten_query,
      intent,
      search_config,
      answer_format,
      key_concepts,
      preloaded_context,
      generation_mode = 'auto',
      include_app_layer = true,
      include_org_layer = true,
      include_project_layer = true,
      include_user_layer = false,
      filter_source_types,
    } = body

    if (!query?.trim()) return errorResponse("Query is required")
    if (!user_id) return errorResponse("user_id is required")

    console.log(`[lib-v3] ═══════════════════════════════════════════════════`)
    console.log(`[lib-v3] v3.2.1 - Query: "${query.substring(0, 50)}..."`)
    console.log(`[lib-v3] intent=${intent}, answer_format=${answer_format}`)

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const sseStream = new ReadableStream({
      async start(controller) {
        try {
          sendSSE(controller, 'step', { step: 'starting', message: '🚀 Démarrage...' })

          // ================================================================
          // 1. CONFIG + CONTEXTE
          // ================================================================
          const config = await getLibrarianConfig(supabase, app_id, org_id)
          const libContext = await getAgentContext(supabase, user_id, org_id, project_id, app_id, preloaded_context)
          
          // v3.2.1: Résoudre les paramètres de génération selon l'intent
          const effectiveGenParams = getEffectiveGenerationParams(config, intent)
          console.log(`[lib-v3] Effective generation: model=${effectiveGenParams.model}, temp=${effectiveGenParams.temperature}, tokens=${effectiveGenParams.maxTokens}`)
          
          mark('1_context')

          await addMessage(supabase, libContext.conversationId, 'user', query)

          // ================================================================
          // 2. EMBEDDING
          // ================================================================
          sendSSE(controller, 'step', { step: 'embedding', message: '🔢 Vectorisation...' })
          const queryForEmbedding = rewritten_query || query
          const queryEmbedding = await generateEmbedding(queryForEmbedding)
          
          mark('2_embedding')

          // ================================================================
          // 3. MÉMOIRE COLLECTIVE
          // ================================================================
          const memoryOrgId = libContext.effectiveOrgId || org_id
          
          if (memoryOrgId) {
            sendSSE(controller, 'step', { step: 'memory', message: '🧠 Mémoire collective...' })
            const memoryResult = await searchQAMemory(supabase, queryEmbedding, memoryOrgId, project_id, config)
            
            mark('3_memory')

            if (memoryResult) {
              console.log(`[lib-v3] 🎯 MEMORY HIT`)
              sendSSE(controller, 'step', { step: 'memory_hit', message: '💡 Réponse trouvée!' })

              for (const word of memoryResult.answer_text.split(' ')) {
                sendSSE(controller, 'token', { content: word + ' ' })
              }

              await incrementQAUsage(supabase, memoryResult.id)
              const processingTime = Date.now() - startTime
              await addMessage(supabase, libContext.conversationId, 'assistant', memoryResult.answer_text, [], 'memory', processingTime)

              sendSSE(controller, 'sources', {
                sources: [{ id: memoryResult.id, type: 'qa_memory', document_name: '💡 Mémoire', score: memoryResult.similarity, layer: 'memory', source_file_id: null, content_preview: null }],
                conversation_id: libContext.conversationId,
                generation_mode: 'memory',
                processing_time_ms: processingTime,
                from_memory: true,
              })

              sendSSE(controller, 'done', {})
              controller.close()
              return
            }
          }

          // ================================================================
          // 4. FILE_FILTER DÉSACTIVÉ (v3.2.0)
          // Le matching textuel est trop fragile. On laisse Gemini
          // faire le tri naturellement parmi les documents scorés.
          // ================================================================
          const fileFilterUuids: string[] | null = null
          
          if (search_config?.file_filter && search_config.file_filter.length > 0) {
            console.log(`[lib-v3] file_filter ignoré (désactivé v3.2.0): ${search_config.file_filter.join(', ')}`)
          }
          
          mark('4_resolve_names')

          // ================================================================
          // 5. RECHERCHE AVEC SCORING
          // ================================================================
          sendSSE(controller, 'step', { step: 'search', message: '🔍 Recherche documentaire...' })

          const boostDocuments = search_config?.boost_documents || []
          const searchResult = await executeSearch(
            supabase, queryEmbedding, query, user_id, libContext.effectiveOrgId,
            project_id, libContext.effectiveAppId, config,
            { app: include_app_layer, org: include_org_layer, project: include_project_layer, user: include_user_layer },
            filter_source_types, fileFilterUuids, intent, boostDocuments
          )

          mark('5_search')

          const meetingInfo = searchResult.meetingChunks.length > 0 ? ` + ${searchResult.meetingChunks.length} réunion(s)` : ''
          // v3.1.0: Message générique (nombre de docs masqué pour l'UX)
          sendSSE(controller, 'step', { step: 'files_found', message: `📚 Documents trouvés${meetingInfo}` })

          // ================================================================
          // 6. DÉCISION MODE
          // ================================================================
          let effectiveMode = generation_mode

          if (generation_mode === 'auto') {
            if (searchResult.files.length === 0) {
              effectiveMode = 'chunks'
            } else if (searchResult.totalPages <= config.gemini_max_pages && GEMINI_API_KEY) {
              effectiveMode = 'gemini'
            } else {
              effectiveMode = 'chunks'
            }
          }

          const modeInfo = MODE_LABELS[effectiveMode as keyof typeof MODE_LABELS] || MODE_LABELS.chunks
          sendSSE(controller, 'step', { step: 'mode', message: `${modeInfo.icon} Mode ${modeInfo.ui}` })

          // ================================================================
          // 7. GÉNÉRATION
          // ================================================================
          let fullResponse = ''
          let cacheWasReused = false
          const meetingContext = buildMeetingContext(searchResult.meetingChunks)

          if (effectiveMode === 'gemini' && searchResult.files.length > 0) {
            try {
              const geminiPrompt = buildFinalPrompt(
                config.gemini_system_prompt || libContext.geminiSystemPrompt,
                libContext.projectIdentity,
                searchResult.files,
                intent,
                answer_format,
                key_concepts
              )

              sendSSE(controller, 'step', { step: 'uploading', message: '📤 Upload fichiers...' })
              const googleUris = await Promise.all(
                searchResult.files.map(f => getOrUploadGoogleFile(supabase, f, config.google_file_ttl_hours))
              )
              mark('6_upload')

              sendSSE(controller, 'step', { step: 'caching', message: '📦 Cache global...' })
              // v3.2.1: Passer le modèle effectif au cache
              const cacheResult = await getOrCreateGlobalCache(
                supabase,
                searchResult.files,
                googleUris,
                geminiPrompt,
                config,
                libContext.effectiveOrgId,
                app_id,
                effectiveGenParams.model  // v3.2.1: Modèle effectif
              )
              cacheWasReused = cacheResult.wasReused
              mark('7_cache')

              sendSSE(controller, 'step', { step: 'generating', message: '✨ Génération...' })
              // v3.2.1: Utiliser les paramètres effectifs
              const generator = generateWithGeminiStream(query, cacheResult.cacheName, effectiveGenParams, meetingContext)

              let firstToken = true
              for await (const token of generator) {
                if (firstToken) {
                  mark('8_first_token')
                  firstToken = false
                }
                fullResponse += token
                sendSSE(controller, 'token', { content: token })
              }

            } catch (geminiError) {
              console.error('[lib-v3] Gemini error, fallback chunks:', geminiError)
              effectiveMode = 'chunks'
              
              const systemPrompt = buildFinalPrompt(
                config.system_prompt || libContext.systemPrompt,
                libContext.projectIdentity,
                [],
                intent,
                answer_format,
                key_concepts
              )
              const context = formatContext(searchResult.chunks, config.max_context_length)
              const generator = generateWithOpenAIStream(query, context, systemPrompt, config)

              for await (const token of generator) {
                fullResponse += token
                sendSSE(controller, 'token', { content: token })
              }
            }
          } else {
            const systemPrompt = buildFinalPrompt(
              config.system_prompt || libContext.systemPrompt,
              libContext.projectIdentity,
              [],
              intent,
              answer_format,
              key_concepts
            )
            const context = formatContext(searchResult.chunks, config.max_context_length)
            const generator = generateWithOpenAIStream(query, context, systemPrompt, config)

            let firstToken = true
            for await (const token of generator) {
              if (firstToken) {
                mark('8_first_token')
                firstToken = false
              }
              fullResponse += token
              sendSSE(controller, 'token', { content: token })
            }
          }

          // ================================================================
          // 8. SOURCES
          // ================================================================
          let finalSources: SourceItem[]
          if (effectiveMode === 'gemini' && searchResult.files.length > 0) {
            finalSources = filterSourcesByCitation(buildSourcesFromFiles(searchResult.files), fullResponse)
          } else {
            finalSources = filterSourcesByCitation(buildSourcesFromChunks(searchResult.chunks), fullResponse)
          }

          // ================================================================
          // 9. FINALISATION
          // ================================================================
          const processingTime = Date.now() - startTime
          await addMessage(supabase, libContext.conversationId, 'assistant', fullResponse, finalSources, effectiveMode, processingTime)

          mark('9_total')
          console.log(`[lib-v3] ⏱️ TOTAL: ${JSON.stringify(timings)}`)

          sendSSE(controller, 'sources', {
            sources: finalSources,
            conversation_id: libContext.conversationId,
            generation_mode: effectiveMode,
            generation_mode_ui: modeInfo.ui,
            processing_time_ms: processingTime,
            files_count: searchResult.files.length,
            chunks_count: searchResult.chunks.length,
            total_pages: searchResult.totalPages,
            cache_reused: cacheWasReused,
            cache_type: cacheWasReused ? 'global' : 'new',
            intent,
            answer_format,
            file_filter_applied: fileFilterUuids !== null,
            // v3.2.1: Ajouter les infos du modèle effectif
            effective_model: effectiveGenParams.model,
            effective_temperature: effectiveGenParams.temperature,
            timings,
          })

          sendSSE(controller, 'done', {})
          controller.close()

        } catch (error) {
          console.error('[lib-v3] Error:', error)
          sendSSE(controller, 'error', { error: error instanceof Error ? error.message : 'Internal error' })
          controller.close()
        }
      }
    })

    return new Response(sseStream, { headers: sseHeaders })

  } catch (error) {
    console.error("[lib-v3] Fatal error:", error)
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500)
  }
})
