// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  BAIKAL-BRAIN - Routeur Sémantique Intelligent                               ║
// ║  Edge Function Supabase                                                      ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  Version: 4.4.0 - Classification d'intention + suggestion mode               ║
// ║  Route vers: BIBLIOTHECAIRE (baikal-librarian) ou ANALYSTE (futur)           ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  Nouveautés v4.4.0:                                                          ║
// ║  - Nouveau champ "intent" (synthesis, factual, comparison, citation, conv.)  ║
// ║  - generation_mode devient une SUGGESTION (Librarian peut override)          ║
// ║  - Prompts GÉNÉRIQUES (spécialisation métier via config.agent_prompts)       ║
// ║  Nouveautés v4.3.2:                                                          ║
// ║  - Transmission du project_context à baikal-librarian                        ║
// ║  Nouveautés v4.3.1:                                                          ║
// ║  - CORRECTION: .schema('core') sur récupération identité projet              ║
// ║  Nouveautés v4.3.0 (Phase 2):                                                ║
// ║  - Récupération de l'identité projet (identity JSONB)                        ║
// ║  - Formatage et injection dans le prompt via {{project_context}}             ║
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

const DEFAULT_CONFIG = {
  model: 'gpt-4o-mini',
  temperature: 0,
  max_tokens: 200,
}

// ============================================================================
// PROMPT GÉNÉRIQUE (Fallback - spécialisation métier via DB)
// ============================================================================

const FALLBACK_SYSTEM_PROMPT = `Tu es un routeur intelligent pour un assistant documentaire.
Analyse la question et détermine:
1. L'INTENTION de l'utilisateur
2. L'agent qui doit traiter la demande
3. Le mode de génération suggéré

RÉPONDS UNIQUEMENT en JSON valide, sans markdown ni explication:
{
  "destination": "BIBLIOTHECAIRE",
  "intent": "synthesis",
  "generation_mode": "gemini",
  "reasoning": "explication courte"
}

═══════════════════════════════════════════════════════════════
INTENTIONS POSSIBLES (champ "intent"):
═══════════════════════════════════════════════════════════════

"synthesis" - Demande de vue d'ensemble, résumé, explication globale
  → Mots-clés: résume, synthèse, explique, présente, décris, c'est quoi ce document
  → Exemples: "Résume ce document", "Explique-moi ce fichier", "C'est quoi ce rapport ?"

"factual" - Question précise sur un fait, chiffre, délai, définition
  → Mots-clés: quel est, combien, quand, où, définition, montant, délai, durée
  → Exemples: "Quel est le délai mentionné ?", "C'est quoi ce terme ?", "Quel montant ?"

"comparison" - Comparaison entre éléments, sections, documents
  → Mots-clés: compare, différence, versus, entre, par rapport à
  → Exemples: "Compare les sections 3 et 7", "Différence entre ces deux documents ?"

"citation" - Demande de citation exacte, référence précise
  → Mots-clés: cite, article, extrait, texte exact, que dit, selon
  → Exemples: "Cite le passage sur...", "Que dit exactement le document sur..."

"conversational" - Salutation, remerciement, question hors-sujet
  → Exemples: "Bonjour", "Merci", "Comment ça va ?", "Au revoir"

═══════════════════════════════════════════════════════════════
AGENTS (champ "destination"):
═══════════════════════════════════════════════════════════════

BIBLIOTHECAIRE - Pour:
- Documents, normes, réglementations
- Informations textuelles, définitions, procédures
- Recherche dans la documentation
- Questions générales nécessitant des sources

ANALYSTE - Pour:
- Calculs numériques (quantités, coûts, statistiques)
- Analyse de données chiffrées
- Tableaux, graphiques
- Traitement de fichiers Excel/CSV

═══════════════════════════════════════════════════════════════
MODE DE GÉNÉRATION (champ "generation_mode"):
Note: C'est une SUGGESTION, le Librarian peut l'adapter selon le volume de pages
═══════════════════════════════════════════════════════════════

"gemini" - Suggéré pour:
  - intent = "synthesis" (résumés, vues d'ensemble)
  - intent = "comparison" (besoin de voir plusieurs sections)
  - Analyse approfondie d'un document complet
  - Questions mentionnant un fichier spécifique par son nom

"chunks" - Suggéré pour:
  - intent = "factual" (recherche précise)
  - intent = "citation" (extrait exact)
  - intent = "conversational" (réponse rapide)
  - Questions rapides, définitions, informations ponctuelles

═══════════════════════════════════════════════════════════════
EXEMPLES:
═══════════════════════════════════════════════════════════════

"Résume ce document" 
→ {"destination":"BIBLIOTHECAIRE","intent":"synthesis","generation_mode":"gemini","reasoning":"demande de résumé global"}

"Quel est le délai mentionné à l'article 19 ?"
→ {"destination":"BIBLIOTHECAIRE","intent":"factual","generation_mode":"chunks","reasoning":"question précise sur un délai"}

"C'est quoi ce terme ?"
→ {"destination":"BIBLIOTHECAIRE","intent":"factual","generation_mode":"chunks","reasoning":"définition demandée"}

"Compare les sections 3 et 7"
→ {"destination":"BIBLIOTHECAIRE","intent":"comparison","generation_mode":"gemini","reasoning":"comparaison nécessitant lecture des deux"}

"Cite le passage sur les pénalités"
→ {"destination":"BIBLIOTHECAIRE","intent":"citation","generation_mode":"chunks","reasoning":"extrait précis demandé"}

"Bonjour !"
→ {"destination":"BIBLIOTHECAIRE","intent":"conversational","generation_mode":"chunks","reasoning":"salutation"}

"Explique-moi ce document en détail"
→ {"destination":"BIBLIOTHECAIRE","intent":"synthesis","generation_mode":"gemini","reasoning":"explication détaillée demandée"}

"Calcule les totaux de ce tableau"
→ {"destination":"ANALYSTE","intent":"factual","generation_mode":"chunks","reasoning":"calcul numérique requis"}`

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
  intent: 'synthesis' | 'factual' | 'comparison' | 'citation' | 'conversational'
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
// FORMATAGE IDENTITÉ PROJET
// ============================================================================

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

  if (identity.market_type) {
    const label = marketTypeLabels[identity.market_type] || identity.market_type;
    parts.push(`**Type de marché**: ${label}`);
  }

  if (identity.project_type) {
    const label = projectTypeLabels[identity.project_type] || identity.project_type;
    parts.push(`**Type de projet**: ${label}`);
  }

  if (identity.description) {
    parts.push(`**Description**: ${identity.description}`);
  }

  return parts.join('\n');
}

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
  
  // Priorité 1: Prompt spécifique à l'organisation
  if (org_id) {
    const { data: orgPrompt } = await supabase
      .schema('config')
      .from('agent_prompts')
      .select('system_prompt, parameters')
      .eq('agent_type', 'router')
      .eq('is_active', true)
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
  
  // Priorité 3: Prompt global
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
  
  console.log('[baikal-brain] Aucun prompt routeur en DB, utilisation du fallback générique')
  return {
    system_prompt: FALLBACK_SYSTEM_PROMPT,
    model: DEFAULT_CONFIG.model,
    temperature: DEFAULT_CONFIG.temperature,
    max_tokens: DEFAULT_CONFIG.max_tokens,
  }
}

// ============================================================================
// ROUTAGE SÉMANTIQUE v4.4.0
// ============================================================================

async function routeQuery(
  query: string, 
  openaiApiKey: string,
  config: RouterConfig,
  projectContext: string
): Promise<RoutingDecision> {
  console.log(`[baikal-brain] Routage avec model=${config.model}, temp=${config.temperature}`)
  
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
    // Nettoyer le JSON (parfois entouré de ```)
    const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(cleanContent) as RoutingDecision
    return {
      destination: parsed.destination || 'BIBLIOTHECAIRE',
      intent: parsed.intent || 'factual',
      generation_mode: parsed.generation_mode || 'chunks',
      reasoning: parsed.reasoning || 'aucune raison fournie'
    }
  } catch {
    console.warn(`[baikal-brain] Erreur parsing JSON: ${content}`)
    return { 
      destination: 'BIBLIOTHECAIRE',
      intent: 'factual',
      generation_mode: 'chunks',
      reasoning: 'fallback - erreur parsing' 
    }
  }
}

// ============================================================================
// APPEL AGENT BIBLIOTHÉCAIRE v4.4.0
// ============================================================================

async function callLibrarian(
  body: RequestBody,
  decision: RoutingDecision,
  supabaseUrl: string, 
  authHeader: string,
  apiKey: string,
  projectContext: string
): Promise<Response> {
  const librarianUrl = `${supabaseUrl}/functions/v1/baikal-librarian`
  
  console.log(`[baikal-brain] Appel du Bibliothécaire: ${librarianUrl}`)
  console.log(`[baikal-brain] user_id: ${body.user_id}`)
  console.log(`[baikal-brain] project_id: ${body.project_id || 'aucun'}`)
  console.log(`[baikal-brain] conversation_id: ${body.conversation_id || 'nouvelle conversation'}`)
  console.log(`[baikal-brain] intent: ${decision.intent}`)
  console.log(`[baikal-brain] generation_mode (suggestion): ${decision.generation_mode}`)
  console.log(`[baikal-brain] project_context (${projectContext.length} chars)`)
  
  // v4.4.0: Transmet l'intent au Librarian
  const normalizedBody = {
    ...body,
    app_id: body.app_id || body.vertical_id,
    generation_mode: body.generation_mode || decision.generation_mode,
    intent: decision.intent,
    project_context: projectContext,
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
    intent: decision.intent,
    suggested_mode: decision.generation_mode,
    routing_reasoning: decision.reasoning
  }, response.status)
}

// ============================================================================
// FONCTION PRINCIPALE
// ============================================================================

serve(async (req: Request): Promise<Response> => {
  const startTime = Date.now()

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

    console.log(`[baikal-brain] v4.4.0 - Classification d'intention + suggestion mode`)
    console.log(`[baikal-brain] Requête: "${query.substring(0, 80)}..."`)
    console.log(`[baikal-brain] user_id: ${user_id}, project_id: ${project_id || 'aucun'}`)
    console.log(`[baikal-brain] conversation_id: ${conversation_id || 'nouvelle conversation'}`)
    if (clientMode) {
      console.log(`[baikal-brain] Mode forcé par client: ${clientMode}`)
    }

    // ========================================
    // 2. INITIALISER SUPABASE CLIENT
    // ========================================
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // ========================================
    // 3. RÉCUPÉRER IDENTITÉ PROJET
    // ========================================
    const projectContext = await getProjectIdentity(supabase, project_id)
    console.log(`[baikal-brain] Contexte projet: ${projectContext.substring(0, 100)}...`)

    // ========================================
    // 4. RÉCUPÉRER CONFIG ROUTEUR
    // ========================================
    const routerConfig = await getRouterConfig(supabase, effectiveAppId, org_id)

    // ========================================
    // 5. ROUTAGE SÉMANTIQUE
    // ========================================
    console.log('[baikal-brain] Analyse du routage...')
    const decision = await routeQuery(query, openaiApiKey, routerConfig, projectContext)
    console.log(`[baikal-brain] Décision: ${decision.destination} | Intent: ${decision.intent} | Mode suggéré: ${decision.generation_mode}`)
    console.log(`[baikal-brain] Raison: ${decision.reasoning}`)

    // ========================================
    // 6. DÉLÉGATION À L'AGENT
    // ========================================
    if (decision.destination === 'BIBLIOTHECAIRE') {
      return await callLibrarian(body, decision, supabaseUrl, authHeader, apiKey, projectContext)
    } 
    else if (decision.destination === 'ANALYSTE') {
      return jsonResponse({
        response: "🚧 L'Agent Analyste est en cours de développement. Pour les calculs et analyses de données, cette fonctionnalité sera bientôt disponible.",
        sources: [],
        routed_to: 'ANALYSTE',
        intent: decision.intent,
        generation_mode: decision.generation_mode,
        status: 'not_implemented',
        reasoning: decision.reasoning,
        processing_time_ms: Date.now() - startTime
      })
    }

    // Fallback
    return await callLibrarian(body, decision, supabaseUrl, authHeader, apiKey, projectContext)

  } catch (error) {
    console.error('[baikal-brain] Erreur non gérée:', error)
    return errorResponse(String(error), 500)
  }
})
