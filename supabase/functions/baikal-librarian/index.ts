// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  BAIKAL-LIBRARIAN v8.0 - Agent RAG avec Gemini Context Caching              ║
// ║  Edge Function Supabase pour ARPET                                          ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  Nouveautés v8.0:                                                            ║
// ║  - Mode 'gemini' : Retrieve then Read avec Context Caching                   ║
// ║  - Mode 'chunks' : RAG classique GPT-4o (comportement existant)              ║
// ║  - Workflow Hybrid : Gemini pour docs avec fichier, chunks pour les autres   ║
// ║  - Table rag.active_caches pour suivi des caches Google                      ║
// ║  - Fallback automatique si erreur Gemini                                     ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  Historique:                                                                 ║
// ║  - v7.0: match_documents_v10, Context Formatter, GraphRAG                    ║
// ║  - v6.0: GraphRAG expansion via concepts                                     ║
// ║  - v5.0: Migration schémas (app_id, core.profiles)                           ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { 
  GoogleGenerativeAI,
  GoogleAICacheManager
} from "npm:@google/generative-ai@0.21.0"

// ============================================================================
// CONFIGURATION
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// API Keys
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

// Configuration par défaut
const DEFAULT_CONFIG = {
  match_threshold: 0.3,
  match_count: 15,
  max_context_length: 12000,
  embedding_model: "text-embedding-3-small",
  llm_model: "gpt-4o-mini",
  temperature: 0.3,
  max_tokens: 2048,
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
  gemini_model: "gemini-1.5-flash-001",
  gemini_max_files: 3,
  cache_ttl_seconds: 3600, // 1 heure
}

const FALLBACK_SYSTEM_PROMPT = `Tu es un assistant expert BTP et marchés publics.

{{context}}

RÈGLES:
- Base tes réponses sur le contexte documentaire fourni
- Cite tes sources avec les numéros [1], [2], etc.
- Si l'information n'est pas dans le contexte, dis-le clairement
- Réponds en français de manière professionnelle`

const GEMINI_SYSTEM_PROMPT = `Tu es l'assistant expert ARPET, spécialisé dans le BTP et les marchés publics.

CONTEXTE:
Tu as accès aux documents complets fournis en contexte. Ces documents contiennent des informations détaillées que tu dois utiliser pour répondre.

RÈGLES STRICTES:
1. Base tes réponses UNIQUEMENT sur les documents fournis en contexte
2. Cite précisément tes sources (nom du document, section si pertinent)
3. Si l'information n'est pas dans les documents, dis-le clairement
4. Réponds en français de manière professionnelle et structurée
5. Si plusieurs documents traitent du sujet, synthétise les informations

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
  // Configuration optionnelle
  match_threshold?: number
  match_count?: number
  temperature?: number
  max_tokens?: number
  // Filtres
  include_app_layer?: boolean
  include_org_layer?: boolean
  include_project_layer?: boolean
  include_user_layer?: boolean
  filter_source_types?: string[]
  filter_concepts?: string[]
  // NOUVEAU v8.0 : Mode de génération
  generation_mode?: 'chunks' | 'gemini'
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

interface CacheEntry {
  file_path: string
  google_cache_name: string
  expires_at: string
}

interface GeminiCacheInfo {
  file_path: string
  cache_name: string | null
  is_new: boolean
  google_file_uri?: string
}

// ============================================================================
// HELPERS
// ============================================================================

function errorResponse(message: string, status: number = 400) {
  return new Response(
    JSON.stringify({ error: message }),
    { 
      status, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    }
  )
}

function successResponse(data: unknown) {
  return new Response(
    JSON.stringify(data),
    { 
      status: 200, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    }
  )
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
// GOOGLE AI SDK - Instances globales
// ============================================================================

let cacheManager: GoogleAICacheManager | null = null
let genAI: GoogleGenerativeAI | null = null

function initGoogleAI() {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not configured")
  }
  
  if (!cacheManager) {
    cacheManager = new GoogleAICacheManager(GEMINI_API_KEY)
  }
  if (!genAI) {
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
  }
  
  return { cacheManager, genAI }
}

// ============================================================================
// GOOGLE AI - FILE UPLOAD (fetch car SDK nécessite filesystem)
// ============================================================================

/**
 * Upload un fichier vers Google AI File Manager via API REST
 * (Le SDK GoogleAIFileManager nécessite un chemin fichier, pas un ArrayBuffer)
 */
async function uploadToGoogleFiles(
  fileBuffer: ArrayBuffer, 
  filename: string, 
  mimeType: string
): Promise<string> {
  console.log(`[Gemini] Upload fichier: ${filename} (${mimeType})`)
  
  // Étape 1: Initier l'upload resumable
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
      body: JSON.stringify({
        file: { display_name: filename }
      }),
    }
  )

  if (!initResponse.ok) {
    const error = await initResponse.text()
    throw new Error(`Google Files init error: ${error}`)
  }

  const uploadUrl = initResponse.headers.get("X-Goog-Upload-URL")
  if (!uploadUrl) {
    throw new Error("Missing upload URL from Google")
  }

  // Étape 2: Upload le contenu
  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "X-Goog-Upload-Command": "upload, finalize",
      "X-Goog-Upload-Offset": "0",
      "Content-Type": mimeType,
    },
    body: fileBuffer,
  })

  if (!uploadResponse.ok) {
    const error = await uploadResponse.text()
    throw new Error(`Google Files upload error: ${error}`)
  }

  const fileInfo = await uploadResponse.json()
  console.log(`[Gemini] Fichier uploadé: ${fileInfo.file?.uri || fileInfo.uri}`)
  
  return fileInfo.file?.uri || fileInfo.uri
}

// ============================================================================
// GOOGLE AI - CACHE MANAGER (SDK)
// ============================================================================

/**
 * Créer un cache Google Context Caching via SDK
 */
async function createGoogleCache(
  fileUri: string, 
  filename: string,
  ttlSeconds: number = 3600
): Promise<string> {
  console.log(`[Gemini] Création cache pour: ${filename}`)
  
  const { cacheManager } = initGoogleAI()
  
  const cache = await cacheManager!.create({
    model: `models/${DEFAULT_CONFIG.gemini_model}`,
    displayName: filename,
    contents: [
      {
        role: "user",
        parts: [
          {
            fileData: {
              fileUri: fileUri,
              mimeType: "application/pdf"
            }
          }
        ]
      }
    ],
    ttlSeconds: ttlSeconds
  })
  
  console.log(`[Gemini] Cache créé: ${cache.name}`)
  
  return cache.name! // Format: "cachedContents/xxx"
}

/**
 * Mettre à jour le TTL d'un cache existant via SDK
 */
async function updateCacheTTL(cacheName: string, ttlSeconds: number = 3600): Promise<boolean> {
  console.log(`[Gemini] Update TTL cache: ${cacheName}`)
  
  try {
    const { cacheManager } = initGoogleAI()
    
    await cacheManager!.update(cacheName, {
      ttlSeconds: ttlSeconds
    })
    
    console.log(`[Gemini] TTL mis à jour pour ${cacheName}`)
    return true
  } catch (error) {
    // Cache n'existe plus, retourner false pour déclencher recréation
    console.warn(`[Gemini] Cache ${cacheName} introuvable ou expiré:`, error)
    return false
  }
}

// ============================================================================
// GOOGLE AI - GENERATION (SDK)
// ============================================================================

/**
 * Générer une réponse avec Gemini en utilisant les caches via SDK
 */
async function generateWithGemini(
  query: string,
  cacheNames: string[],
  systemPrompt: string,
  temperature: number = 0.3,
  maxTokens: number = 2048
): Promise<string> {
  console.log(`[Gemini] Génération avec ${cacheNames.length} cache(s)`)
  
  const { cacheManager, genAI } = initGoogleAI()
  
  // Récupérer le cache
  const cacheName = cacheNames[0]
  const cache = await cacheManager!.get(cacheName)
  
  // Créer le modèle avec le cache
  const model = genAI!.getGenerativeModelFromCachedContent(cache, {
    generationConfig: {
      temperature: temperature,
      maxOutputTokens: maxTokens,
    }
  })
  
  // Générer la réponse
  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [{ text: query }]
      }
    ],
    systemInstruction: systemPrompt
  })
  
  const response = result.response
  const text = response.text()
  
  if (!text) {
    throw new Error("Gemini returned empty response")
  }
  
  return text
}

// ============================================================================
// WORKFLOW GEMINI - Cache Strategy
// ============================================================================

async function processCacheStrategy(
  supabase: ReturnType<typeof createClient>,
  files: FileResult[]
): Promise<GeminiCacheInfo[]> {
  const results: GeminiCacheInfo[] = []
  
  for (const file of files) {
    const filePath = file.storage_path
    
    console.log(`[Cache] Traitement: ${file.original_filename}`)
    
    // Vérifier si un cache valide existe
    const { data: existingCache, error: cacheError } = await supabase
      .schema('rag')
      .from('active_caches')
      .select('google_cache_name, expires_at')
      .eq('file_path', filePath)
      .gt('expires_at', new Date().toISOString())
      .single()
    
    if (existingCache && !cacheError) {
      // CACHE HIT - Mettre à jour le TTL
      console.log(`[Cache] HIT pour ${file.original_filename}`)
      
      const ttlUpdated = await updateCacheTTL(
        existingCache.google_cache_name, 
        DEFAULT_CONFIG.cache_ttl_seconds
      )
      
      if (ttlUpdated) {
        // Mettre à jour expires_at dans notre table
        const newExpiry = new Date(Date.now() + DEFAULT_CONFIG.cache_ttl_seconds * 1000)
        await supabase
          .schema('rag')
          .from('active_caches')
          .update({ expires_at: newExpiry.toISOString() })
          .eq('file_path', filePath)
        
        results.push({
          file_path: filePath,
          cache_name: existingCache.google_cache_name,
          is_new: false
        })
        continue
      }
      
      // TTL update failed → cache expiré côté Google, on doit recréer
      console.log(`[Cache] Cache expiré côté Google, recréation nécessaire`)
      await supabase
        .schema('rag')
        .from('active_caches')
        .delete()
        .eq('file_path', filePath)
    }
    
    // CACHE MISS - Télécharger et créer le cache
    console.log(`[Cache] MISS pour ${file.original_filename}`)
    
    try {
      // Télécharger depuis Supabase Storage
      const { data: fileData, error: downloadError } = await supabase
        .storage
        .from(file.storage_bucket)
        .download(filePath)
      
      if (downloadError || !fileData) {
        console.error(`[Cache] Erreur téléchargement ${filePath}:`, downloadError)
        continue
      }
      
      const fileBuffer = await fileData.arrayBuffer()
      
      // Upload vers Google Files
      const googleFileUri = await uploadToGoogleFiles(
        fileBuffer,
        file.original_filename,
        file.mime_type || 'application/pdf'
      )
      
      // Créer le cache
      const cacheName = await createGoogleCache(
        googleFileUri,
        file.original_filename,
        DEFAULT_CONFIG.cache_ttl_seconds
      )
      
      // Sauvegarder dans notre table
      const expiresAt = new Date(Date.now() + DEFAULT_CONFIG.cache_ttl_seconds * 1000)
      
      await supabase
        .schema('rag')
        .from('active_caches')
        .upsert({
          file_path: filePath,
          google_cache_name: cacheName,
          expires_at: expiresAt.toISOString(),
          storage_bucket: file.storage_bucket,
          original_filename: file.original_filename,
          mime_type: file.mime_type,
          file_size_bytes: file.file_size,
        })
      
      results.push({
        file_path: filePath,
        cache_name: cacheName,
        is_new: true,
        google_file_uri: googleFileUri
      })
      
    } catch (error) {
      console.error(`[Cache] Erreur création cache pour ${file.original_filename}:`, error)
      // Continuer avec les autres fichiers
    }
  }
  
  return results
}

// ============================================================================
// CONTEXT FORMATTER (mode chunks)
// ============================================================================

function formatContext(documents: DocumentResult[], maxLength: number): string {
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
  systemPrompt: string,
  temperature: number,
  maxTokens: number,
  model: string
): Promise<string> {
  const finalPrompt = systemPrompt.replace('{{context}}', context)
  
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
// EXECUTE CHUNKS MODE - Fonction réutilisable pour RAG classique
// ============================================================================

async function executeChunksMode(
  supabase: ReturnType<typeof createClient>,
  query: string,
  queryEmbedding: number[],
  user_id: string,
  effectiveOrgId: string | null,
  project_id: string | undefined,
  effectiveAppId: string,
  match_threshold: number,
  match_count: number,
  temperature: number,
  max_tokens: number,
  include_app_layer: boolean,
  include_org_layer: boolean,
  include_project_layer: boolean,
  include_user_layer: boolean,
  filter_source_types: string[] | undefined,
  filter_concepts: string[] | undefined,
  agentConfig: typeof DEFAULT_CONFIG,
  systemPrompt: string,
  isFallback: boolean = false
): Promise<Response> {
  
  console.log(`[baikal-librarian] Mode CHUNKS ${isFallback ? '(FALLBACK)' : '(classique)'}`)

  // Recherche vectorielle avec match_documents_v10
  const { data: documents, error: searchError } = await supabase
    .schema('rag')
    .rpc("match_documents_v10", {
      query_embedding: queryEmbedding,
      query_text: query.trim(),
      p_user_id: user_id,
      p_org_id: effectiveOrgId || null,
      p_project_id: project_id || null,
      p_app_id: effectiveAppId,
      match_count: match_count,
      similarity_threshold: match_threshold,
      include_app_layer: include_app_layer,
      include_org_layer: include_org_layer,
      include_project_layer: include_project_layer,
      include_user_layer: include_user_layer,
      filter_source_types: filter_source_types || null,
      filter_concepts: filter_concepts || null,
      enable_concept_expansion: agentConfig.enable_concept_expansion,
    })

  if (searchError) {
    console.error("[baikal-librarian] Erreur match_documents_v10:", searchError)
    return errorResponse(`Search error: ${searchError.message}`, 500)
  }

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
  }))

  console.log(`[baikal-librarian] ${matchedDocs.length} document(s) trouvé(s)`)

  if (matchedDocs.length === 0) {
    return errorResponse("Aucun document pertinent trouvé", 404)
  }

  // Formater le contexte
  const context = formatContext(matchedDocs, agentConfig.max_context_length || DEFAULT_CONFIG.max_context_length)

  // Générer la réponse avec OpenAI
  const response = await generateWithOpenAI(
    query,
    context,
    systemPrompt,
    temperature,
    max_tokens,
    agentConfig.llm_model || DEFAULT_CONFIG.llm_model
  )

  // Métriques
  const layerCounts = {
    app: matchedDocs.filter(d => d.layer === 'app').length,
    org: matchedDocs.filter(d => d.layer === 'org').length,
    project: matchedDocs.filter(d => d.layer === 'project').length,
    user: matchedDocs.filter(d => d.layer === 'user').length,
  }

  return successResponse({
    response: response,
    metrics: {
      mode: 'chunks',
      fallback: isFallback,
      documents_found: matchedDocs.length,
      layers: layerCounts,
    },
    sources: matchedDocs.slice(0, 5).map(d => ({
      id: d.id,
      similarity: d.similarity,
      layer: d.layer,
      source: d.metadata?.filename || d.metadata?.source,
    }))
  })
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    // Parse request
    const body: RequestBody = await req.json()
    const {
      query,
      user_id,
      org_id,
      project_id,
      app_id,
      agent_id,
      generation_mode = 'chunks', // Default: comportement existant
      match_threshold = DEFAULT_CONFIG.match_threshold,
      match_count = DEFAULT_CONFIG.match_count,
      temperature = DEFAULT_CONFIG.temperature,
      max_tokens = DEFAULT_CONFIG.max_tokens,
      include_app_layer = DEFAULT_CONFIG.include_app_layer,
      include_org_layer = DEFAULT_CONFIG.include_org_layer,
      include_project_layer = DEFAULT_CONFIG.include_project_layer,
      include_user_layer = DEFAULT_CONFIG.include_user_layer,
      filter_source_types,
      filter_concepts,
    } = body

    // Validation
    if (!query?.trim()) {
      return errorResponse("Query is required")
    }
    if (!user_id) {
      return errorResponse("user_id is required")
    }

    console.log(`[baikal-librarian] Mode: ${generation_mode}, Query: "${query.substring(0, 50)}..."`)

    // Init Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // ========================================
    // 1. RÉCUPÉRER PROFIL & CONFIG AGENT
    // ========================================
    const { data: profile } = await supabase
      .schema('core')
      .from('profiles')
      .select('org_id, app_id, app_role')
      .eq('id', user_id)
      .single()

    const effectiveOrgId = org_id || profile?.org_id
    const effectiveAppId = app_id || profile?.app_id || 'arpet'

    // Charger config agent si agent_id fourni
    let agentConfig = { ...DEFAULT_CONFIG }
    let systemPrompt = FALLBACK_SYSTEM_PROMPT
    let geminiSystemPrompt = GEMINI_SYSTEM_PROMPT  // Prompt Gemini par défaut

    if (agent_id) {
      const { data: agent } = await supabase
        .schema('config')
        .from('agent_prompts')
        .select('*')
        .eq('id', agent_id)
        .single()

      if (agent) {
        agentConfig = { ...agentConfig, ...agent.config }
        systemPrompt = agent.system_prompt || FALLBACK_SYSTEM_PROMPT
        // Utiliser le prompt Gemini de l'agent si disponible
        geminiSystemPrompt = agent.gemini_system_prompt || GEMINI_SYSTEM_PROMPT
      }
    }

    // ========================================
    // 2. GÉNÉRER EMBEDDING
    // ========================================
    console.log("[baikal-librarian] Génération embedding...")
    const queryEmbedding = await generateEmbedding(query)

    // ========================================
    // 3. BRANCHEMENT SELON LE MODE
    // ========================================

    if (generation_mode === 'gemini') {
      // ════════════════════════════════════════
      // MODE GEMINI - Retrieve then Read
      // ════════════════════════════════════════
      
      console.log("[baikal-librarian] Mode GEMINI activé")

      // Vérifier que la clé Google est configurée
      if (!GEMINI_API_KEY) {
        console.warn("[baikal-librarian] GEMINI_API_KEY non configurée, fallback vers chunks")
        // Fallback vers mode chunks
        return await executeChunksMode(
          supabase, query, queryEmbedding, user_id, effectiveOrgId, project_id,
          effectiveAppId, match_threshold, match_count, temperature, max_tokens,
          include_app_layer, include_org_layer, include_project_layer, include_user_layer,
          filter_source_types, filter_concepts, agentConfig, systemPrompt,
          true // isFallback
        )
      }

      // 3a. Rechercher les fichiers avec source_file_id
      const { data: filesWithSource, error: filesError } = await supabase
        .schema('rag')
        .rpc('match_files_v1', {
          query_embedding: queryEmbedding,
          match_threshold: match_threshold,
          match_count: DEFAULT_CONFIG.gemini_max_files,
          p_app_id: effectiveAppId,
          p_org_id: effectiveOrgId || null,
          p_project_id: project_id || null,
          p_user_id: user_id,
          include_app_layer: include_app_layer,
          include_org_layer: include_org_layer,
          include_project_layer: include_project_layer,
          include_user_layer: include_user_layer,
        })

      if (filesError) {
        console.error("[baikal-librarian] Erreur match_files_v1:", filesError)
        // Fallback vers mode chunks
        return await executeChunksMode(
          supabase, query, queryEmbedding, user_id, effectiveOrgId, project_id,
          effectiveAppId, match_threshold, match_count, temperature, max_tokens,
          include_app_layer, include_org_layer, include_project_layer, include_user_layer,
          filter_source_types, filter_concepts, agentConfig, systemPrompt,
          true // isFallback
        )
      }

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

      console.log(`[baikal-librarian] ${files.length} fichier(s) trouvé(s) avec source`)

      // 3b. Si aucun fichier avec source, fallback vers chunks
      if (files.length === 0) {
        console.log("[baikal-librarian] Aucun fichier avec source, fallback vers chunks")
        return await executeChunksMode(
          supabase, query, queryEmbedding, user_id, effectiveOrgId, project_id,
          effectiveAppId, match_threshold, match_count, temperature, max_tokens,
          include_app_layer, include_org_layer, include_project_layer, include_user_layer,
          filter_source_types, filter_concepts, agentConfig, systemPrompt,
          true // isFallback
        )
      }

      // 3c. Traiter les fichiers avec Google Cache
      let geminiResponse = ""
      let geminiSuccess = false

      try {
        const cacheInfos = await processCacheStrategy(supabase, files)
        const validCaches = cacheInfos.filter(c => c.cache_name)

        if (validCaches.length > 0) {
          console.log(`[baikal-librarian] ${validCaches.length} cache(s) prêt(s)`)
          
          // Générer avec Gemini
          geminiResponse = await generateWithGemini(
            query,
            validCaches.map(c => c.cache_name!),
            geminiSystemPrompt,  // Utilise le prompt personnalisé de l'agent
            temperature,
            max_tokens
          )
          geminiSuccess = true
        } else {
          console.warn("[baikal-librarian] Aucun cache valide créé")
        }
      } catch (geminiError) {
        console.error("[baikal-librarian] Erreur Gemini:", geminiError)
        // geminiSuccess reste false, on va fallback
      }

      // 3d. Si Gemini a échoué, fallback vers match_documents_v10
      if (!geminiSuccess) {
        console.log("[baikal-librarian] Échec Gemini, fallback vers match_documents_v10")
        return await executeChunksMode(
          supabase, query, queryEmbedding, user_id, effectiveOrgId, project_id,
          effectiveAppId, match_threshold, match_count, temperature, max_tokens,
          include_app_layer, include_org_layer, include_project_layer, include_user_layer,
          filter_source_types, filter_concepts, agentConfig, systemPrompt,
          true // isFallback
        )
      }

      // 3e. Succès Gemini - Rechercher aussi les chunks orphelins pour enrichir
      const { data: chunksWithoutSource } = await supabase
        .schema('rag')
        .rpc('match_documents_orphans_v1', {
          query_embedding: queryEmbedding,
          match_threshold: match_threshold,
          match_count: 5,
          p_app_id: effectiveAppId,
          p_org_id: effectiveOrgId || null,
          p_project_id: project_id || null,
          p_user_id: user_id,
          include_app_layer: include_app_layer,
          include_org_layer: include_org_layer,
          include_project_layer: include_project_layer,
          include_user_layer: include_user_layer,
        })

      const orphanChunks: DocumentResult[] = (chunksWithoutSource || []).map((d: any) => ({
        id: d.out_id,
        content: d.out_content,
        similarity: d.out_similarity,
        metadata: d.out_metadata,
        layer: d.out_layer,
        source_type: d.out_source_type,
      }))

      // 3f. Mode hybrid: combiner Gemini + chunks orphelins si pertinents
      let finalResponse = geminiResponse
      if (orphanChunks.length > 2) {
        finalResponse += `\n\n---\n**Sources complémentaires (base documentaire):**\n`
        for (let i = 0; i < Math.min(3, orphanChunks.length); i++) {
          const chunk = orphanChunks[i]
          const source = chunk.metadata?.filename || chunk.metadata?.source || 'Document'
          finalResponse += `- ${source}: ${chunk.content.substring(0, 200)}...\n`
        }
      }

      // Métriques
      const metrics = {
        mode: 'gemini',
        fallback: false,
        files_found: files.length,
        orphan_chunks: orphanChunks.length,
        files: files.map(f => ({
          filename: f.original_filename,
          similarity: f.max_similarity,
          chunks: f.chunk_count
        }))
      }

      return successResponse({
        response: finalResponse,
        metrics: metrics,
      })

    } else {
      // ════════════════════════════════════════
      // MODE CHUNKS - RAG Classique (existant)
      // ════════════════════════════════════════
      
      return await executeChunksMode(
        supabase, query, queryEmbedding, user_id, effectiveOrgId, project_id,
        effectiveAppId, match_threshold, match_count, temperature, max_tokens,
        include_app_layer, include_org_layer, include_project_layer, include_user_layer,
        filter_source_types, filter_concepts, agentConfig, systemPrompt,
        false // pas un fallback
      )
    }

  } catch (error) {
    console.error("[baikal-librarian] Erreur:", error)
    return errorResponse(
      error instanceof Error ? error.message : "Internal server error",
      500
    )
  }
})
