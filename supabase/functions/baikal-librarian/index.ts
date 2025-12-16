// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  BAIKAL-LIBRARIAN v7.0 - Agent RAG avec GraphRAG Multi-Layer                ║
// ║  Edge Function Supabase pour ARPET                                          ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  Nouveautés v7.0:                                                            ║
// ║  - match_documents_v8 → match_documents_v10 (multi-layer + RRF)              ║
// ║  - Context Formatter intégré (formatage structuré par layer)                 ║
// ║  - Support placeholder {{context}} dans les prompts                          ║
// ║  - Filtres par layer (app, org, project, user)                               ║
// ║  - Filtres par source_type                                                   ║
// ║  - Expansion GraphRAG via hiérarchie concepts                                ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  Historique:                                                                 ║
// ║  - v6.0: GraphRAG expansion via concepts                                     ║
// ║  - v5.0: Migration schémas (app_id, core.profiles, rag.match_documents_v7)   ║
// ║  - v4.2: Recherche Hybride Vector + Full-text                                ║
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
}

const FALLBACK_SYSTEM_PROMPT = `Tu es un assistant expert BTP et marchés publics.

{{context}}

RÈGLES:
- Base tes réponses sur le contexte documentaire fourni
- Cite tes sources avec les numéros [1], [2], etc.
- Si l'information n'est pas dans le contexte, dis-le clairement
- Réponds en français de manière professionnelle`

// ============================================================================
// TYPES
// ============================================================================

interface RequestBody {
  query: string
  user_id: string
  org_id?: string
  project_id?: string
  app_id?: string
  // Options de recherche
  match_count?: number
  match_threshold?: number
  // Filtres par layer
  include_app_layer?: boolean
  include_org_layer?: boolean
  include_project_layer?: boolean
  include_user_layer?: boolean
  // Filtres additionnels
  filter_source_types?: string[]
  filter_concepts?: string[]
  // Options de formatage
  include_metadata?: boolean
  include_concepts?: boolean
  include_scores?: boolean
}

interface DocumentResult {
  id: number
  content: string
  similarity: number
  metadata: Record<string, unknown>
  layer: string
  source_type: string | null
  matched_concepts: string[]
  rank_score: number
  match_source: string
}

interface AgentConfig {
  system_prompt: string
  temperature: number
  max_tokens: number
  model: string
  prompt_name: string
  resolution_level: string
  include_app_layer: boolean
  include_org_layer: boolean
  include_project_layer: boolean
  include_user_layer: boolean
  enable_concept_expansion: boolean
}

interface Source {
  id: string
  type: string
  name: string
  layer: string
  source_type: string | null
  score: number
  rank_score: number
  match_source: string
  matched_concepts: string[]
  content_preview: string
}

// ============================================================================
// CONTEXT FORMATTER (intégré)
// ============================================================================

const LAYER_CONFIG: Record<string, { emoji: string; title: string; desc: string }> = {
  app: {
    emoji: '📜',
    title: 'CADRE RÉGLEMENTAIRE & MÉTIER',
    desc: 'Références normatives et contractuelles',
  },
  org: {
    emoji: '🏢',
    title: 'DOCUMENTS ORGANISATION',
    desc: 'Procédures et documents internes',
  },
  project: {
    emoji: '📋',
    title: 'DOCUMENTS PROJET',
    desc: 'Documents spécifiques au chantier',
  },
  user: {
    emoji: '👤',
    title: 'NOTES PERSONNELLES',
    desc: 'Documents personnels',
  },
}

function groupByLayer(documents: DocumentResult[]): Record<string, DocumentResult[]> {
  const grouped: Record<string, DocumentResult[]> = { app: [], org: [], project: [], user: [] }
  for (const doc of documents) {
    if (grouped[doc.layer]) {
      grouped[doc.layer].push(doc)
    }
  }
  return grouped
}

function formatDocument(doc: DocumentResult, index: number, options: { includeMetadata?: boolean; includeConcepts?: boolean; includeScores?: boolean }): string {
  const lines: string[] = []
  
  // Titre
  const title = (doc.metadata?.document_title as string) || (doc.metadata?.filename as string) || 'Document'
  const section = doc.metadata?.current_section as string
  let titleLine = `[${index + 1}] ${title}`
  if (section) titleLine += ` - ${section}`
  lines.push(titleLine)
  
  // Métadonnées
  if (options.includeMetadata) {
    const metaParts: string[] = []
    if (doc.source_type) metaParts.push(`Type: ${doc.source_type}`)
    if (doc.metadata?.chunk_index !== undefined) {
      metaParts.push(`Partie ${(doc.metadata.chunk_index as number) + 1}/${doc.metadata.total_chunks}`)
    }
    if (metaParts.length > 0) lines.push(`  [${metaParts.join(' | ')}]`)
  }
  
  // Scores (debug)
  if (options.includeScores) {
    lines.push(`  [Sim: ${(doc.similarity * 100).toFixed(1)}% | RRF: ${doc.rank_score.toFixed(4)} | Via: ${doc.match_source}]`)
  }
  
  // Concepts
  if (options.includeConcepts && doc.matched_concepts?.length > 0) {
    lines.push(`  🏷️ Concepts: ${doc.matched_concepts.join(', ')}`)
  }
  
  // Contenu
  const contentLines = doc.content.split('\n').map(line => `> ${line}`).join('\n')
  lines.push(contentLines)
  
  return lines.join('\n')
}

function formatContextForLLM(
  documents: DocumentResult[],
  options: { includeMetadata?: boolean; includeConcepts?: boolean; includeScores?: boolean; maxDocsPerLayer?: number } = {}
): string {
  const opts = {
    includeMetadata: true,
    includeConcepts: false,
    includeScores: false,
    maxDocsPerLayer: 5,
    ...options,
  }
  
  if (!documents || documents.length === 0) {
    return '📭 Aucun document pertinent trouvé.'
  }
  
  const grouped = groupByLayer(documents)
  const layerOrder = ['app', 'org', 'project', 'user']
  const sections: string[] = []
  
  // Header
  sections.push(`# 📚 CONTEXTE DOCUMENTAIRE\n*${documents.length} documents pertinents trouvés*\n`)
  
  // Sections par layer
  for (const layer of layerOrder) {
    const docs = grouped[layer]
    if (!docs || docs.length === 0) continue
    
    const config = LAYER_CONFIG[layer]
    const lines: string[] = []
    
    lines.push(`## ${config.emoji} ${config.title}`)
    lines.push(`*${config.desc}*`)
    lines.push('')
    
    // Trier par rank_score décroissant
    const sorted = [...docs].sort((a, b) => b.rank_score - a.rank_score)
    const limited = sorted.slice(0, opts.maxDocsPerLayer)
    
    for (let i = 0; i < limited.length; i++) {
      lines.push(formatDocument(limited[i], i, opts))
      lines.push('')
    }
    
    sections.push(lines.join('\n'))
  }
  
  // Footer avec concepts
  if (opts.includeConcepts) {
    const allConcepts = new Set<string>()
    for (const doc of documents) {
      for (const concept of doc.matched_concepts || []) {
        allConcepts.add(concept)
      }
    }
    if (allConcepts.size > 0) {
      sections.push(`## 🏷️ CONCEPTS IDENTIFIÉS\n${Array.from(allConcepts).join(', ')}`)
    }
  }
  
  return sections.join('\n---\n\n')
}

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function errorResponse(message: string, status = 500): Response {
  console.error("[baikal-librarian] Erreur:", message)
  return jsonResponse({ error: message, status: "error", response: null, sources: [] }, status)
}

async function getUserContext(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<{ app_id: string | null; org_id: string }> {
  const { data: profile, error } = await supabase
    .schema('core')
    .from("profiles")
    .select("app_id, org_id")
    .eq("id", userId)
    .single()

  if (error || !profile) {
    console.warn("[baikal-librarian] Profil non trouvé pour user:", userId)
    return { app_id: null, org_id: "" }
  }

  return { app_id: profile.app_id, org_id: profile.org_id }
}

async function getAgentConfig(
  supabase: ReturnType<typeof createClient>,
  agentType: string,
  appId: string | null,
  orgId: string | null
): Promise<AgentConfig> {
  const { data, error } = await supabase
    .schema('config')
    .rpc("get_agent_prompt", {
      p_agent_type: agentType,
      p_app_id: appId,
      p_org_id: orgId
    })

  if (error) {
    console.error("[baikal-librarian] Erreur get_agent_prompt:", error)
  }

  const result = data?.[0]

  if (!result) {
    console.warn("[baikal-librarian] Aucun prompt trouvé, utilisation du fallback")
    return {
      system_prompt: FALLBACK_SYSTEM_PROMPT,
      temperature: DEFAULT_CONFIG.temperature,
      max_tokens: DEFAULT_CONFIG.max_tokens,
      model: DEFAULT_CONFIG.llm_model,
      prompt_name: "Fallback",
      resolution_level: "fallback",
      include_app_layer: DEFAULT_CONFIG.include_app_layer,
      include_org_layer: DEFAULT_CONFIG.include_org_layer,
      include_project_layer: DEFAULT_CONFIG.include_project_layer,
      include_user_layer: DEFAULT_CONFIG.include_user_layer,
      enable_concept_expansion: DEFAULT_CONFIG.enable_concept_expansion,
    }
  }

  console.log(`[baikal-librarian] Prompt chargé: "${result.name}" (${result.resolution_level})`)

  const params = result.parameters || {}

  return {
    system_prompt: result.system_prompt,
    temperature: params.temperature ?? DEFAULT_CONFIG.temperature,
    max_tokens: params.max_tokens ?? DEFAULT_CONFIG.max_tokens,
    model: params.model ?? DEFAULT_CONFIG.llm_model,
    prompt_name: result.name,
    resolution_level: result.resolution_level,
    include_app_layer: params.include_app_layer ?? DEFAULT_CONFIG.include_app_layer,
    include_org_layer: params.include_org_layer ?? DEFAULT_CONFIG.include_org_layer,
    include_project_layer: params.include_project_layer ?? DEFAULT_CONFIG.include_project_layer,
    include_user_layer: params.include_user_layer ?? DEFAULT_CONFIG.include_user_layer,
    enable_concept_expansion: params.enable_concept_expansion ?? DEFAULT_CONFIG.enable_concept_expansion,
  }
}

function extractSources(documents: DocumentResult[]): Source[] {
  return documents.map(doc => {
    const metadata = doc.metadata || {}
    const name = (metadata.document_title as string) 
              || (metadata.filename as string)
              || "Document"
    
    return {
      id: `doc_${doc.id}`,
      type: "document",
      name,
      layer: doc.layer,
      source_type: doc.source_type,
      score: doc.similarity,
      rank_score: doc.rank_score,
      match_source: doc.match_source,
      matched_concepts: doc.matched_concepts || [],
      content_preview: doc.content.substring(0, 200),
    }
  })
}

// ============================================================================
// HANDLER PRINCIPAL
// ============================================================================

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  const startTime = Date.now()

  try {
    // ========================================
    // 1. VALIDATION
    // ========================================
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
    const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

    if (!OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return errorResponse("Configuration manquante", 500)
    }

    const body: RequestBody = await req.json()
    const { 
      query, 
      user_id,
      org_id, 
      project_id,
      match_count = DEFAULT_CONFIG.match_count,
      match_threshold = DEFAULT_CONFIG.match_threshold,
      filter_source_types,
      filter_concepts,
      include_metadata = true,
      include_concepts = true,
      include_scores = false,
    } = body

    if (!query?.trim()) return errorResponse("Le champ query est requis", 400)
    if (!user_id?.trim()) return errorResponse("Le champ user_id est requis", 400)

    console.log("[baikal-librarian] ========================================")
    console.log("[baikal-librarian] v7.0 - GraphRAG Multi-Layer")
    console.log("[baikal-librarian] Query:", query.substring(0, 100))

    // ========================================
    // 2. CONTEXTE UTILISATEUR & CONFIG
    // ========================================
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const userContext = await getUserContext(supabase, user_id)
    const effectiveOrgId = org_id || userContext.org_id
    const effectiveAppId = body.app_id || userContext.app_id || 'arpet'

    console.log("[baikal-librarian] app_id:", effectiveAppId)
    console.log("[baikal-librarian] org_id:", effectiveOrgId)
    console.log("[baikal-librarian] project_id:", project_id)

    const agentConfig = await getAgentConfig(supabase, "librarian", effectiveAppId, effectiveOrgId || null)

    // Override layers depuis la requête
    const includeAppLayer = body.include_app_layer ?? agentConfig.include_app_layer
    const includeOrgLayer = body.include_org_layer ?? agentConfig.include_org_layer
    const includeProjectLayer = body.include_project_layer ?? agentConfig.include_project_layer
    const includeUserLayer = body.include_user_layer ?? agentConfig.include_user_layer

    console.log("[baikal-librarian] Prompt:", agentConfig.prompt_name)
    console.log("[baikal-librarian] Layers: app=", includeAppLayer, "org=", includeOrgLayer, "project=", includeProjectLayer)

    // ========================================
    // 3. GÉNÉRATION EMBEDDING
    // ========================================
    console.log("[baikal-librarian] Génération embedding...")
    
    const embeddingResponse = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEFAULT_CONFIG.embedding_model,
        input: query.trim(),
      }),
    })

    if (!embeddingResponse.ok) {
      const errorData = await embeddingResponse.json()
      return errorResponse(`Erreur OpenAI Embedding: ${errorData.error?.message}`, 500)
    }

    const embeddingData = await embeddingResponse.json()
    const queryEmbedding = embeddingData.data[0].embedding

    // ========================================
    // 4. RECHERCHE match_documents_v10
    // ========================================
    console.log("[baikal-librarian] Recherche v10 (multi-layer + GraphRAG)...")

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
        include_app_layer: includeAppLayer,
        include_org_layer: includeOrgLayer,
        include_project_layer: includeProjectLayer,
        include_user_layer: includeUserLayer,
        filter_source_types: filter_source_types || null,
        filter_concepts: filter_concepts || null,
        enable_concept_expansion: agentConfig.enable_concept_expansion,
      })

    if (searchError) {
      console.error("[baikal-librarian] Erreur match_documents_v10:", searchError)
      return errorResponse(`Erreur recherche: ${searchError.message}`, 500)
    }

    // Mapper les colonnes out_* vers les noms attendus
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

    // ========================================
    // 5. MÉTRIQUES & LOGS
    // ========================================
    const layerCounts = {
      app: matchedDocs.filter(d => d.layer === 'app').length,
      org: matchedDocs.filter(d => d.layer === 'org').length,
      project: matchedDocs.filter(d => d.layer === 'project').length,
      user: matchedDocs.filter(d => d.layer === 'user').length,
    }
    
    const matchSourceCounts = {
      vector: matchedDocs.filter(d => d.match_source === 'vector').length,
      fulltext: matchedDocs.filter(d => d.match_source === 'fulltext').length,
      graphrag: matchedDocs.filter(d => d.match_source === 'graphrag').length,
    }

    const allConcepts = new Set<string>()
    matchedDocs.forEach(d => (d.matched_concepts || []).forEach(c => allConcepts.add(c)))

    console.log(`[baikal-librarian] Résultats: ${matchedDocs.length} docs`)
    console.log(`[baikal-librarian] Par layer: app=${layerCounts.app}, org=${layerCounts.org}, project=${layerCounts.project}`)
    console.log(`[baikal-librarian] Par source: vector=${matchSourceCounts.vector}, fulltext=${matchSourceCounts.fulltext}, graphrag=${matchSourceCounts.graphrag}`)
    if (allConcepts.size > 0) {
      console.log(`[baikal-librarian] Concepts: ${Array.from(allConcepts).join(', ')}`)
    }

    // ========================================
    // 6. CAS SANS RÉSULTATS
    // ========================================
    if (matchedDocs.length === 0) {
      return jsonResponse({
        response: "Je n'ai trouvé aucun document pertinent pour répondre à votre question. Pouvez-vous reformuler ou préciser votre demande ?",
        sources: [],
        status: "success",
        processing_time_ms: Date.now() - startTime,
        documents_found: 0,
        model: agentConfig.model,
        prompt_used: agentConfig.prompt_name,
        app_id: effectiveAppId,
        layer_counts: layerCounts,
        match_source_counts: matchSourceCounts,
      })
    }

    // ========================================
    // 7. FORMATAGE CONTEXTE
    // ========================================
    const formattedContext = formatContextForLLM(matchedDocs, {
      includeMetadata: include_metadata,
      includeConcepts: include_concepts,
      includeScores: include_scores,
      maxDocsPerLayer: 5,
    })

    // ========================================
    // 8. INJECTION DANS LE PROMPT
    // ========================================
    let systemPrompt = agentConfig.system_prompt

    // Remplacer le placeholder {{context}} par le contexte formaté
    if (systemPrompt.includes('{{context}}')) {
      systemPrompt = systemPrompt.replace('{{context}}', formattedContext)
    } else {
      // Si pas de placeholder, ajouter le contexte à la fin
      systemPrompt = `${systemPrompt}\n\n${formattedContext}`
    }

    const sources = extractSources(matchedDocs)

    // ========================================
    // 9. GÉNÉRATION LLM
    // ========================================
    console.log("[baikal-librarian] Génération LLM avec", agentConfig.model)

    const llmResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: agentConfig.model,
        temperature: agentConfig.temperature,
        max_tokens: agentConfig.max_tokens,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: query }
        ],
      }),
    })

    if (!llmResponse.ok) {
      const errorData = await llmResponse.json()
      return errorResponse(`Erreur LLM: ${errorData.error?.message}`, 500)
    }

    const llmData = await llmResponse.json()
    const answer = llmData.choices?.[0]?.message?.content || "Désolé, je n'ai pas pu générer de réponse."

    // ========================================
    // 10. RÉPONSE FINALE
    // ========================================
    const processingTime = Date.now() - startTime
    console.log(`[baikal-librarian] Réponse générée en ${processingTime}ms`)

    return jsonResponse({
      response: answer,
      sources,
      status: "success",
      processing_time_ms: processingTime,
      documents_found: matchedDocs.length,
      model: agentConfig.model,
      embedding_model: DEFAULT_CONFIG.embedding_model,
      prompt_used: agentConfig.prompt_name,
      prompt_resolution: agentConfig.resolution_level,
      app_id: effectiveAppId,
      // Métriques v7.0
      layer_counts: layerCounts,
      match_source_counts: matchSourceCounts,
      concepts_matched: Array.from(allConcepts),
      // Vote context
      can_vote: true,
      vote_context: {
        question: query,
        answer,
        source_ids: matchedDocs.map(d => String(d.id)),
      },
    })

  } catch (error) {
    console.error("[baikal-librarian] Erreur non gérée:", error)
    return errorResponse(String(error), 500)
  }
})
