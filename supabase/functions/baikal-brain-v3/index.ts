// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  BAIKAL-BRAIN v3.0.1 - Orchestrateur Intelligent                             ║
// ║  Edge Function Supabase                                                      ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  v3.0.1: Fix endpoint librarian-v3                                           ║
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

// v3.0.1: URL corrigée vers librarian-v3
const LIBRARIAN_URL = `${SUPABASE_URL}/functions/v1/baikal-librarian-v3`

// ============================================================================
// CONSTANTES FALLBACK
// ============================================================================

const FALLBACK_CONFIG = {
  model: "gpt-4o-mini",
  temperature: 0.3,
  max_tokens: 1024,
  context: {
    messages_count: 4,
    timeout_minutes: 30,
    include_documents_cles: true,
  },
  analysis: {
    enable_query_rewriting: true,
    enable_intent_detection: true,
    enable_document_detection: true,
    enable_search_config: true,
  },
  routing: {
    skip_search_for_conversational: true,
    default_agent: "librarian_v3",
  },
  fallback: {
    on_parse_error: "factual",
    use_keywords_extraction: true,
  },
  sse: {
    send_immediate_ack: true,
    send_analysis_step: true,
  },
}

const FALLBACK_SYSTEM_PROMPT = `Tu es le Brain ARPET, orchestrateur intelligent spécialisé BTP et marchés de travaux.

## MISSION
Analyse chaque requête utilisateur et produis une analyse structurée pour router vers le bon agent.

## OUTPUT FORMAT
Réponds UNIQUEMENT en JSON valide, sans texte avant ou après:

{
  "intent": "factual|synthesis|comparison|citation|conversational",
  "requires_search": true,
  "rewritten_query": "Question enrichie avec contexte conversation",
  "detected_documents": ["CCAG", "CCAP"],
  "search_config": {
    "scope": "narrow|broad",
    "max_files": 3,
    "min_similarity": 0.5,
    "boost_documents": ["CCAG"],
    "file_filter": null
  },
  "answer_format": "paragraph|list|table|quote",
  "key_concepts": ["pénalités", "retard"],
  "reasoning": "Explication courte du choix"
}

## RÈGLES INTENT

| Intent | Quand | requires_search | scope | answer_format |
|--------|-------|-----------------|-------|---------------|
| factual | Fait précis, délai, montant, article | true | narrow | paragraph |
| synthesis | Résumé, explication globale | true | broad | paragraph |
| comparison | Comparer documents/articles | true | broad | table |
| citation | Extrait exact, verbatim | true | narrow | quote |
| conversational | Salutation, merci, hors-sujet | false | - | paragraph |

## RÈGLES SEARCH_CONFIG

1. **scope: narrow** → Question précise, 1-2 docs suffisent
   - max_files: 2, min_similarity: 0.5

2. **scope: broad** → Vue d'ensemble, comparaison
   - max_files: 5, min_similarity: 0.35

3. **boost_documents** → Si l'utilisateur mentionne explicitement un doc
   - Ex: "dans le CCAG" → boost_documents: ["CCAG"]

4. **file_filter** → Si restriction explicite
   - Ex: "uniquement le CCAP" → file_filter: ["CCAP"]`

// ============================================================================
// TYPES
// ============================================================================

interface RequestBody {
  query: string
  user_id: string
  org_id?: string
  project_id?: string
  app_id?: string
  conversation_id?: string
  generation_mode?: 'chunks' | 'gemini' | 'auto'
  stream?: boolean
  include_app_layer?: boolean
  include_org_layer?: boolean
  include_project_layer?: boolean
  include_user_layer?: boolean
  filter_source_types?: string[]
  filter_concepts?: string[]
}

interface BrainConfig {
  model: string
  temperature: number
  max_tokens: number
  systemPrompt: string
  context: {
    messages_count: number
    timeout_minutes: number
    include_documents_cles: boolean
  }
  analysis: {
    enable_query_rewriting: boolean
    enable_intent_detection: boolean
    enable_document_detection: boolean
    enable_search_config: boolean
  }
  routing: {
    skip_search_for_conversational: boolean
    default_agent: string
    agents?: Record<string, string[]>
  }
  fallback: {
    on_parse_error: string
    use_keywords_extraction: boolean
  }
  sse: {
    send_immediate_ack: boolean
    send_analysis_step: boolean
  }
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
  requires_search: boolean
  rewritten_query: string
  detected_documents: string[]
  search_config: {
    scope: 'narrow' | 'broad'
    max_files: number
    min_similarity: number
    boost_documents: string[]
    file_filter: string[] | null
  }
  answer_format: 'paragraph' | 'list' | 'table' | 'quote'
  key_concepts: string[]
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

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

// ============================================================================
// GET BRAIN CONFIG
// ============================================================================

async function getBrainConfig(
  supabase: ReturnType<typeof createClient>,
  appId: string = 'arpet',
  orgId?: string
): Promise<BrainConfig> {
  console.log(`[brain-v3] Chargement config brain_v3 (app=${appId}, org=${orgId || 'global'})...`)

  const { data, error } = await supabase
    .schema('config')
    .from('agent_prompts')
    .select('system_prompt, parameters')
    .eq('agent_type', 'brain_v3')
    .eq('app_id', appId)
    .eq('is_active', true)
    .or(orgId ? `org_id.eq.${orgId},org_id.is.null` : 'org_id.is.null')
    .order('org_id', { ascending: false, nullsFirst: false })
    .limit(1)
    .single()

  if (error || !data) {
    console.warn('[brain-v3] Config DB non trouvée, utilisation fallback')
    return { ...FALLBACK_CONFIG, systemPrompt: FALLBACK_SYSTEM_PROMPT }
  }

  const params = data.parameters || {}

  return {
    model: params.model || FALLBACK_CONFIG.model,
    temperature: params.temperature || FALLBACK_CONFIG.temperature,
    max_tokens: params.max_tokens || FALLBACK_CONFIG.max_tokens,
    systemPrompt: data.system_prompt || FALLBACK_SYSTEM_PROMPT,
    context: {
      messages_count: params.context?.messages_count || FALLBACK_CONFIG.context.messages_count,
      timeout_minutes: params.context?.timeout_minutes || FALLBACK_CONFIG.context.timeout_minutes,
      include_documents_cles: params.context?.include_documents_cles ?? FALLBACK_CONFIG.context.include_documents_cles,
    },
    analysis: {
      enable_query_rewriting: params.analysis?.enable_query_rewriting ?? FALLBACK_CONFIG.analysis.enable_query_rewriting,
      enable_intent_detection: params.analysis?.enable_intent_detection ?? FALLBACK_CONFIG.analysis.enable_intent_detection,
      enable_document_detection: params.analysis?.enable_document_detection ?? FALLBACK_CONFIG.analysis.enable_document_detection,
      enable_search_config: params.analysis?.enable_search_config ?? FALLBACK_CONFIG.analysis.enable_search_config,
    },
    routing: {
      skip_search_for_conversational: params.routing?.skip_search_for_conversational ?? FALLBACK_CONFIG.routing.skip_search_for_conversational,
      default_agent: params.routing?.default_agent || FALLBACK_CONFIG.routing.default_agent,
      agents: params.routing?.agents,
    },
    fallback: {
      on_parse_error: params.fallback?.on_parse_error || FALLBACK_CONFIG.fallback.on_parse_error,
      use_keywords_extraction: params.fallback?.use_keywords_extraction ?? FALLBACK_CONFIG.fallback.use_keywords_extraction,
    },
    sse: {
      send_immediate_ack: params.sse?.send_immediate_ack ?? FALLBACK_CONFIG.sse.send_immediate_ack,
      send_analysis_step: params.sse?.send_analysis_step ?? FALLBACK_CONFIG.sse.send_analysis_step,
    },
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
  conversationId: string | undefined,
  brainConfig: BrainConfig
): Promise<AgentContext> {
  console.log(`[brain-v3] Appel get_agent_context (conversation_id=${conversationId || 'auto'})...`)
  
  const { data, error } = await supabase
    .schema('rag')
    .rpc('get_agent_context', {
      p_user_id: userId,
      p_org_id: orgId || null,
      p_project_id: projectId || null,
      p_app_id: appId || null,
      p_agent_type: 'librarian_v3',
      p_conversation_id: conversationId || null,
      p_conversation_timeout_minutes: brainConfig.context.timeout_minutes,
      p_context_messages_count: brainConfig.context.messages_count,
    })

  if (error) {
    console.error('[brain-v3] Erreur get_agent_context:', error)
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
    recentMessages,
    messageCount: ctx.out_message_count || 0,
    previousSourceFileIds: ctx.out_previous_source_file_ids || [],
    documentsCles,
  }

  console.log(`[brain-v3] Context: config=${result.configSource}, conv=${result.conversationId}, msgs=${result.messageCount}`)
  if (result.recentMessages.length > 0) {
    console.log(`[brain-v3] Historique: ${result.recentMessages.length} message(s)`)
  }
  
  return result
}

// ============================================================================
// FORMAT HELPERS
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
  if (!context.recentMessages || context.recentMessages.length === 0) return ''
  let conversationContext = ''
  if (context.conversationSummary) {
    conversationContext += `RÉSUMÉ DE LA CONVERSATION:\n${context.conversationSummary}\n\n`
  }
  const messages = context.recentMessages
    .slice().reverse()
    .map(m => `${m.role === 'user' ? 'USER' : 'ASSISTANT'}: ${m.content.substring(0, 800)}`)
    .join('\n\n')
  conversationContext += messages
  return conversationContext
}

function formatDocumentsCles(docs: Array<{ slug: string; label: string }>): string {
  if (!docs || docs.length === 0) return ''
  return docs.map(d => d.label).join(', ')
}

// ============================================================================
// ANALYZE QUERY
// ============================================================================

async function analyzeQuery(
  query: string,
  context: AgentContext,
  brainConfig: BrainConfig
): Promise<AnalysisResult> {
  console.log(`[brain-v3] Analyse de la query...`)

  const projectContext = formatProjectContext(context.projectIdentity)
  const conversationHistory = formatConversationForAnalysis(context)
  const documentsList = formatDocumentsCles(context.documentsCles)

  let userMessage = `QUESTION UTILISATEUR:\n${query}`
  if (projectContext) userMessage = `CONTEXTE PROJET:\n${projectContext}\n\n${userMessage}`
  if (conversationHistory) userMessage = `HISTORIQUE CONVERSATION:\n${conversationHistory}\n\n${userMessage}`
  if (documentsList) userMessage = `DOCUMENTS CLÉS DISPONIBLES:\n${documentsList}\n\n${userMessage}`

  console.log(`[brain-v3] Contexte: projet=${!!projectContext}, historique=${conversationHistory.length} chars, docs=${documentsList.length > 0}`)

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: brainConfig.model,
        messages: [
          { role: "system", content: brainConfig.systemPrompt },
          { role: "user", content: userMessage }
        ],
        temperature: brainConfig.temperature,
        max_tokens: brainConfig.max_tokens,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`OpenAI error: ${JSON.stringify(error)}`)
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content || ''
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')

    const parsed = JSON.parse(jsonMatch[0])
    
    const result: AnalysisResult = {
      intent: parsed.intent || 'factual',
      requires_search: parsed.requires_search ?? true,
      rewritten_query: parsed.rewritten_query || query,
      detected_documents: parsed.detected_documents || [],
      search_config: {
        scope: parsed.search_config?.scope || 'narrow',
        max_files: parsed.search_config?.max_files || 3,
        min_similarity: parsed.search_config?.min_similarity || 0.4,
        boost_documents: parsed.search_config?.boost_documents || [],
        file_filter: parsed.search_config?.file_filter || null,
      },
      answer_format: parsed.answer_format || 'paragraph',
      key_concepts: parsed.key_concepts || [],
      reasoning: parsed.reasoning || 'Analyse automatique',
    }

    console.log(`[brain-v3] Analyse: intent=${result.intent}, requires_search=${result.requires_search}`)
    console.log(`[brain-v3] search_config: scope=${result.search_config.scope}, max_files=${result.search_config.max_files}`)
    console.log(`[brain-v3] answer_format=${result.answer_format}, key_concepts=[${result.key_concepts.join(', ')}]`)
    if (result.rewritten_query !== query) {
      console.log(`[brain-v3] ✅ Query enrichie: "${result.rewritten_query.substring(0, 80)}..."`)
    }

    return result
  } catch (error) {
    console.error('[brain-v3] Erreur analyse, utilisation fallback:', error)
    if (brainConfig.fallback.use_keywords_extraction) {
      return buildFallbackAnalysis(query, context.documentsCles)
    }
    throw error
  }
}

// ============================================================================
// FALLBACK ANALYSIS
// ============================================================================

function buildFallbackAnalysis(
  query: string,
  documentsCles: Array<{ slug: string; label: string }>
): AnalysisResult {
  const intent = detectIntentByKeywords(query)
  return {
    intent,
    requires_search: intent !== 'conversational',
    rewritten_query: query,
    detected_documents: detectDocumentsByKeywords(query, documentsCles),
    search_config: getDefaultSearchConfig(intent),
    answer_format: getDefaultAnswerFormat(intent),
    key_concepts: extractKeywords(query),
    reasoning: 'Fallback: analyse par mots-clés',
  }
}

function detectIntentByKeywords(query: string): AnalysisResult['intent'] {
  const q = query.toLowerCase()
  if (/^(bonjour|salut|hello|hi|merci|thanks|au revoir|bye|coucou|hey)/i.test(q)) return 'conversational'
  if (/résume|synthèse|synthétise|explique|présente|décris|parle-moi/i.test(q)) return 'synthesis'
  if (/compare|différence|versus|vs\b|entre .+ et|par rapport/i.test(q)) return 'comparison'
  if (/cite|citation|extrait|texte exact|mot pour mot/i.test(q)) return 'citation'
  return 'factual'
}

function detectDocumentsByKeywords(query: string, documentsCles: Array<{ slug: string; label: string }>): string[] {
  if (!documentsCles?.length) return []
  const q = query.toLowerCase()
  return documentsCles.filter(d => q.includes(d.slug.toLowerCase()) || q.includes(d.label.toLowerCase())).map(d => d.label)
}

function getDefaultSearchConfig(intent: AnalysisResult['intent']): AnalysisResult['search_config'] {
  const configs: Record<string, AnalysisResult['search_config']> = {
    factual: { scope: 'narrow', max_files: 2, min_similarity: 0.5, boost_documents: [], file_filter: null },
    synthesis: { scope: 'broad', max_files: 5, min_similarity: 0.35, boost_documents: [], file_filter: null },
    comparison: { scope: 'broad', max_files: 4, min_similarity: 0.4, boost_documents: [], file_filter: null },
    citation: { scope: 'narrow', max_files: 1, min_similarity: 0.6, boost_documents: [], file_filter: null },
    conversational: { scope: 'narrow', max_files: 0, min_similarity: 0.5, boost_documents: [], file_filter: null },
  }
  return configs[intent] || configs.factual
}

function getDefaultAnswerFormat(intent: AnalysisResult['intent']): AnalysisResult['answer_format'] {
  const formats: Record<string, AnalysisResult['answer_format']> = {
    factual: 'paragraph', synthesis: 'paragraph', comparison: 'table', citation: 'quote', conversational: 'paragraph'
  }
  return formats[intent] || 'paragraph'
}

function extractKeywords(query: string): string[] {
  const stopwords = ['dans', 'pour', 'avec', 'cette', 'quel', 'quelle', 'comment', 'pourquoi']
  return query.toLowerCase().split(/\s+/).filter(w => w.length > 4 && !stopwords.includes(w)).slice(0, 5)
}

// ============================================================================
// HANDLE CONVERSATIONAL
// ============================================================================

async function handleConversational(
  query: string,
  context: AgentContext,
  analysis: AnalysisResult,
  stream: boolean
): Promise<Response> {
  console.log(`[brain-v3] Mode conversationnel - Skip RAG`)

  const responses: Record<string, string> = {
    bonjour: "Bonjour ! Comment puis-je vous aider avec vos documents ?",
    salut: "Salut ! Je suis prêt à répondre à vos questions sur les documents du projet.",
    hello: "Hello! How can I help you with your project documents?",
    merci: "Je vous en prie ! N'hésitez pas si vous avez d'autres questions.",
    thanks: "You're welcome! Feel free to ask if you have more questions.",
  }

  const q = query.toLowerCase().trim()
  let response = "Je suis là pour répondre à vos questions sur les documents du projet."
  for (const [key, value] of Object.entries(responses)) {
    if (q.startsWith(key)) { response = value; break }
  }

  if (stream) {
    const encoder = new TextEncoder()
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sseEvent('step', { step: 'done', message: 'Mode conversationnel' })))
        controller.enqueue(encoder.encode(sseEvent('message', { content: response, conversation_id: context.conversationId })))
        controller.enqueue(encoder.encode(sseEvent('done', { conversation_id: context.conversationId })))
        controller.close()
      }
    })
    return new Response(body, { status: 200, headers: sseHeaders })
  }

  return new Response(JSON.stringify({ response, conversation_id: context.conversationId, sources: [] }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
  })
}

// ============================================================================
// CALL LIBRARIAN V3
// ============================================================================

async function callLibrarianWithProxy(
  req: Request,
  body: RequestBody,
  context: AgentContext,
  analysis: AnalysisResult
): Promise<Response> {
  console.log(`[brain-v3] Appel Librarian v3 (stream=${body.stream !== false})...`)

  const librarianPayload = {
    query: body.query,
    rewritten_query: analysis.rewritten_query,
    intent: analysis.intent,
    detected_documents: analysis.detected_documents,
    search_config: analysis.search_config,
    answer_format: analysis.answer_format,
    key_concepts: analysis.key_concepts,
    user_id: body.user_id,
    org_id: body.org_id,
    project_id: body.project_id,
    app_id: body.app_id,
    conversation_id: context.conversationId,
    generation_mode: body.generation_mode || 'auto',
    stream: body.stream !== false,
    include_app_layer: body.include_app_layer,
    include_org_layer: body.include_org_layer,
    include_project_layer: body.include_project_layer,
    include_user_layer: body.include_user_layer,
    filter_source_types: body.filter_source_types,
    preloaded_context: {
      effective_org_id: context.effectiveOrgId,
      effective_app_id: context.effectiveAppId,
      system_prompt: context.systemPrompt,
      gemini_system_prompt: context.geminiSystemPrompt,
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
    console.error('[brain-v3] Erreur Librarian v3:', errorText)
    return errorResponse(`Librarian error: ${errorText}`, librarianResponse.status)
  }

  if (body.stream !== false && librarianResponse.body) {
    console.log(`[brain-v3] Proxy streaming SSE...`)
    return new Response(librarianResponse.body, { status: 200, headers: sseHeaders })
  }

  const jsonResponse = await librarianResponse.json()
  jsonResponse.analysis = {
    intent: analysis.intent,
    requires_search: analysis.requires_search,
    rewritten_query: analysis.rewritten_query,
    detected_documents: analysis.detected_documents,
    search_config: analysis.search_config,
    answer_format: analysis.answer_format,
    key_concepts: analysis.key_concepts,
    reasoning: analysis.reasoning,
  }

  return new Response(JSON.stringify(jsonResponse), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
  })
}

// ============================================================================
// SSE STREAM WITH IMMEDIATE ACK
// ============================================================================

function createImmediateAckStream(
  context: AgentContext,
  brainConfig: BrainConfig,
  processRequest: () => Promise<Response>
): Response {
  const encoder = new TextEncoder()
  
  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (brainConfig.sse.send_immediate_ack) {
          controller.enqueue(encoder.encode(sseEvent('step', { step: 'received', message: 'Question reçue', conversation_id: context.conversationId })))
        }
        if (brainConfig.sse.send_analysis_step) {
          controller.enqueue(encoder.encode(sseEvent('step', { step: 'analyzing', message: 'Analyse de la question...' })))
        }

        const response = await processRequest()
        
        if (response.body) {
          const reader = response.body.getReader()
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            controller.enqueue(value)
          }
        }
        
        controller.close()
      } catch (error) {
        console.error('[brain-v3] Erreur stream:', error)
        controller.enqueue(encoder.encode(sseEvent('error', { message: error instanceof Error ? error.message : 'Erreur interne' })))
        controller.close()
      }
    }
  })

  return new Response(stream, { status: 200, headers: sseHeaders })
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
    const { query, user_id, org_id, project_id, app_id = 'arpet', conversation_id, stream = true } = body

    if (!query?.trim()) return errorResponse("Query is required")
    if (!user_id) return errorResponse("user_id is required")

    console.log(`[brain-v3] ═══════════════════════════════════════════════════`)
    console.log(`[brain-v3] v3.0.1 - Query: "${query.substring(0, 60)}..."`)

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // 1. CONFIG
    const brainConfig = await getBrainConfig(supabase, app_id, org_id)

    // 2. CONTEXT
    const context = await getAgentContext(supabase, user_id, org_id, project_id, app_id, conversation_id, brainConfig)

    // 3. ANALYSE
    const analysis = await analyzeQuery(query, context, brainConfig)
    console.log(`[brain-v3] Analyse terminée en ${Date.now() - startTime}ms`)

    // 4. ROUTING
    if (!analysis.requires_search && brainConfig.routing.skip_search_for_conversational) {
      console.log(`[brain-v3] ⏭️ Skip RAG (conversationnel)`)
      return await handleConversational(query, context, analysis, stream)
    }

    // 5. LIBRARIAN
    if (stream && (brainConfig.sse.send_immediate_ack || brainConfig.sse.send_analysis_step)) {
      return createImmediateAckStream(context, brainConfig, async () => {
        return await callLibrarianWithProxy(req, body, context, analysis)
      })
    }

    return await callLibrarianWithProxy(req, body, context, analysis)

  } catch (error) {
    console.error("[brain-v3] Erreur:", error)
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500)
  }
})
