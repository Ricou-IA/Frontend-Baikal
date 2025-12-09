// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  BAIKAL-LIBRARIAN v5.0 - Agent RAG avec Hybrid Search                        ║
// ║  Edge Function Supabase pour ARPET                                           ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  Nouveautés v5.0 (Migration schémas):                                        ║
// ║  - profiles → core.profiles                                                  ║
// ║  - vertical_id → app_id                                                      ║
// ║  - match_documents_v5 → rag.match_documents_v7                               ║
// ║  - Rétro-compatibilité avec ancien nommage                                   ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  Historique:                                                                 ║
// ║  - v4.2: Recherche Hybride Vector + Full-text                                ║
// ║  - v4.1: Poids configurables vector_weight / fulltext_weight                 ║
// ║  - v4.0: Fallback sur v4/v3 si v5 non disponible                             ║
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

// Paramètres par défaut (peuvent être overridés par agent_prompts.parameters)
const DEFAULT_CONFIG = {
  match_threshold: 0.35,
  match_count: 10,
  max_context_length: 12000,
  embedding_model: "text-embedding-3-small",
  llm_model: "gpt-4o-mini",
  temperature: 0.3,
  max_tokens: 2048,
  // Poids pour la recherche hybride
  vector_weight: 0.7,
  fulltext_weight: 0.3,
}

// Prompt de fallback si aucun trouvé dans la base
const FALLBACK_SYSTEM_PROMPT = `Tu es un assistant qui repond aux questions en te basant sur le contexte documentaire fourni.
Base tes reponses sur le contexte. Ne jamais inventer. Cite les sources. Reponds en francais.`

// ============================================================================
// TYPES
// ============================================================================

interface RequestBody {
  query: string
  user_id: string
  org_id?: string
  project_id?: string
  // MIGRATION: Support des deux nommages pour rétro-compatibilité
  app_id?: string
  vertical_id?: string  // Deprecated, utiliser app_id
  match_threshold?: number
  match_count?: number
  vector_weight?: number
  fulltext_weight?: number
}

interface AgentPromptResult {
  id: string
  name: string
  system_prompt: string
  parameters: {
    temperature?: number
    max_tokens?: number
    model?: string
    vector_weight?: number
    fulltext_weight?: number
  }
  resolution_level: string
}

interface UserContext {
  // MIGRATION: vertical_id → app_id
  app_id: string | null
  org_id: string
}

interface AgentConfig {
  system_prompt: string
  temperature: number
  max_tokens: number
  model: string
  prompt_name: string
  resolution_level: string
  vector_weight: number
  fulltext_weight: number
}

interface DocumentMatch {
  id: string
  content: string
  metadata: Record<string, unknown>
  similarity: number
  vector_score: number
  fulltext_score: number
  source_type: "document" | "qa_memory"
  boost_level: string
  target_projects: string[] | null
}

interface Source {
  id: string
  type: "document" | "qa_memory"
  name: string
  score: number
  vector_score?: number
  fulltext_score?: number
  authority_label?: string
  content_preview: string
  qa_id?: string
}

interface ResponsePayload {
  response: string
  sources: Source[]
  knowledge_type: string
  status: string
  processing_time_ms: number
  documents_found: number
  qa_memory_found: number
  model: string
  embedding_model: string
  search_type: "hybrid" | "vector_only"
  prompt_used: string
  prompt_resolution: string
  // MIGRATION: vertical_id → app_id (gardé pour rétro-compatibilité réponse)
  app_id: string | null
  vertical_id?: string | null  // Deprecated
  can_vote: boolean
  vote_context?: {
    question: string
    answer: string
    source_ids: string[]
  }
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
  return jsonResponse({ 
    error: message, 
    status: "error",
    response: null,
    sources: [] 
  }, status)
}

/**
 * Récupère le contexte utilisateur depuis son profil
 * MIGRATION: profiles → core.profiles, vertical_id → app_id
 */
async function getUserContext(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<UserContext> {
  // MIGRATION: Utilisation du schéma core et de app_id
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

  return {
    app_id: profile.app_id,
    org_id: profile.org_id
  }
}

/**
 * Récupère la configuration de l'agent (prompt + paramètres) depuis agent_prompts
 * Utilise la fonction SQL get_agent_prompt pour la résolution hiérarchique
 * MIGRATION: p_vertical_id → p_app_id
 */
async function getAgentConfig(
  supabase: ReturnType<typeof createClient>,
  agentType: string,
  appId: string | null,
  orgId: string | null
): Promise<AgentConfig> {
  // MIGRATION: Appel RPC avec p_app_id au lieu de p_vertical_id
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

  const result = data?.[0] as AgentPromptResult | undefined

  if (!result) {
    console.warn("[baikal-librarian] Aucun prompt trouvé, utilisation du fallback")
    return {
      system_prompt: FALLBACK_SYSTEM_PROMPT,
      temperature: DEFAULT_CONFIG.temperature,
      max_tokens: DEFAULT_CONFIG.max_tokens,
      model: DEFAULT_CONFIG.llm_model,
      prompt_name: "Fallback",
      resolution_level: "fallback",
      vector_weight: DEFAULT_CONFIG.vector_weight,
      fulltext_weight: DEFAULT_CONFIG.fulltext_weight
    }
  }

  console.log(`[baikal-librarian] Prompt chargé: "${result.name}" (${result.resolution_level})`)

  return {
    system_prompt: result.system_prompt,
    temperature: result.parameters?.temperature ?? DEFAULT_CONFIG.temperature,
    max_tokens: result.parameters?.max_tokens ?? DEFAULT_CONFIG.max_tokens,
    model: result.parameters?.model ?? DEFAULT_CONFIG.llm_model,
    prompt_name: result.name,
    resolution_level: result.resolution_level,
    vector_weight: result.parameters?.vector_weight ?? DEFAULT_CONFIG.vector_weight,
    fulltext_weight: result.parameters?.fulltext_weight ?? DEFAULT_CONFIG.fulltext_weight
  }
}

/**
 * Construit le contexte pour le LLM avec distinction des types de sources
 */
function buildContext(documents: DocumentMatch[], maxLength: number): string {
  let context = ""
  let currentLength = 0
  
  // Trier par score hybride (déjà fait en SQL, mais on s'assure)
  const sorted = [...documents].sort((a, b) => b.similarity - a.similarity)
  
  for (const doc of sorted) {
    let docText = ""
    const metadata = doc.metadata || {}
    
    if (doc.source_type === "qa_memory") {
      const authorityLabel = metadata.authority_label as string
      const badge = authorityLabel === "expert" ? "⭐ Expert" 
                  : authorityLabel === "team" ? "✓ Équipe" 
                  : "Utilisateur"
      docText = `\n---\n[Reponse validee ${badge}]\n${doc.content}\n`
    } else {
      // Document classique
      const filename = (metadata.filename as string) 
                    || (metadata.source_file as string)
                    || (metadata.code_name ? `${metadata.code_name} - Art. ${metadata.article_num}` : null)
                    || "Document"
      
      // Indicateur de match (vector vs fulltext)
      const matchType = doc.fulltext_score > 0.1 ? "[FT+V]" : "[V]"
      docText = `\n---\n${matchType} Source: ${filename}\n${doc.content}\n`
    }
    
    if (currentLength + docText.length > maxLength) {
      break
    }
    
    context += docText
    currentLength += docText.length
  }
  
  return context
}

/**
 * Extrait les sources pour la réponse
 */
function extractSources(documents: DocumentMatch[]): Source[] {
  return documents.map(doc => {
    const metadata = doc.metadata || {}
    
    if (doc.source_type === "qa_memory") {
      return {
        id: `qa_${doc.id}`,
        type: "qa_memory" as const,
        name: `Q&A: "${(metadata.question as string || "").substring(0, 50)}${(metadata.question as string || "").length > 50 ? '...' : ''}"`,
        score: doc.similarity,
        vector_score: doc.vector_score,
        fulltext_score: doc.fulltext_score,
        authority_label: metadata.authority_label as string,
        content_preview: doc.content.substring(0, 200),
        qa_id: doc.id
      }
    }
    
    // Document classique
    const name = (metadata.filename as string) 
              || (metadata.source_file as string)
              || (metadata.code_name ? `${metadata.code_name} - Art. ${metadata.article_num}` : null)
              || "Document"
    
    return {
      id: `doc_${doc.id}`,
      type: "document" as const,
      name: name,
      score: doc.similarity,
      vector_score: doc.vector_score,
      fulltext_score: doc.fulltext_score,
      content_preview: doc.content.substring(0, 200)
    }
  })
}

/**
 * Détermine le type de connaissance principal
 */
function determineKnowledgeType(
  documents: DocumentMatch[],
  userId: string,
  projectId: string | undefined,
  orgId: string
): string {
  if (documents.length === 0) return "none"
  
  // Vérifier si on a des qa_memory avec haut niveau d'autorité
  const expertQA = documents.find(d => 
    d.source_type === "qa_memory" && d.metadata?.authority_label === "expert"
  )
  if (expertQA) return "expert_validated"
  
  const teamQA = documents.find(d => 
    d.source_type === "qa_memory" && d.metadata?.authority_label === "team"
  )
  if (teamQA) return "team_validated"
  
  // Vérifier les niveaux de documents
  const userDoc = documents.find(d => 
    d.source_type === "document" && d.metadata?.user_id === userId
  )
  if (userDoc) return "personal"
  
  const projectDoc = documents.find(d => 
    d.source_type === "document" && 
    projectId && 
    (d.target_projects || []).includes(projectId)
  )
  if (projectDoc) return "project"
  
  const orgDoc = documents.find(d => 
    d.source_type === "document" && d.metadata?.org_id === orgId
  )
  if (orgDoc) return "organization"
  
  return "shared"
}

/**
 * Log l'usage des qa_memory utilisées
 * MIGRATION: Appel RPC dans le schéma rag
 */
async function logQAUsage(
  supabase: ReturnType<typeof createClient>,
  documents: DocumentMatch[]
): Promise<void> {
  const qaMemoryIds = documents
    .filter(d => d.source_type === "qa_memory")
    .map(d => d.id)
  
  for (const qaId of qaMemoryIds) {
    try {
      // MIGRATION: RPC dans le schéma rag
      await supabase.schema('rag').rpc("log_qa_usage", { p_row_id: qaId })
    } catch (e) {
      console.warn("[baikal-librarian] Erreur log_qa_usage:", e)
    }
  }
}

// ============================================================================
// HANDLER PRINCIPAL
// ============================================================================

serve(async (req: Request) => {
  // Handle CORS preflight
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

    if (!OPENAI_API_KEY) {
      return errorResponse("OPENAI_API_KEY manquant dans les secrets", 500)
    }
    if (!SUPABASE_URL) {
      return errorResponse("SUPABASE_URL manquant", 500)
    }
    if (!SUPABASE_SERVICE_KEY) {
      return errorResponse("SUPABASE_SERVICE_ROLE_KEY manquant", 500)
    }

    const body: RequestBody = await req.json()
    const { 
      query, 
      user_id,
      org_id, 
      project_id,
      match_threshold = DEFAULT_CONFIG.match_threshold,
      match_count = DEFAULT_CONFIG.match_count,
      vector_weight,
      fulltext_weight
    } = body

    if (!query || query.trim().length === 0) {
      return errorResponse("Le champ query est requis", 400)
    }

    if (!user_id || user_id.trim().length === 0) {
      return errorResponse("Le champ user_id est requis", 400)
    }

    console.log("[baikal-librarian] ========================================")
    console.log("[baikal-librarian] v5.0 - Migration Schemas")
    console.log("[baikal-librarian] Requete:", query.substring(0, 100))
    console.log("[baikal-librarian] user_id:", user_id)

    // ========================================
    // 2. RÉCUPÉRATION CONTEXTE UTILISATEUR
    // ========================================
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    
    const userContext = await getUserContext(supabase, user_id)
    const effectiveOrgId = org_id || userContext.org_id
    
    // MIGRATION: Logs avec app_id
    console.log("[baikal-librarian] app_id:", userContext.app_id)
    console.log("[baikal-librarian] org_id:", effectiveOrgId)
    console.log("[baikal-librarian] project_id:", project_id)

    // ========================================
    // 3. CHARGEMENT CONFIG AGENT (PROMPT DYNAMIQUE)
    // ========================================
    // MIGRATION: Utilisation de app_id au lieu de vertical_id
    const agentConfig = await getAgentConfig(
      supabase,
      "librarian",
      userContext.app_id,
      effectiveOrgId || null
    )

    // Override des poids si fournis dans la requête
    const effectiveVectorWeight = vector_weight ?? agentConfig.vector_weight
    const effectiveFulltextWeight = fulltext_weight ?? agentConfig.fulltext_weight

    console.log("[baikal-librarian] Prompt:", agentConfig.prompt_name)
    console.log("[baikal-librarian] Resolution:", agentConfig.resolution_level)
    console.log("[baikal-librarian] Model:", agentConfig.model)
    console.log("[baikal-librarian] Weights: vector=", effectiveVectorWeight, "fulltext=", effectiveFulltextWeight)

    // ========================================
    // 4. GÉNÉRATION DE L'EMBEDDING
    // ========================================
    console.log("[baikal-librarian] Generation de l'embedding...")
    
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
      console.error("[baikal-librarian] OpenAI Embedding Error:", errorData)
      return errorResponse(`Erreur OpenAI Embedding: ${errorData.error?.message || "Erreur inconnue"}`, 500)
    }

    const embeddingData = await embeddingResponse.json()
    const queryEmbedding = embeddingData.data[0].embedding
    console.log("[baikal-librarian] Embedding genere, dimensions:", queryEmbedding.length)

    // ========================================
    // 5. RECHERCHE HYBRIDE (match_documents_v7)
    // ========================================
    // MIGRATION: match_documents_v5 → rag.match_documents_v7
    console.log("[baikal-librarian] Recherche hybride v7...")
    
    let matchedDocs: DocumentMatch[] = []
    let searchType: "hybrid" | "vector_only" = "hybrid"

    const rpcParamsV7: Record<string, unknown> = {
      query_embedding: queryEmbedding,
      query_text: query.trim(),
      p_user_id: user_id,
      match_threshold: match_threshold,
      match_count: match_count,
      vector_weight: effectiveVectorWeight,
      fulltext_weight: effectiveFulltextWeight,
    }

    if (effectiveOrgId) {
      rpcParamsV7.filter_org = effectiveOrgId
    }
    if (project_id) {
      rpcParamsV7.filter_project = project_id
    }

    // MIGRATION: Appel au schéma rag avec la nouvelle fonction v7
    const { data: documentsV7, error: searchErrorV7 } = await supabase
      .schema('rag')
      .rpc("match_documents_v7", rpcParamsV7)

    if (searchErrorV7) {
      console.warn("[baikal-librarian] Erreur match_documents_v7, fallback sur v5:", searchErrorV7.message)
      searchType = "vector_only"
      
      // Fallback sur v5 (ancienne version)
      const { data: documentsV5, error: errorV5 } = await supabase
        .rpc("match_documents_v5", rpcParamsV7)
      
      if (errorV5) {
        console.warn("[baikal-librarian] Erreur match_documents_v5, fallback sur v4:", errorV5.message)
        
        // Fallback sur v4 (vector seul)
        const rpcParamsV4: Record<string, unknown> = {
          query_embedding: queryEmbedding,
          p_user_id: user_id,
          match_threshold: match_threshold,
          match_count: match_count,
        }
        
        if (effectiveOrgId) {
          rpcParamsV4.filter_org = effectiveOrgId
        }
        if (project_id) {
          rpcParamsV4.filter_project = project_id
        }
        
        const { data: documentsV4, error: errorV4 } = await supabase
          .rpc("match_documents_v4", rpcParamsV4)
        
        if (errorV4) {
          console.warn("[baikal-librarian] Erreur match_documents_v4, fallback sur v3:", errorV4.message)
          
          const { data: documentsV3, error: errorV3 } = await supabase
            .rpc("match_documents_v3", rpcParamsV4)
          
          if (errorV3) {
            return errorResponse(`Erreur recherche: ${errorV3.message}`, 500)
          }
          
          matchedDocs = (documentsV3 || []).map((d: Record<string, unknown>) => ({
            ...d,
            source_type: "document" as const,
            vector_score: d.similarity as number,
            fulltext_score: 0,
            boost_level: "app",
            target_projects: null
          }))
        } else {
          matchedDocs = (documentsV4 || []).map((d: Record<string, unknown>) => ({
            ...d,
            vector_score: d.similarity as number,
            fulltext_score: 0,
          })) as DocumentMatch[]
        }
      } else {
        matchedDocs = (documentsV5 as DocumentMatch[]) || []
      }
    } else {
      matchedDocs = (documentsV7 as DocumentMatch[]) || []
    }

    // Compteurs
    const docCount = matchedDocs.filter(d => d.source_type === "document").length
    const qaCount = matchedDocs.filter(d => d.source_type === "qa_memory").length
    const fulltextMatches = matchedDocs.filter(d => d.fulltext_score > 0.1).length
    
    console.log(`[baikal-librarian] Resultats: ${docCount} docs, ${qaCount} qa_memory`)
    console.log(`[baikal-librarian] Dont ${fulltextMatches} avec match full-text`)

    // ========================================
    // 6. CAS SANS RÉSULTATS
    // ========================================
    if (matchedDocs.length === 0) {
      return jsonResponse({
        response: "Je n'ai trouve aucun document pertinent pour repondre a votre question. Pouvez-vous reformuler ou preciser votre demande ?",
        sources: [],
        knowledge_type: "none",
        status: "success",
        processing_time_ms: Date.now() - startTime,
        documents_found: 0,
        qa_memory_found: 0,
        model: agentConfig.model,
        embedding_model: DEFAULT_CONFIG.embedding_model,
        search_type: searchType,
        prompt_used: agentConfig.prompt_name,
        prompt_resolution: agentConfig.resolution_level,
        // MIGRATION: Retourne app_id + vertical_id pour rétro-compatibilité
        app_id: userContext.app_id,
        vertical_id: userContext.app_id,  // Deprecated, pour rétro-compatibilité
        can_vote: true,
        vote_context: { question: query, answer: "", source_ids: [] }
      } as ResponsePayload)
    }

    // ========================================
    // 7. CONSTRUCTION CONTEXTE & SOURCES
    // ========================================
    const context = buildContext(matchedDocs, DEFAULT_CONFIG.max_context_length)
    const sources = extractSources(matchedDocs)
    const knowledgeType = determineKnowledgeType(matchedDocs, user_id, project_id, effectiveOrgId)

    // ========================================
    // 8. GÉNÉRATION RÉPONSE LLM
    // ========================================
    console.log("[baikal-librarian] Generation LLM avec", agentConfig.model)

    const userPrompt = `CONTEXTE DOCUMENTAIRE:
${context}

QUESTION DE L'UTILISATEUR:
${query}

Reponds a la question en te basant sur le contexte fourni.`

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
          { role: "system", content: agentConfig.system_prompt },
          { role: "user", content: userPrompt }
        ],
      }),
    })

    if (!llmResponse.ok) {
      const errorData = await llmResponse.json()
      console.error("[baikal-librarian] OpenAI LLM Error:", errorData)
      return errorResponse(`Erreur LLM: ${errorData.error?.message || "Erreur inconnue"}`, 500)
    }

    const llmData = await llmResponse.json()
    const answer = llmData.choices?.[0]?.message?.content || "Desole, je n'ai pas pu generer de reponse."

    // ========================================
    // 9. LOG USAGE QA_MEMORY
    // ========================================
    await logQAUsage(supabase, matchedDocs)

    // ========================================
    // 10. RÉPONSE FINALE
    // ========================================
    const processingTime = Date.now() - startTime
    console.log(`[baikal-librarian] Reponse generee en ${processingTime}ms (${searchType})`)

    return jsonResponse({
      response: answer,
      sources: sources,
      knowledge_type: knowledgeType,
      status: "success",
      processing_time_ms: processingTime,
      documents_found: docCount,
      qa_memory_found: qaCount,
      model: agentConfig.model,
      embedding_model: DEFAULT_CONFIG.embedding_model,
      search_type: searchType,
      prompt_used: agentConfig.prompt_name,
      prompt_resolution: agentConfig.resolution_level,
      // MIGRATION: Retourne app_id + vertical_id pour rétro-compatibilité
      app_id: userContext.app_id,
      vertical_id: userContext.app_id,  // Deprecated, pour rétro-compatibilité
      can_vote: true,
      vote_context: {
        question: query,
        answer: answer,
        source_ids: matchedDocs.map(d => d.id)
      }
    } as ResponsePayload)

  } catch (error) {
    console.error("[baikal-librarian] Erreur non geree:", error)
    return errorResponse(String(error), 500)
  }
})
