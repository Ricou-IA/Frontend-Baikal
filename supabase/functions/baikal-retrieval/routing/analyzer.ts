// ============================================================================
// baikal-retrieval - Routing: Query Analyzer (LLM-based)
// ============================================================================

import type {
  AgentContext, BrainConfig, AnalysisResult, FeatureFlags,
  Intent, AnswerFormat, DocumentCle,
} from "../types.ts"
import { safeRequiresSearch, detectIntentByKeywords, extractKeywords } from "./safety.ts"
import { detectCrossRef } from "./cross-ref.ts"

// ============================================================================
// ANALYZE QUERY
// ============================================================================

export async function analyzeQuery(
  query: string,
  context: AgentContext,
  brainConfig: BrainConfig,
  features: FeatureFlags,
  openaiApiKey: string,
): Promise<AnalysisResult> {
  const userMessage = buildAnalysisMessage(query, context)

  try {
    const body: Record<string, unknown> = {
      model: brainConfig.model,
      messages: [
        { role: "system", content: brainConfig.systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: brainConfig.temperature,
      max_tokens: brainConfig.max_tokens,
    }

    // Improvement B: response_format for reliable JSON
    if (features.use_response_format_json) {
      body.response_format = { type: "json_object" }
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      throw new Error(`OpenAI error: ${await response.text()}`)
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content || ''

    const parsed = parseAnalysisJSON(content, features.use_response_format_json)

    // Apply safety override on requires_search + intent
    const llmRequiresSearch = parsed.requires_search ?? true
    const llmIntent = parsed.intent || 'factual'
    const safeOverride = safeRequiresSearch(query, llmRequiresSearch, llmIntent)

    const result: AnalysisResult = {
      intent: safeOverride.intent,
      requires_search: safeOverride.requires_search,
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

    // Cross-ref: heuristic detection on rewritten query (LLM fallback path)
    const crossRef = detectCrossRef(result.rewritten_query || query)
    if (crossRef.is_cross_ref) {
      result.cross_ref = crossRef
      // Merge cross-ref detected documents into analysis detected_documents
      const merged = [...new Set([...result.detected_documents, ...crossRef.detected_documents])]
      result.detected_documents = merged
      console.log(`[retrieval] Cross-ref detected (LLM path): norms=[${crossRef.detected_norms.join(', ')}], lot=${crossRef.detected_lot}`)
    }

    return result
  } catch (error) {
    console.error('[retrieval] Analysis error, using fallback:', error)
    if (brainConfig.fallback.use_keywords_extraction) {
      return buildFallbackAnalysis(query, context.documentsCles)
    }
    throw error
  }
}

// ============================================================================
// BUILD ANALYSIS MESSAGE (with anaphora resolution instructions)
// ============================================================================

function buildAnalysisMessage(query: string, context: AgentContext): string {
  const parts: string[] = []

  // Project context
  if (context.projectIdentity && Object.keys(context.projectIdentity).length > 0) {
    const details: string[] = []
    const pi = context.projectIdentity
    if (pi.market_type) details.push(`Type de marche: ${pi.market_type}`)
    if (pi.project_type) details.push(`Type de projet: ${pi.project_type}`)
    if (pi.description) details.push(`Description: ${pi.description}`)
    if (details.length > 0) {
      parts.push(`CONTEXTE PROJET:\n${details.join('\n')}`)
    }
  }

  // Conversation history (for anaphora resolution)
  if (context.recentMessages && context.recentMessages.length > 0) {
    let conversationContext = ''
    if (context.conversationSummary) {
      conversationContext += `RESUME DE LA CONVERSATION:\n${context.conversationSummary}\n\n`
    }
    const messages = context.recentMessages
      .slice().reverse()
      .map(m => `${m.role === 'user' ? 'USER' : 'ASSISTANT'}: ${m.content.substring(0, 800)}`)
      .join('\n\n')
    conversationContext += messages
    parts.push(`HISTORIQUE CONVERSATION:\n${conversationContext}`)
  }

  // Available documents
  if (context.documentsCles.length > 0) {
    const docsList = context.documentsCles.map(d => d.label).join(', ')
    parts.push(`DOCUMENTS CLES DISPONIBLES:\n${docsList}`)
  }

  parts.push(`QUESTION UTILISATEUR:\n${query}`)

  return parts.join('\n\n')
}

// ============================================================================
// JSON PARSING
// ============================================================================

function parseAnalysisJSON(content: string, useResponseFormat: boolean): Record<string, unknown> {
  if (useResponseFormat) {
    // response_format guarantees valid JSON
    return JSON.parse(content.trim())
  }

  // Legacy regex fallback
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON in response')
  return JSON.parse(jsonMatch[0])
}

// ============================================================================
// FALLBACK ANALYSIS
// ============================================================================

export function buildFallbackAnalysis(
  query: string,
  documentsCles: DocumentCle[],
): AnalysisResult {
  const detectedIntent = detectIntentByKeywords(query)
  const safeOverride = safeRequiresSearch(query, false, detectedIntent)

  const searchConfigs: Record<string, AnalysisResult['search_config']> = {
    factual: { scope: 'narrow', max_files: 2, min_similarity: 0.42, boost_documents: [], file_filter: null },
    synthesis: { scope: 'broad', max_files: 5, min_similarity: 0.35, boost_documents: [], file_filter: null },
    comparison: { scope: 'broad', max_files: 5, min_similarity: 0.35, boost_documents: [], file_filter: null },
    citation: { scope: 'narrow', max_files: 1, min_similarity: 0.6, boost_documents: [], file_filter: null },
    conversational: { scope: 'narrow', max_files: 0, min_similarity: 0.5, boost_documents: [], file_filter: null },
  }

  const formatMap: Record<string, AnswerFormat> = {
    factual: 'paragraph', synthesis: 'paragraph', comparison: 'table', citation: 'quote', conversational: 'paragraph',
  }

  const detectedDocs = documentsCles
    .filter(d => {
      const q = query.toLowerCase()
      return q.includes(d.slug.toLowerCase()) || q.includes(d.label.toLowerCase())
    })
    .map(d => d.label)

  // Cross-ref heuristic detection (sync, 0ms — no I/O)
  // V1: projectNorms and projectLots are undefined (regex covers 70-80% of cases)
  const crossRef = detectCrossRef(query)

  const result: AnalysisResult = {
    intent: safeOverride.intent,
    requires_search: safeOverride.requires_search,
    rewritten_query: query,
    detected_documents: detectedDocs,
    search_config: searchConfigs[safeOverride.intent] || searchConfigs.factual,
    answer_format: formatMap[safeOverride.intent] || 'paragraph',
    key_concepts: extractKeywords(query),
    reasoning: 'Fallback: analyse par mots-cles',
  }

  if (crossRef.is_cross_ref) {
    result.cross_ref = crossRef
    // Merge cross-ref detected documents into detected_documents
    const merged = [...new Set([...result.detected_documents, ...crossRef.detected_documents])]
    result.detected_documents = merged
    // Force search when cross-ref is detected
    result.requires_search = true
    console.log(`[retrieval] Cross-ref detected (heuristic): norms=[${crossRef.detected_norms.join(', ')}], docs=[${crossRef.detected_documents.join(', ')}], lot=${crossRef.detected_lot}`)
  }

  return result
}
