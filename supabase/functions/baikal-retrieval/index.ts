// ============================================================================
// baikal-retrieval v2.0.0 - "Agentic RAG"
// ============================================================================
//
// Evolution from v1.3.0 "Search-First, Analyze-Later":
//   - Phase A (fast path): rule-based analysis → search → generate (~4.5s)
//     PRESERVED: works exactly like v1.3 when results are good enough
//   - Phase B (agentic): Gemini 2.5 Flash tool-calling loop
//     NEW: replaces old widening when results are insufficient
//     The LLM iteratively searches, evaluates, and refines until satisfied
//
// Agentic tools:
//   - search_documents:  Hybrid search (reuses match_documents_v14)
//   - list_project_files: List available files in the project
//   - search_in_file:    Search within a specific file (cross-doc)
//
// SSE events for frontend:
//   - step: agent_thinking / agent_searching / agent_found / generating
//   - token: streaming response tokens
//   - sources: final citations + metrics
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

import type { RequestBody, PipelineMetrics, SourceItem, AnalysisResult } from "./types.ts"
import { corsHeaders, sseHeaders, sendSSE, errorResponse } from "./utils.ts"
import { createTimer } from "./utils.ts"
import { loadConfig, getIntentStrategy, getEffectiveGenerationParams } from "./config.ts"
import { getAgentContext, addMessage } from "./context.ts"
import { analyzeQuery, buildFallbackAnalysis } from "./routing/analyzer.ts"
import { resolveRoute, buildConversationalResponse } from "./routing/router.ts"
import { generateEmbedding } from "./search/embedding.ts"
import { searchQAMemory, incrementQAUsage } from "./search/memory.ts"
import { executeSearch, executeCrossRefSearch } from "./search/retrieval.ts"
import { rerankIfEnabled } from "./search/reranker.ts"
import { buildSystemPrompt, formatContext, buildMeetingContext } from "./generation/prompt.ts"
import { generateWithOpenAIStream } from "./generation/openai.ts"
import { generateWithGeminiStream, getOrUploadGoogleFile, getOrCreateGlobalCache } from "./generation/gemini.ts"
import { buildSourcesFromFiles, buildSourcesFromChunks } from "./sources.ts"
import { generateSuggestions } from "./generation/suggestions.ts"

// v2.0: Agentic imports
import { runAgenticLoop, shouldTriggerAgentic } from "./agentic/orchestrator.ts"
import type { ToolExecutionContext } from "./agentic/tools.ts"

// ============================================================================
// ENV
// ============================================================================

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

// ============================================================================
// LATENCY THRESHOLDS (alarme observabilite)
// ============================================================================

const LATENCY_THRESHOLD_MS = {
  fast: 5_000,       // fast path = ~5s cible
  agentic: 10_000,   // agentic = +5s tolerance
}

function warnIfSlow(
  totalMs: number,
  mode: 'fast' | 'agentic',
  query: string,
  timings: Record<string, number>,
): void {
  const threshold = LATENCY_THRESHOLD_MS[mode]
  if (totalMs > threshold) {
    console.warn(
      `[retrieval] SLOW_REQUEST mode=${mode} total=${totalMs}ms threshold=${threshold}ms ` +
      `query="${query.substring(0, 80).replace(/\n/g, ' ')}" timings=${JSON.stringify(timings)}`,
    )
  }
}

// ============================================================================
// MODE LABELS
// ============================================================================

const MODE_LABELS: Record<string, { ui: string; icon: string }> = {
  gemini: { ui: 'Full Document', icon: '📄' },
  chunks: { ui: 'RAG Chunks', icon: '🧩' },
  memory: { ui: 'Memoire Collective', icon: '🧠' },
  agentic: { ui: 'Recherche Intelligente', icon: '🧠' },
}

// ============================================================================
// GENERATION MODE ROUTING
// ============================================================================

function resolveGenerationMode(
  requestedMode: string | undefined,
  analysis: AnalysisResult
): 'chunks' | 'gemini' | 'auto' {
  if (requestedMode && requestedMode !== 'auto') {
    console.log(`[retrieval] generation_mode: '${requestedMode}' (explicite depuis frontend)`)
    return requestedMode as 'chunks' | 'gemini'
  }

  const fullDocIntents: AnalysisResult['intent'][] = ['synthesis', 'citation']

  if (fullDocIntents.includes(analysis.intent) && analysis.detected_documents.length > 0) {
    console.log(`[retrieval] 📄 generation_mode: 'gemini' (intent=${analysis.intent}, docs=[${analysis.detected_documents.join(', ')}])`)
    return 'gemini'
  }

  if (analysis.intent === 'comparison' && analysis.detected_documents.length > 0) {
    console.log(`[retrieval] 📄 generation_mode: 'gemini' (comparison avec docs=[${analysis.detected_documents.join(', ')}])`)
    return 'gemini'
  }

  console.log(`[retrieval] generation_mode: 'auto' (intent=${analysis.intent}, docs=${analysis.detected_documents.length})`)
  return 'auto'
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const body: RequestBody = await req.json()
    const {
      query, user_id, org_id, project_id,
      app_id = 'arpet', conversation_id,
      generation_mode = 'auto', stream = true,
      include_app_layer = true, include_org_layer = true,
      include_project_layer = true, include_user_layer = false,
      filter_source_types,
      enable_suggestions = false,
    } = body

    if (!query?.trim()) return errorResponse("Query is required")
    if (!user_id) return errorResponse("user_id is required")

    console.log(`[retrieval] === v2.0.0 Agentic === Query: "${query.substring(0, 60)}..."`)

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const timer = createTimer()
    const layerFlags = { app: include_app_layer, org: include_org_layer, project: include_project_layer, user: include_user_layer }

    const sseStream = new ReadableStream({
      async start(controller) {
        const metrics: PipelineMetrics = {
          timings: {},
          decisions: {
            intent: '', requires_search: true, llm_requires_search: true,
            safe_override_applied: false, generation_mode: '',
            reranking_applied: false, adaptive_threshold_applied: false,
            no_results_detected: false, memory_hit: false,
            agentic_triggered: false, agentic_iterations: 0,
          },
          counts: {
            total_chunks: 0, l0_chunks: 0, l1_chunks: 0,
            child_chunks: 0, files_count: 0, total_pages: 0, sources_count: 0,
          },
        }

        try {
          sendSSE(controller, 'step', { step: 'received', message: 'Question reçue' })

          // =============================================================
          // PHASE A — FAST PATH (rule-based, no LLM analysis)
          // Target: < 5s total for standard factual queries
          // =============================================================

          // A1. CONFIG
          const config = await loadConfig(supabase, app_id, org_id)
          metrics.timings.config = timer.mark('config')

          // A2. PARALLEL: context + initial embedding (on raw query)
          sendSSE(controller, 'step', { step: 'analyzing', message: 'Analyse de la question...' })

          const [context, initialEmbedding] = await Promise.all([
            getAgentContext(supabase, user_id, org_id, project_id, app_id, conversation_id, config.brain),
            generateEmbedding(query, OPENAI_API_KEY),
          ])
          metrics.timings.context_embed = timer.mark('context_embed')

          await addMessage(supabase, context.conversationId, 'user', query)

          // A3. ANALYSIS — LLM brain if enabled (query rewriting + intent + doc detection),
          // else rule-based keyword fallback. analyzeQuery has its own internal fallback to
          // buildFallbackAnalysis on OpenAI error when use_keywords_extraction is true.
          let fastAnalysis: AnalysisResult
          let queryEmbedding = initialEmbedding

          if (config.brain.analysis.enable_query_rewriting) {
            try {
              fastAnalysis = await analyzeQuery(query, context, config.brain, config.features, OPENAI_API_KEY)
              metrics.timings.brain_analysis = timer.mark('brain_analysis')

              // Re-embed if rewritten query is meaningfully different (anaphora resolution case).
              const rewritten = fastAnalysis.rewritten_query?.trim()
              if (rewritten && rewritten !== query.trim()) {
                console.log(`[retrieval] Query rewritten: "${query.substring(0, 60)}" -> "${rewritten.substring(0, 80)}"`)
                queryEmbedding = await generateEmbedding(rewritten, OPENAI_API_KEY)
                metrics.timings.reembedding = timer.mark('reembedding')
              }
            } catch (err) {
              console.warn('[retrieval] Brain LLM analysis threw, using rule-based fallback:', err)
              fastAnalysis = buildFallbackAnalysis(query, context.documentsCles)
            }
          } else {
            fastAnalysis = buildFallbackAnalysis(query, context.documentsCles)
          }

          const intentStrategy = getIntentStrategy(fastAnalysis.intent)

          metrics.decisions.intent = fastAnalysis.intent
          metrics.decisions.requires_search = fastAnalysis.requires_search
          console.log(`[retrieval] Fast-path: intent=${fastAnalysis.intent}, strategy=${JSON.stringify(intentStrategy.hierarchy_levels)}, children=${intentStrategy.include_children}`)

          // A4. ROUTING DECISION
          const route = resolveRoute(fastAnalysis, config.brain)

          if (route === 'conversational') {
            const response = buildConversationalResponse(query, context, config.brain)
            for (const word of response.split(' ')) {
              sendSSE(controller, 'token', { content: word + ' ' })
            }
            const processingTime = timer.elapsed
            await addMessage(supabase, context.conversationId, 'assistant', response, [], 'conversational', processingTime)
            sendSSE(controller, 'sources', {
              sources: [], conversation_id: context.conversationId,
              generation_mode: 'conversational', processing_time_ms: processingTime,
              timings: metrics.timings,
            })
            sendSSE(controller, 'done', {})
            controller.close()
            return
          }

          // A5. QA MEMORY (fast circuit-breaker)
          const memoryOrgId = context.effectiveOrgId || org_id
          if (memoryOrgId) {
            sendSSE(controller, 'step', { step: 'memory', message: 'Mémoire collective...' })
            const memoryResult = await searchQAMemory(supabase, queryEmbedding, memoryOrgId, project_id, config.librarian)
            metrics.timings.memory = timer.mark('memory')

            if (memoryResult) {
              metrics.decisions.memory_hit = true
              for (const word of memoryResult.answer_text.split(' ')) {
                sendSSE(controller, 'token', { content: word + ' ' })
              }
              await incrementQAUsage(supabase, memoryResult.id)
              const processingTime = timer.elapsed
              await addMessage(supabase, context.conversationId, 'assistant', memoryResult.answer_text, [], 'memory', processingTime)
              sendSSE(controller, 'sources', {
                sources: [{ id: memoryResult.id, type: 'qa_memory', document_name: 'Memoire', score: memoryResult.similarity, layer: 'memory', source_file_id: null, content_preview: null }],
                conversation_id: context.conversationId,
                generation_mode: 'memory', processing_time_ms: processingTime,
                from_memory: true,
                timings: metrics.timings,
              })
              sendSSE(controller, 'done', {})
              controller.close()
              return
            }
          }

          // A5b. SSE ANALYSIS EVENT (with cross_ref if detected)
          if (fastAnalysis.cross_ref?.is_cross_ref) {
            sendSSE(controller, 'analysis', {
              intent: fastAnalysis.intent,
              rewritten_query: fastAnalysis.rewritten_query,
              detected_documents: fastAnalysis.detected_documents,
              reasoning: fastAnalysis.reasoning,
              cross_ref: fastAnalysis.cross_ref,
            })
          }

          // A6. SEARCH (with fast-path analysis)
          sendSSE(controller, 'step', { step: 'search', message: 'Recherche documentaire...' })

          let searchResult: Awaited<ReturnType<typeof executeSearch>>
          if (fastAnalysis.cross_ref?.is_cross_ref) {
            console.log(`[retrieval] Cross-ref search activated`)
            searchResult = await executeCrossRefSearch(
              supabase, queryEmbedding, query, user_id, context.effectiveOrgId,
              project_id, context.effectiveAppId, config.librarian,
              filter_source_types,
              fastAnalysis.search_config, fastAnalysis.intent, intentStrategy,
              fastAnalysis.cross_ref,
            )
          } else {
            searchResult = await executeSearch(
              supabase, queryEmbedding, query, user_id, context.effectiveOrgId,
              project_id, context.effectiveAppId, config.librarian,
              layerFlags, filter_source_types,
              fastAnalysis.search_config, fastAnalysis.intent, intentStrategy, config.features,
            )
          }
          metrics.timings.search = timer.mark('search')

          // A7. RERANKING (feature-flagged)
          searchResult = await rerankIfEnabled(searchResult, query, config.features)
          metrics.decisions.reranking_applied = searchResult.reranked
          metrics.timings.rerank = timer.mark('rerank')

          // =============================================================
          // DECISION: Fast Path (v1.3) vs Agentic (v2.0)
          // =============================================================

          const useAgentic = shouldTriggerAgentic(searchResult.chunks, config.agentic)

          if (useAgentic && GEMINI_API_KEY) {
            // ===========================================================
            // PHASE B — AGENTIC RAG (Gemini tool-calling loop)
            // ===========================================================
            console.log(`[retrieval] === AGENTIC MODE ===`)
            metrics.decisions.agentic_triggered = true

            sendSSE(controller, 'step', { step: 'agentic_start', message: '🧠 Recherche intelligente activée...' })

            // Build tool execution context (reuses existing modules)
            const toolCtx: ToolExecutionContext = {
              supabase,
              queryEmbedding,
              userId: user_id,
              effectiveOrgId: context.effectiveOrgId,
              projectId: project_id,
              effectiveAppId: context.effectiveAppId,
              config: config.librarian,
              features: config.features,
              layerFlags,
              filterSourceTypes: filter_source_types,
              openaiApiKey: OPENAI_API_KEY,
              documentsCles: context.documentsCles,
            }

            // SSE wrapper for the orchestrator
            const sseSender = (event: string, data: unknown) => sendSSE(controller, event, data)

            const agenticResult = await runAgenticLoop(
              query, context, config.agentic, toolCtx,
              GEMINI_API_KEY, sseSender, timer.startTime,
            )

            metrics.timings.agentic = timer.mark('agentic')
            metrics.decisions.agentic_iterations = agenticResult.iterations
            metrics.decisions.generation_mode = 'agentic'
            metrics.counts.total_chunks = agenticResult.allChunks.length
            metrics.counts.l0_chunks = agenticResult.allChunks.filter(c => c.hierarchy_level === 0).length
            metrics.counts.l1_chunks = agenticResult.allChunks.filter(c => c.hierarchy_level === 1).length
            metrics.counts.files_count = agenticResult.allFiles.length
            metrics.counts.sources_count = agenticResult.sources.length

            // SUGGESTIONS (optional, non-blocking)
            if (enable_suggestions && config.suggestions.enabled && agenticResult.allChunks.length > 0) {
              try {
                const suggestions = await generateSuggestions(
                  query, agenticResult.allChunks, fastAnalysis,
                  config.suggestions, OPENAI_API_KEY,
                )
                if (suggestions.length > 0) {
                  sendSSE(controller, 'suggestions', { suggestions })
                }
                metrics.timings.suggestions = timer.mark('suggestions')
              } catch (err) {
                console.warn('[retrieval] Suggestions failed (non-fatal):', err)
              }
            }

            // FINALIZE
            const processingTime = timer.elapsed
            await addMessage(supabase, context.conversationId, 'assistant', agenticResult.fullResponse, agenticResult.sources, 'agentic', processingTime)
            metrics.timings.total = processingTime

            console.log(`[retrieval] Agentic done in ${processingTime}ms (${agenticResult.iterations} iterations, timed_out=${agenticResult.timedOut})`)
            warnIfSlow(processingTime, 'agentic', query, metrics.timings)

            sendSSE(controller, 'sources', {
              sources: agenticResult.sources,
              conversation_id: context.conversationId,
              generation_mode: 'agentic',
              generation_mode_ui: MODE_LABELS.agentic.ui,
              processing_time_ms: processingTime,
              files_count: agenticResult.allFiles.length,
              chunks_count: agenticResult.allChunks.length,
              intent: fastAnalysis.intent,
              answer_format: fastAnalysis.answer_format,
              agentic: {
                iterations: agenticResult.iterations,
                timed_out: agenticResult.timedOut,
                steps: agenticResult.steps,
              },
              fast_path: false,
              metrics,
              timings: metrics.timings,
            })

            sendSSE(controller, 'done', {})
            controller.close()
            return
          }

          // =============================================================
          // FAST PATH (v1.3 behavior preserved)
          // Results are good enough — generate directly
          // =============================================================

          sendSSE(controller, 'step', { step: 'files_found', message: `${searchResult.files.length} document(s) trouvés` })

          // SUGGESTIONS: launch early in parallel with generation
          let suggestionsPromise: Promise<import("./types.ts").SuggestionItem[]> | null = null
          if (enable_suggestions && config.suggestions.enabled && searchResult.chunks.length > 0) {
            suggestionsPromise = generateSuggestions(
              query, searchResult.chunks, fastAnalysis,
              config.suggestions, OPENAI_API_KEY,
            ).catch(err => {
              console.warn('[retrieval] Suggestions failed (non-fatal):', err)
              return []
            })
          }

          let effectiveAnalysis: AnalysisResult = fastAnalysis

          // Update counts
          metrics.counts.total_chunks = searchResult.chunks.length
          metrics.counts.l0_chunks = searchResult.chunks.filter(c => c.hierarchy_level === 0).length
          metrics.counts.l1_chunks = searchResult.chunks.filter(c => c.hierarchy_level === 1).length
          metrics.counts.child_chunks = searchResult.chunks.filter(c => c.retrieval_role === 'child').length
          metrics.counts.files_count = searchResult.files.length
          metrics.counts.total_pages = searchResult.totalPages

          // MODE DECISION
          const activeIntentStrategy = intentStrategy
          const resolvedMode = resolveGenerationMode(generation_mode, effectiveAnalysis)
          let effectiveMode = resolvedMode
          if (resolvedMode === 'auto') {
            if (activeIntentStrategy.mode === 'chunks') {
              effectiveMode = 'chunks'
            } else if (searchResult.files.length === 0) {
              effectiveMode = 'chunks'
            } else if (searchResult.totalPages <= config.librarian.gemini_max_pages && GEMINI_API_KEY) {
              effectiveMode = 'gemini'
            } else {
              effectiveMode = 'chunks'
            }
          }
          metrics.decisions.generation_mode = effectiveMode

          const modeInfo = MODE_LABELS[effectiveMode] || MODE_LABELS.chunks
          sendSSE(controller, 'step', { step: 'mode', message: `${modeInfo.icon} Mode ${modeInfo.ui}` })

          // GENERATION
          let fullResponse = ''
          let cacheWasReused = false
          const meetingContext = buildMeetingContext(searchResult.meetingChunks)
          const effectiveGenParams = getEffectiveGenerationParams(config.librarian, effectiveAnalysis.intent)

          if (effectiveMode === 'gemini' && searchResult.files.length > 0) {
            try {
              const geminiPrompt = buildSystemPrompt(
                config.librarian.gemini_system_prompt || context.geminiSystemPrompt,
                context, searchResult.files, effectiveAnalysis.intent,
                effectiveAnalysis.answer_format, effectiveAnalysis.key_concepts, true, config.features,
              )

              sendSSE(controller, 'step', { step: 'uploading', message: 'Upload fichiers...' })
              const googleUris = await Promise.all(
                searchResult.files.map(f => getOrUploadGoogleFile(supabase, f, config.librarian.google_file_ttl_hours)),
              )
              metrics.timings.upload = timer.mark('upload')

              sendSSE(controller, 'step', { step: 'caching', message: 'Cache global...' })
              const cacheResult = await getOrCreateGlobalCache(
                supabase, searchResult.files, googleUris, geminiPrompt,
                config.librarian, context.effectiveOrgId, app_id, effectiveGenParams.model,
              )
              cacheWasReused = cacheResult.wasReused
              metrics.timings.cache = timer.mark('cache')

              sendSSE(controller, 'step', { step: 'generating', message: 'Génération...' })
              const generator = generateWithGeminiStream(
                effectiveAnalysis.rewritten_query || query, cacheResult.cacheName,
                effectiveGenParams, meetingContext,
              )

              for await (const token of generator) {
                fullResponse += token
                sendSSE(controller, 'token', { content: token })
              }
            } catch (geminiError) {
              console.error('[retrieval] Gemini error, fallback chunks:', geminiError)
              effectiveMode = 'chunks'
              metrics.decisions.generation_mode = 'chunks'

              const systemPrompt = buildSystemPrompt(
                config.librarian.system_prompt || context.systemPrompt,
                context, [], effectiveAnalysis.intent,
                effectiveAnalysis.answer_format, effectiveAnalysis.key_concepts, false, config.features,
              )
              const ctx = formatContext(searchResult.chunks, config.librarian.max_context_length)
              const generator = generateWithOpenAIStream(
                effectiveAnalysis.rewritten_query || query, ctx, systemPrompt,
                config.librarian, OPENAI_API_KEY,
              )
              for await (const token of generator) {
                fullResponse += token
                sendSSE(controller, 'token', { content: token })
              }
            }
          } else {
            // Chunks mode (default for factual/citation)
            const systemPrompt = buildSystemPrompt(
              config.librarian.system_prompt || context.systemPrompt,
              context, [], effectiveAnalysis.intent,
              effectiveAnalysis.answer_format, effectiveAnalysis.key_concepts, false, config.features,
            )
            const ctx = formatContext(searchResult.chunks, config.librarian.max_context_length)

            sendSSE(controller, 'step', { step: 'generating', message: 'Génération...' })
            const generator = generateWithOpenAIStream(
              effectiveAnalysis.rewritten_query || query, ctx, systemPrompt,
              config.librarian, OPENAI_API_KEY,
            )
            for await (const token of generator) {
              fullResponse += token
              sendSSE(controller, 'token', { content: token })
            }
          }

          metrics.timings.generation = timer.mark('generation')

          // SUGGESTIONS: await the parallel promise (launched before generation)
          if (suggestionsPromise) {
            const suggestions = await suggestionsPromise
            if (suggestions.length > 0) {
              sendSSE(controller, 'suggestions', { suggestions })
            }
            metrics.timings.suggestions = timer.mark('suggestions')
          }

          // SOURCES
          let finalSources: SourceItem[]
          if (effectiveMode === 'gemini' && searchResult.files.length > 0) {
            finalSources = buildSourcesFromFiles(searchResult.files)
          } else {
            finalSources = buildSourcesFromChunks(searchResult.chunks)
          }
          metrics.counts.sources_count = finalSources.length

          // FINALIZE
          const processingTime = timer.elapsed
          await addMessage(supabase, context.conversationId, 'assistant', fullResponse, finalSources, effectiveMode, processingTime)
          metrics.timings.total = processingTime

          console.log(`[retrieval] Fast-path done in ${processingTime}ms: ${JSON.stringify(metrics.timings)}`)
          warnIfSlow(processingTime, 'fast', query, metrics.timings)

          sendSSE(controller, 'sources', {
            sources: finalSources,
            conversation_id: context.conversationId,
            generation_mode: effectiveMode,
            generation_mode_ui: modeInfo.ui,
            processing_time_ms: processingTime,
            files_count: searchResult.files.length,
            chunks_count: searchResult.chunks.length,
            total_pages: searchResult.totalPages,
            cache_reused: cacheWasReused,
            intent: effectiveAnalysis.intent,
            answer_format: effectiveAnalysis.answer_format,
            rewritten_query: effectiveAnalysis.rewritten_query,
            file_filter_applied: searchResult.filterApplied,
            effective_model: effectiveGenParams.model,
            hierarchy_strategy: {
              levels: activeIntentStrategy.hierarchy_levels,
              include_children: activeIntentStrategy.include_children,
            },
            fast_path: true,
            agentic: null,
            cross_ref: effectiveAnalysis.cross_ref || null,
            metrics,
            timings: metrics.timings,
          })

          sendSSE(controller, 'done', {})
          controller.close()

        } catch (error) {
          console.error('[retrieval] Pipeline error:', error)
          sendSSE(controller, 'error', { error: error instanceof Error ? error.message : 'Internal error' })
          controller.close()
        }
      },
    })

    return new Response(sseStream, { headers: sseHeaders })

  } catch (error) {
    console.error("[retrieval] Fatal error:", error)
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500)
  }
})
