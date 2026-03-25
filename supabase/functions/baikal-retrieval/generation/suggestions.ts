// ============================================================================
// baikal-retrieval - Generation: Follow-up Suggestions
// ============================================================================
//
// Generates 3-4 contextual follow-up questions based on the chunks found.
// Uses gpt-4o-mini (non-streaming, JSON output) for speed.
// Target: < 1.5s latency. Non-fatal: errors return empty array.
//
// SSE event format:
//   event: suggestions
//   data: { "suggestions": [{ "text": "...", "source_hint": "..." }] }
// ============================================================================

import type { ChunkResult, SuggestionItem, SuggestionsConfig, AnalysisResult } from "../types.ts"

// ============================================================================
// EXTRACT SECTION CONTEXT FROM CHUNKS
// ============================================================================

function extractSectionContext(
  chunks: ChunkResult[],
  maxTitles: number,
): { titles: string[]; fileNames: string[] } {
  const titlesSet = new Set<string>()
  const fileNamesSet = new Set<string>()

  for (const chunk of chunks) {
    if (chunk.file_original_filename) {
      fileNamesSet.add(chunk.file_original_filename)
    }
    if (chunk.section_title && titlesSet.size < maxTitles) {
      titlesSet.add(chunk.section_title)
    }
  }

  return {
    titles: Array.from(titlesSet),
    fileNames: Array.from(fileNamesSet),
  }
}

// ============================================================================
// BUILD PROMPT
// ============================================================================

function buildSuggestionsPrompt(
  query: string,
  sectionTitles: string[],
  fileNames: string[],
  analysis: AnalysisResult,
  maxCount: number,
): string {
  return `Tu es un assistant documentaire BTP. L'utilisateur vient de poser cette question :
"${query}"

Voici les SECTIONS trouvees dans les documents du projet :
${sectionTitles.map(t => `- ${t}`).join('\n')}

Documents disponibles : ${fileNames.join(', ')}
Intent detecte : ${analysis.intent}
${analysis.key_concepts?.length > 0 ? `Concepts cles : ${analysis.key_concepts.join(', ')}` : ''}

Genere exactement ${maxCount} questions de suivi CONTEXTUELLES que l'utilisateur pourrait poser ensuite.

REGLES :
- Chaque question doit etre directement liee a une section/theme REEL des documents (pas de themes inventes)
- Chaque question doit etre en francais, courte (max 80 caracteres), actionnable
- Les questions doivent explorer des SOUS-THEMES differents de la question initiale
- NE PAS reformuler la question initiale
- NE PAS poser de questions generiques ("Avez-vous d'autres questions ?")
- source_hint DOIT etre le NOM DU DOCUMENT (ex: "CCAP Travaux", "Norme NFP03-001", "CCAG"), PAS un numero de section

Reponds UNIQUEMENT en JSON valide :
{
  "suggestions": [
    { "text": "Question courte en francais ?", "source_hint": "Nom du document" }
  ]
}`
}

// ============================================================================
// GENERATE SUGGESTIONS (main export)
// ============================================================================

export async function generateSuggestions(
  query: string,
  chunks: ChunkResult[],
  analysis: AnalysisResult,
  suggestionsConfig: SuggestionsConfig,
  openaiApiKey: string,
): Promise<SuggestionItem[]> {
  if (!suggestionsConfig.enabled) return []
  if (chunks.length === 0) return []

  // Filter chunks by similarity to avoid suggestions based on irrelevant results
  const minSimilarity = suggestionsConfig.min_similarity ?? 0.35
  const relevantChunks = chunks.filter(c => c.similarity >= minSimilarity)
  if (relevantChunks.length === 0) {
    console.log(`[suggestions] Skipped: 0/${chunks.length} chunks above similarity ${minSimilarity}`)
    return []
  }
  console.log(`[suggestions] ${relevantChunks.length}/${chunks.length} chunks above similarity ${minSimilarity}`)

  const { titles, fileNames } = extractSectionContext(
    relevantChunks,
    suggestionsConfig.max_section_titles,
  )

  // Need at least 2 section titles to generate meaningful suggestions
  if (titles.length < 2) {
    console.log(`[suggestions] Skipped: only ${titles.length} section title(s)`)
    return []
  }

  const prompt = buildSuggestionsPrompt(
    query, titles, fileNames, analysis, suggestionsConfig.max_count,
  )

  // Race against timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(
    () => controller.abort(),
    suggestionsConfig.timeout_ms,
  )

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: suggestionsConfig.model,
        messages: [
          { role: "user", content: prompt },
        ],
        temperature: suggestionsConfig.temperature,
        max_tokens: 512,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      console.error(`[suggestions] OpenAI error: ${response.status}`)
      return []
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) return []

    const parsed = JSON.parse(content)
    const suggestions: SuggestionItem[] = (parsed.suggestions || [])
      .slice(0, suggestionsConfig.max_count)
      .map((s: { text: string; source_hint?: string }) => ({
        text: (s.text || '').substring(0, 80),
        source_hint: s.source_hint || '',
      }))
      .filter((s: SuggestionItem) => s.text.length > 0)

    console.log(`[suggestions] Generated ${suggestions.length} suggestions`)
    return suggestions

  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      console.warn(`[suggestions] Timed out after ${suggestionsConfig.timeout_ms}ms`)
    } else {
      console.error('[suggestions] Error:', err)
    }
    return []
  } finally {
    clearTimeout(timeoutId)
  }
}
