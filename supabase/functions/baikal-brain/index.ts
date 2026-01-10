// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  BAIKAL-BRAIN v2.1.0 - Query Analyzer avec Streaming Proxy                   ║
// ║  Edge Function Supabase                                                      ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  Rôle:                                                                       ║
// ║  - Analyser la question utilisateur (intent, query rewriting)                ║
// ║  - Enrichir avec le contexte conversation                                    ║
// ║  - Appeler baikal-librarian avec le contexte complet                         ║
// ║  - Proxy le stream SSE vers le frontend                                      ║
// ║                                                                              ║
// ║  Nouveautés v2.1.0:                                                          ║
// ║  - FIX: Passage de conversation_id à get_agent_context                       ║
// ║  - FIX: Récupération correcte de l'historique pour query rewriting           ║
// ║                                                                              ║
// ║  v2.0.0:                                                                     ║
// ║  - Refonte complète: Query Analyzer au lieu de simple routeur                ║
// ║  - Intent detection (synthesis, factual, comparison, citation)               ║
// ║  - Query rewriting avec contexte conversation                                ║
// ║  - Passage du contexte complet au Librarian (1 seul appel DB)                ║
// ║  - Proxy streaming SSE                                                       ║
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
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

// URL interne pour appeler Librarian
const LIBRARIAN_URL = `${SUPABASE_URL}/functions/v1/baikal-librarian`

// ============================================================================
// CONSTANTES
// ============================================================================

const DEFAULT_CONFIG = {
  analysis_model: "gpt-4o-mini",
  analysis_temperature: 0.1,
  analysis_max_tokens: 500,
  conversation_timeout_minutes: 30,
  conversation_context_messages: 4,
}

// ============================================================================
// PROMPT FALLBACK - ANALYSE DE QUERY (Agnostique)
// ============================================================================

const FALLBACK_ANALYSIS_PROMPT = `Tu es un analyseur de questions pour un assistant documentaire.

Ton rôle est d'analyser la question de l'utilisateur pour:
1. Déterminer son INTENTION (ce qu'il cherche à obtenir)
2. REFORMULER la question pour améliorer la recherche documentaire
3. DÉTECTER les documents explicitement ou implicitement mentionnés

RÉPONDS UNIQUEMENT en JSON valide, sans markdown ni explication.

## FORMAT DE RÉPONSE

{
  "intent": "synthesis|factual|comparison|citation|conversational",
  "rewritten_query": "question reformulée et enrichie",
  "detected_documents": ["doc1", "doc2"],
  "reasoning": "explication courte de ton analyse"
}

## INTENTIONS POSSIBLES

"synthesis" - Vue d'ensemble, résumé, explication globale
  → Mots-clés: résume, synthèse, synthétise, explique, présente, décris, c'est quoi ce document, parle-moi de
  → Exemples: "Résume ce document", "Explique-moi ce fichier", "C'est quoi ce rapport ?"

"factual" - Question précise sur un fait, chiffre, délai, définition
  → Mots-clés: quel est, combien, quand, où, définition, montant, délai, durée, article
  → Exemples: "Quel est le délai ?", "C'est quoi ce terme ?", "Quel montant ?"

"comparison" - Comparaison entre éléments, sections, documents
  → Mots-clés: compare, différence, versus, entre, par rapport à, similaire
  → Exemples: "Compare les sections 3 et 7", "Différence entre ces deux documents ?"

"citation" - Demande de citation exacte, référence précise, extrait verbatim
  → Mots-clés: cite, article, extrait, texte exact, que dit, selon, mot pour mot
  → Exemples: "Cite le passage sur...", "Que dit exactement le document sur..."

"conversational" - Salutation, remerciement, question hors-sujet documentaire
  → Exemples: "Bonjour", "Merci", "Comment ça va ?", "Au revoir"

## RÈGLES DE REFORMULATION

1. ENRICHIS avec le contexte de conversation si pertinent
   - "Et les pénalités ?" + contexte CCAP → "Quelles sont les pénalités mentionnées dans le CCAP ?"
   
2. PRÉCISE les références implicites
   - "C'est quoi le délai ?" + doc mentionné avant → "Quel est le délai mentionné dans [document] ?"
   - "De quel plan est-il question ?" + contexte électricien → "Quel plan est attendu pour le lot électricité ?"

3. CONSERVE l'intention originale
   - Ne transforme pas une question factuelle en synthèse

4. DÉTECTE les documents mentionnés
   - Explicites: "dans le CCAP", "selon le rapport"
   - Implicites: déduits du contexte de conversation (réunions, lots, etc.)

5. UTILISE L'HISTORIQUE pour comprendre les pronoms et références
   - "il", "elle", "ce", "ça", "le plan", "le délai" → Réfère à quoi dans l'historique ?
   - Questions courtes comme "Et pour X ?" → Enrichir avec le sujet de la conversation

## FALLBACK

Si la question est ambiguë ou conversationnelle, utilise:
- intent: "conversational" pour les salutations/remerciements
- intent: "factual" pour les questions ambiguës sur des documents`

// ============================================================================
// TYPES
// ============================================================================

interface RequestBody {
  query: string
  user_id: string
  org_id?: string
  project_id?: string
  app_id?: string
  conversation_id?: string  // v2.1.0: Peut être fourni par le frontend
  generation_mode?: 'chunks' | 'gemini' | 'auto'
  stream?: boolean
  include_app_layer?: boolean
  include_org_layer?: boolean
  include_project_layer?: boolean
  include_user_layer?: boolean
  filter_source_types?: string[]
  filter_concepts?: string[]
}

interface AgentContext {
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

interface AnalysisResult {
  intent: 'synthesis' | 'factual' | 'comparison' | 'citation' | 'conversational'
  rewritten_query: string
  detected_documents: string[]
  reasoning: string
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
// GET AGENT CONTEXT (1 seul appel DB)
// v2.1.0: Ajout du paramètre conversationId pour récupérer l'historique correct
// ============================================================================

async function getAgentContext(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  orgId: string | undefined,
  projectId: string | undefined,
  appId: string | undefined,
  conversationId: string | undefined,  // v2.1.0: NOUVEAU PARAMÈTRE
  agentType: string = 'router'
): Promise<AgentContext> {
  console.log(`[baikal-brain] Appel get_agent_context (agent_type=${agentType}, conversation_id=${conversationId || 'auto'})...`)
  
  const { data, error } = await supabase
    .schema('rag')
    .rpc('get_agent_context', {
      p_user_id: userId,
      p_org_id: orgId || null,
      p_project_id: projectId || null,
      p_app_id: appId || null,
      p_agent_type: agentType,
      p_conversation_id: conversationId || null,  // v2.1.0: PASSAGE DU CONVERSATION_ID
      p_conversation_timeout_minutes: DEFAULT_CONFIG.conversation_timeout_minutes,
      p_context_messages_count: DEFAULT_CONFIG.conversation_context_messages,
    })

  if (error) {
    console.error('[baikal-brain] Erreur get_agent_context:', error)
    throw new Error(`Context error: ${error.message}`)
  }

  const ctx = data?.[0] || data

  let recentMessages = ctx.out_recent_messages || []
  if (typeof recentMessages === 'string') {
    try { recentMessages = JSON.parse(recentMessages) } catch { recentMessages = [] }
  }

  let documentsCles = ctx.out_documents_cles || []
  if (typeof documentsCles === 'string') {
    try { documentsCles = JSON.parse(documentsCles) } catch { documentsCles = [] }
  }

  const result: AgentContext = {
    effectiveOrgId: ctx.out_effective_org_id || null,
    effectiveAppId: ctx.out_effective_app_id || 'arpet',
    systemPrompt: ctx.out_system_prompt || null,
    geminiSystemPrompt: ctx.out_gemini_system_prompt || null,
    parameters: ctx.out_parameters || {},
    configSource: ctx.out_config_source || 'fallback',
    projectIdentity: ctx.out_project_identity || null,
    conversationId: ctx.out_conversation_id,
    conversationSummary: ctx.out_conversation_summary || null,
    conversationFirstMessage: ctx.out_conversation_first_message || null,
    recentMessages: recentMessages,
    messageCount: ctx.out_message_count || 0,
    previousSourceFileIds: ctx.out_previous_source_file_ids || [],
    documentsCles: documentsCles,
  }

  // v2.1.0: Log détaillé pour debug
  console.log(`[baikal-brain] Context: config=${result.configSource}, conv=${result.conversationId}, msgs=${result.messageCount}`)
  if (result.recentMessages.length > 0) {
    console.log(`[baikal-brain] Historique récupéré: ${result.recentMessages.length} message(s)`)
    // Log du dernier message pour vérification
    const lastMsg = result.recentMessages[result.recentMessages.length - 1]
    console.log(`[baikal-brain] Dernier message: [${lastMsg.role}] "${lastMsg.content.substring(0, 80)}..."`)
  } else {
    console.log(`[baikal-brain] Aucun historique de conversation`)
  }
  
  return result
}

// ============================================================================
// FORMAT CONTEXT FOR ANALYSIS PROMPT
// ============================================================================

function formatProjectContext(identity: Record<string, unknown> | null): string {
  if (!identity || Object.keys(identity).length === 0) return ''

  const parts: string[] = []
  if (identity.market_type) parts.push(`Type de marché: ${identity.market_type}`)
  if (identity.project_type) parts.push(`Type de projet: ${identity.project_type}`)
  if (identity.description) parts.push(`Description: ${identity.description}`)
  
  return parts.length > 0 ? parts.join('\n') : ''
}

function formatConversationForAnalysis(context: AgentContext): string {
  if (!context.recentMessages || context.recentMessages.length === 0) {
    return ''
  }

  // v2.1.0: Inclure aussi le résumé si disponible
  let conversationContext = ''
  
  if (context.conversationSummary) {
    conversationContext += `RÉSUMÉ DE LA CONVERSATION:\n${context.conversationSummary}\n\n`
  }

  // Messages récents (inversés pour ordre chronologique)
  const messages = context.recentMessages
    .slice()
    .reverse()
    .map(m => {
      const role = m.role === 'user' ? 'USER' : 'ASSISTANT'
      // v2.1.0: Inclure plus de contenu pour mieux comprendre le contexte
      const content = m.content.substring(0, 800)
      return `${role}: ${content}`
    })
    .join('\n\n')

  conversationContext += messages

  return conversationContext
}

function formatDocumentsCles(docs: Array<{ slug: string; label: string }>): string {
  if (!docs || docs.length === 0) return ''
  return docs.map(d => d.label).join(', ')
}

// ============================================================================
// ANALYZE QUERY (Intent Detection + Query Rewriting)
// ============================================================================

async function analyzeQuery(
  query: string,
  context: AgentContext
): Promise<AnalysisResult> {
  console.log(`[baikal-brain] Analyse de la query...`)

  // Construire le prompt d'analyse
  const analysisPrompt = context.systemPrompt || FALLBACK_ANALYSIS_PROMPT
  
  // Construire le contexte pour l'analyse
  const projectContext = formatProjectContext(context.projectIdentity)
  const conversationHistory = formatConversationForAnalysis(context)
  const documentsList = formatDocumentsCles(context.documentsCles)

  let userMessage = `QUESTION UTILISATEUR:\n${query}`

  if (projectContext) {
    userMessage = `CONTEXTE PROJET:\n${projectContext}\n\n${userMessage}`
  }

  // v2.1.0: Mettre l'historique en évidence pour le query rewriting
  if (conversationHistory) {
    userMessage = `HISTORIQUE CONVERSATION (IMPORTANT pour comprendre les références):\n${conversationHistory}\n\n${userMessage}`
  }

  if (documentsList) {
    userMessage = `DOCUMENTS CLÉS DISPONIBLES:\n${documentsList}\n\n${userMessage}`
  }

  // v2.1.0: Log du contexte envoyé à l'analyse
  console.log(`[baikal-brain] Contexte analyse: projet=${!!projectContext}, historique=${conversationHistory.length} chars, docs=${documentsList.length > 0}`)

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEFAULT_CONFIG.analysis_model,
        messages: [
          { role: "system", content: analysisPrompt },
          { role: "user", content: userMessage }
        ],
        temperature: DEFAULT_CONFIG.analysis_temperature,
        max_tokens: DEFAULT_CONFIG.analysis_max_tokens,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('[baikal-brain] Erreur OpenAI:', error)
      throw new Error(`OpenAI error: ${JSON.stringify(error)}`)
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content || ''

    // Parser le JSON de la réponse
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.warn('[baikal-brain] Pas de JSON dans la réponse, fallback')
      throw new Error('No JSON in response')
    }

    const result: AnalysisResult = JSON.parse(jsonMatch[0])
    
    // Valider les champs obligatoires
    if (!result.intent) result.intent = 'factual'
    if (!result.rewritten_query) result.rewritten_query = query
    if (!result.detected_documents) result.detected_documents = []
    if (!result.reasoning) result.reasoning = 'Analyse automatique'

    console.log(`[baikal-brain] Analyse: intent=${result.intent}, docs=[${result.detected_documents.join(', ')}]`)
    console.log(`[baikal-brain] Rewritten: "${result.rewritten_query.substring(0, 100)}..."`)
    
    // v2.1.0: Log si la query a été enrichie
    if (result.rewritten_query !== query) {
      console.log(`[baikal-brain] ✅ Query enrichie avec contexte`)
    } else {
      console.log(`[baikal-brain] ⚠️ Query non modifiée`)
    }

    return result

  } catch (error) {
    console.error('[baikal-brain] Erreur analyse, utilisation fallback:', error)
    
    // Fallback: détection basique par mots-clés
    return {
      intent: detectIntentByKeywords(query),
      rewritten_query: query,
      detected_documents: detectDocumentsByKeywords(query, context.documentsCles),
      reasoning: 'Fallback: analyse par mots-clés'
    }
  }
}

// ============================================================================
// FALLBACK: DETECTION PAR MOTS-CLÉS
// ============================================================================

function detectIntentByKeywords(query: string): AnalysisResult['intent'] {
  const q = query.toLowerCase()

  // Conversationnel
  if (/^(bonjour|salut|hello|hi|merci|thanks|au revoir|bye)/i.test(q)) {
    return 'conversational'
  }

  // Synthèse
  if (/résume|synthèse|synthétise|explique|présente|décris|parle-moi|c'est quoi ce (document|fichier|rapport)/i.test(q)) {
    return 'synthesis'
  }

  // Comparaison
  if (/compare|différence|versus|vs\b|entre .+ et|par rapport/i.test(q)) {
    return 'comparison'
  }

  // Citation
  if (/cite|citation|extrait|texte exact|mot pour mot|que dit exactement|verbatim/i.test(q)) {
    return 'citation'
  }

  // Par défaut: factuel
  return 'factual'
}

function detectDocumentsByKeywords(
  query: string,
  documentsCles: Array<{ slug: string; label: string }>
): string[] {
  if (!documentsCles || documentsCles.length === 0) return []

  const q = query.toLowerCase()
  const detected: string[] = []

  for (const doc of documentsCles) {
    if (q.includes(doc.slug.toLowerCase()) || q.includes(doc.label.toLowerCase())) {
      detected.push(doc.label)
    }
  }

  return detected
}

// ============================================================================
// CALL LIBRARIAN WITH CONTEXT (Proxy Stream)
// ============================================================================

async function callLibrarianWithProxy(
  req: Request,
  body: RequestBody,
  context: AgentContext,
  analysis: AnalysisResult
): Promise<Response> {
  console.log(`[baikal-brain] Appel Librarian (stream=${body.stream !== false})...`)

  // Construire le payload pour Librarian
  const librarianPayload = {
    // Query originale + enrichie
    query: body.query,
    rewritten_query: analysis.rewritten_query,
    
    // Analyse
    intent: analysis.intent,
    detected_documents: analysis.detected_documents,
    
    // IDs
    user_id: body.user_id,
    org_id: body.org_id,
    project_id: body.project_id,
    app_id: body.app_id,
    conversation_id: context.conversationId,
    
    // Options
    generation_mode: body.generation_mode || 'auto',
    stream: body.stream !== false,
    
    // Layers
    include_app_layer: body.include_app_layer,
    include_org_layer: body.include_org_layer,
    include_project_layer: body.include_project_layer,
    include_user_layer: body.include_user_layer,
    
    // Filtres
    filter_source_types: body.filter_source_types,
    filter_concepts: body.filter_concepts,
    
    // Contexte pré-chargé (évite double appel DB)
    preloaded_context: {
      effective_org_id: context.effectiveOrgId,
      effective_app_id: context.effectiveAppId,
      system_prompt: null, // Librarian utilisera son propre prompt
      gemini_system_prompt: null,
      parameters: context.parameters,
      config_source: context.configSource,
      project_identity: context.projectIdentity,
      conversation_id: context.conversationId,
      conversation_summary: context.conversationSummary,
      conversation_first_message: context.conversationFirstMessage,
      recent_messages: context.recentMessages,
      message_count: context.messageCount,
      previous_source_file_ids: context.previousSourceFileIds,
      documents_cles: context.documentsCles,
    }
  }

  // Récupérer le token d'auth de la requête originale
  const authHeader = req.headers.get('Authorization')

  const librarianResponse = await fetch(LIBRARIAN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader || `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(librarianPayload),
  })

  if (!librarianResponse.ok) {
    const errorText = await librarianResponse.text()
    console.error('[baikal-brain] Erreur Librarian:', errorText)
    return errorResponse(`Librarian error: ${errorText}`, librarianResponse.status)
  }

  // Si streaming, proxy le stream SSE
  if (body.stream !== false && librarianResponse.body) {
    console.log(`[baikal-brain] Proxy streaming SSE...`)
    
    return new Response(librarianResponse.body, {
      status: 200,
      headers: sseHeaders,
    })
  }

  // Sinon, retourner la réponse JSON
  const jsonResponse = await librarianResponse.json()
  
  // Enrichir avec les infos d'analyse
  jsonResponse.analysis = {
    intent: analysis.intent,
    rewritten_query: analysis.rewritten_query,
    detected_documents: analysis.detected_documents,
    reasoning: analysis.reasoning,
  }

  return new Response(JSON.stringify(jsonResponse), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  const startTime = Date.now()

  // CORS preflight
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
      conversation_id,  // v2.1.0: Récupérer du body
    } = body

    // Validation
    if (!query?.trim()) return errorResponse("Query is required")
    if (!user_id) return errorResponse("user_id is required")

    console.log(`[baikal-brain] v2.1.0 - Query Analyzer`)
    console.log(`[baikal-brain] Query: "${query.substring(0, 50)}..."`)
    console.log(`[baikal-brain] conversation_id from frontend: ${conversation_id || 'none'}`)

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // ========================================================================
    // 1. RÉCUPÉRER CONTEXTE (1 seul appel DB)
    // v2.1.0: Passage du conversation_id pour récupérer le bon historique
    // ========================================================================
    const context = await getAgentContext(
      supabase, 
      user_id, 
      org_id, 
      project_id, 
      app_id, 
      conversation_id,  // v2.1.0: NOUVEAU - Passer le conversation_id
      'router'
    )

    // ========================================================================
    // 2. ANALYSER LA QUERY
    // ========================================================================
    const analysis = await analyzeQuery(query, context)

    const analysisTime = Date.now() - startTime
    console.log(`[baikal-brain] Analyse terminée en ${analysisTime}ms`)

    // ========================================================================
    // 3. APPELER LIBRARIAN AVEC PROXY STREAM
    // ========================================================================
    return await callLibrarianWithProxy(req, body, context, analysis)

  } catch (error) {
    console.error("[baikal-brain] Erreur:", error)
    return errorResponse(
      error instanceof Error ? error.message : "Internal server error",
      500
    )
  }
})
