// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  BAIKAL-LIBRARIAN v9.3.0 - Sans Cache Gemini                                 ║
// ║  Edge Function Supabase                                                      ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  v9.3.0:                                                                     ║
// ║  - Suppression du Context Caching Gemini                                     ║
// ║  - Envoi direct du fichier à chaque requête                                  ║
// ║  - Diagnostic : éliminer le cache comme source de blocage                    ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { GoogleGenerativeAI } from "npm:@google/generative-ai@0.21.0"

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
// CONSTANTES SYSTÈME
// ============================================================================

const DEFAULT_CONFIG = {
  similarity_threshold: 0.3,
  match_count: 30,
  max_context_length: 12000,
  embedding_model: "text-embedding-3-small",
  llm_model: "gpt-4o-mini",
  temperature: 0.3,
  max_tokens: 2048,
  include_app_layer: true,
  include_org_layer: true,
  include_project_layer: true,
  include_user_layer: false,
  enable_concept_expansion: true,
  gemini_model: "gemini-2.0-flash-001",
  gemini_max_pages: 500,
  conversation_timeout_minutes: 30,
  conversation_context_messages: 4,
  qa_memory_similarity_threshold: 0.85,
  qa_memory_max_results: 3,
}

const MODE_LABELS = {
  gemini: { internal: 'gemini', ui: 'Full Document', icon: '📄' },
  chunks: { internal: 'chunks', ui: 'RAG Chunks', icon: '🧩' },
  memory: { internal: 'memory', ui: 'Mémoire Collective', icon: '🧠' },
}

// ============================================================================
// PROMPTS FALLBACK AGNOSTIQUES
// ============================================================================

const FALLBACK_SYSTEM_PROMPT = `Tu es un assistant IA spécialisé dans l'analyse de documents.

## TON RÔLE
Tu réponds aux questions en te basant UNIQUEMENT sur les documents fournis dans le contexte.

## RÈGLES FONDAMENTALES
1. **Documents présents** → Utilise-les pour répondre, cite le nom du document
2. **Documents absents** → Indique clairement qu'aucun document n'a été trouvé
3. **Information non trouvée** → Dis-le honnêtement, ne fabrique jamais

## COMPORTEMENT
- Réponds de manière claire et structurée
- Cite tes sources par leur nom (document, article, section, page)
- Sois précis et factuel
- Pas de formule de politesse à la fin`

const FALLBACK_GEMINI_PROMPT = `Tu es un assistant IA spécialisé dans l'analyse approfondie de documents.

## TON RÔLE
Tu as accès aux documents COMPLETS. Analyse-les en profondeur pour répondre aux questions.

## RÈGLES FONDAMENTALES
1. **Lis attentivement** → Parcours l'ensemble des documents fournis
2. **Croise les informations** → Compare les données entre documents si plusieurs
3. **Cite précisément** → Mentionne le nom du document, la section, la page

## COMPORTEMENT
- Structure ta réponse de façon claire
- Base-toi uniquement sur les documents fournis
- Si l'information n'est pas trouvée, indique-le clairement
- Pas de formule de politesse à la fin`

// ============================================================================
// CONTEXTE PROJET - Template d'injection automatique
// ============================================================================

const PROJECT_CONTEXT_TEMPLATE = `
═══════════════════════════════════════════════════════════════
CONTEXTE PROJET ACTIF
═══════════════════════════════════════════════════════════════
{{project_details}}

INSTRUCTION IMPORTANTE:
- Contextualise TOUJOURS ta réponse en fonction de ce projet
- Si un document ne s'applique PAS à ce contexte, signale-le clairement
- Suggère les documents appropriés si nécessaire
═══════════════════════════════════════════════════════════════`

// ============================================================================
// FORMAT_RULES (toujours injectées)
// ============================================================================

const FORMAT_RULES = `
═══════════════════════════════════════════════════════════════
RÈGLES DE FORMAT (OBLIGATOIRES)
═══════════════════════════════════════════════════════════════

### Comment citer tes sources
- Cite TOUJOURS par le NOM DU DOCUMENT (ex: "Selon le CCAG, article 20.1...")
- Mentionne l'article, la section ou la page si disponible

### CE QUE TU NE DOIS PAS FAIRE
- N'utilise PAS de numéros abstraits comme [1], [2], [3]
- NE GÉNÈRE PAS de section "Sources" ou "Références" à la fin
- NE CITE PAS de longs extraits verbatim
- NE TERMINE PAS par une formule de politesse (Cordialement, etc.)

### Format attendu
Ta réponse doit être fluide et naturelle, avec les noms de documents intégrés dans le texte.`

// ============================================================================
// INSTRUCTIONS PAR INTENT
// ============================================================================

const INTENT_INSTRUCTIONS: Record<string, string> = {
  synthesis: `
═══════════════════════════════════════════════════════════════
INSTRUCTION SPÉCIFIQUE: SYNTHÈSE
═══════════════════════════════════════════════════════════════
L'utilisateur demande une VUE D'ENSEMBLE ou une SYNTHÈSE.
- Identifie les points clés de chaque document
- Croise les informations entre documents
- Structure ta réponse avec des sections claires`,

  factual: `
═══════════════════════════════════════════════════════════════
INSTRUCTION SPÉCIFIQUE: INFORMATION PRÉCISE
═══════════════════════════════════════════════════════════════
L'utilisateur cherche une INFORMATION PRÉCISE.
- Va droit au but : donne la réponse d'abord
- Cite le document et l'article/clause exacte
- Pas de développement inutile`,

  comparison: `
═══════════════════════════════════════════════════════════════
INSTRUCTION SPÉCIFIQUE: COMPARAISON
═══════════════════════════════════════════════════════════════
L'utilisateur veut COMPARER des éléments.
- Présente les éléments côte à côte
- Mets en évidence DIFFÉRENCES et POINTS COMMUNS
- Utilise un tableau si pertinent`,

  citation: `
═══════════════════════════════════════════════════════════════
INSTRUCTION SPÉCIFIQUE: EXTRAIT EXACT
═══════════════════════════════════════════════════════════════
L'utilisateur veut un EXTRAIT EXACT.
- Reproduis le texte exact entre guillemets
- Indique la source précise (document, article, page)`,

  conversational: `
═══════════════════════════════════════════════════════════════
INSTRUCTION SPÉCIFIQUE: CONVERSATION
═══════════════════════════════════════════════════════════════
L'utilisateur fait une remarque conversationnelle.
- Réponds de manière naturelle et cordiale
- Propose ton aide pour des questions documentaires`,
}

// ============================================================================
// TYPES
// ============================================================================

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
  detected_documents?: string[]
  preloaded_context?: PreloadedContext
  generation_mode?: 'chunks' | 'gemini' | 'auto'
  stream?: boolean
  include_app_layer?: boolean
  include_org_layer?: boolean
  include_project_layer?: boolean
  include_user_layer?: boolean
  filter_source_types?: string[]
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

interface AgentConfig {
  llm_model: string
  temperature: number
  max_tokens: number
  match_count: number
  similarity_threshold: number
  enable_concept_expansion: boolean
  gemini_model: string
  gemini_max_pages: number
  max_context_length: number
  qa_memory_similarity_threshold: number
  qa_memory_max_results: number
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
  chunk_count: number
  layer?: string
}

interface SearchResult {
  chunks: ChunkResult[]
  files: FileInfo[]
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

// ============================================================================
// HELPERS
// ============================================================================

function errorResponse(message: string, status: number = 400) {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  )
}

// ============================================================================
// SSE HELPERS
// ============================================================================

function formatSSE(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function formatSSEStep(step: string, message: string, details?: Record<string, unknown>): string {
  return formatSSE('step', { step, message, details: details || {} })
}

function formatSSEToken(content: string): string {
  return formatSSE('token', { content })
}

function formatSSESources(payload: Record<string, unknown>): string {
  return formatSSE('sources', payload)
}

function formatSSEDone(): string {
  return formatSSE('done', {})
}

function formatSSEError(error: string): string {
  return formatSSE('error', { error })
}

// ============================================================================
// FILTRAGE SOURCES PAR CITATION
// ============================================================================

function extractSearchTerms(filename: string): string[] {
  return filename
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[._-]/g, ' ')
    .split(/\s+/)
    .filter(term => term.length >= 2)
}

function isDocumentCitedInResponse(filename: string, response: string): boolean {
  const responseLower = response.toLowerCase()
  const terms = extractSearchTerms(filename)
  
  const baseFilename = filename.replace(/\.[^.]+$/, '').toLowerCase()
  if (responseLower.includes(baseFilename)) return true
  
  const acronyms = ['ccag', 'ccap', 'cctp', 'doe', 'pv', 'nf', 'dtu', 'rc', 'ae']
  for (const term of terms) {
    if (acronyms.includes(term) && responseLower.includes(term)) {
      return true
    }
  }
  
  const normMatch = filename.match(/NF\s*P?\s*[\d-]+/i)
  if (normMatch) {
    const normCode = normMatch[0].replace(/\s+/g, '').toLowerCase()
    if (responseLower.includes(normCode)) return true
  }
  
  if (responseLower.includes('nf p03-001') || responseLower.includes('nf p03 001') || responseLower.includes('nfp03001')) {
    if (filename.toLowerCase().includes('nf') && filename.toLowerCase().includes('p03')) {
      return true
    }
  }
  
  const genericTerms = ['document', 'fichier', 'page', 'article', 'section', 'annexe', 'travaux', 'projet']
  const significantTerms = terms.filter(t => t.length >= 5 && !genericTerms.includes(t))
  
  if (significantTerms.length >= 2) {
    const matched = significantTerms.filter(term => responseLower.includes(term))
    if (matched.length >= 2) return true
  }
  
  for (const term of significantTerms) {
    if (term.length >= 6 && responseLower.includes(term)) return true
  }
  
  return false
}

function filterSourcesByCitation(sources: SourceItem[], response: string): SourceItem[] {
  if (!sources.length || !response.trim()) return sources
  
  const cited = sources.filter(s => isDocumentCitedInResponse(s.document_name, response))
  
  const unique = new Map<string, SourceItem>()
  for (const source of cited) {
    const key = source.source_file_id || source.document_name
    if (!unique.has(key)) unique.set(key, source)
  }
  
  const result = Array.from(unique.values())
  
  console.log(`[librarian] Sources filtrées: ${sources.length} → ${result.length}`)
  
  if (result.length === 0 && sources.length > 0) {
    console.log(`[librarian] Aucune citation détectée, conservation source principale`)
    return [sources[0]]
  }
  
  return result
}

// ============================================================================
// MÉMOIRE COLLECTIVE - RECHERCHE
// ============================================================================

async function searchQAMemory(
  supabase: ReturnType<typeof createClient>,
  queryEmbedding: number[],
  orgId: string,
  projectId: string | undefined,
  config: AgentConfig
): Promise<QAMemoryResult | null> {
  try {
    const { data, error } = await supabase.schema('rag').rpc('search_qa_memory', {
      p_query_embedding: queryEmbedding,
      p_org_id: orgId,
      p_project_id: projectId || null,
      p_similarity_threshold: config.qa_memory_similarity_threshold,
      p_limit: config.qa_memory_max_results,
    })

    if (error) {
      console.warn('[librarian] Erreur recherche qa_memory:', error.message)
      return null
    }

    if (!data || data.length === 0) {
      console.log('[librarian] Aucun match qa_memory')
      return null
    }

    const best = data[0]
    console.log(`[librarian] Match qa_memory trouvé: similarity=${best.similarity.toFixed(3)}, is_expert=${best.is_expert_faq}, trust_score=${best.trust_score}`)
    
    return {
      id: best.id,
      question_text: best.question_text,
      answer_text: best.answer_text,
      similarity: best.similarity,
      is_expert_faq: best.is_expert_faq,
      expert_source: best.expert_source,
      trust_score: best.trust_score,
      usage_count: best.usage_count,
      source_file_ids: best.source_file_ids,
      created_by: best.created_by,
      created_at: best.created_at,
    }
  } catch (err) {
    console.error('[librarian] Exception recherche qa_memory:', err)
    return null
  }
}

// ============================================================================
// MÉMOIRE COLLECTIVE - INCRÉMENTER USAGE
// ============================================================================

async function incrementQAUsage(
  supabase: ReturnType<typeof createClient>,
  qaId: string
): Promise<void> {
  try {
    await supabase.schema('rag').rpc('increment_qa_usage', {
      p_qa_id: qaId,
    })
    console.log(`[librarian] Usage incrémenté pour qa_memory: ${qaId}`)
  } catch (err) {
    console.warn('[librarian] Erreur incrément usage qa_memory:', err)
  }
}

// ============================================================================
// CONTEXT
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
    console.log(`[librarian] Contexte pré-chargé par Brain`)
    
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
    p_agent_type: 'librarian',
    p_conversation_timeout_minutes: DEFAULT_CONFIG.conversation_timeout_minutes,
    p_context_messages_count: DEFAULT_CONFIG.conversation_context_messages,
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
// BUILD AGENT CONFIG
// ============================================================================

function buildAgentConfig(parameters: Record<string, unknown>): AgentConfig {
  return {
    llm_model: (parameters.model as string) || DEFAULT_CONFIG.llm_model,
    temperature: (parameters.temperature as number) ?? DEFAULT_CONFIG.temperature,
    max_tokens: (parameters.max_tokens as number) || DEFAULT_CONFIG.max_tokens,
    match_count: (parameters.match_count as number) || DEFAULT_CONFIG.match_count,
    similarity_threshold: (parameters.similarity_threshold as number) ?? DEFAULT_CONFIG.similarity_threshold,
    enable_concept_expansion: (parameters.enable_concept_expansion as boolean) ?? DEFAULT_CONFIG.enable_concept_expansion,
    gemini_model: (parameters.gemini_model as string) || DEFAULT_CONFIG.gemini_model,
    gemini_max_pages: (parameters.gemini_max_pages as number) || DEFAULT_CONFIG.gemini_max_pages,
    max_context_length: DEFAULT_CONFIG.max_context_length,
    qa_memory_similarity_threshold: (parameters.qa_memory_similarity_threshold as number) ?? DEFAULT_CONFIG.qa_memory_similarity_threshold,
    qa_memory_max_results: (parameters.qa_memory_max_results as number) || DEFAULT_CONFIG.qa_memory_max_results,
  }
}

// ============================================================================
// PROMPT BUILDING
// ============================================================================

function formatProjectContext(identity: Record<string, unknown> | null): string {
  if (!identity || Object.keys(identity).length === 0) return ''

  const details: string[] = []
  if (identity.market_type) details.push(`• Type de marché: ${identity.market_type}`)
  if (identity.project_type) details.push(`• Type de projet: ${identity.project_type}`)
  if (identity.description) details.push(`• Description: ${identity.description}`)
  if (identity.name) details.push(`• Nom du projet: ${identity.name}`)
  
  if (details.length === 0) return ''
  
  return PROJECT_CONTEXT_TEMPLATE.replace('{{project_details}}', details.join('\n'))
}

function buildFinalPrompt(
  customPrompt: string | null,
  fallbackPrompt: string,
  projectIdentity: Record<string, unknown> | null,
  intent?: string
): string {
  const parts: string[] = []
  
  const basePrompt = customPrompt?.trim() || fallbackPrompt
  const cleanedPrompt = basePrompt.replace(/\{\{project_context\}\}/g, '').replace(/\n{3,}/g, '\n\n').trim()
  parts.push(cleanedPrompt)
  
  const projectContext = formatProjectContext(projectIdentity)
  if (projectContext) {
    parts.push(projectContext)
  }
  
  parts.push(FORMAT_RULES)
  
  if (intent && INTENT_INSTRUCTIONS[intent]) {
    parts.push(INTENT_INSTRUCTIONS[intent])
  }
  
  return parts.join('\n\n')
}

function formatConversationHistory(context: LibrarianContext): string {
  const parts: string[] = []

  if (context.conversationSummary) {
    parts.push(`RÉSUMÉ DES ÉCHANGES:\n${context.conversationSummary}`)
  }

  if (context.conversationFirstMessage && !context.conversationSummary) {
    parts.push(`QUESTION INITIALE:\n${context.conversationFirstMessage}`)
  }

  if (context.recentMessages?.length > 0) {
    const formatted = context.recentMessages
      .slice().reverse()
      .map(m => `${m.role === 'user' ? 'USER' : 'ASSISTANT'}: ${m.content}`)
      .join('\n\n')
    parts.push(`HISTORIQUE:\n${formatted}`)
  }

  return parts.length ? `CONTEXTE CONVERSATION:\n${parts.join('\n\n---\n\n')}\n\n---\n\n` : ''
}

// ============================================================================
// DOCUMENT DETECTION
// ============================================================================

function detectMentionedDocuments(
  query: string,
  conversationHistory: string,
  documentsCles: Array<{ slug: string; label: string }>
): string[] {
  if (!documentsCles?.length) return []

  const text = `${query} ${conversationHistory}`.toLowerCase()

  return documentsCles
    .filter(doc => text.includes(doc.slug.toLowerCase()) || text.includes(doc.label.toLowerCase()))
    .map(doc => doc.label)
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
    console.warn('[librarian] Erreur add_message:', error)
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
      model: DEFAULT_CONFIG.embedding_model,
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
// SEARCH (UNIFIED - match_documents_v12)
// ============================================================================

async function executeSearch(
  supabase: ReturnType<typeof createClient>,
  queryEmbedding: number[],
  queryText: string,
  userId: string,
  effectiveOrgId: string | null,
  projectId: string | undefined,
  effectiveAppId: string,
  config: AgentConfig,
  layerFlags: { app: boolean; org: boolean; project: boolean; user: boolean },
  filterSourceTypes: string[] | undefined,
  filterFileIds: string[] | null,
  filterFilenames: string[] | null
): Promise<SearchResult> {
  
  const { data, error } = await supabase.schema('rag').rpc('match_documents_v12', {
    query_embedding: queryEmbedding,
    query_text: queryText,
    p_user_id: userId,
    p_org_id: effectiveOrgId,
    p_project_id: projectId || null,
    p_app_id: effectiveAppId,
    match_count: config.match_count,
    similarity_threshold: config.similarity_threshold,
    include_app_layer: layerFlags.app,
    include_org_layer: layerFlags.org,
    include_project_layer: layerFlags.project,
    include_user_layer: layerFlags.user,
    filter_source_types: filterSourceTypes || null,
    filter_file_ids: filterFileIds,
    filter_filenames: filterFilenames,
    enable_concept_expansion: config.enable_concept_expansion,
  })

  if (error) throw new Error(`Search error: ${error.message}`)

  let chunks: ChunkResult[] = (data || []).map((d: Record<string, unknown>) => ({
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

  let fallbackUsed = false
  const hasFilters = (filterFileIds && filterFileIds.length > 0) || (filterFilenames && filterFilenames.length > 0)

  if (chunks.length === 0 && hasFilters) {
    console.log(`[librarian] Filtres sans résultat, fallback sans filtres`)
    
    const { data: fallbackData, error: fallbackError } = await supabase.schema('rag').rpc('match_documents_v12', {
      query_embedding: queryEmbedding,
      query_text: queryText,
      p_user_id: userId,
      p_org_id: effectiveOrgId,
      p_project_id: projectId || null,
      p_app_id: effectiveAppId,
      match_count: config.match_count,
      similarity_threshold: config.similarity_threshold,
      include_app_layer: layerFlags.app,
      include_org_layer: layerFlags.org,
      include_project_layer: layerFlags.project,
      include_user_layer: layerFlags.user,
      filter_source_types: filterSourceTypes || null,
      filter_file_ids: null,
      filter_filenames: null,
      enable_concept_expansion: config.enable_concept_expansion,
    })

    if (!fallbackError && fallbackData) {
      chunks = (fallbackData || []).map((d: Record<string, unknown>) => ({
        chunk_id: d.out_chunk_id as number,
        content: d.out_content as string,
        similarity: d.out_similarity as number,
        metadata: d.out_metadata as Record<string, unknown>,
        layer: d.out_layer as string,
        source_file_id: d.out_source_file_id as string | null,
        matched_concepts: d.out_matched_concepts as string[] || [],
        rank_score: d.out_rank_score as number,
        match_source: d.out_match_source as string,
        filter_applied: false,
        file_storage_path: d.out_file_storage_path as string | null,
        file_storage_bucket: d.out_file_storage_bucket as string | null,
        file_original_filename: d.out_file_original_filename as string | null,
        file_mime_type: d.out_file_mime_type as string | null,
        file_total_pages: (d.out_file_total_pages as number) || 1,
        file_max_similarity: d.out_file_max_similarity as number | null,
        file_chunk_count: d.out_file_chunk_count as number | null,
      }))
      fallbackUsed = true
    }
  }

  const filesMap = new Map<string, FileInfo>()
  for (const chunk of chunks) {
    if (!chunk.source_file_id || !chunk.file_storage_path) continue
    
    if (!filesMap.has(chunk.source_file_id)) {
      filesMap.set(chunk.source_file_id, {
        file_id: chunk.source_file_id,
        storage_path: chunk.file_storage_path,
        storage_bucket: chunk.file_storage_bucket || 'documents',
        original_filename: chunk.file_original_filename || 'Document',
        mime_type: chunk.file_mime_type || 'application/pdf',
        total_pages: chunk.file_total_pages,
        max_similarity: chunk.file_max_similarity || chunk.similarity,
        chunk_count: chunk.file_chunk_count || 1,
        layer: chunk.layer,
      })
    }
  }

  const files = Array.from(filesMap.values())
  const totalPages = files.reduce((sum, f) => sum + f.total_pages, 0)

  console.log(`[librarian] Recherche: ${chunks.length} chunks, ${files.length} fichiers, ${totalPages} pages`)

  return {
    chunks,
    files,
    totalPages,
    filterApplied: hasFilters && !fallbackUsed,
    fallbackUsed,
  }
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
      const docName = chunk.file_original_filename || 'Document'
      const text = `\n--- ${docName} ---\n${chunk.content}\n`

      if (currentLength + text.length > maxLength) break

      context += text
      currentLength += text.length
    }
  }

  return context
}

// ============================================================================
// OPENAI STREAMING
// ============================================================================

async function* generateWithOpenAIStream(
  query: string,
  context: string,
  conversationHistory: string,
  systemPrompt: string,
  config: AgentConfig
): AsyncGenerator<string, string, undefined> {
  const finalPrompt = conversationHistory
    ? conversationHistory + systemPrompt
    : systemPrompt
  
  const fullPrompt = finalPrompt + '\n\n' + context

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.llm_model,
      messages: [
        { role: "system", content: fullPrompt },
        { role: "user", content: query }
      ],
      temperature: config.temperature,
      max_tokens: config.max_tokens,
      stream: true,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`OpenAI error: ${JSON.stringify(error)}`)
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
      } catch { /* ignore */ }
    }
  }

  return fullContent
}

// ============================================================================
// GEMINI STREAMING - v9.3.0 SANS CACHE
// ============================================================================

let genAI: GoogleGenerativeAI | null = null

function initGoogleAI() {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured")
  if (!genAI) genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
  return genAI
}

/**
 * v9.3.0: Upload fichier vers Google Files API (sans cache)
 */
async function uploadToGoogleFiles(fileBuffer: ArrayBuffer, filename: string, mimeType: string): Promise<string> {
  console.log(`[librarian] Upload vers Google Files: ${filename}`)
  
  const initResponse = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": fileBuffer.byteLength.toString(),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { display_name: filename } }),
    }
  )

  if (!initResponse.ok) throw new Error(`Google Files init error: ${await initResponse.text()}`)

  const uploadUrl = initResponse.headers.get("X-Goog-Upload-URL")
  if (!uploadUrl) throw new Error("Missing upload URL")

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "X-Goog-Upload-Command": "upload, finalize",
      "X-Goog-Upload-Offset": "0",
      "Content-Type": mimeType,
    },
    body: fileBuffer,
  })

  if (!uploadResponse.ok) throw new Error(`Google Files upload error: ${await uploadResponse.text()}`)

  const fileInfo = await uploadResponse.json()
  const fileUri = fileInfo.file?.uri || fileInfo.uri
  console.log(`[librarian] Upload terminé: ${fileUri}`)
  return fileUri
}

/**
 * v9.3.0: Génération Gemini SANS cache
 * Upload direct du fichier à chaque requête
 */
async function* generateWithGeminiStream(
  supabase: ReturnType<typeof createClient>,
  query: string,
  files: FileInfo[],
  conversationHistory: string,
  systemPrompt: string,
  config: AgentConfig
): AsyncGenerator<string, string, undefined> {
  const genAI = initGoogleAI()
  
  console.log(`[librarian] Gemini sans cache - ${files.length} fichier(s)`)

  // Préparer les parties du contenu
  const parts: Array<{ text: string } | { fileData: { fileUri: string; mimeType: string } }> = []

  // Upload chaque fichier
  for (const file of files) {
    console.log(`[librarian] Téléchargement depuis Supabase: ${file.original_filename}`)
    const { data: fileData, error } = await supabase.storage
      .from(file.storage_bucket)
      .download(file.storage_path)
    
    if (error || !fileData) {
      console.error(`[librarian] Erreur téléchargement ${file.original_filename}:`, error)
      continue
    }

    const fileBuffer = await fileData.arrayBuffer()
    const googleFileUri = await uploadToGoogleFiles(fileBuffer, file.original_filename, file.mime_type)
    
    parts.push({
      fileData: {
        fileUri: googleFileUri,
        mimeType: file.mime_type
      }
    })
  }

  if (parts.length === 0) {
    throw new Error("Aucun fichier n'a pu être uploadé")
  }

  // Ajouter le prompt
  const fullQuery = conversationHistory
    ? `${systemPrompt}\n\n${conversationHistory}\nQUESTION ACTUELLE:\n${query}`
    : `${systemPrompt}\n\nQUESTION:\n${query}`

  parts.push({ text: fullQuery })

  console.log(`[librarian] Gemini generateContentStream avec ${parts.length} parties`)

  // Créer le modèle et générer
  const model = genAI.getGenerativeModel({ 
    model: config.gemini_model,
    generationConfig: {
      temperature: config.temperature,
      maxOutputTokens: config.max_tokens,
    }
  })

  const result = await model.generateContentStream({
    contents: [{ role: "user", parts }]
  })

  let fullContent = ''

  for await (const chunk of result.stream) {
    const text = chunk.text()
    if (text) {
      fullContent += text
      yield text
    }
  }

  console.log(`[librarian] Gemini terminé: ${fullContent.length} chars`)
  return fullContent
}

// ============================================================================
// BUILD SOURCES
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

  return Array.from(sourcesMap.values())
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  const startTime = Date.now()

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
      app_id,
      rewritten_query,
      intent,
      detected_documents: brainDetectedDocuments,
      preloaded_context,
      generation_mode = 'auto',
      stream = true,
      include_app_layer = DEFAULT_CONFIG.include_app_layer,
      include_org_layer = DEFAULT_CONFIG.include_org_layer,
      include_project_layer = DEFAULT_CONFIG.include_project_layer,
      include_user_layer = DEFAULT_CONFIG.include_user_layer,
      filter_source_types,
    } = body

    if (!query?.trim()) return errorResponse("Query is required")
    if (!user_id) return errorResponse("user_id is required")

    console.log(`[librarian] v9.3.0 (sans cache) - Query: "${query.substring(0, 50)}..."`)

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const encoder = new TextEncoder()
    
    const sseStream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode(formatSSEStep('analyzing', '🧠 Analyse de la question...')))

          const libContext = await getAgentContext(supabase, user_id, org_id, project_id, app_id, preloaded_context)
          const config = buildAgentConfig(libContext.parameters)

          const systemPrompt = buildFinalPrompt(
            libContext.systemPrompt,
            FALLBACK_SYSTEM_PROMPT,
            libContext.projectIdentity,
            intent
          )
          
          const geminiSystemPrompt = buildFinalPrompt(
            libContext.geminiSystemPrompt,
            FALLBACK_GEMINI_PROMPT,
            libContext.projectIdentity,
            intent
          )

          const conversationHistory = formatConversationHistory(libContext)

          console.log(`[librarian] Prompt custom: ${libContext.systemPrompt ? 'OUI' : 'FALLBACK'}`)
          console.log(`[librarian] Contexte projet: ${libContext.projectIdentity ? 'OUI' : 'NON'}`)
          
          if (libContext.projectIdentity) {
            console.log(`[librarian] projectIdentity:`, JSON.stringify(libContext.projectIdentity))
          }

          await addMessage(supabase, libContext.conversationId, 'user', query)

          let detectedDocuments: string[] = brainDetectedDocuments || []
          if (detectedDocuments.length === 0) {
            detectedDocuments = detectMentionedDocuments(query, conversationHistory, libContext.documentsCles)
          }

          const isFollowUp = libContext.previousSourceFileIds.length > 0 && detectedDocuments.length === 0
          let filterFileIds: string[] | null = null
          let filterFilenames: string[] | null = null

          if (isFollowUp) {
            filterFileIds = libContext.previousSourceFileIds
            console.log(`[librarian] Question de suivi, filtre sur ${filterFileIds.length} fichiers`)
          } else if (detectedDocuments.length > 0) {
            filterFilenames = detectedDocuments
            console.log(`[librarian] Documents détectés: [${detectedDocuments.join(', ')}]`)
          }

          controller.enqueue(encoder.encode(formatSSEStep('embedding', '🔢 Vectorisation de la requête...')))

          const queryForEmbedding = rewritten_query || query
          const queryEmbedding = await generateEmbedding(queryForEmbedding)

          // ================================================================
          // RECHERCHE MÉMOIRE COLLECTIVE AVANT RAG
          // ================================================================
          
          if (libContext.effectiveOrgId) {
            controller.enqueue(encoder.encode(formatSSEStep('memory_search', '🧠 Recherche dans la mémoire collective...')))
            
            const memoryResult = await searchQAMemory(
              supabase,
              queryEmbedding,
              libContext.effectiveOrgId,
              project_id,
              config
            )

            if (memoryResult) {
              console.log(`[librarian] 🎯 MEMORY HIT: similarity=${memoryResult.similarity.toFixed(3)}`)
              
              const memoryLabel = memoryResult.is_expert_faq 
                ? `💡 Réponse FAQ Expert (${memoryResult.expert_source || 'Expert'})` 
                : `💡 Réponse validée par l'équipe (${memoryResult.trust_score} validations)`
              
              controller.enqueue(encoder.encode(formatSSEStep('memory_hit', memoryLabel, {
                similarity: memoryResult.similarity,
                is_expert_faq: memoryResult.is_expert_faq,
                expert_source: memoryResult.expert_source,
                trust_score: memoryResult.trust_score,
                usage_count: memoryResult.usage_count,
              })))

              const memoryAnswer = memoryResult.answer_text
              for (const char of memoryAnswer) {
                controller.enqueue(encoder.encode(formatSSEToken(char)))
              }

              await incrementQAUsage(supabase, memoryResult.id)

              const processingTime = Date.now() - startTime
              await addMessage(supabase, libContext.conversationId, 'assistant', memoryAnswer, [], 'memory', processingTime)

              const memorySources: SourceItem[] = memoryResult.is_expert_faq 
                ? [{
                    id: memoryResult.id,
                    type: 'qa_memory',
                    source_file_id: null,
                    document_name: `FAQ Expert: ${memoryResult.expert_source || 'Expert'}`,
                    score: memoryResult.similarity,
                    layer: 'memory',
                    content_preview: memoryResult.question_text.substring(0, 100),
                  }]
                : [{
                    id: memoryResult.id,
                    type: 'qa_memory',
                    source_file_id: null,
                    document_name: `Réponse validée (${memoryResult.trust_score} 👍)`,
                    score: memoryResult.similarity,
                    layer: 'memory',
                    content_preview: memoryResult.question_text.substring(0, 100),
                  }]

              controller.enqueue(encoder.encode(formatSSESources({
                sources: memorySources,
                conversation_id: libContext.conversationId,
                generation_mode: 'memory',
                generation_mode_ui: MODE_LABELS.memory.ui,
                processing_time_ms: processingTime,
                files_count: 0,
                chunks_count: 0,
                total_pages: 0,
                filter_applied: false,
                fallback_used: false,
                is_follow_up: isFollowUp,
                cache_hits: 0,
                cache_misses: 0,
                intent: intent || null,
                query_rewritten: !!rewritten_query,
                from_memory: true,
                qa_memory_id: memoryResult.id,
                qa_memory_similarity: memoryResult.similarity,
                qa_memory_is_expert: memoryResult.is_expert_faq,
                qa_memory_trust_score: memoryResult.trust_score,
              })))

              controller.enqueue(encoder.encode(formatSSEDone()))
              controller.close()
              return
            }
          }

          // ================================================================
          // PAS DE MATCH MÉMOIRE → CONTINUER RAG CLASSIQUE
          // ================================================================

          if (filterFilenames?.length) {
            controller.enqueue(encoder.encode(formatSSEStep('filter_applied', `🎯 Recherche dans [${filterFilenames.join(', ')}]...`)))
          } else {
            controller.enqueue(encoder.encode(formatSSEStep('search', '🔍 Recherche dans les documents...')))
          }

          const layerFlags = { app: include_app_layer, org: include_org_layer, project: include_project_layer, user: include_user_layer }
          
          const searchResult = await executeSearch(
            supabase, queryEmbedding, query, user_id, libContext.effectiveOrgId,
            project_id, libContext.effectiveAppId, config, layerFlags,
            filter_source_types, filterFileIds, filterFilenames
          )

          if (searchResult.fallbackUsed) {
            controller.enqueue(encoder.encode(formatSSEStep('filter_fallback', '⚠️ Document non trouvé, recherche élargie...')))
          }
          
          controller.enqueue(encoder.encode(formatSSEStep('files_found', 
            `📚 ${searchResult.files.length} document${searchResult.files.length > 1 ? 's' : ''} trouvé${searchResult.files.length > 1 ? 's' : ''} (${searchResult.totalPages} pages)`,
            { files_count: searchResult.files.length, total_pages: searchResult.totalPages }
          )))

          let effectiveMode = generation_mode
          
          if (generation_mode === 'auto') {
            if (searchResult.files.length === 0 || !GEMINI_API_KEY) {
              effectiveMode = 'chunks'
            } else if (searchResult.totalPages <= config.gemini_max_pages) {
              effectiveMode = 'gemini'
            } else {
              effectiveMode = 'chunks'
            }
          }

          const modeInfo = MODE_LABELS[effectiveMode as keyof typeof MODE_LABELS] || MODE_LABELS.chunks
          controller.enqueue(encoder.encode(formatSSEStep('mode_decision', 
            `${modeInfo.icon} Mode ${modeInfo.ui} sélectionné`,
            { mode: modeInfo.ui, internal_mode: effectiveMode }
          )))

          controller.enqueue(encoder.encode(formatSSEStep('generating', '✨ Génération de la réponse...')))

          let fullResponse = ''
          let geminiFilesUsed: FileInfo[] = []

          if (effectiveMode === 'gemini' && searchResult.files.length > 0) {
            geminiFilesUsed = searchResult.files
            
            try {
              controller.enqueue(encoder.encode(formatSSEStep('uploading', '📤 Chargement du document vers Gemini...')))
              
              const generator = generateWithGeminiStream(
                supabase, query, searchResult.files, conversationHistory,
                geminiSystemPrompt, config
              )

              for await (const token of generator) {
                fullResponse += token
                controller.enqueue(encoder.encode(formatSSEToken(token)))
              }
            } catch (geminiError) {
              console.error('[librarian] Gemini error, fallback chunks:', geminiError)
              
              effectiveMode = 'chunks'
              geminiFilesUsed = []
              
              controller.enqueue(encoder.encode(formatSSEStep('gemini_fallback', '⚠️ Basculement vers RAG Chunks...')))
              
              const context = formatContext(searchResult.chunks, config.max_context_length)
              const generator = generateWithOpenAIStream(query, context, conversationHistory, systemPrompt, config)
              
              for await (const token of generator) {
                fullResponse += token
                controller.enqueue(encoder.encode(formatSSEToken(token)))
              }
            }
          } else {
            const context = formatContext(searchResult.chunks, config.max_context_length)
            const generator = generateWithOpenAIStream(query, context, conversationHistory, systemPrompt, config)
            
            for await (const token of generator) {
              fullResponse += token
              controller.enqueue(encoder.encode(formatSSEToken(token)))
            }
          }

          // BUILD SOURCES SELON LE MODE
          let allSources: SourceItem[]
          
          if (effectiveMode === 'gemini' && geminiFilesUsed.length > 0) {
            allSources = buildSourcesFromFiles(geminiFilesUsed)
            console.log(`[librarian] Sources Gemini: ${allSources.map(s => s.document_name).join(', ')}`)
          } else {
            allSources = buildSourcesFromChunks(searchResult.chunks)
            console.log(`[librarian] Sources Chunks: ${allSources.map(s => s.document_name).join(', ')}`)
          }
          
          const filteredSources = filterSourcesByCitation(allSources, fullResponse)

          const processingTime = Date.now() - startTime
          await addMessage(supabase, libContext.conversationId, 'assistant', fullResponse, filteredSources, effectiveMode, processingTime)

          controller.enqueue(encoder.encode(formatSSESources({
            sources: filteredSources,
            conversation_id: libContext.conversationId,
            generation_mode: effectiveMode,
            generation_mode_ui: MODE_LABELS[effectiveMode as keyof typeof MODE_LABELS]?.ui || effectiveMode,
            processing_time_ms: processingTime,
            files_count: searchResult.files.length,
            chunks_count: searchResult.chunks.length,
            total_pages: searchResult.totalPages,
            filter_applied: searchResult.filterApplied,
            fallback_used: searchResult.fallbackUsed,
            is_follow_up: isFollowUp,
            cache_hits: 0,
            cache_misses: 0,
            intent: intent || null,
            query_rewritten: !!rewritten_query,
            from_memory: false,
            qa_memory_id: null,
          })))

          controller.enqueue(encoder.encode(formatSSEDone()))
          controller.close()

        } catch (error) {
          console.error('[librarian] Error:', error)
          controller.enqueue(encoder.encode(formatSSEError(error instanceof Error ? error.message : 'Internal error')))
          controller.close()
        }
      }
    })

    return new Response(sseStream, { headers: sseHeaders })

  } catch (error) {
    console.error("[librarian] Fatal error:", error)
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500)
  }
})
