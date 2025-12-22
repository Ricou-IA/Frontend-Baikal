// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  BAIKAL-BRAIN - Routeur Sémantique Intelligent                               ║
// ║  Edge Function Supabase pour ARPET                                           ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  Version: 4.3.2 - Transmission contexte projet à librarian (Phase 2)         ║
// ║  Route vers: BIBLIOTHECAIRE (baikal-librarian) ou ANALYSTE (futur)           ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  Nouveautés v4.3.2:                                                          ║
// ║  - Transmission du project_context à baikal-librarian                        ║
// ║  Nouveautés v4.3.1:                                                          ║
// ║  - CORRECTION: .schema('core') sur récupération identité projet              ║
// ║  Nouveautés v4.3.0 (Phase 2):                                                ║
// ║  - Récupération de l'identité projet (identity JSONB)                        ║
// ║  - Formatage et injection dans le prompt via {{project_context}}             ║
// ║  - Simplification: market_type, project_type, description (sans main_trades) ║
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

interface ProjectIdentity {
  market_type?: string
  project_type?: string
  description?: string
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
// PHASE 2: FORMATAGE IDENTITÉ PROJET (SIMPLIFIÉ - SANS main_trades)
// ============================================================================

/**
 * Formate l'identité du projet pour injection dans le prompt
 */
function formatProjectIdentity(identity: ProjectIdentity | null): string {
  if (!identity || Object.keys(identity).length === 0) {
    return 'Aucune identité projet définie.';
  }

  const marketTypeLabels: Record<string, string> = {
    public: 'Marché Public',
    prive: 'Marché Privé',
  };

  const projectTypeLabels: Record<string, string> = {
    entreprise_generale: 'Entreprise Générale',
    macro_lot: 'Macro-Lot',
    gros_oeuvre: 'Gros-Œuvre',
    lots_techniques: 'Lots Techniques',
    lots_architecturaux: 'Lots Architecturaux',
  };

  const parts: string[] = [];

  // Type de marché
  if (identity.market_type) {
    const label = marketTypeLabels[identity.market_type] || identity.market_type;
    parts.push(`**Type de marché**: ${label}`);
  }

  // Type de projet
  if (identity.project_type) {
    const label = projectTypeLabels[identity.project_type] || identity.project_type;
    parts.push(`**Type de projet**: ${label}`);
  }

  // Description
  if (identity.description) {
    parts.push(`**Description**: ${identity.description}`);
  }

  return parts.join('\n');
}

/**
 * Récupère l'identité du projet depuis la base de données
 * CORRECTION v4.3.1: Ajout .schema('core') pour chercher dans core.projects
 */
async function getProjectIdentity(
  supabase: ReturnType<typeof createClient>,
  project_id: string | undefined
): Promise<string> {
  if (!project_id) {
    return 'Aucune identité projet.';
  }

  try {
    const { data: project, error } = await supabase
      .schema('core')
      .from('projects')
      .select('identity')
      .eq('id', project_id)
      .single();

    if (error) {
      console.warn(`[baikal-brain] Erreur récupération identité projet: ${error.message}`);
      return 'Aucune identité projet.';
    }

    if (!project || !project.identity) {
      return 'Aucune identité projet définie.';
    }

    return formatProjectIdentity(project.identity as ProjectIdentity);
  } catch (error) {
    console.warn(`[baikal-brain] Erreur formatage identité: ${error}`);
    return 'Aucune identité projet.';
  }
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
  config: RouterConfig,
  projectContext: string
): Promise<RoutingDecision> {
  console.log(`[baikal-brain] Routage avec model=${config.model}, temp=${config.temperature}`)
  
  // PHASE 2: Injecter le contexte projet dans le prompt système
  const systemPromptWithContext = config.system_prompt
    .replace('{{project_context}}', projectContext);
  
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
        { role: 'system', content: systemPromptWithContext },
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

/**
 * Appelle l'agent Bibliothécaire (baikal-librarian)
 * v4.3.2: Ajout transmission project_context
 */
async function callLibrarian(
  body: RequestBody,
  decision: RoutingDecision,
  supabaseUrl: string, 
  authHeader: string,
  apiKey: string,
  projectContext: string  // ← AJOUT v4.3.2
): Promise<Response> {
  const librarianUrl = `${supabaseUrl}/functions/v1/baikal-librarian`
  
  console.log(`[baikal-brain] Appel du Bibliothécaire: ${librarianUrl}`)
  console.log(`[baikal-brain] user_id transmis: ${body.user_id}`)
  console.log(`[baikal-brain] project_id transmis: ${body.project_id || 'aucun'}`)
  console.log(`[baikal-brain] conversation_id transmis: ${body.conversation_id || 'aucun (nouvelle conversation)'}`)
  console.log(`[baikal-brain] generation_mode: ${decision.generation_mode}`)
  console.log(`[baikal-brain] project_context transmis (${projectContext.length} chars): ${projectContext.substring(0, 100)}...`)
  
  // MIGRATION: Normaliser app_id / vertical_id avant transmission
  // Le client peut forcer le generation_mode, sinon on utilise la décision du routeur
  // v4.3.2: Ajout project_context dans le body
  const normalizedBody = {
    ...body,
    app_id: body.app_id || body.vertical_id,  // Priorité à app_id
    generation_mode: body.generation_mode || decision.generation_mode,  // Client override ou décision routeur
    project_context: projectContext,  // ← AJOUT CRITIQUE v4.3.2
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
    const { query, user_id, org_id, project_id, conversation_id, generation_mode: clientMode } = body

    if (!query || query.trim().length === 0) {
      return errorResponse('Le champ "query" est requis', 400)
    }

    const effectiveAppId = body.app_id || body.vertical_id || 'arpet'

    console.log(`[baikal-brain] v4.3.2 - Transmission contexte projet à librarian`)
    console.log(`[baikal-brain] Requête reçue: "${query.substring(0, 80)}..."`)
    console.log(`[baikal-brain] user_id: ${user_id}`)
    console.log(`[baikal-brain] project_id: ${project_id || 'aucun'}`)
    console.log(`[baikal-brain] conversation_id: ${conversation_id || 'nouvelle conversation'}`)
    if (clientMode) {
      console.log(`[baikal-brain] Mode forcé par client: ${clientMode}`)
    }

    // ========================================
    // 2. INITIALISER SUPABASE CLIENT
    // ========================================
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // ========================================
    // 3. PHASE 2: RÉCUPÉRER IDENTITÉ PROJET
    // ========================================
    const projectContext = await getProjectIdentity(supabase, project_id)
    console.log(`[baikal-brain] Contexte projet: ${projectContext}`)

    // ========================================
    // 4. RÉCUPÉRER CONFIG ROUTEUR DEPUIS DB
    // ========================================
    const routerConfig = await getRouterConfig(supabase, effectiveAppId, org_id)

    // ========================================
    // 5. ROUTAGE SÉMANTIQUE
    // ========================================
    console.log('[baikal-brain] Analyse du routage...')
    const decision = await routeQuery(query, openaiApiKey, routerConfig, projectContext)
    console.log(`[baikal-brain] Décision: ${decision.destination} | Mode: ${decision.generation_mode} | Raison: ${decision.reasoning}`)

    // ========================================
    // 6. DÉLÉGATION À L'AGENT
    // ========================================
    if (decision.destination === 'BIBLIOTHECAIRE') {
      return await callLibrarian(body, decision, supabaseUrl, authHeader, apiKey, projectContext)  // ← AJOUT projectContext v4.3.2
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
    return await callLibrarian(body, decision, supabaseUrl, authHeader, apiKey, projectContext)  // ← AJOUT projectContext v4.3.2

  } catch (error) {
    console.error('[baikal-brain] Erreur non gérée:', error)
    return errorResponse(String(error), 500)
  }
})
