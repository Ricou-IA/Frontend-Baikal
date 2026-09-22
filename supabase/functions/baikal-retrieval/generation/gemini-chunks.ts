// ============================================================================
// baikal-retrieval - Generation: Gemini sur extraits (Sprint 3, S3.2)
// ============================================================================
// Même contrat que generation/openai.ts : prompt système + contexte formaté
// (formatContext) en instruction système, question en message utilisateur,
// tokens streamés. Réflexion coupée (thinkingBudget 0) pour tenir le budget de
// latence ; les modèles *-pro refusent 0 → pas de thinkingConfig.
// ============================================================================

import type { LibrarianConfig } from "../types.ts"
import { usageFromGemini, type TokenUsage } from "./usage.ts"

export function thinkingConfigFor(model: string): { thinkingBudget: number } | undefined {
  return /-pro\b/i.test(model) ? undefined : { thinkingBudget: 0 }
}

export function buildGeminiChunksBody(
  query: string,
  context: string,
  systemPrompt: string,
  config: LibrarianConfig,
): Record<string, unknown> {
  const thinkingConfig = thinkingConfigFor(config.llm_model)
  return {
    systemInstruction: { parts: [{ text: systemPrompt + '\n\n' + context }] },
    contents: [{ role: 'user', parts: [{ text: query }] }],
    generationConfig: {
      temperature: config.temperature,
      maxOutputTokens: config.max_tokens,
      ...(thinkingConfig ? { thinkingConfig } : {}),
    },
  }
}

export async function* generateWithGeminiChunksStream(
  query: string,
  context: string,
  systemPrompt: string,
  config: LibrarianConfig,
  geminiApiKey: string,
  onUsage?: (u: TokenUsage) => void,
  fetchFn: typeof fetch = fetch,
): AsyncGenerator<string, string, undefined> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.llm_model}:streamGenerateContent?alt=sse&key=${geminiApiKey}`
  const response = await fetchFn(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildGeminiChunksBody(query, context, systemPrompt, config)),
    signal: AbortSignal.timeout(120_000),
  })

  if (!response.ok) {
    throw new Error(`Gemini chunks error (${response.status}): ${await response.text()}`)
  }
  const reader = response.body?.getReader()
  if (!reader) throw new Error("No response body reader")

  const decoder = new TextDecoder()
  let fullContent = ''
  let buffer = ''
  let lastUsage: TokenUsage | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data: ')) continue
      try {
        const json = JSON.parse(trimmed.slice(6))
        const u = usageFromGemini(json)
        if (u) lastUsage = u
        const parts = json.candidates?.[0]?.content?.parts as Array<{ text?: string }> | undefined
        for (const p of parts ?? []) {
          if (p.text) { fullContent += p.text; yield p.text }
        }
      } catch {
        // événement SSE malformé : ignoré
      }
    }
  }
  if (lastUsage) onUsage?.(lastUsage)
  return fullContent
}
