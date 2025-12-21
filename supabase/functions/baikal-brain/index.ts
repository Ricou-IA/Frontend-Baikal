// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  BAIKAL-BRAIN - Routeur Sémantique Intelligent                               ║
// ║  Edge Function Supabase pour ARPET                                           ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  Version: 4.2.0 - Lecture prompt routeur depuis DB + conversation_id         ║
// ║  Route vers: BIBLIOTHECAIRE (baikal-librarian) ou ANALYSTE (futur)           ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  Nouveautés v4.2.0:                                                          ║
// ║  - Lecture du prompt routeur depuis config.agent_prompts                     ║
// ║  - Paramètres (model, temperature) configurables depuis DB                   ║
// ║  - Fallback sur prompt hardcodé si pas de config en DB                       ║
// ║  Nouveautés v4.1.0:                                                          ║
// ║  - Transmission du conversation_id pour la mémoire contextuelle              ║
// ║  Nouveautés v4.0.0:                                                          ║
// ║  - Décision automatique du generation_mode                                   ║
// ║  - "gemini" : Analyse PDF complet via Google Context Caching                 ║
// ║  - "chunks" : RAG classique GPT-4o (comportement existant)                   ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// ============================================================================
// CONFIGURATION
// ============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Configuration par défaut (fallback si pas de prompt en DB)
const DEFAULT_CONFIG = {
  model: 'gpt-4o-mini',
  temperature: 0,
  max_tokens: 150,
}

// Prompt de routage par défaut (fallback)
const FALLBACK_SYSTEM_PROMPT = `Tu es un routeur intelligent pour un assistant BTP. 
Analyse la question et détermine quel agent doit la traiter et comment.

RÉPONDS UNIQUEMENT en JSON valide, sans markdown ni explication:
{"destination": "BIBLIOTHECAIRE", "generation_mode": "chunks", "reasoning": "explication courte"}

RÈGLES DE ROUTAGE:

BIBLIOTHECAIRE - Pour les questions sur:
- Documents, normes, réglementations (DTU, CCTP, etc.)
- Informations textuelles, définitions, procédures
- Recherche dans la documentation technique
- Questions générales sur le BTP

ANALYSTE - Pour les questions nécessitant:
- Calculs numériques (métrés, quantités, coûts)
- Analyse de données chiffrées
- Statistiques, tableaux, graphiques
- Traitement de fichiers Excel/CSV

MODE DE GÉNÉRATION (pour BIBLIOTHECAIRE uniquement):
- "gemini" : Analyse approfondie d'un document complet, lecture intégrale d'un PDF, 
  synthèse globale, questions mentionnant un fichier spécifique (CCTP, cahier des charges, 
  marché, contrat, notice, rapport), demande de résumé complet, analyse exhaustive
- "chunks" : Questions rapides, définitions, recherches générales, points précis,
  questions sur des normes ou réglementations, informations ponctuelles

EXEMPLES:
- "Résume le CCTP lot 10" → destination: BIBLIOTHECAIRE, generation_mode: gemini
- "C'est quoi un DTU ?" → destination: BIBLIOTHECAIRE, generation_mode: chunks
- "Quelles sont les clauses de garantie du document ?" → destination: BIBLIOTHECAIRE, generation_mode: gemini
- "Quel est le délai de paiement légal ?" → destination: BIBLIOTHECAIRE, generation_mode: chunks
- "Analyse complète du cahier des charges" → destination: BIBLIOTHECAIRE, generation_mode: gemini
- "Que dit le CCTP sur les enduits ?" → destination: BIBLIOTHECAIRE, generation_mode: gemini
- "Quelles sont les normes applicables ?" → destination: BIBLIOTHECAIRE, generation_mode: chunks
- "Fais-moi une synthèse du document" → destination: BIBLIOTHECAIRE, generation_mode: gemini
- "Calcule le métré du lot 3" → destination: ANALYSTE, generation_mode: chunks
- "Liste les responsabilités de l'entrepreneur" → destination: BIBLIOTHECAIRE, generation_mode: gemini`

// ============================================================================
// TYPES
// ============================================================================

interface RequestBody {
  query: string
  user_id?: string
  org_id?: string
  project_id?: string
  conversation_id?: string
  app_id?: string
  vertical_id?: string
  match_threshold?: number
  match_count?: number
  generation_mode?: 'chunks' | 'gemini'
}

interface RoutingDecision {
  destination: 'BIBLIOTHECAIRE' | 'ANALYSTE'
  generation_mode: 'chunks' | 'gemini'
  reasoning: string
}

interface RouterConfig {
  system_prompt: string
  model: string
  temperature: number
  max_tokens: number
}

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function errorResponse(message: string, status = 500): Response {
  console.error(`[baikal-brain] Erreur: ${message}`)
  return jsonResponse({ error: message, status: 'error' }, status)
}

// ============================================================================
// RÉCUPÉRATION CONFIG ROUTEUR DEPUIS DB
// ============================================================================

async function getRouterConfig(
  supabase: ReturnType<typeof createClient>,
  app_id: string,
  org_id?: string
): Promise<RouterConfig> {
  console.log(`[baikal-brain] Recherche prompt routeur pour app=${app_id}, org=${org_id || 'null'}`)
  
  // Chercher le prompt le plus spécifique (hiérarchie: org > app > global)
  let query = supabase
    .schema('config')
    .from('agent_prompts')
    .select('system_prompt, parameters')
    .eq('agent_type', 'router')
    .eq('is_active', true)
  
  // Priorité 1: Prompt spécifique à l'organisation
  if (org_id) {
    const { data: orgPrompt } = await query
      .eq('org_id', org_id)
      .single()
    
    if (orgPrompt) {
      console.log('[baikal-brain] Prompt routeur trouvé: niveau organisation')
      return {
        system_prompt: orgPrompt.system_prompt,
        model: orgPrompt.parameters?.model || DEFAULT_CONFIG.model,
        temperature: orgPrompt.parameters?.temperature ?? DEFAULT_CONFIG.temperature,
        max_tokens: orgPrompt.parameters?.max_tokens || DEFAULT_CONFIG.max_tokens,
      }
    }
  }
  
  // Priorité 2: Prompt spécifique à la verticale (app_id)
  const { data: appPrompt } = await supabase
    .schema('config')
    .from('agent_prompts')
    .select('system_prompt, parameters')
    .eq('agent_type', 'router')
    .eq('is_active', true)
    .eq('app_id', app_id)
    .is('org_id', null)
    .single()
  
  if (appPrompt) {
    console.log('[baikal-brain] Prompt routeur trouvé: niveau verticale')
    return {
      system_prompt: appPrompt.system_prompt,
      model: appPrompt.parameters?.model || DEFAULT_CONFIG.model,
      temperature: appPrompt.parameters?.temperature ?? DEFAULT_CONFIG.temperature,
      max_tokens: appPrompt.parameters?.max_tokens || DEFAULT_CONFIG.max_tokens,
    }
  }
  
  // Priorité 3: Prompt global (pas d'app_id, pas d'org_id)
  const { data: globalPrompt } = await supabase
    .schema('config')
    .from('agent_prompts')
    .select('system_prompt, parameters')
    .eq('agent_type', 'router')
    .eq('is_active', true)
    .is('app_id', null)
    .is('org_id', null)
    .single()
  
  if (globalPrompt) {
    console.log('[baikal-brain] Prompt routeur trouvé: niveau global')
    return {
      system_prompt: globalPrompt.system_prompt,
      model: globalPrompt.parameters?.model || DEFAULT_CONFIG.model,
      temperature: globalPrompt.parameters?.temperature ?? DEFAULT_CONFIG.temperature,
      max_tokens: globalPrompt.parameters?.max_tokens || DEFAULT_CONFIG.max_tokens,
    }
  }
  
  // Fallback: utiliser le prompt hardcodé
  console.log('[baikal-brain] Aucun prompt routeur en DB, utilisation du fallback')
  return {
    system_prompt: FALLBACK_SYSTEM_PROMPT,
    model: DEFAULT_CONFIG.model,
    temperature: DEFAULT_CONFIG.temperature,
    max_tokens: DEFAULT_CONFIG.max_tokens,
  }
}

// ============================================================================
// ROUTAGE SÉMANTIQUE
// ============================================================================

async function routeQuery(
  query: string, 
  openaiApiKey: string,
  config: RouterConfig
): Promise<RoutingDecision> {
  console.log(`[baikal-brain] Routage avec model=${config.model}, temp=${config.temperature}`)
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      temperature: config.temperature,
      max_tokens: config.max_tokens,
      messages: [
        { role: 'system', content: config.system_prompt },
        { role: 'user', content: query }
      ],
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI routing error: ${response.status}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content || ''

  try {
    const parsed = JSON.parse(content.trim()) as RoutingDecision
    return {
      destination: parsed.destination || 'BIBLIOTHECAIRE',
      generation_mode: parsed.generation_mode || 'chunks',
      reasoning: parsed.reasoning || 'aucune raison fournie'
    }
  } catch {
    console.warn(`[baikal-brain] Erreur parsing JSON: ${content}`)
    return { 
      destination: 'BIBLIOTHECAIRE', 
      generation_mode: 'chunks',
      reasoning: 'fallback - erreur parsing' 
    }
  }
}

// ============================================================================
// APPEL AGENT BIBLIOTHÉCAIRE
// ============================================================================

async function callLibrarian(
  body: RequestBody,
  decision: RoutingDecision,
  supabaseUrl: string, 
  authHeader: string,
  apiKey: string
): Promise<Response> {
  const librarianUrl = `${supabaseUrl}/functions/v1/baikal-librarian`
  
  console.log(`[baikal-brain] Appel du Bibliothécaire: ${librarianUrl}`)
  console.log(`[baikal-brain] user_id transmis: ${body.user_id}`)
  console.log(`[baikal-brain] conversation_id transmis: ${body.conversation_id || 'aucun (nouvelle conversation)'}`)
  console.log(`[baikal-brain] generation_mode: ${decision.generation_mode}`)
  
  const normalizedBody = {
    ...body,
    app_id: body.app_id || body.vertical_id,
    generation_mode: body.generation_mode || decision.generation_mode,
    conversation_id: body.conversation_id,
  }
  
  const response = await fetch(librarianUrl, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'apikey': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(normalizedBody),
  })

  const data = await response.json()
  return jsonResponse({
    ...data,
    routed_to: 'BIBLIOTHECAIRE',
    generation_mode: normalizedBody.generation_mode,
    routing_reasoning: decision.reasoning
  }, response.status)
}

// ============================================================================
// FONCTION PRINCIPALE
// ============================================================================

serve(async (req: Request): Promise<Response> => {
  const startTime = Date.now()

  // Gestion CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return errorResponse('Méthode non autorisée. Utilisez POST.', 405)
  }

  try {
    // ========================================
    // 1. VALIDATION
    // ========================================
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!openaiApiKey) {
      return errorResponse('OPENAI_API_KEY manquant', 500)
    }
    if (!supabaseUrl || !supabaseServiceKey) {
      return errorResponse('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant', 500)
    }

    const authHeader = req.headers.get('Authorization') || ''
    const apiKey = req.headers.get('apikey') || ''

    const body: RequestBody = await req.json()
    const { query, user_id, org_id, conversation_id, generation_mode: clientMode } = body

    if (!query || query.trim().length === 0) {
      return errorResponse('Le champ "query" est requis', 400)
    }

    const effectiveAppId = body.app_id || body.vertical_id || 'arpet'

    console.log(`[baikal-brain] v4.2.0 - Lecture prompt depuis DB`)
    console.log(`[baikal-brain] Requête reçue: "${query.substring(0, 80)}..."`)
    console.log(`[baikal-brain] user_id: ${user_id}`)
    console.log(`[baikal-brain] conversation_id: ${conversation_id || 'nouvelle conversation'}`)
    if (clientMode) {
      console.log(`[baikal-brain] Mode forcé par client: ${clientMode}`)
    }

    // ========================================
    // 2. RÉCUPÉRER CONFIG ROUTEUR DEPUIS DB
    // ========================================
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const routerConfig = await getRouterConfig(supabase, effectiveAppId, org_id)

    // ========================================
    // 3. ROUTAGE SÉMANTIQUE
    // ========================================
    console.log('[baikal-brain] Analyse du routage...')
    const decision = await routeQuery(query, openaiApiKey, routerConfig)
    console.log(`[baikal-brain] Décision: ${decision.destination} | Mode: ${decision.generation_mode} | Raison: ${decision.reasoning}`)

    // ========================================
    // 4. DÉLÉGATION À L'AGENT
    // ========================================
    if (decision.destination === 'BIBLIOTHECAIRE') {
      return await callLibrarian(body, decision, supabaseUrl, authHeader, apiKey)
    } 
    else if (decision.destination === 'ANALYSTE') {
      return jsonResponse({
        response: "🚧 L'Agent Analyste est en cours de développement. Pour les calculs et analyses de données, cette fonctionnalité sera bientôt disponible. En attendant, je peux vous aider avec des questions sur la documentation et les normes BTP.",
        sources: [],
        routed_to: 'ANALYSTE',
        generation_mode: decision.generation_mode,
        status: 'not_implemented',
        reasoning: decision.reasoning,
        processing_time_ms: Date.now() - startTime
      })
    }

    // Fallback
    return await callLibrarian(body, decision, supabaseUrl, authHeader, apiKey)

  } catch (error) {
    console.error('[baikal-brain] Erreur non gérée:', error)
    return errorResponse(String(error), 500)
  }
})
