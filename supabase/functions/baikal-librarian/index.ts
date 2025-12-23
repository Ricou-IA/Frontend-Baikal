// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  BAIKAL-LIBRARIAN v8.11.0 - Agent RAG Hybride Intelligent                   ║
// ║  Edge Function Supabase                                                      ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  Nouveautés v8.11.0:                                                         ║
// ║  - Comptage documents uniques (via source_file_id)                           ║
// ║  - Calcul total pages (via metadata.total_pages)                             ║
// ║  - Override intelligent: gemini → chunks si pages > GEMINI_MAX_PAGES         ║
// ║  - Metrics enrichies: unique_docs, total_pages, chunks_found, override_reason║
// ║  - Prompts GÉNÉRIQUES (spécialisation métier via config.agent_prompts)       ║
// ║  Nouveautés v8.10.0:                                                         ║
// ║  - PHASE 2: Réception et injection du contexte projet dans les prompts      ║
// ║  - Support {{project_context}} dans system_prompt et gemini_system_prompt   ║
// ║  Nouveautés v8.9.3:                                                          ║
// ║  - Fix: Appel LLM même sans documents (mémoire + échanges cordiaux)          ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { GoogleGenerativeAI } from "npm:@google/generative-ai@0.21.0"
import { GoogleAICacheManager } from "npm:@google/generative-ai@0.21.0/server"

// ============================================================================
// CONFIGURATION
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

// Configuration par défaut (fallback)
const DEFAULT_CONFIG = {
  // LLM
  match_threshold: 0.3,
  match_count: 15,
  max_context_length: 12000,
  embedding_model: "text-embedding-3-small",
  llm_model: "gpt-4o-mini",
  temperature: 0.3,
  max_tokens: 2048,
  // Poids recherche
  vector_weight: 0.7,
  fulltext_weight: 0.3,
  // Layers par défaut
  include_app_layer: true,
  include_org_layer: true,
  include_project_layer: true,
  include_user_layer: false,
  // GraphRAG
  concept_match_count: 5,
  concept_similarity_threshold: 0.5,
  enable_concept_expansion: true,
  // Gemini Config
  gemini_model: "gemini-2.0-flash",
  gemini_max_files: 10,
  cache_ttl_minutes: 60,
  // v8.11.0: Seuil pour override Gemini → Chunks
  gemini_max_pages: 500,
  // Conversation Config
  conversation_timeout_minutes: 30,
  conversation_context_messages: 4,
}

// ============================================================================
// PROMPTS GÉNÉRIQUES (Fallback - spécialisation métier via DB)
// ============================================================================

const FALLBACK_SYSTEM_PROMPT = `Tu es un assistant documentaire expert, chaleureux et professionnel.

{{project_context}}

RÈGLE ABSOLUE - UTILISATION DES DOCUMENTS:
Des documents apparaissent dans le CONTEXTE DOCUMENTAIRE ci-dessous ?
→ OUI = Ces documents SONT pertinents. Utilise-les pour répondre. Ne dis JAMAIS "je n'ai pas trouvé" si des documents sont présents.
→ NON (section vide ou "Aucun document pertinent trouvé") = Dis-le clairement.

Tu ne juges PAS si un document est pertinent. Si le système te fournit des documents, c'est qu'ils correspondent à la question.

RÈGLES:
- Réponds de manière naturelle et cordiale aux salutations et échanges informels
- Si l'utilisateur fait référence à un échange précédent, utilise l'historique de conversation
- Pour les questions techniques, base tes réponses sur le contexte documentaire fourni
- Cite tes sources avec les numéros [1], [2], etc. quand tu utilises des documents
- Dis que tu n'as pas trouvé UNIQUEMENT si le contexte documentaire est vide
- Réponds de manière professionnelle mais chaleureuse`

const GEMINI_SYSTEM_PROMPT = `Tu es un assistant documentaire expert.

{{project_context}}

CONTEXTE:
Tu as accès aux documents complets fournis en contexte. Ces documents contiennent des informations détaillées que tu dois utiliser pour répondre.

RÈGLE ABSOLUE:
Les documents fournis SONT pertinents pour la question. Utilise-les.
Ne dis JAMAIS "je n'ai pas trouvé" si des documents sont présents.

RÈGLES:
1. Réponds de manière naturelle et cordiale aux salutations et échanges informels
2. Si l'utilisateur fait référence à un échange précédent, utilise l'historique de conversation
3. Pour les questions techniques, base tes réponses sur les documents fournis en contexte
4. Cite précisément tes sources (nom du document, section si pertinent)
5. Dis que tu n'as pas trouvé UNIQUEMENT si aucun document n'est fourni
6. Réponds de manière professionnelle et structurée

FORMAT DE RÉPONSE:
- Réponds de manière claire et concise
- Utilise des listes à puces si nécessaire
- Cite les sources entre [crochets]`

// ============================================================================
// TYPES
// ============================================================================

interface RequestBody {
  query: string
  user_id: string
  org_id?: string
  project_id?: string
  app_id?: string
  agent_id?: string
  conversation_id?: string
  project_context?: string
  intent?: 'synthesis' | 'factual' | 'comparison' | 'citation' | 'conversational'
  match_threshold?: number
  match_count?: number
  temperature?: number
  max_tokens?: number
  include_app_layer?: boolean
  include_org_layer?: boolean
  include_project_layer?: boolean
  include_user_layer?: boolean
  filter_source_types?: string[]
  filter_concepts?: string[]
  generation_mode?: 'chunks' | 'gemini'
}

interface ConversationContext {
  conversation_id: string
  first_message: string | null
  summary: string | null
  recent_messages: Array<{
    role: string
    content: string
    created_at: string
  }>
  message_count: number
}

interface AgentConfig {
  llm_model: string
  temperature: number
  max_tokens: number
  match_count: number
  match_threshold: number
  enable_concept_expansion: boolean
  vector_weight: number
  fulltext_weight: number
  gemini_model: string
  gemini_max_files: number
  gemini_max_pages: number
  cache_ttl_minutes: number
  max_context_length: number
}

interface DocumentResult {
  id: number
  content: string
  similarity: number
  metadata: Record<string, unknown>
  layer: string
  source_type?: string
  matched_concepts?: string[]
  rank_score?: number
  match_source?: string
  source_file_id?: string
}

interface FileResult {
  file_id: string
  storage_path: string
  storage_bucket: string
  original_filename: string
  mime_type: string
  file_size: number
  max_similarity: number
  avg_similarity: number
  chunk_count: number
  layers: string[]
  sample_content: string
}

interface GeminiCacheInfo {
  file_path: string
  cache_name: string | null
  is_new: boolean
  google_file_uri?: string
}

// v8.11.0: Stats des documents
interface DocumentStats {
  chunks_found: number
  unique_docs: number
  total_pages: number
  doc_details: Array<{
    source_file_id: string
    filename: string
    pages: number
  }>
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

function successResponse(data: unknown) {
  return new Response(
    JSON.stringify(data),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  )
}

// ============================================================================
// v8.11.0: CALCUL STATS DOCUMENTS
// ============================================================================

function calculateDocumentStats(documents: DocumentResult[]): DocumentStats {
  const uniqueDocs = new Map<string, { filename: string; pages: number }>()
  
  for (const doc of documents) {
    const fileId = doc.source_file_id
    if (!fileId) continue
    
    if (!uniqueDocs.has(fileId)) {
      uniqueDocs.set(fileId, {
        filename: (doc.metadata?.filename || doc.metadata?.document_title || 'Document') as string,
        pages: (doc.metadata?.total_pages || 1) as number
      })
    }
  }
  
  const docDetails = Array.from(uniqueDocs.entries()).map(([id, info]) => ({
    source_file_id: id,
    filename: info.filename,
    pages: info.pages
  }))
  
  const totalPages = docDetails.reduce((sum, doc) => sum + doc.pages, 0)
  
  return {
    chunks_found: documents.length,
    unique_docs: uniqueDocs.size,
    total_pages: totalPages,
    doc_details: docDetails
  }
}

// ============================================================================
// RÉCUPÉRATION CONFIG AGENT DEPUIS DB
// ============================================================================

async function getAgentConfig(
  supabase: ReturnType<typeof createClient>,
  app_id: string,
  org_id?: string
): Promise<{ config: AgentConfig; systemPrompt: string; geminiSystemPrompt: string }> {
  console.log(`[baikal-librarian] Recherche prompt librarian pour app=${app_id}, org=${org_id || 'null'}`)
  
  let promptData = null
  
  // Priorité 1: Organisation
  if (org_id) {
    const { data } = await supabase
      .schema('config')
      .from('agent_prompts')
      .select('system_prompt, gemini_system_prompt, parameters')
      .eq('agent_type', 'librarian')
      .eq('is_active', true)
      .eq('org_id', org_id)
      .single()
    
    if (data) {
      console.log('[baikal-librarian] Prompt trouvé: niveau organisation')
      promptData = data
    }
  }
  
  // Priorité 2: Verticale (app_id)
  if (!promptData) {
    const { data } = await supabase
      .schema('config')
      .from('agent_prompts')
      .select('system_prompt, gemini_system_prompt, parameters')
      .eq('agent_type', 'librarian')
      .eq('is_active', true)
      .eq('app_id', app_id)
      .is('org_id', null)
      .single()
    
    if (data) {
      console.log('[baikal-librarian] Prompt trouvé: niveau verticale')
      promptData = data
    }
  }
  
  // Priorité 3: Global
  if (!promptData) {
    const { data } = await supabase
      .schema('config')
      .from('agent_prompts')
      .select('system_prompt, gemini_system_prompt, parameters')
      .eq('agent_type', 'librarian')
      .eq('is_active', true)
      .is('app_id', null)
      .is('org_id', null)
      .single()
    
    if (data) {
      console.log('[baikal-librarian] Prompt trouvé: niveau global')
      promptData = data
    }
  }
  
  if (!promptData) {
    console.log('[baikal-librarian] Aucun prompt en DB, utilisation du fallback générique')
  }
  
  const params = promptData?.parameters || {}
  
  const config: AgentConfig = {
    llm_model: params.model || DEFAULT_CONFIG.llm_model,
    temperature: params.temperature ?? DEFAULT_CONFIG.temperature,
    max_tokens: params.max_tokens || DEFAULT_CONFIG.max_tokens,
    match_count: params.match_count || DEFAULT_CONFIG.match_count,
    match_threshold: params.match_threshold ?? DEFAULT_CONFIG.match_threshold,
    enable_concept_expansion: params.enable_concept_expansion ?? DEFAULT_CONFIG.enable_concept_expansion,
    vector_weight: params.vector_weight ?? DEFAULT_CONFIG.vector_weight,
    fulltext_weight: params.fulltext_weight ?? DEFAULT_CONFIG.fulltext_weight,
    gemini_model: params.gemini_model || DEFAULT_CONFIG.gemini_model,
    gemini_max_files: params.gemini_max_files || DEFAULT_CONFIG.gemini_max_files,
    gemini_max_pages: params.gemini_max_pages || DEFAULT_CONFIG.gemini_max_pages,
    cache_ttl_minutes: params.cache_ttl_minutes || DEFAULT_CONFIG.cache_ttl_minutes,
    max_context_length: DEFAULT_CONFIG.max_context_length,
  }
  
  console.log(`[baikal-librarian] Config: match_count=${config.match_count}, threshold=${config.match_threshold}`)
  console.log(`[baikal-librarian] Gemini: model=${config.gemini_model}, max_pages=${config.gemini_max_pages}`)
  
  return {
    config,
    systemPrompt: promptData?.system_prompt || FALLBACK_SYSTEM_PROMPT,
    geminiSystemPrompt: promptData?.gemini_system_prompt || GEMINI_SYSTEM_PROMPT,
  }
}

// ============================================================================
// INJECTION CONTEXTE PROJET
// ============================================================================

function injectProjectContext(prompt: string, projectContext: string): string {
  if (!projectContext || projectContext === 'Aucune identité projet.' || projectContext === 'Aucune identité projet définie.') {
    return prompt.replace('{{project_context}}', '').replace(/\n\n+/g, '\n\n').trim()
  }
  
  if (prompt.includes('{{project_context}}')) {
    return prompt.replace('{{project_context}}', `CONTEXTE PROJET:\n${projectContext}\n`)
  }
  
  return `CONTEXTE PROJET:\n${projectContext}\n\n---\n\n${prompt}`
}

// ============================================================================
// CONVERSATION MEMORY FUNCTIONS
// ============================================================================

async function findOrCreateConversation(
  supabase: ReturnType<typeof createClient>,
  user_id: string,
  org_id: string | null,
  project_id: string | null,
  app_id: string
): Promise<string> {
  const { data, error } = await supabase
    .schema('rag')
    .rpc('find_or_create_conversation', {
      p_user_id: user_id,
      p_org_id: org_id,
      p_project_id: project_id,
      p_app_id: app_id,
      p_timeout_minutes: DEFAULT_CONFIG.conversation_timeout_minutes,
    })
  
  if (error) throw new Error(`Conversation error: ${error.message}`)
  return data
}

async function getConversationContext(
  supabase: ReturnType<typeof createClient>,
  conversation_id: string
): Promise<ConversationContext | null> {
  const { data, error } = await supabase
    .schema('rag')
    .rpc('get_conversation_context', {
      p_conversation_id: conversation_id,
      p_last_n_messages: DEFAULT_CONFIG.conversation_context_messages,
    })
  
  if (error || !data || data.length === 0) return null
  
  const ctx = data[0]
  let recentMessages = ctx.recent_messages || []
  if (typeof recentMessages === 'string') {
    try { recentMessages = JSON.parse(recentMessages) } catch { recentMessages = [] }
  }
  
  return {
    conversation_id: ctx.conversation_id,
    first_message: ctx.first_message,
    summary: ctx.summary,
    recent_messages: recentMessages,
    message_count: ctx.message_count,
  }
}

async function addMessage(
  supabase: ReturnType<typeof createClient>,
  conversation_id: string,
  role: 'user' | 'assistant',
  content: string,
  sources?: unknown[],
  generation_mode?: string,
  processing_time_ms?: number
): Promise<string | null> {
  const { data, error } = await supabase
    .schema('rag')
    .rpc('add_message', {
      p_conversation_id: conversation_id,
      p_role: role,
      p_content: content,
      p_sources: sources ? JSON.stringify(sources) : null,
      p_generation_mode: generation_mode || null,
      p_processing_time_ms: processing_time_ms || null,
    })
  
  if (error) return null
  return data
}

function formatConversationHistory(context: ConversationContext | null): string {
  if (!context) return ''
  
  const parts: string[] = []
  
  if (context.summary) {
    parts.push(`RÉSUMÉ DES ÉCHANGES PRÉCÉDENTS:\n${context.summary}`)
  }
  
  if (context.first_message && !context.summary) {
    parts.push(`QUESTION INITIALE DE L'UTILISATEUR:\n${context.first_message}`)
  }
  
  if (context.recent_messages && context.recent_messages.length > 0) {
    const messagesFormatted = context.recent_messages
      .slice().reverse()
      .map(m => `${m.role === 'user' ? 'UTILISATEUR' : 'ASSISTANT'}: ${m.content}`)
      .join('\n\n')
    parts.push(`HISTORIQUE RÉCENT:\n${messagesFormatted}`)
  }
  
  if (parts.length === 0) return ''
  return `CONTEXTE DE CONVERSATION:\n${parts.join('\n\n---\n\n')}\n\n---\n\n`
}

// ============================================================================
// OPENAI EMBEDDING
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
    throw new Error(`OpenAI Embedding error: ${JSON.stringify(error)}`)
  }

  const data = await response.json()
  return data.data[0].embedding
}

// ============================================================================
// GOOGLE AI SDK
// ============================================================================

let cacheManager: GoogleAICacheManager | null = null
let genAI: GoogleGenerativeAI | null = null

function initGoogleAI() {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured")
  if (!cacheManager) cacheManager = new GoogleAICacheManager(GEMINI_API_KEY)
  if (!genAI) genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
  return { cacheManager, genAI }
}

async function uploadToGoogleFiles(
  fileBuffer: ArrayBuffer, 
  filename: string, 
  mimeType: string
): Promise<string> {
  console.log(`[Gemini] Upload fichier: ${filename} (${mimeType})`)
  
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
  if (!uploadUrl) throw new Error("Missing upload URL from Google")

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
  console.log(`[Gemini] Fichier uploadé: ${fileInfo.file?.uri || fileInfo.uri}`)
  return fileInfo.file?.uri || fileInfo.uri
}

async function createGoogleCache(
  fileUri: string, 
  filename: string,
  systemPrompt: string,
  geminiModel: string,
  ttlSeconds: number
): Promise<string> {
  console.log(`[Gemini] Création cache pour: ${filename} (model=${geminiModel}, ttl=${ttlSeconds}s)`)
  
  const { cacheManager } = initGoogleAI()
  
  const cache = await cacheManager!.create({
    model: geminiModel,
    displayName: filename,
    systemInstruction: systemPrompt,
    contents: [{
      role: "user",
      parts: [{ fileData: { fileUri: fileUri, mimeType: "application/pdf" } }]
    }],
    ttlSeconds: ttlSeconds
  })
  
  console.log(`[Gemini] Cache créé: ${cache.name}`)
  return cache.name!
}

async function updateCacheTTL(cacheName: string): Promise<boolean> {
  try {
    const { cacheManager } = initGoogleAI()
    const cache = await cacheManager!.get(cacheName)
    return cache && cache.name ? true : false
  } catch {
    return false
  }
}

async function generateWithGemini(
  query: string,
  cacheNames: string[],
  conversationHistory: string,
  temperature: number,
  maxTokens: number
): Promise<string> {
  console.log(`[Gemini] Génération avec ${cacheNames.length} cache(s)`)
  
  const { cacheManager, genAI } = initGoogleAI()
  
  const cacheName = cacheNames[0]
  const cache = await cacheManager!.get(cacheName)
  
  const model = genAI!.getGenerativeModelFromCachedContent(cache, {
    generationConfig: { temperature, maxOutputTokens: maxTokens }
  })
  
  const fullQuery = conversationHistory 
    ? `${conversationHistory}\nQUESTION ACTUELLE:\n${query}`
    : query
  
  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: fullQuery }] }]
  })
  
  const text = result.response.text()
  if (!text) throw new Error("Gemini returned empty response")
  return text
}

// ============================================================================
// CACHE STRATEGY
// ============================================================================

async function processCacheStrategy(
  supabase: ReturnType<typeof createClient>,
  files: FileResult[],
  systemPrompt: string,
  geminiModel: string,
  cacheTtlMinutes: number
): Promise<GeminiCacheInfo[]> {
  const results: GeminiCacheInfo[] = []
  const cacheTtlSeconds = cacheTtlMinutes * 60
  
  for (const file of files) {
    const filePath = file.storage_path
    console.log(`[Cache] Traitement: ${file.original_filename}`)
    
    // Vérifier cache existant
    const { data: existingCache, error: cacheError } = await supabase
      .schema('rag')
      .from('active_caches')
      .select('google_cache_name, expires_at')
      .eq('file_path', filePath)
      .gt('expires_at', new Date().toISOString())
      .single()
    
    if (existingCache && !cacheError) {
      console.log(`[Cache] HIT pour ${file.original_filename}`)
      const ttlUpdated = await updateCacheTTL(existingCache.google_cache_name)
      
      if (ttlUpdated) {
        const newExpiry = new Date(Date.now() + cacheTtlSeconds * 1000)
        await supabase.schema('rag').from('active_caches')
          .update({ expires_at: newExpiry.toISOString() })
          .eq('file_path', filePath)
        
        results.push({ file_path: filePath, cache_name: existingCache.google_cache_name, is_new: false })
        continue
      }
      
      console.log(`[Cache] Cache expiré côté Google, recréation nécessaire`)
      await supabase.schema('rag').from('active_caches').delete().eq('file_path', filePath)
    }
    
    console.log(`[Cache] MISS pour ${file.original_filename}`)
    
    try {
      const { data: fileData, error: downloadError } = await supabase.storage
        .from(file.storage_bucket).download(filePath)
      
      if (downloadError || !fileData) {
        console.error(`[Cache] Erreur téléchargement ${filePath}:`, downloadError)
        continue
      }
      
      const fileBuffer = await fileData.arrayBuffer()
      const googleFileUri = await uploadToGoogleFiles(fileBuffer, file.original_filename, file.mime_type || 'application/pdf')
      const cacheName = await createGoogleCache(googleFileUri, file.original_filename, systemPrompt, geminiModel, cacheTtlSeconds)
      
      const expiresAt = new Date(Date.now() + cacheTtlSeconds * 1000)
      
      await supabase.schema('rag').from('active_caches').upsert({
        file_path: filePath,
        google_cache_name: cacheName,
        expires_at: expiresAt.toISOString(),
        storage_bucket: file.storage_bucket,
        original_filename: file.original_filename,
        mime_type: file.mime_type,
        file_size_bytes: file.file_size,
      })
      
      results.push({ file_path: filePath, cache_name: cacheName, is_new: true, google_file_uri: googleFileUri })
    } catch (error) {
      console.error(`[Cache] Erreur création cache pour ${file.original_filename}:`, error)
    }
  }
  
  return results
}

// ============================================================================
// CONTEXT FORMATTER (mode chunks)
// ============================================================================

function formatContext(documents: DocumentResult[], maxLength: number): string {
  if (documents.length === 0) {
    return "CONTEXTE DOCUMENTAIRE:\nAucun document pertinent trouvé dans la base documentaire.\n"
  }
  
  const sections: Record<string, DocumentResult[]> = {}
  
  for (const doc of documents) {
    const layer = doc.layer || 'unknown'
    if (!sections[layer]) sections[layer] = []
    sections[layer].push(doc)
  }
  
  let context = "CONTEXTE DOCUMENTAIRE:\n\n"
  let currentLength = context.length
  let docIndex = 1
  
  const layerOrder = ['app', 'org', 'project', 'user']
  const layerLabels: Record<string, string> = {
    app: '📚 Base de connaissances',
    org: '🏢 Documents organisation',
    project: '📁 Documents projet',
    user: '👤 Documents personnels'
  }
  
  for (const layer of layerOrder) {
    const docs = sections[layer]
    if (!docs || docs.length === 0) continue
    
    const layerHeader = `\n${layerLabels[layer] || layer}:\n`
    if (currentLength + layerHeader.length > maxLength) break
    
    context += layerHeader
    currentLength += layerHeader.length
    
    for (const doc of docs) {
      const source = doc.metadata?.filename || doc.metadata?.source || 'Document'
      const docText = `\n[${docIndex}] ${source}:\n${doc.content}\n`
      
      if (currentLength + docText.length > maxLength) break
      
      context += docText
      currentLength += docText.length
      docIndex++
    }
  }
  
  return context
}

// ============================================================================
// OPENAI CHAT (mode chunks)
// ============================================================================

async function generateWithOpenAI(
  query: string,
  context: string,
  conversationHistory: string,
  systemPrompt: string,
  temperature: number,
  maxTokens: number,
  model: string
): Promise<string> {
  console.log(`[OpenAI] Génération avec model=${model}`)
  
  let finalPrompt = systemPrompt
  
  if (conversationHistory) {
    finalPrompt = conversationHistory + finalPrompt
  }
  
  finalPrompt = finalPrompt + '\n\n' + context
  
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: "system", content: finalPrompt },
        { role: "user", content: query }
      ],
      temperature: temperature,
      max_tokens: maxTokens,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`OpenAI Chat error: ${JSON.stringify(error)}`)
  }

  const data = await response.json()
  return data.choices[0]?.message?.content || ""
}

// ============================================================================
// EXECUTE CHUNKS MODE
// ============================================================================

async function executeChunksMode(
  supabase: ReturnType<typeof createClient>,
  query: string,
  queryEmbedding: number[],
  user_id: string,
  effectiveOrgId: string | null,
  project_id: string | undefined,
  effectiveAppId: string,
  agentConfig: AgentConfig,
  systemPrompt: string,
  conversationHistory: string,
  include_app_layer: boolean,
  include_org_layer: boolean,
  include_project_layer: boolean,
  include_user_layer: boolean,
  filter_source_types: string[] | undefined,
  filter_concepts: string[] | undefined,
  isFallback: boolean = false
): Promise<{ response: string; sources: unknown[]; documentsFound: number; stats: DocumentStats }> {
  
  console.log(`[baikal-librarian] Mode CHUNKS ${isFallback ? '(FALLBACK)' : ''}`)

  const { data: documents, error: searchError } = await supabase
    .schema('rag')
    .rpc("match_documents_v10", {
      query_embedding: queryEmbedding,
      query_text: query.trim(),
      p_user_id: user_id,
      p_org_id: effectiveOrgId || null,
      p_project_id: project_id || null,
      p_app_id: effectiveAppId,
      match_count: agentConfig.match_count,
      similarity_threshold: agentConfig.match_threshold,
      include_app_layer,
      include_org_layer,
      include_project_layer,
      include_user_layer,
      filter_source_types: filter_source_types || null,
      filter_concepts: filter_concepts || null,
      enable_concept_expansion: agentConfig.enable_concept_expansion,
    })

  if (searchError) throw new Error(`Search error: ${searchError.message}`)

  const matchedDocs: DocumentResult[] = (documents || []).map((d: any) => ({
    id: d.out_id,
    content: d.out_content,
    similarity: d.out_similarity,
    metadata: d.out_metadata,
    layer: d.out_layer,
    source_type: d.out_source_type,
    matched_concepts: d.out_matched_concepts || [],
    rank_score: d.out_rank_score,
    match_source: d.out_match_source,
    source_file_id: d.out_source_file_id,
  }))

  // v8.11.0: Calcul des stats
  const stats = calculateDocumentStats(matchedDocs)
  console.log(`[baikal-librarian] ${stats.chunks_found} chunks de ${stats.unique_docs} doc(s), ${stats.total_pages} pages total`)

  const context = formatContext(matchedDocs, agentConfig.max_context_length)

  const response = await generateWithOpenAI(
    query, context, conversationHistory, systemPrompt,
    agentConfig.temperature, agentConfig.max_tokens, agentConfig.llm_model
  )

  const sources = matchedDocs.slice(0, 5).map(d => ({
    id: d.id,
    type: 'document',
    source_file_id: d.source_file_id || null,
    chunk_id: d.id,
    document_name: d.metadata?.filename || d.metadata?.source || 'Document',
    name: d.metadata?.filename || d.metadata?.source || 'Document',
    score: d.similarity,
    layer: d.layer,
    content_preview: d.content?.substring(0, 200) || null,
  }))

  return { response, sources, documentsFound: stats.unique_docs, stats }
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
      query, user_id, org_id, project_id, app_id,
      conversation_id: inputConversationId,
      project_context, intent,
      generation_mode = 'chunks',
      include_app_layer = DEFAULT_CONFIG.include_app_layer,
      include_org_layer = DEFAULT_CONFIG.include_org_layer,
      include_project_layer = DEFAULT_CONFIG.include_project_layer,
      include_user_layer = DEFAULT_CONFIG.include_user_layer,
      filter_source_types, filter_concepts,
    } = body

    if (!query?.trim()) return errorResponse("Query is required")
    if (!user_id) return errorResponse("user_id is required")

    console.log(`[baikal-librarian] v8.11.0 - Agent RAG Hybride Intelligent`)
    console.log(`[baikal-librarian] Query: "${query.substring(0, 50)}..."`)
    console.log(`[baikal-librarian] Intent: ${intent || 'non spécifié'}, Mode suggéré: ${generation_mode}`)

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // ========================================
    // 1. PROFIL UTILISATEUR
    // ========================================
    const { data: profile } = await supabase
      .schema('core')
      .from('profiles')
      .select('org_id, app_id, app_role')
      .eq('id', user_id)
      .single()

    const effectiveOrgId = org_id || profile?.org_id
    const effectiveAppId = app_id || profile?.app_id || 'arpet'

    // ========================================
    // 2. CONFIG AGENT
    // ========================================
    const { config: agentConfig, systemPrompt: rawSystemPrompt, geminiSystemPrompt: rawGeminiSystemPrompt } = 
      await getAgentConfig(supabase, effectiveAppId, effectiveOrgId)

    const systemPrompt = injectProjectContext(rawSystemPrompt, project_context || '')
    const geminiSystemPrompt = injectProjectContext(rawGeminiSystemPrompt, project_context || '')

    // ========================================
    // 3. CONVERSATION
    // ========================================
    let conversationId = inputConversationId
    let conversationHistory = ''
    
    try {
      if (!conversationId) {
        conversationId = await findOrCreateConversation(supabase, user_id, effectiveOrgId || null, project_id || null, effectiveAppId)
      }
      const conversationContext = await getConversationContext(supabase, conversationId)
      conversationHistory = formatConversationHistory(conversationContext)
      await addMessage(supabase, conversationId, 'user', query)
    } catch (convError) {
      console.error('[baikal-librarian] Erreur conversation:', convError)
    }

    // ========================================
    // 4. EMBEDDING
    // ========================================
    console.log("[baikal-librarian] Génération embedding...")
    const queryEmbedding = await generateEmbedding(query)

    // ========================================
    // 5. RECHERCHE INITIALE (pour calculer les stats)
    // ========================================
    const { data: initialDocs } = await supabase
      .schema('rag')
      .rpc("match_documents_v10", {
        query_embedding: queryEmbedding,
        query_text: query.trim(),
        p_user_id: user_id,
        p_org_id: effectiveOrgId || null,
        p_project_id: project_id || null,
        p_app_id: effectiveAppId,
        match_count: agentConfig.match_count,
        similarity_threshold: agentConfig.match_threshold,
        include_app_layer, include_org_layer, include_project_layer, include_user_layer,
        filter_source_types: filter_source_types || null,
        filter_concepts: filter_concepts || null,
        enable_concept_expansion: agentConfig.enable_concept_expansion,
      })

    const matchedDocs: DocumentResult[] = (initialDocs || []).map((d: any) => ({
      id: d.out_id,
      content: d.out_content,
      similarity: d.out_similarity,
      metadata: d.out_metadata,
      layer: d.out_layer,
      source_type: d.out_source_type,
      source_file_id: d.out_source_file_id,
    }))

    // v8.11.0: Calcul des stats
    const stats = calculateDocumentStats(matchedDocs)
    console.log(`[baikal-librarian] Stats: ${stats.chunks_found} chunks, ${stats.unique_docs} docs, ${stats.total_pages} pages`)

    // ========================================
    // 6. DÉCISION DU MODE (avec override intelligent)
    // ========================================
    let effectiveMode = generation_mode
    let overrideReason: string | null = null

    if (generation_mode === 'gemini') {
      // Vérifier si on peut vraiment utiliser Gemini
      if (stats.unique_docs === 0) {
        effectiveMode = 'chunks'
        overrideReason = 'Aucun document avec source_file_id trouvé'
        console.log(`[baikal-librarian] Override: ${overrideReason} → CHUNKS`)
      } else if (stats.total_pages > agentConfig.gemini_max_pages) {
        effectiveMode = 'chunks'
        overrideReason = `Total pages (${stats.total_pages}) > limite Gemini (${agentConfig.gemini_max_pages})`
        console.log(`[baikal-librarian] Override: ${overrideReason} → CHUNKS`)
      } else {
        console.log(`[baikal-librarian] Gemini OK: ${stats.total_pages} pages ≤ ${agentConfig.gemini_max_pages}`)
      }
    }

    // ========================================
    // 7. EXÉCUTION
    // ========================================
    let finalResponse = ''
    let sources: unknown[] = []
    let documentsFound = 0
    let cacheStatus: 'hit' | 'miss' | 'partial' | null = null
    let metrics: Record<string, unknown> = {}

    if (effectiveMode === 'gemini') {
      console.log("[baikal-librarian] Mode GEMINI")

      if (!GEMINI_API_KEY) {
        console.warn("[baikal-librarian] GEMINI_API_KEY non configurée, fallback vers chunks")
        const result = await executeChunksMode(
          supabase, query, queryEmbedding, user_id, effectiveOrgId, project_id,
          effectiveAppId, agentConfig, systemPrompt, conversationHistory,
          include_app_layer, include_org_layer, include_project_layer, include_user_layer,
          filter_source_types, filter_concepts, true
        )
        finalResponse = result.response
        sources = result.sources
        documentsFound = result.stats.unique_docs
        metrics = { mode: 'chunks', fallback: true, reason: 'GEMINI_API_KEY manquante', ...result.stats }
      } else {
        const { data: filesWithSource } = await supabase
          .schema('rag')
          .rpc('match_files_v1', {
            query_embedding: queryEmbedding,
            match_threshold: agentConfig.match_threshold,
            match_count: agentConfig.gemini_max_files,
            p_app_id: effectiveAppId,
            p_org_id: effectiveOrgId || null,
            p_project_id: project_id || null,
            p_user_id: user_id,
            include_app_layer, include_org_layer, include_project_layer, include_user_layer,
          })

        const files: FileResult[] = (filesWithSource || []).map((f: any) => ({
          file_id: f.out_file_id,
          storage_path: f.out_storage_path,
          storage_bucket: f.out_storage_bucket,
          original_filename: f.out_original_filename,
          mime_type: f.out_mime_type,
          file_size: f.out_file_size,
          max_similarity: f.out_max_similarity,
          avg_similarity: f.out_avg_similarity,
          chunk_count: f.out_chunk_count,
          layers: f.out_layers,
          sample_content: f.out_sample_content,
        }))

        console.log(`[baikal-librarian] ${files.length} fichier(s) trouvé(s) pour Gemini`)

        if (files.length === 0) {
          console.log("[baikal-librarian] Aucun fichier source, fallback vers chunks")
          const result = await executeChunksMode(
            supabase, query, queryEmbedding, user_id, effectiveOrgId, project_id,
            effectiveAppId, agentConfig, systemPrompt, conversationHistory,
            include_app_layer, include_org_layer, include_project_layer, include_user_layer,
            filter_source_types, filter_concepts, true
          )
          finalResponse = result.response
          sources = result.sources
          documentsFound = result.stats.unique_docs
          metrics = { mode: 'chunks', fallback: true, reason: 'Aucun fichier source', ...result.stats }
        } else {
          let geminiSuccess = false
          let validCaches: GeminiCacheInfo[] = []

          try {
            const cacheInfos = await processCacheStrategy(
              supabase, files, geminiSystemPrompt, agentConfig.gemini_model, agentConfig.cache_ttl_minutes
            )
            validCaches = cacheInfos.filter(c => c.cache_name)

            if (validCaches.length > 0) {
              console.log(`[baikal-librarian] ${validCaches.length} cache(s) prêt(s)`)
              finalResponse = await generateWithGemini(
                query, validCaches.map(c => c.cache_name!), conversationHistory,
                agentConfig.temperature, agentConfig.max_tokens
              )
              geminiSuccess = true
            } else {
              console.warn("[baikal-librarian] Aucun cache valide créé")
            }
          } catch (geminiError) {
            console.error("[baikal-librarian] Erreur Gemini:", geminiError)
          }

          if (!geminiSuccess) {
            console.log("[baikal-librarian] Échec Gemini, fallback vers chunks")
            const result = await executeChunksMode(
              supabase, query, queryEmbedding, user_id, effectiveOrgId, project_id,
              effectiveAppId, agentConfig, systemPrompt, conversationHistory,
              include_app_layer, include_org_layer, include_project_layer, include_user_layer,
              filter_source_types, filter_concepts, true
            )
            finalResponse = result.response
            sources = result.sources
            documentsFound = result.stats.unique_docs
            metrics = { mode: 'chunks', fallback: true, reason: 'Échec Gemini', ...result.stats }
          } else {
            const cacheHits = validCaches.filter(c => !c.is_new).length
            const cacheMisses = validCaches.filter(c => c.is_new).length
            
            cacheStatus = cacheHits > 0 && cacheMisses === 0 ? 'hit' 
              : cacheHits === 0 && cacheMisses > 0 ? 'miss' : 'partial'

            documentsFound = files.length
            sources = files.map(f => ({
              id: f.file_id,
              type: 'document',
              source_file_id: f.file_id,
              document_name: f.original_filename,
              name: f.original_filename,
              score: f.max_similarity,
              layer: f.layers?.[0] || 'app',
              content_preview: f.sample_content?.substring(0, 200) || null,
            }))

            metrics = {
              mode: 'gemini',
              fallback: false,
              cache_hits: cacheHits,
              cache_misses: cacheMisses,
              files_found: files.length,
              gemini_model: agentConfig.gemini_model,
              ...stats
            }
          }
        }
      }
    } else {
      // MODE CHUNKS
      const result = await executeChunksMode(
        supabase, query, queryEmbedding, user_id, effectiveOrgId, project_id,
        effectiveAppId, agentConfig, systemPrompt, conversationHistory,
        include_app_layer, include_org_layer, include_project_layer, include_user_layer,
        filter_source_types, filter_concepts, false
      )
      finalResponse = result.response
      sources = result.sources
      documentsFound = result.stats.unique_docs
      
      metrics = {
        mode: 'chunks',
        fallback: false,
        ...result.stats
      }
    }

    // ========================================
    // 8. SAUVEGARDE RÉPONSE
    // ========================================
    const processingTime = Date.now() - startTime
    
    if (conversationId) {
      try {
        await addMessage(supabase, conversationId, 'assistant', finalResponse, sources, effectiveMode, processingTime)
      } catch {}
    }

    // ========================================
    // 9. RÉPONSE
    // ========================================
    return successResponse({
      response: finalResponse,
      conversation_id: conversationId,
      generation_mode: effectiveMode,
      suggested_mode: generation_mode,
      intent: intent || null,
      override_applied: overrideReason !== null,
      override_reason: overrideReason,
      cache_status: cacheStatus,
      documents_found: documentsFound,
      chunks_found: stats.chunks_found,
      total_pages: stats.total_pages,
      processing_time_ms: processingTime,
      metrics,
      sources,
    })

  } catch (error) {
    console.error("[baikal-librarian] Erreur:", error)
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500)
  }
})
