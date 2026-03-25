// ============================================================================
// baikal-retrieval - Types unifies
// ============================================================================

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

export type Supabase = SupabaseClient

// ============================================================================
// REQUEST / RESPONSE
// ============================================================================

export interface RequestBody {
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
  enable_suggestions?: boolean
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface IntentParams {
  max_files: number
  min_similarity: number
  match_count: number
}

export interface GenerationOverride {
  gemini_model?: string
  temperature?: number
  max_tokens?: number
}

export interface FeatureFlags {
  enable_reranking: boolean
  cohere_model: string
  cohere_top_n: number
  adaptive_threshold_enabled: boolean
  adaptive_threshold_ratio: number
  no_results_min_similarity: number
  use_response_format_json: boolean
  inject_conversation_in_generation: boolean
}

export interface BrainConfig {
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

export interface LibrarianConfig {
  match_count: number
  match_threshold: number
  vector_weight: number
  fulltext_weight: number
  boost_factor: number
  enable_concept_expansion: boolean
  enable_file_scoring: boolean
  min_file_score: number
  intent_config: Record<string, IntentParams>
  gemini_model: string
  gemini_max_files: number
  gemini_max_pages: number
  max_tokens: number
  temperature: number
  default_answer_format: string
  enable_format_detection: boolean
  intent_overrides: Record<string, GenerationOverride>
  system_prompt: string
  gemini_system_prompt: string
  identity: { name: string; role: string; personality: string }
  behavior: { citation_style: string; response_language: string; tone: string; verbosity: string }
  restrictions: { out_of_scope_message: string; no_data_message: string }
  cache_ttl_minutes: number
  enable_global_cache: boolean
  llm_model: string
  max_context_length: number
  google_file_ttl_hours: number
  qa_memory_similarity_threshold: number
  qa_memory_max_results: number
  scoring_method: string
  boost_on_mention: number
  min_chunks_for_inclusion: number
}

export interface RetrievalConfig {
  brain: BrainConfig
  librarian: LibrarianConfig
  features: FeatureFlags
  agentic: AgenticConfig
  suggestions: SuggestionsConfig
}

// ============================================================================
// CONTEXT
// ============================================================================

export interface AgentContext {
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
  recentMessages: ConversationMessage[]
  messageCount: number
  previousSourceFileIds: string[]
  documentsCles: DocumentCle[]
}

export interface ConversationMessage {
  role: string
  content: string
  created_at: string
  sources?: unknown[]
}

export interface DocumentCle {
  slug: string
  label: string
}

// ============================================================================
// ROUTING / ANALYSIS
// ============================================================================

export type Intent = 'synthesis' | 'factual' | 'comparison' | 'citation' | 'conversational'
export type AnswerFormat = 'paragraph' | 'list' | 'table' | 'quote'
export type SearchScope = 'narrow' | 'broad'

export interface SearchConfig {
  scope: SearchScope
  max_files: number
  min_similarity: number
  boost_documents: string[]
  file_filter: string[] | null
}

export interface AnalysisResult {
  intent: Intent
  requires_search: boolean
  rewritten_query: string
  detected_documents: string[]
  search_config: SearchConfig
  answer_format: AnswerFormat
  key_concepts: string[]
  reasoning: string
  cross_ref?: CrossRefAnalysis
}

export interface SafeAnalysisOverride {
  requires_search: boolean
  intent: Intent
  was_overridden: boolean
}

export type RouteDecision = 'conversational' | 'search' | 'external_agent'

// ============================================================================
// CROSS-REFERENCING
// ============================================================================

export type CrossRefMode = 'compare' | 'synthesize' | 'compliance'

export interface CrossRefAction {
  type: CrossRefMode
  label: string
  description: string
  documents: string[]
  prompt_hint: string
}

export interface CrossRefAnalysis {
  is_cross_ref: boolean
  cross_ref_type: CrossRefMode | null
  detected_documents: string[]
  detected_norms: string[]
  detected_lot: string | null
  suggested_actions: CrossRefAction[]
  detection_method: 'heuristic' | 'llm'
}

// ============================================================================
// SEARCH
// ============================================================================

export interface IntentStrategy {
  hierarchy_levels: number[]
  include_children: boolean
  mode: 'chunks' | 'gemini' | 'auto'
  skip_search?: boolean
}

export interface ChunkResult {
  chunk_id: number
  content: string
  similarity: number
  metadata: Record<string, unknown>
  layer: string
  source_file_id: string | null
  matched_concepts: string[]
  rank_score: number
  match_source: string
  filter_applied: boolean
  file_storage_path: string | null
  file_storage_bucket: string | null
  file_original_filename: string | null
  file_mime_type: string | null
  file_total_pages: number
  file_max_similarity: number | null
  file_chunk_count: number | null
  hierarchy_level: number
  parent_chunk_id: number | null
  retrieval_role: 'primary' | 'child'
  section_title: string | null
}

export interface FileInfo {
  file_id: string
  storage_path: string
  storage_bucket: string
  original_filename: string
  mime_type: string
  total_pages: number
  max_similarity: number
  avg_similarity: number
  chunk_count: number
  layer: string
  score: number
  is_boosted: boolean
}

// v1.1.1: Matches librarian-v4 SearchResult interface
export interface SearchResult {
  chunks: ChunkResult[]
  files: FileInfo[]
  meetingChunks: ChunkResult[]
  totalPages: number
  filterApplied: boolean
  fallbackUsed: boolean        // v1.1.1: replaces noRelevantResults (matches lib-v4)
  reranked: boolean
}

// ============================================================================
// QA MEMORY
// ============================================================================

export interface QAMemoryResult {
  id: string
  question_text: string
  answer_text: string
  similarity: number
  is_expert_faq: boolean
  expert_source: string | null
  trust_score: number
  usage_count: number
  source_file_ids: string[] | null
  created_by: string | null
  created_at: string
}

// ============================================================================
// GENERATION
// ============================================================================

export interface EffectiveGenerationParams {
  model: string
  temperature: number
  maxTokens: number
}

// ============================================================================
// SOURCES
// ============================================================================

export interface SourceItem {
  id?: string | number
  type: string
  source_file_id: string | null
  document_name: string
  score: number
  layer: string
  content_preview: string | null
  section_title?: string | null
  hierarchy_level?: number
  page?: number
}

// ============================================================================
// AGENTIC
// ============================================================================

export interface AgenticConfig {
  enabled: boolean
  model: string                    // "gemini-2.5-flash" for tool-calling
  max_iterations: number           // Max tool calls (default: 3)
  timeout_ms: number               // Budget total (default: 8000)
  temperature: number              // For orchestrator reasoning (default: 0.2)
  quality_threshold: number        // Min chunks to skip agentic (default: 3)
  similarity_threshold: number     // Min avg similarity to skip agentic (default: 0.45)
}

export interface ToolCall {
  name: string
  args: Record<string, unknown>
}

export interface ToolResult {
  name: string
  chunks: ChunkResult[]
  files: FileInfo[]
  summary: string                  // Short description for SSE step display
}

export interface AgenticStep {
  iteration: number
  tool_call: ToolCall
  result_summary: string
  chunks_found: number
  elapsed_ms: number
}

// ============================================================================
// SUGGESTIONS
// ============================================================================

export interface SuggestionItem {
  text: string             // Follow-up question (< 80 chars, French)
  source_hint: string      // Document or section that inspired this
}

export interface SuggestionsConfig {
  enabled: boolean
  model: string            // LLM for generation (default: "gpt-4o-mini")
  temperature: number      // Creativity (default: 0.4)
  max_count: number        // Number of suggestions (default: 3)
  max_section_titles: number  // Max unique section_titles to feed (default: 15)
  timeout_ms: number       // Abort if exceeds this (default: 3000)
  min_similarity: number   // Min chunk similarity to include (default: 0.35)
}

// ============================================================================
// METRICS
// ============================================================================

export interface PipelineMetrics {
  timings: Record<string, number>
  decisions: {
    intent: string
    requires_search: boolean
    llm_requires_search: boolean
    safe_override_applied: boolean
    generation_mode: string
    reranking_applied: boolean
    adaptive_threshold_applied: boolean
    no_results_detected: boolean
    memory_hit: boolean
    agentic_triggered: boolean
    agentic_iterations: number
  }
  counts: {
    total_chunks: number
    l0_chunks: number
    l1_chunks: number
    child_chunks: number
    files_count: number
    total_pages: number
    sources_count: number
  }
}
