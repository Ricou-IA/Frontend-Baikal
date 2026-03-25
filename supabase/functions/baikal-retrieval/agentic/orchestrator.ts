// ============================================================================
// baikal-retrieval v2.0 - Agentic: Orchestrator (ReAct Loop)
// ============================================================================
//
// Core agentic loop:
//   1. Send query + context to Gemini 2.5 Flash (with tools)
//   2. If Gemini returns a tool_call → execute it, feed results back
//   3. If Gemini returns text → stream final response to user via SSE
//   4. Repeat up to max_iterations or timeout
//
// SSE events emitted for frontend visibility:
//   - { step: 'agent_thinking', message: '...' }
//   - { step: 'agent_searching', message: '🔍 Recherche dans le CCAP...' }
//   - { step: 'agent_found', message: '3 résultats trouvés dans le CCAP' }
//   - { step: 'generating', message: '✨ Rédaction de la réponse...' }
// ============================================================================

import type {
  Supabase, AgenticConfig, LibrarianConfig, FeatureFlags,
  ChunkResult, FileInfo, SearchResult, AgentContext,
  AgenticStep, SourceItem, DocumentCle,
} from "../types.ts"
import {
  callGeminiAgent,
  streamGeminiAgentResponse,
  buildInitialMessages,
  appendToolCallToHistory,
  appendToolResultToHistory,
  formatChunksForAgent,
} from "./gemini-agent.ts"
import { executeTool, type ToolExecutionContext } from "./tools.ts"
import { buildSourcesFromChunks } from "../sources.ts"

// ============================================================================
// TYPES
// ============================================================================

export interface AgenticResult {
  fullResponse: string
  sources: SourceItem[]
  allChunks: ChunkResult[]
  allFiles: FileInfo[]
  steps: AgenticStep[]
  iterations: number
  timedOut: boolean
}

// ============================================================================
// AGENTIC ORCHESTRATOR
// ============================================================================

export async function runAgenticLoop(
  query: string,
  context: AgentContext,
  agenticConfig: AgenticConfig,
  toolCtx: ToolExecutionContext,
  geminiApiKey: string,
  sendSSE: (event: string, data: unknown) => void,
  startTime: number,
): Promise<AgenticResult> {

  // Build context info for the agent
  const contextParts: string[] = []
  if (context.projectIdentity) {
    const pi = context.projectIdentity
    const details = [
      pi.name && `Projet: ${pi.name}`,
      pi.market_type && `Type: ${pi.market_type}`,
      pi.description && `${pi.description}`,
    ].filter(Boolean)
    if (details.length > 0) contextParts.push(`Contexte projet: ${details.join(', ')}`)
  }
  if (context.conversationSummary) {
    contextParts.push(`Résumé conversation: ${context.conversationSummary}`)
  }
  if (context.recentMessages?.length > 0) {
    const recent = context.recentMessages
      .slice(-3)
      .map(m => `${m.role === 'user' ? 'Utilisateur' : 'Assistant'}: ${m.content.substring(0, 300)}`)
      .join('\n')
    contextParts.push(`Derniers échanges:\n${recent}`)
  }
  if (context.documentsCles?.length > 0) {
    contextParts.push(`Documents clés disponibles: ${context.documentsCles.map(d => d.label).join(', ')}`)
  }

  let history = buildInitialMessages(query, contextParts.join('\n\n'))
  const allChunks: ChunkResult[] = []
  const allFiles: FileInfo[] = []
  const steps: AgenticStep[] = []
  let iterations = 0
  let timedOut = false

  // ==========================================
  // REACT LOOP
  // ==========================================

  while (iterations < agenticConfig.max_iterations) {
    // Check timeout
    const elapsed = Date.now() - startTime
    if (elapsed > agenticConfig.timeout_ms) {
      console.log(`[agentic] Timeout reached (${elapsed}ms > ${agenticConfig.timeout_ms}ms) at iteration ${iterations}`)
      timedOut = true
      break
    }

    iterations++
    console.log(`[agentic] Iteration ${iterations}/${agenticConfig.max_iterations}`)

    // Call Gemini with tools
    sendSSE('step', { step: 'agent_thinking', message: `Réflexion (étape ${iterations})...` })

    const turn = await callGeminiAgent(query, history, agenticConfig, geminiApiKey)

    if (turn.type === 'text') {
      // Gemini decided to respond — we're done with the loop
      // The final text will be streamed separately
      console.log(`[agentic] Gemini chose to respond at iteration ${iterations}`)
      break
    }

    // Tool call
    const toolName = turn.name!
    const toolArgs = turn.args || {}

    console.log(`[agentic] Tool call: ${toolName}(${JSON.stringify(toolArgs).substring(0, 100)})`)

    // SSE: show what the agent is doing
    const searchLabel = getToolLabel(toolName, toolArgs)
    sendSSE('step', { step: 'agent_searching', message: searchLabel })

    // Execute the tool
    const stepStart = Date.now()
    const toolResult = await executeTool(toolName, toolArgs, toolCtx)
    const stepDuration = Date.now() - stepStart

    // Collect chunks
    allChunks.push(...toolResult.chunks)
    allFiles.push(...toolResult.files)

    // SSE: show results
    sendSSE('step', { step: 'agent_found', message: toolResult.summary })

    // Record step
    steps.push({
      iteration: iterations,
      tool_call: { name: toolName, args: toolArgs },
      result_summary: toolResult.summary,
      chunks_found: toolResult.chunks.length,
      elapsed_ms: stepDuration,
    })

    // Update conversation history for Gemini
    history = appendToolCallToHistory(history, toolName, toolArgs)
    const toolResultText = formatChunksForAgent(toolResult.chunks)
    history = appendToolResultToHistory(history, toolName, toolResultText)
  }

  // ==========================================
  // FINAL GENERATION (streaming)
  // ==========================================

  sendSSE('step', { step: 'generating', message: 'Rédaction de la réponse...' })

  // If we timed out or exhausted iterations without a text response,
  // force a final generation by removing tools
  let fullResponse = ''

  const generator = streamGeminiAgentResponse(history, agenticConfig, geminiApiKey)

  for await (const token of generator) {
    fullResponse += token
    sendSSE('token', { content: token })
  }

  // Deduplicate chunks by chunk_id
  const uniqueChunks = deduplicateChunks(allChunks)
  const sources = buildSourcesFromChunks(uniqueChunks)

  return {
    fullResponse,
    sources,
    allChunks: uniqueChunks,
    allFiles: deduplicateFiles(allFiles),
    steps,
    iterations,
    timedOut,
  }
}

// ============================================================================
// QUALITY GATE: Should we trigger agentic or use fast path?
// ============================================================================

export function shouldTriggerAgentic(
  chunks: ChunkResult[],
  agenticConfig: AgenticConfig,
): boolean {
  if (!agenticConfig.enabled) return false

  // Not enough chunks → agentic
  if (chunks.length < agenticConfig.quality_threshold) {
    console.log(`[agentic] Triggered: only ${chunks.length} chunks (threshold: ${agenticConfig.quality_threshold})`)
    return true
  }

  // Low average similarity → agentic
  const avgSimilarity = chunks.reduce((sum, c) => sum + c.similarity, 0) / chunks.length
  if (avgSimilarity < agenticConfig.similarity_threshold) {
    console.log(`[agentic] Triggered: avg similarity ${avgSimilarity.toFixed(3)} < ${agenticConfig.similarity_threshold}`)
    return true
  }

  console.log(`[agentic] Fast path OK: ${chunks.length} chunks, avg similarity ${avgSimilarity.toFixed(3)}`)
  return false
}

// ============================================================================
// HELPERS
// ============================================================================

function getToolLabel(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case 'search_documents':
      return `🔍 Recherche: "${(args.query as string || '').substring(0, 50)}..."`
    case 'list_project_files':
      return '📋 Liste des documents du projet...'
    case 'search_in_file':
      return `🔍 Recherche dans ${args.file_name}: "${(args.query as string || '').substring(0, 40)}..."`
    default:
      return `🔧 ${toolName}...`
  }
}

function deduplicateChunks(chunks: ChunkResult[]): ChunkResult[] {
  const seen = new Set<number>()
  return chunks.filter(c => {
    if (c.chunk_id < 0) return true  // Synthetic chunks (list_project_files)
    if (seen.has(c.chunk_id)) return false
    seen.add(c.chunk_id)
    return true
  })
}

function deduplicateFiles(files: FileInfo[]): FileInfo[] {
  const seen = new Set<string>()
  return files.filter(f => {
    if (seen.has(f.file_id)) return false
    seen.add(f.file_id)
    return true
  })
}
