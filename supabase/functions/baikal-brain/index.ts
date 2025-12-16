// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  BAIKAL-BRAIN - Routeur Sémantique Intelligent                               ║
// ║  Edge Function Supabase pour ARPET                                           ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  Version: 4.0.0 - Support generation_mode (chunks/gemini)                    ║
// ║  Route vers: BIBLIOTHECAIRE (baikal-librarian) ou ANALYSTE (futur)           ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  Nouveautés v4.0.0:                                                          ║
// ║  - Décision automatique du generation_mode                                   ║
// ║  - "gemini" : Analyse PDF complet via Google Context Caching                 ║
// ║  - "chunks" : RAG classique GPT-4o (comportement existant)                   ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// ============================================================================
// CONFIGURATION
// ============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ROUTING_MODEL = 'gpt-4o-mini'

// ============================================================================
// PROMPT DE ROUTAGE
// ============================================================================

const SYSTEM_PROMPT = `Tu es un routeur intelligent pour un assistant BTP. 
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
  // MIGRATION: Support des deux nommages pour rétro-compatibilité
  app_id?: string
  vertical_id?: string       // Deprecated, utiliser app_id
  match_threshold?: number
  match_count?: number
  // Peut être forcé par le client (override la décision du routeur)
  generation_mode?: 'chunks' | 'gemini'
}

interface RoutingDecision {
  destination: 'BIBLIOTHECAIRE' | 'ANALYSTE'
  generation_mode: 'chunks' | 'gemini'
  reasoning: string
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

/**
 * Effectue le routage sémantique de la requête
 */
async function routeQuery(query: string, openaiApiKey: string): Promise<RoutingDecision> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: ROUTING_MODEL,
      temperature: 0,
      max_tokens: 150,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
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
    // Valider et normaliser
    return {
      destination: parsed.destination || 'BIBLIOTHECAIRE',
      generation_mode: parsed.generation_mode || 'chunks',
      reasoning: parsed.reasoning || 'aucune raison fournie'
    }
  } catch {
    // Fallback sur le bibliothécaire en mode chunks en cas d'erreur de parsing
    console.warn(`[baikal-brain] Erreur parsing JSON: ${content}`)
    return { 
      destination: 'BIBLIOTHECAIRE', 
      generation_mode: 'chunks',
      reasoning: 'fallback - erreur parsing' 
    }
  }
}

/**
 * Appelle l'agent Bibliothécaire (baikal-librarian)
 */
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
  console.log(`[baikal-brain] generation_mode: ${decision.generation_mode}`)
  
  // MIGRATION: Normaliser app_id / vertical_id avant transmission
  // Le client peut forcer le generation_mode, sinon on utilise la décision du routeur
  const normalizedBody = {
    ...body,
    app_id: body.app_id || body.vertical_id,  // Priorité à app_id
    generation_mode: body.generation_mode || decision.generation_mode,  // Client override ou décision routeur
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

  // Retransmet la réponse du bibliothécaire
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
    
    if (!openaiApiKey) {
      return errorResponse('OPENAI_API_KEY manquant', 500)
    }
    if (!supabaseUrl) {
      return errorResponse('SUPABASE_URL manquant', 500)
    }

    // Récupérer les headers pour les transmettre
    const authHeader = req.headers.get('Authorization') || ''
    const apiKey = req.headers.get('apikey') || ''

    const body: RequestBody = await req.json()
    const { query, user_id, generation_mode: clientMode } = body

    if (!query || query.trim().length === 0) {
      return errorResponse('Le champ "query" est requis', 400)
    }

    console.log(`[baikal-brain] v4.0.0 - Support generation_mode`)
    console.log(`[baikal-brain] Requête reçue: "${query.substring(0, 80)}..."`)
    console.log(`[baikal-brain] user_id: ${user_id}`)
    if (clientMode) {
      console.log(`[baikal-brain] Mode forcé par client: ${clientMode}`)
    }

    // ========================================
    // 2. ROUTAGE SÉMANTIQUE
    // ========================================
    console.log('[baikal-brain] Analyse du routage...')
    const decision = await routeQuery(query, openaiApiKey)
    console.log(`[baikal-brain] Décision: ${decision.destination} | Mode: ${decision.generation_mode} | Raison: ${decision.reasoning}`)

    // ========================================
    // 3. DÉLÉGATION À L'AGENT
    // ========================================
    if (decision.destination === 'BIBLIOTHECAIRE') {
      return await callLibrarian(body, decision, supabaseUrl, authHeader, apiKey)
    } 
    else if (decision.destination === 'ANALYSTE') {
      // L'analyste n'est pas encore implémenté
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

    // Fallback (ne devrait jamais arriver)
    return await callLibrarian(body, decision, supabaseUrl, authHeader, apiKey)

  } catch (error) {
    console.error('[baikal-brain] Erreur non gérée:', error)
    return errorResponse(String(error), 500)
  }
})