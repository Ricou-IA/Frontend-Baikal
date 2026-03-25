// ============================================================================
// baikal-retrieval - Configuration (Brain + Librarian + Feature Flags)
// ============================================================================

import type {
  Supabase, RetrievalConfig, BrainConfig, LibrarianConfig,
  FeatureFlags, AgenticConfig, SuggestionsConfig,
  IntentParams, IntentStrategy, GenerationOverride,
} from "./types.ts"

// ============================================================================
// FALLBACK CONSTANTS
// ============================================================================

const FALLBACK_BRAIN: BrainConfig = {
  model: "gpt-4o-mini",
  temperature: 0.3,
  max_tokens: 1024,
  systemPrompt: '',
  context: { messages_count: 4, timeout_minutes: 30, include_documents_cles: true },
  analysis: {
    enable_query_rewriting: true,
    enable_intent_detection: true,
    enable_document_detection: true,
    enable_search_config: true,
  },
  routing: { skip_search_for_conversational: true, default_agent: 'librarian_v3' },
  fallback: { on_parse_error: 'factual', use_keywords_extraction: true },
  sse: { send_immediate_ack: true, send_analysis_step: true },
}

const FALLBACK_LIBRARIAN: LibrarianConfig = {
  match_count: 8,
  match_threshold: 0.35,
  vector_weight: 0.8,
  fulltext_weight: 0.2,
  boost_factor: 1.5,
  enable_concept_expansion: true,
  enable_file_scoring: true,
  min_file_score: 0.3,
  intent_config: {
    factual: { max_files: 2, min_similarity: 0.42, match_count: 6 },
    synthesis: { max_files: 5, min_similarity: 0.35, match_count: 10 },
    comparison: { max_files: 4, min_similarity: 0.4, match_count: 8 },
    citation: { max_files: 1, min_similarity: 0.6, match_count: 4 },
    conversational: { max_files: 0, min_similarity: 0.5, match_count: 0 },
  },
  gemini_model: "gemini-2.5-flash-lite",
  gemini_max_files: 5,
  gemini_max_pages: 450,
  max_tokens: 6400,
  temperature: 0.3,
  default_answer_format: 'paragraph',
  enable_format_detection: true,
  intent_overrides: {},
  system_prompt: '',
  gemini_system_prompt: '',
  identity: { name: 'Assistant', role: 'assistant documentaire', personality: 'professionnel' },
  behavior: { citation_style: 'inline', response_language: 'fr', tone: 'professional', verbosity: 'balanced' },
  restrictions: { out_of_scope_message: '', no_data_message: '' },
  cache_ttl_minutes: 60,
  enable_global_cache: true,
  llm_model: "gpt-4o-mini",
  max_context_length: 12000,
  google_file_ttl_hours: 47,
  qa_memory_similarity_threshold: 0.85,
  qa_memory_max_results: 3,
  scoring_method: 'chunks_weighted',
  boost_on_mention: 2.0,
  min_chunks_for_inclusion: 1,
}

const FALLBACK_FEATURES: FeatureFlags = {
  enable_reranking: false,
  cohere_model: 'rerank-v3.5',
  cohere_top_n: 10,
  adaptive_threshold_enabled: false,       // v1.1.0: disabled - was eliminating relevant chunks (petanque bug)
  adaptive_threshold_ratio: 0.55,          // v1.1.0: lowered from 0.70 (less aggressive when re-enabled)
  no_results_min_similarity: 0.15,         // v1.1.0: lowered from 0.25 (was rejecting valid results too early)
  use_response_format_json: true,
  inject_conversation_in_generation: true,
}

const FALLBACK_AGENTIC: AgenticConfig = {
  enabled: true,
  model: 'gemini-2.5-flash',
  max_iterations: 3,
  timeout_ms: 8000,
  temperature: 0.2,
  quality_threshold: 3,           // Min chunks to consider fast path sufficient
  similarity_threshold: 0.45,     // Min avg similarity to consider fast path sufficient
}

const FALLBACK_SUGGESTIONS: SuggestionsConfig = {
  enabled: true,
  model: 'gpt-4o-mini',
  temperature: 0.4,
  max_count: 3,
  max_section_titles: 15,
  timeout_ms: 3000,
  min_similarity: 0.35,
}

// ============================================================================
// BRAIN SYSTEM PROMPT (fallback)
// ============================================================================

export const FALLBACK_BRAIN_SYSTEM_PROMPT = `Tu es le Brain ARPET, orchestrateur intelligent specialise BTP et marches de travaux.

## MISSION
Analyse chaque requete utilisateur et produis une analyse structuree pour router vers le bon agent.

## OUTPUT FORMAT
Reponds UNIQUEMENT en JSON valide:

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
  "key_concepts": ["penalites", "retard"],
  "reasoning": "Explication courte du choix"
}

## REGLES INTENT

| Intent | Quand | requires_search | scope |
|--------|-------|-----------------|-------|
| factual | Fait precis, delai, montant, article, localisation | true | narrow |
| synthesis | Resume, explication globale | true | broad |
| comparison | Comparer documents, incoherences, ecarts | true | broad |
| citation | Extrait exact, verbatim | true | narrow |
| conversational | UNIQUEMENT salutation simple SANS question | false | - |

## IMPORTANT - REQUIRES_SEARCH
- requires_search = false UNIQUEMENT pour les salutations simples sans aucune question
- En cas de doute -> requires_search = true

## RESOLUTION D'ANAPHORES (CRITIQUE)
Si l'historique de conversation est fourni, tu DOIS resoudre les references:
- "et pour la residence B ?" -> "Quelles sont les prescriptions pour la residence B concernant [sujet du message precedent] ?"
- "pareil pour le lot 3" -> "Quels sont les details du lot 3 pour [sujet precedent] ?"
- "et les penalites ?" -> reformuler avec le contexte complet
La rewritten_query doit etre AUTONOME (comprehensible sans historique).

## REGLES COMPARISON
Les mots suivants indiquent une COMPARAISON:
- "incoherence", "difference", "ecart", "conforme", "comparer", "entre X et Y"

## REGLES SEARCH_CONFIG
1. scope: narrow -> Question precise, max_files: 2, min_similarity: 0.5
2. scope: broad -> Vue d'ensemble, max_files: 5, min_similarity: 0.35
3. boost_documents -> Si l'utilisateur mentionne un doc explicitement
4. file_filter -> Si restriction explicite ("uniquement le CCAP")`

// ============================================================================
// INTENT STRATEGIES (hierarchy L0/L1)
// ============================================================================

// v1.1.1: EXACT copy from librarian-v4 INTENT_STRATEGY
// Do NOT change these - they are proven to work in production
const INTENT_STRATEGIES: Record<string, IntentStrategy> = {
  factual: {
    hierarchy_levels: [1],      // L1 uniquement (texte exact pour sourçage)
    include_children: false,
    mode: 'chunks',             // Jamais Gemini pour factual (risque hallucination)
  },
  citation: {
    hierarchy_levels: [1],      // L1 uniquement (texte exact)
    include_children: false,
    mode: 'chunks',
  },
  synthesis: {
    hierarchy_levels: [0],      // Chercher dans L0 (sections/résumés)
    include_children: true,     // Puis récupérer L1 enfants pour le contenu détaillé
    mode: 'chunks',
  },
  comparison: {
    hierarchy_levels: [0],      // L0 pour identifier les sections
    include_children: true,     // L1 enfants pour comparer le contenu exact
    mode: 'chunks',
  },
  conversational: {
    hierarchy_levels: [1],
    include_children: false,
    mode: 'chunks',
    skip_search: true,          // Pas de recherche pour les salutations
  },
}

const DEFAULT_STRATEGY: IntentStrategy = {
  hierarchy_levels: [1],
  include_children: false,
  mode: 'chunks',
}

export function getIntentStrategy(intent: string | undefined): IntentStrategy {
  if (!intent) return DEFAULT_STRATEGY
  return INTENT_STRATEGIES[intent] || DEFAULT_STRATEGY
}

// ============================================================================
// LOAD CONFIG (parallel brain + librarian)
// ============================================================================

export async function loadConfig(
  supabase: Supabase,
  appId: string,
  orgId?: string,
): Promise<RetrievalConfig> {
  const orgFilter = orgId
    ? `org_id.eq.${orgId},org_id.is.null`
    : 'org_id.is.null'

  // Parallel loading of brain + librarian configs
  const [brainResult, libResult] = await Promise.all([
    supabase
      .schema('config')
      .from('agent_prompts')
      .select('system_prompt, parameters')
      .eq('agent_type', 'brain_v3')
      .eq('app_id', appId)
      .eq('is_active', true)
      .or(orgFilter)
      .order('org_id', { ascending: false, nullsFirst: false })
      .limit(1)
      .single(),
    supabase
      .schema('config')
      .from('agent_prompts')
      .select('system_prompt, gemini_system_prompt, parameters')
      .eq('agent_type', 'librarian_v3')
      .eq('app_id', appId)
      .eq('is_active', true)
      .or(orgFilter)
      .order('org_id', { ascending: false, nullsFirst: false })
      .limit(1)
      .single(),
  ])

  const brain = parseBrainConfig(brainResult.data)
  const librarian = parseLibrarianConfig(libResult.data)
  const features = parseFeatureFlags(libResult.data?.parameters?.features)
  const agentic = parseAgenticConfig(libResult.data?.parameters?.agentic)
  const suggestions = parseSuggestionsConfig(libResult.data?.parameters?.suggestions)

  return { brain, librarian, features, agentic, suggestions }
}

// ============================================================================
// PARSERS (DB -> typed config)
// ============================================================================

function parseBrainConfig(data: Record<string, unknown> | null): BrainConfig {
  if (!data) return { ...FALLBACK_BRAIN, systemPrompt: FALLBACK_BRAIN_SYSTEM_PROMPT }

  const params = (data.parameters || {}) as Record<string, Record<string, unknown>>

  return {
    model: (params.model as unknown as string) || FALLBACK_BRAIN.model,
    temperature: (params.temperature as unknown as number) || FALLBACK_BRAIN.temperature,
    max_tokens: (params.max_tokens as unknown as number) || FALLBACK_BRAIN.max_tokens,
    systemPrompt: (data.system_prompt as string) || FALLBACK_BRAIN_SYSTEM_PROMPT,
    context: {
      messages_count: params.context?.messages_count as number || FALLBACK_BRAIN.context.messages_count,
      timeout_minutes: params.context?.timeout_minutes as number || FALLBACK_BRAIN.context.timeout_minutes,
      include_documents_cles: params.context?.include_documents_cles as boolean ?? FALLBACK_BRAIN.context.include_documents_cles,
    },
    analysis: {
      enable_query_rewriting: params.analysis?.enable_query_rewriting as boolean ?? FALLBACK_BRAIN.analysis.enable_query_rewriting,
      enable_intent_detection: params.analysis?.enable_intent_detection as boolean ?? FALLBACK_BRAIN.analysis.enable_intent_detection,
      enable_document_detection: params.analysis?.enable_document_detection as boolean ?? FALLBACK_BRAIN.analysis.enable_document_detection,
      enable_search_config: params.analysis?.enable_search_config as boolean ?? FALLBACK_BRAIN.analysis.enable_search_config,
    },
    routing: {
      skip_search_for_conversational: params.routing?.skip_search_for_conversational as boolean ?? FALLBACK_BRAIN.routing.skip_search_for_conversational,
      default_agent: params.routing?.default_agent as string || FALLBACK_BRAIN.routing.default_agent,
      agents: params.routing?.agents as Record<string, string[]>,
    },
    fallback: {
      on_parse_error: params.fallback?.on_parse_error as string || FALLBACK_BRAIN.fallback.on_parse_error,
      use_keywords_extraction: params.fallback?.use_keywords_extraction as boolean ?? FALLBACK_BRAIN.fallback.use_keywords_extraction,
    },
    sse: {
      send_immediate_ack: params.sse?.send_immediate_ack as boolean ?? FALLBACK_BRAIN.sse.send_immediate_ack,
      send_analysis_step: params.sse?.send_analysis_step as boolean ?? FALLBACK_BRAIN.sse.send_analysis_step,
    },
  }
}

function parseLibrarianConfig(data: Record<string, unknown> | null): LibrarianConfig {
  if (!data) return FALLBACK_LIBRARIAN

  const params = (data.parameters || {}) as Record<string, Record<string, unknown>>
  const search = params.search || {}
  const generation = params.generation || {}
  const prompts = params.prompts || {}
  const cache = params.cache || {}
  const scoring = params.scoring || {}
  const legacy = params.legacy || {}

  return {
    match_count: search.match_count as number || FALLBACK_LIBRARIAN.match_count,
    match_threshold: search.match_threshold as number || FALLBACK_LIBRARIAN.match_threshold,
    vector_weight: search.vector_weight as number || FALLBACK_LIBRARIAN.vector_weight,
    fulltext_weight: search.fulltext_weight as number || FALLBACK_LIBRARIAN.fulltext_weight,
    boost_factor: search.boost_factor as number || FALLBACK_LIBRARIAN.boost_factor,
    enable_concept_expansion: search.enable_concept_expansion as boolean ?? FALLBACK_LIBRARIAN.enable_concept_expansion,
    enable_file_scoring: search.enable_file_scoring as boolean ?? FALLBACK_LIBRARIAN.enable_file_scoring,
    min_file_score: search.min_file_score as number || FALLBACK_LIBRARIAN.min_file_score,
    intent_config: search.intent_config as Record<string, IntentParams> || FALLBACK_LIBRARIAN.intent_config,
    gemini_model: generation.gemini_model as string || FALLBACK_LIBRARIAN.gemini_model,
    gemini_max_files: generation.gemini_max_files as number || FALLBACK_LIBRARIAN.gemini_max_files,
    gemini_max_pages: generation.gemini_max_pages as number || FALLBACK_LIBRARIAN.gemini_max_pages,
    max_tokens: generation.max_tokens as number || FALLBACK_LIBRARIAN.max_tokens,
    temperature: generation.temperature as number ?? FALLBACK_LIBRARIAN.temperature,
    default_answer_format: generation.default_answer_format as string || FALLBACK_LIBRARIAN.default_answer_format,
    enable_format_detection: generation.enable_format_detection as boolean ?? FALLBACK_LIBRARIAN.enable_format_detection,
    intent_overrides: generation.intent_overrides as Record<string, GenerationOverride> || FALLBACK_LIBRARIAN.intent_overrides,
    system_prompt: data.system_prompt as string || FALLBACK_LIBRARIAN.system_prompt,
    gemini_system_prompt: data.gemini_system_prompt as string || FALLBACK_LIBRARIAN.gemini_system_prompt,
    identity: prompts.identity as LibrarianConfig['identity'] || FALLBACK_LIBRARIAN.identity,
    behavior: prompts.behavior as LibrarianConfig['behavior'] || FALLBACK_LIBRARIAN.behavior,
    restrictions: prompts.restrictions as LibrarianConfig['restrictions'] || FALLBACK_LIBRARIAN.restrictions,
    cache_ttl_minutes: cache.ttl_minutes as number || FALLBACK_LIBRARIAN.cache_ttl_minutes,
    enable_global_cache: cache.enable_global_cache as boolean ?? FALLBACK_LIBRARIAN.enable_global_cache,
    scoring_method: scoring.method as string || FALLBACK_LIBRARIAN.scoring_method,
    boost_on_mention: scoring.boost_on_mention as number || FALLBACK_LIBRARIAN.boost_on_mention,
    min_chunks_for_inclusion: scoring.min_chunks_for_inclusion as number || FALLBACK_LIBRARIAN.min_chunks_for_inclusion,
    llm_model: FALLBACK_LIBRARIAN.llm_model,
    max_context_length: search.max_context_length as number || FALLBACK_LIBRARIAN.max_context_length,
    google_file_ttl_hours: FALLBACK_LIBRARIAN.google_file_ttl_hours,
    qa_memory_similarity_threshold: legacy.qa_memory_similarity_threshold as number || FALLBACK_LIBRARIAN.qa_memory_similarity_threshold,
    qa_memory_max_results: legacy.qa_memory_max_results as number || FALLBACK_LIBRARIAN.qa_memory_max_results,
  }
}

function parseFeatureFlags(raw: unknown): FeatureFlags {
  if (!raw || typeof raw !== 'object') return FALLBACK_FEATURES
  const f = raw as Record<string, unknown>
  return {
    enable_reranking: f.enable_reranking as boolean ?? FALLBACK_FEATURES.enable_reranking,
    cohere_model: f.cohere_model as string || FALLBACK_FEATURES.cohere_model,
    cohere_top_n: f.cohere_top_n as number || FALLBACK_FEATURES.cohere_top_n,
    adaptive_threshold_enabled: f.adaptive_threshold_enabled as boolean ?? FALLBACK_FEATURES.adaptive_threshold_enabled,
    adaptive_threshold_ratio: f.adaptive_threshold_ratio as number || FALLBACK_FEATURES.adaptive_threshold_ratio,
    no_results_min_similarity: f.no_results_min_similarity as number || FALLBACK_FEATURES.no_results_min_similarity,
    use_response_format_json: f.use_response_format_json as boolean ?? FALLBACK_FEATURES.use_response_format_json,
    inject_conversation_in_generation: f.inject_conversation_in_generation as boolean ?? FALLBACK_FEATURES.inject_conversation_in_generation,
  }
}

function parseAgenticConfig(raw: unknown): AgenticConfig {
  if (!raw || typeof raw !== 'object') return FALLBACK_AGENTIC
  const a = raw as Record<string, unknown>
  return {
    enabled: a.enabled as boolean ?? FALLBACK_AGENTIC.enabled,
    model: a.model as string || FALLBACK_AGENTIC.model,
    max_iterations: a.max_iterations as number || FALLBACK_AGENTIC.max_iterations,
    timeout_ms: a.timeout_ms as number || FALLBACK_AGENTIC.timeout_ms,
    temperature: a.temperature as number ?? FALLBACK_AGENTIC.temperature,
    quality_threshold: a.quality_threshold as number || FALLBACK_AGENTIC.quality_threshold,
    similarity_threshold: a.similarity_threshold as number || FALLBACK_AGENTIC.similarity_threshold,
  }
}

function parseSuggestionsConfig(raw: unknown): SuggestionsConfig {
  if (!raw || typeof raw !== 'object') return FALLBACK_SUGGESTIONS
  const s = raw as Record<string, unknown>
  return {
    enabled: s.enabled as boolean ?? FALLBACK_SUGGESTIONS.enabled,
    model: s.model as string || FALLBACK_SUGGESTIONS.model,
    temperature: s.temperature as number ?? FALLBACK_SUGGESTIONS.temperature,
    max_count: s.max_count as number || FALLBACK_SUGGESTIONS.max_count,
    max_section_titles: s.max_section_titles as number || FALLBACK_SUGGESTIONS.max_section_titles,
    timeout_ms: s.timeout_ms as number || FALLBACK_SUGGESTIONS.timeout_ms,
    min_similarity: s.min_similarity as number ?? FALLBACK_SUGGESTIONS.min_similarity,
  }
}

// ============================================================================
// CROSS-REF CONFIG
// ============================================================================

export const CROSS_REF_CONFIG = {
  regex: {
    dtu: /\bDTU\s*(?:n[°º]?\s*)?\d+[\.\d]*/gi,
    nf: /\bNF\s*[A-Z]\s*\d+/gi,
    article: /\barticle\s+\d+[\.\d]*/gi,
    crossVerbs: /\b(comparer|conformit[eé]|conforme|v[eé]rifier|recouper|synth[eé]tiser|prescriptions?\s+du|pr[eé]voit.*concernant)\b/i,
    projectDocs: /\b(CCTP|CCAG|DOE|DPGF|planning|PV\s+de\s+r[eé]ception|m[eé]moire\s+technique)\b/gi,
  },
  search: {
    normBoost: 1.3,
    maxChunksFused: 20,
    appLayerLimit: 10,
    projectLayerLimit: 10,
  },
}

// ============================================================================
// HELPERS
// ============================================================================

export function getEffectiveGenerationParams(
  config: LibrarianConfig,
  intent: string | undefined,
): { model: string; temperature: number; maxTokens: number } {
  let model = config.gemini_model
  let temperature = config.temperature
  let maxTokens = config.max_tokens

  if (intent && config.intent_overrides?.[intent]) {
    const ov = config.intent_overrides[intent]
    if (ov.gemini_model) model = ov.gemini_model
    if (ov.temperature !== undefined) temperature = ov.temperature
    if (ov.max_tokens) maxTokens = ov.max_tokens
  }

  return { model, temperature, maxTokens }
}
