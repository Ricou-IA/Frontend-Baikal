// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  BAIKAL-LIBRARIAN v10.4.1 - INSTRUMENTED (Timing Logs)                       ║
// ║  Edge Function Supabase                                                      ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  v10.4.1:                                                                    ║
// ║  - INSTRUMENTATION: Ajout logs de timing pour diagnostic performance         ║
// ║  v10.4.0:                                                                    ║
// ║  - NEW: Support chunks meeting_transcript (sans source_file_id)              ║
// ║  - NEW: Injection contenu meetings dans prompt Gemini                        ║
// ║  - NEW: Sources meetings pour UI                                             ║
// ║  v10.3.2:                                                                    ║
// ║  - FIX: Recherche mémoire utilise org_id du body si effectiveOrgId NULL      ║
// ║  v10.3.1:                                                                    ║
// ║  - CLEANUP: buildFinalPrompt appelé une seule fois (Gemini)                  ║
// ║  v10.3.0:                                                                    ║
// ║  - FIX: Cache invalidé si fichiers recherche ≠ fichiers cache                ║
// ║  - FIX: Sources = searchResult.files (plus jamais previousSourceFileIds)     ║
// ║  - REMOVED: detectMentionedDocuments (inutile, recherche suffit)             ║
// ║  - REMOVED: filterFilenames (source de bugs)                                 ║
// ║  - SIMPLIFY: isFollowUp basé uniquement sur previousSourceFileIds            ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

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
  gemini_model: "gemini-2.0-flash",
  gemini_max_pages: 500,
  gemini_timeout_ms: 60000,
  google_file_ttl_hours: 47,
  gemini_cache_ttl_seconds: 3600,
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
// PROMPTS FALLBACK (utilisés seulement si config vide)
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

const PROJECT_CONTEXT_TEMPLATE = `
═══════════════════════════════════════════════════════════════
CONTEXTE PROJET ACTIF
═══════════════════════════════════════════════════════════════
{{project_details}}
═══════════════════════════════════════════════════════════════`

const FORMAT_RULES = `
═══════════════════════════════════════════════════════════════
RÈGLES DE CITATION (OBLIGATOIRES)
═══════════════════════════════════════════════════════════════

### Format de citation interactif
Pour chaque information citée, utilise ce format :
<cite doc="ID_DU_DOCUMENT" page="NUMERO_PAGE">texte ou référence</cite>

Exemple: Selon <cite doc="abc-123" page="15">l'article 20.1 du CCAG</cite>, le délai est de 30 jours.

### Catalogue des documents disponibles
{{doc_catalog}}

### CE QUE TU NE DOIS PAS FAIRE
- N'utilise PAS de numéros abstraits comme [1], [2], [3]
- NE GÉNÈRE PAS de section "Sources" ou "Références" à la fin
- NE CITE PAS de longs extraits verbatim
- NE TERMINE PAS par une formule de politesse`

const INTENT_INSTRUCTIONS: Record<string, string> = {
  synthesis: `L'utilisateur demande une SYNTHÈSE. Identifie les points clés de chaque document et croise les informations.`,
  factual: `L'utilisateur cherche une INFORMATION PRÉCISE. Va droit au but, donne la réponse d'abord et cite l'article/clause exacte.`,
  comparison: `L'utilisateur veut COMPARER des éléments. Présente les différences et points communs côte à côte.`,
  citation: `L'utilisateur veut un EXTRAIT EXACT. Reproduis le texte exact entre guillemets.`,
  conversational: `Réponds de manière naturelle et propose ton aide pour naviguer dans les documents.`,
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
  gemini_timeout_ms: number
  max_context_length: number
  google_file_ttl_hours: number
  gemini_cache_ttl_seconds: number
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
  chunk_count?: number
  layer?: string
}

interface SearchResult {
  chunks: ChunkResult[]
  files: FileInfo[]
  meetingChunks: ChunkResult[]  // v10.4.0: Chunks de réunions
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

const sendSSE = (controller: ReadableStreamDefaultController, event: string, data: unknown) => {
  controller.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
}

// ============================================================================
// GOOGLE FILE URI CACHING (ANTI-429 UPLOAD)
// ============================================================================

async function getOrUploadGoogleFile(
  supabase: ReturnType<typeof createClient>,
  file: FileInfo,
  ttlHours: number
): Promise<string> {
  // 1. Vérifier si on a déjà un URI valide en DB (sources.files)
  const { data: dbFile } = await supabase
    .schema('sources')
    .from('files')
    .select('google_file_uri, google_uri_expires_at')
    .eq('id', file.file_id)
    .single()

  if (dbFile?.google_file_uri && dbFile.google_uri_expires_at) {
    const expiresAt = new Date(dbFile.google_uri_expires_at)
    if (expiresAt > new Date()) {
      console.log(`[librarian] Réutilisation Google URI: ${file.original_filename}`)
      return dbFile.google_file_uri
    }
  }

  // 2. Sinon, télécharger depuis Supabase Storage
  console.log(`[librarian] Upload vers Google Files: ${file.original_filename}`)
  
  const { data: fileData, error: downloadError } = await supabase.storage
    .from(file.storage_bucket)
    .download(file.storage_path)

  if (downloadError || !fileData) {
    throw new Error(`Erreur téléchargement ${file.original_filename}: ${downloadError?.message}`)
  }

  const fileBuffer = await fileData.arrayBuffer()

  // 3. Upload vers Google Files API (resumable)
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

  console.log(`[librarian] Upload terminé: ${googleFileUri}`)

  // 4. Sauvegarder l'URI en DB pour réutilisation (sources.files)
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString()
  
  await supabase
    .schema('sources')
    .from('files')
    .update({
      google_file_uri: googleFileUri,
      google_uri_expires_at: expiresAt,
    })
    .eq('id', file.file_id)

  return googleFileUri
}

// ============================================================================
// GEMINI CONTEXT CACHING VIA API REST
// ============================================================================

async function createGeminiCache(
  files: FileInfo[],
  googleUris: string[],
  systemPrompt: string,
  model: string,
  ttlSeconds: number
): Promise<string> {
  console.log(`[librarian] Création Context Cache Gemini (${files.length} fichiers)`)

  const parts: Array<Record<string, unknown>> = []
  
  // Texte système d'abord
  parts.push({ text: systemPrompt })
  
  // Fichiers ensuite
  for (let i = 0; i < googleUris.length; i++) {
    parts.push({
      fileData: {
        fileUri: googleUris[i],
        mimeType: files[i].mime_type || 'application/pdf',
      }
    })
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: `models/${model}`,
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
  
  console.log(`[librarian] Context Cache créé: ${cacheName}`)
  
  return cacheName
}

// ============================================================================
// GEMINI STREAMING GENERATION VIA API REST
// ============================================================================

async function* generateWithGeminiStream(
  query: string,
  cacheName: string | null,
  files: FileInfo[],
  googleUris: string[],
  systemPrompt: string,
  config: AgentConfig,
  meetingContext: string = ''  // v10.4.0: Contexte meetings
): AsyncGenerator<string, string, undefined> {
  
  // v10.4.0: Ajouter le contexte meetings à la question
  const fullQuery = meetingContext 
    ? `${query}\n\n${meetingContext}`
    : query;
  
  let requestBody: Record<string, unknown>
  
  if (cacheName) {
    // Génération avec cache existant
    console.log(`[librarian] Génération streaming avec cache: ${cacheName}`)
    requestBody = {
      cachedContent: cacheName,
      contents: [{ role: "user", parts: [{ text: fullQuery }] }],
      generationConfig: {
        temperature: config.temperature,
        maxOutputTokens: config.max_tokens,
      },
    }
  } else {
    // Génération directe sans cache
    console.log(`[librarian] Génération streaming directe (sans cache)`)
    const parts: Array<Record<string, unknown>> = []
    
    parts.push({ text: `${systemPrompt}\n\nQUESTION:\n${fullQuery}` })
    
    for (let i = 0; i < googleUris.length; i++) {
      parts.push({
        fileData: {
          fileUri: googleUris[i],
          mimeType: files[i].mime_type || 'application/pdf',
        }
      })
    }
    
    requestBody = {
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: config.temperature,
        maxOutputTokens: config.max_tokens,
      },
    }
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${config.gemini_model}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Gemini streaming error: ${errorText}`)
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
      } catch (parseError) {
        // Log parsing errors instead of silently ignoring
        console.warn(`[librarian] Gemini SSE parsing error: ${parseError instanceof Error ? parseError.message : 'Unknown'}`)
      }
    }
  }

  console.log(`[librarian] Gemini terminé: ${fullContent.length} chars`)
  return fullContent
}

// ============================================================================
// MÉMOIRE COLLECTIVE
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

    if (!data || data.length === 0) return null

    const best = data[0]
    
    // Vérifier les conditions de réutilisation
    const isUsable = best.is_expert_faq || best.trust_score >= 3
    
    if (!isUsable) {
      console.log(`[librarian] Match qa_memory ignoré: trust_score=${best.trust_score} < 3, is_expert=${best.is_expert_faq}`)
      return null
    }
    
    console.log(`[librarian] Match qa_memory: similarity=${best.similarity.toFixed(3)}, trust=${best.trust_score}, is_expert=${best.is_expert_faq}`)

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

async function incrementQAUsage(
  supabase: ReturnType<typeof createClient>,
  qaId: string
): Promise<void> {
  try {
    await supabase.schema('rag').rpc('increment_qa_usage', { p_qa_id: qaId })
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
    gemini_timeout_ms: (parameters.gemini_timeout_ms as number) || DEFAULT_CONFIG.gemini_timeout_ms,
    max_context_length: DEFAULT_CONFIG.max_context_length,
    google_file_ttl_hours: DEFAULT_CONFIG.google_file_ttl_hours,
    gemini_cache_ttl_seconds: (parameters.gemini_cache_ttl_seconds as number) || DEFAULT_CONFIG.gemini_cache_ttl_seconds,
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

function buildDocCatalog(files: FileInfo[]): string {
  if (files.length === 0) return 'Aucun document disponible.'
  
  return files.map(f => `- ID: "${f.file_id}" | NOM: "${f.original_filename}" | PAGES: ${f.total_pages}`).join('\n')
}

function buildFinalPrompt(
  configPrompt: string | null,
  fallbackPrompt: string,
  projectIdentity: Record<string, unknown> | null,
  files: FileInfo[],
  intent?: string
): string {
  const parts: string[] = []

  // 1. Prompt de configuration (prioritaire) ou fallback
  const basePrompt = configPrompt?.trim() || fallbackPrompt
  console.log(`[librarian] Prompt source: ${configPrompt?.trim() ? 'CONFIG' : 'FALLBACK'}`)
  
  // Nettoyer les placeholders non remplacés
  const cleanedPrompt = basePrompt
    .replace(/\{\{project_context\}\}/g, '')
    .replace(/\{\{doc_catalog\}\}/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  parts.push(cleanedPrompt)

  // 2. Contexte projet (si disponible)
  const projectContext = formatProjectContext(projectIdentity)
  if (projectContext) {
    parts.push(projectContext)
  }

  // 3. Règles de citation avec catalogue de documents
  const docCatalog = buildDocCatalog(files)
  const formatRulesWithCatalog = FORMAT_RULES.replace('{{doc_catalog}}', docCatalog)
  parts.push(formatRulesWithCatalog)

  // 4. Instructions spécifiques à l'intent
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
// v10.4.0: BUILD MEETING CONTEXT
// ============================================================================

function buildMeetingContext(meetingChunks: ChunkResult[]): string {
  if (meetingChunks.length === 0) return '';
  
  const header = `
═══════════════════════════════════════════════════════════════
COMPTES-RENDUS DE RÉUNIONS DE CHANTIER
═══════════════════════════════════════════════════════════════
Les informations ci-dessous proviennent des comptes-rendus de réunions.
Utilise-les pour répondre aux questions sur les décisions, actions et discussions.
═══════════════════════════════════════════════════════════════
`;

  const meetingContents = meetingChunks.map(chunk => {
    return chunk.content;
  }).join('\n\n---\n\n');

  return header + meetingContents;
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
// SEARCH (SIMPLIFIÉ - sans filterFilenames)
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
  filterFileIds: string[] | null
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
    filter_filenames: null,  // TOUJOURS null - on fait confiance à la recherche
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

  // v10.4.0: Séparer les chunks fichiers et meetings
  const meetingChunks = chunks.filter(c => 
    c.metadata?.source_type === 'meeting_transcript'
  );
  const fileChunks = chunks.filter(c => 
    c.metadata?.source_type !== 'meeting_transcript'
  );

  console.log(`[librarian] Chunks trouvés: ${chunks.length} total, ${meetingChunks.length} meetings, ${fileChunks.length} fichiers`);

  // Construire la map des fichiers (exclut les meetings)
  const filesMap = new Map<string, FileInfo>()
  for (const chunk of fileChunks) {
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

  console.log(`[librarian] Recherche: ${chunks.length} chunks, ${files.length} fichiers, ${totalPages} pages, ${meetingChunks.length} meetings`)

  return {
    chunks,
    files,
    meetingChunks,  // v10.4.0
    totalPages,
    filterApplied: filterFileIds !== null && filterFileIds.length > 0,
    fallbackUsed: false,
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
      // v10.4.0: Afficher le nom de la réunion pour les meetings
      let docName = chunk.file_original_filename || 'Document';
      if (chunk.metadata?.source_type === 'meeting_transcript') {
        const meetingDate = chunk.metadata?.meeting_date || 'Date inconnue';
        const meetingTitle = chunk.metadata?.meeting_title || 'Réunion';
        docName = `📋 Réunion du ${meetingDate} - ${meetingTitle}`;
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
      } catch (parseError) {
        // Log parsing errors instead of silently ignoring
        console.warn(`[librarian] OpenAI SSE parsing error: ${parseError instanceof Error ? parseError.message : 'Unknown'}`)
      }
    }
  }

  return fullContent
}

// ============================================================================
// SOURCES BUILDING
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

// v10.4.0: Build sources from meeting chunks
function buildSourcesFromMeetings(meetingChunks: ChunkResult[]): SourceItem[] {
  // Dédupliquer par meeting_id
  const meetingsMap = new Map<string, SourceItem>();
  
  for (const chunk of meetingChunks) {
    const meetingId = chunk.metadata?.meeting_id as string || `meeting-${chunk.chunk_id}`;
    
    if (!meetingsMap.has(meetingId)) {
      const meetingDate = chunk.metadata?.meeting_date || 'Date inconnue';
      const meetingTitle = chunk.metadata?.meeting_title || 'Réunion';
      
      meetingsMap.set(meetingId, {
        id: chunk.chunk_id,
        type: 'meeting',
        source_file_id: null,
        document_name: `📋 Réunion du ${meetingDate} - ${meetingTitle}`,
        score: chunk.similarity,
        layer: chunk.layer,
        content_preview: chunk.content?.substring(0, 200) || null,
      });
    }
  }
  
  return Array.from(meetingsMap.values());
}

function buildSourcesFromChunks(chunks: ChunkResult[]): SourceItem[] {
  const sourcesMap = new Map<string, SourceItem>()

  for (const chunk of chunks) {
    const key = chunk.source_file_id || chunk.chunk_id.toString()
    if (sourcesMap.has(key)) continue

    // v10.4.0: Gérer les meetings différemment
    if (chunk.metadata?.source_type === 'meeting_transcript') {
      const meetingDate = chunk.metadata?.meeting_date || 'Date inconnue';
      const meetingTitle = chunk.metadata?.meeting_title || 'Réunion';
      sourcesMap.set(key, {
        id: chunk.chunk_id,
        type: 'meeting',
        source_file_id: null,
        document_name: `📋 Réunion du ${meetingDate} - ${meetingTitle}`,
        score: chunk.similarity,
        layer: chunk.layer,
        content_preview: chunk.content?.substring(0, 200) || null,
      });
    } else {
      sourcesMap.set(key, {
        id: chunk.chunk_id,
        type: 'document',
        source_file_id: chunk.source_file_id,
        document_name: chunk.file_original_filename || 'Document',
        score: chunk.similarity,
        layer: chunk.layer,
        content_preview: chunk.content?.substring(0, 200) || null,
      });
    }
  }

  return Array.from(sourcesMap.values())
}

function filterSourcesByCitation(sources: SourceItem[], response: string): SourceItem[] {
  if (!sources.length || !response.trim()) return sources

  // Détecter les IDs dans les tags <cite doc="ID">
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
  console.log(`[librarian] Sources filtrées (chunks): ${sources.length} → ${result.length}`)

  if (result.length === 0 && sources.length > 0) {
    console.log(`[librarian] Aucune citation détectée, conservation source principale`)
    return [sources[0]]
  }

  return result
}

// ============================================================================
// HELPER: Comparer deux listes de file_ids
// ============================================================================

function areFileIdsSame(ids1: string[], ids2: string[]): boolean {
  if (ids1.length !== ids2.length) return false
  const sorted1 = [...ids1].sort()
  const sorted2 = [...ids2].sort()
  return sorted1.every((id, i) => id === sorted2[i])
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  // ════════════════════════════════════════════════════════════════════════════
  // v10.4.1: INSTRUMENTATION TIMING
  // ════════════════════════════════════════════════════════════════════════════
  const startTime = Date.now()
  const timings: Record<string, number> = {}
  
  const mark = (label: string) => {
    timings[label] = Date.now() - startTime
    console.log(`[librarian] ⏱️ ${label}: ${timings[label]}ms`)
  }
  // ════════════════════════════════════════════════════════════════════════════

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
      preloaded_context,
      generation_mode = 'auto',
      include_app_layer = DEFAULT_CONFIG.include_app_layer,
      include_org_layer = DEFAULT_CONFIG.include_org_layer,
      include_project_layer = DEFAULT_CONFIG.include_project_layer,
      include_user_layer = DEFAULT_CONFIG.include_user_layer,
      filter_source_types,
    } = body

    if (!query?.trim()) return errorResponse("Query is required")
    if (!user_id) return errorResponse("user_id is required")

    console.log(`[librarian] v10.4.1 INSTRUMENTED - Query: "${query.substring(0, 50)}..."`)

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const sseStream = new ReadableStream({
      async start(controller) {
        try {
          sendSSE(controller, 'step', { step: 'analyzing', message: '🧠 Analyse de la question...' })

          // ================================================================
          // 1. CONTEXTE
          // ================================================================
          const libContext = await getAgentContext(supabase, user_id, org_id, project_id, app_id, preloaded_context)
          const config = buildAgentConfig(libContext.parameters)
          const conversationHistory = formatConversationHistory(libContext)

          mark('1_context')  // ⏱️ TIMING

          console.log(`[librarian] Contexte projet: ${libContext.projectIdentity ? 'OUI' : 'NON'}`)
          console.log(`[librarian] Config source: ${libContext.configSource}`)

          await addMessage(supabase, libContext.conversationId, 'user', query)

          // ================================================================
          // 2. EMBEDDING
          // ================================================================
          sendSSE(controller, 'step', { step: 'embedding', message: '🔢 Vectorisation...' })
          const queryForEmbedding = rewritten_query || query
          const queryEmbedding = await generateEmbedding(queryForEmbedding)

          mark('2_embedding')  // ⏱️ TIMING

          // ================================================================
          // 3. RECHERCHE MÉMOIRE COLLECTIVE
          // ================================================================
          // FIX v10.3.2: Utiliser org_id du body si effectiveOrgId est NULL (super admin)
          const memoryOrgId = libContext.effectiveOrgId || org_id
          
          if (memoryOrgId) {
            sendSSE(controller, 'step', { step: 'memory_search', message: '🧠 Mémoire collective...' })
            console.log(`[librarian] Recherche mémoire avec org_id: ${memoryOrgId}`)

            const memoryResult = await searchQAMemory(
              supabase,
              queryEmbedding,
              memoryOrgId,
              project_id,
              config
            )

            mark('3_memory_search')  // ⏱️ TIMING

            if (memoryResult) {
              console.log(`[librarian] 🎯 MEMORY HIT`)

              const memoryLabel = memoryResult.is_expert_faq
                ? `💡 Réponse FAQ Expert`
                : `💡 Réponse validée (${memoryResult.trust_score} 👍)`

              sendSSE(controller, 'step', { step: 'memory_hit', message: memoryLabel })

              const words = memoryResult.answer_text.split(' ')
              for (const word of words) {
                sendSSE(controller, 'token', { content: word + ' ' })
              }

              await incrementQAUsage(supabase, memoryResult.id)

              const processingTime = Date.now() - startTime
              await addMessage(supabase, libContext.conversationId, 'assistant', memoryResult.answer_text, [], 'memory', processingTime)

              // ⏱️ TIMING FINAL (memory path)
              console.log(`[librarian] ⏱️ TOTAL (memory): ${JSON.stringify(timings)}`)

              sendSSE(controller, 'sources', {
                sources: [{
                  id: memoryResult.id,
                  type: 'qa_memory',
                  source_file_id: null,
                  document_name: memoryLabel,
                  score: memoryResult.similarity,
                  layer: 'memory',
                  content_preview: memoryResult.question_text.substring(0, 100),
                }],
                conversation_id: libContext.conversationId,
                generation_mode: 'memory',
                generation_mode_ui: MODE_LABELS.memory.ui,
                processing_time_ms: processingTime,
                from_memory: true,
                qa_memory_id: memoryResult.id,
                qa_memory_similarity: memoryResult.similarity,
                qa_memory_is_expert: memoryResult.is_expert_faq,
                qa_memory_trust_score: memoryResult.trust_score,
                timings,  // ⏱️ Inclure les timings dans la réponse
              })

              sendSSE(controller, 'done', {})
              controller.close()
              return
            }
          } else {
            console.log(`[librarian] Recherche mémoire SKIPPED: pas d'org_id disponible`)
            mark('3_memory_search_skipped')  // ⏱️ TIMING
          }

          // ================================================================
          // 4. RECHERCHE DOCUMENTAIRE (simplifiée - sans filterFilenames)
          // ================================================================
          sendSSE(controller, 'step', { step: 'search', message: '🔍 Recherche documentaire...' })

          const layerFlags = { app: include_app_layer, org: include_org_layer, project: include_project_layer, user: include_user_layer }

          const searchResult = await executeSearch(
            supabase, queryEmbedding, query, user_id, libContext.effectiveOrgId,
            project_id, libContext.effectiveAppId, config, layerFlags,
            filter_source_types, null
          )

          mark('4_sql_search')  // ⏱️ TIMING - LE SUSPECT PRINCIPAL

          // v10.4.0: Message avec info meetings
          const meetingInfo = searchResult.meetingChunks.length > 0 
            ? ` + ${searchResult.meetingChunks.length} réunion(s)`
            : '';
          
          sendSSE(controller, 'step', {
            step: 'files_found',
            message: `📚 ${searchResult.files.length} doc(s) - ${searchResult.totalPages} pages${meetingInfo}`,
          })

          console.log(`[librarian] Fichiers trouvés: [${searchResult.files.map(f => f.original_filename).join(', ')}]`)
          if (searchResult.meetingChunks.length > 0) {
            console.log(`[librarian] Meetings trouvés: ${searchResult.meetingChunks.length} chunk(s)`)
          }

          // ================================================================
          // 5. DÉCISION MODE
          // ================================================================
          let effectiveMode = generation_mode

          if (generation_mode === 'auto') {
            // v10.4.0: Si seulement des meetings (pas de fichiers), utiliser chunks
            if (searchResult.files.length === 0 && searchResult.meetingChunks.length > 0) {
              effectiveMode = 'chunks'
              console.log(`[librarian] Mode chunks forcé: seulement des meetings, pas de fichiers PDF`)
            } else if (searchResult.files.length === 0 || !GEMINI_API_KEY) {
              effectiveMode = 'chunks'
            } else if (searchResult.totalPages <= config.gemini_max_pages) {
              effectiveMode = 'gemini'
            } else {
              effectiveMode = 'chunks'
            }
          }

          const modeInfo = MODE_LABELS[effectiveMode as keyof typeof MODE_LABELS] || MODE_LABELS.chunks
          sendSSE(controller, 'step', { step: 'mode_decision', message: `${modeInfo.icon} Mode ${modeInfo.ui}` })

          // ================================================================
          // 6. GÉNÉRATION
          // ================================================================
          let fullResponse = ''
          let cacheWasReused = false
          let firstTokenMarked = false  // ⏱️ Flag pour premier token
          
          // v10.4.0: Construire le contexte meetings
          const meetingContext = buildMeetingContext(searchResult.meetingChunks);

          if (effectiveMode === 'gemini' && searchResult.files.length > 0) {

            try {
              sendSSE(controller, 'step', { step: 'caching', message: '📦 Préparation contexte...' })

              // ============================================================
              // 6a. Construire le prompt Gemini UNE SEULE FOIS
              // ============================================================
              const geminiPrompt = buildFinalPrompt(
                libContext.geminiSystemPrompt,
                FALLBACK_GEMINI_PROMPT,
                libContext.projectIdentity,
                searchResult.files,
                intent
              )

              // ============================================================
              // 6b. Vérifier si un cache valide existe ET correspond aux fichiers
              // ============================================================
              const { data: conv } = await supabase
                .schema('rag')
                .from('conversations')
                .select('gemini_cache_name, gemini_cache_expires_at, gemini_cache_file_ids')
                .eq('id', libContext.conversationId)
                .single()

              let cacheName: string | null = null
              let googleUris: string[] = []

              const searchFileIds = searchResult.files.map(f => f.file_id)
              const cacheFileIds: string[] = conv?.gemini_cache_file_ids || []
              
              const cacheNotExpired = conv?.gemini_cache_name && 
                                       conv.gemini_cache_expires_at && 
                                       new Date(conv.gemini_cache_expires_at) > new Date()
              
              const sameFiles = areFileIdsSame(searchFileIds, cacheFileIds)

              console.log(`[librarian] Cache check: notExpired=${cacheNotExpired}, sameFiles=${sameFiles}`)
              console.log(`[librarian] Search files: [${searchFileIds.join(', ')}]`)
              console.log(`[librarian] Cache files: [${cacheFileIds.join(', ')}]`)

              if (cacheNotExpired && sameFiles) {
                // Cache valide ET mêmes fichiers → Réutiliser
                cacheName = conv.gemini_cache_name
                cacheWasReused = true
                console.log(`[librarian] ✅ Cache réutilisé: ${cacheName}`)
                mark('5_google_upload_skipped')  // ⏱️ TIMING
                mark('6_gemini_cache_reused')  // ⏱️ TIMING
              } else {
                // Pas de cache valide OU fichiers différents → Créer nouveau
                if (cacheNotExpired && !sameFiles) {
                  console.log(`[librarian] ⚠️ Cache invalidé: fichiers différents`)
                } else {
                  console.log(`[librarian] Création nouveau cache...`)
                }
                cacheWasReused = false

                // Upload fichiers vers Google Files
                googleUris = await Promise.all(
                  searchResult.files.map(f => getOrUploadGoogleFile(supabase, f, config.google_file_ttl_hours))
                )

                mark('5_google_upload')  // ⏱️ TIMING

                // Créer le cache avec le prompt déjà construit
                cacheName = await createGeminiCache(
                  searchResult.files,
                  googleUris,
                  geminiPrompt,
                  config.gemini_model,
                  config.gemini_cache_ttl_seconds
                )

                mark('6_gemini_cache')  // ⏱️ TIMING

                // Sauvegarder en DB avec les file_ids
                const cacheExpiresAt = new Date(Date.now() + config.gemini_cache_ttl_seconds * 1000).toISOString()
                await supabase
                  .schema('rag')
                  .from('conversations')
                  .update({
                    gemini_cache_name: cacheName,
                    gemini_cache_expires_at: cacheExpiresAt,
                    gemini_cache_file_ids: searchFileIds,
                  })
                  .eq('id', libContext.conversationId)
              }

              // ============================================================
              // 6c. GÉNÉRATION STREAMING GEMINI (avec contexte meetings)
              // ============================================================
              sendSSE(controller, 'step', { step: 'generating', message: '✨ Génération...' })

              const generator = generateWithGeminiStream(
                query,
                cacheName,
                searchResult.files,
                googleUris,
                geminiPrompt,
                config,
                meetingContext  // v10.4.0: Passer le contexte meetings
              )

              for await (const token of generator) {
                // ⏱️ TIMING: Premier token
                if (!firstTokenMarked) {
                  mark('7_first_token')
                  firstTokenMarked = true
                }
                fullResponse += token
                sendSSE(controller, 'token', { content: token })
              }

            } catch (geminiError) {
              console.error('[librarian] Gemini error, fallback chunks:', geminiError)

              effectiveMode = 'chunks'
              cacheWasReused = false

              sendSSE(controller, 'step', { step: 'gemini_fallback', message: '⚠️ Fallback RAG Chunks...' })

              const systemPrompt = buildFinalPrompt(
                libContext.systemPrompt,
                FALLBACK_SYSTEM_PROMPT,
                libContext.projectIdentity,
                [],
                intent
              )

              const context = formatContext(searchResult.chunks, config.max_context_length)
              const generator = generateWithOpenAIStream(query, context, conversationHistory, systemPrompt, config)

              for await (const token of generator) {
                // ⏱️ TIMING: Premier token
                if (!firstTokenMarked) {
                  mark('7_first_token')
                  firstTokenMarked = true
                }
                fullResponse += token
                sendSSE(controller, 'token', { content: token })
              }
            }
          } else {
            // Mode chunks
            mark('5_google_upload_na')  // ⏱️ TIMING (N/A pour chunks)
            mark('6_gemini_cache_na')  // ⏱️ TIMING (N/A pour chunks)

            const systemPrompt = buildFinalPrompt(
              libContext.systemPrompt,
              FALLBACK_SYSTEM_PROMPT,
              libContext.projectIdentity,
              [],
              intent
            )

            const context = formatContext(searchResult.chunks, config.max_context_length)
            const generator = generateWithOpenAIStream(query, context, conversationHistory, systemPrompt, config)

            for await (const token of generator) {
              // ⏱️ TIMING: Premier token
              if (!firstTokenMarked) {
                mark('7_first_token')
                firstTokenMarked = true
              }
              fullResponse += token
              sendSSE(controller, 'token', { content: token })
            }
          }

          // ================================================================
          // 7. SOURCES (v10.4.0: Ajouter les meetings)
          // ================================================================
          let finalSources: SourceItem[]

          if (effectiveMode === 'gemini' && searchResult.files.length > 0) {
            // Mode Gemini: Sources = fichiers + meetings
            finalSources = buildSourcesFromFiles(searchResult.files)
            
            // v10.4.0: Ajouter les sources meetings
            const meetingSources = buildSourcesFromMeetings(searchResult.meetingChunks)
            finalSources = [...finalSources, ...meetingSources]
            
            console.log(`[librarian] Sources Gemini: ${finalSources.map(s => s.document_name).join(', ')}`)
          } else {
            // Mode chunks: filtrer par citation
            const allSources = buildSourcesFromChunks(searchResult.chunks)
            finalSources = filterSourcesByCitation(allSources, fullResponse)
            console.log(`[librarian] Sources Chunks (filtrées): ${finalSources.map(s => s.document_name).join(', ')}`)
          }

          // ================================================================
          // 8. FINALISATION
          // ================================================================
          const processingTime = Date.now() - startTime
          await addMessage(supabase, libContext.conversationId, 'assistant', fullResponse, finalSources, effectiveMode, processingTime)

          // ⏱️ TIMING FINAL
          mark('8_total')
          console.log(`[librarian] ⏱️ TOTAL: ${JSON.stringify(timings)}`)

          sendSSE(controller, 'sources', {
            sources: finalSources,
            conversation_id: libContext.conversationId,
            generation_mode: effectiveMode,
            generation_mode_ui: modeInfo.ui,
            processing_time_ms: processingTime,
            files_count: searchResult.files.length,
            chunks_count: searchResult.chunks.length,
            meetings_count: searchResult.meetingChunks.length,  // v10.4.0
            total_pages: searchResult.totalPages,
            cache_reused: cacheWasReused,
            intent: intent || null,
            timings,  // ⏱️ Inclure les timings dans la réponse SSE
          })

          sendSSE(controller, 'done', {})
          controller.close()

        } catch (error) {
          console.error('[librarian] Error:', error)
          // ⏱️ TIMING sur erreur
          console.log(`[librarian] ⏱️ ERROR at ${Date.now() - startTime}ms: ${JSON.stringify(timings)}`)
          sendSSE(controller, 'error', { error: error instanceof Error ? error.message : 'Internal error' })
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
