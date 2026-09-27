// ============================================================================
// baikal-retrieval - Generation: OpenAI Streaming (chunks mode)
// ============================================================================

import type { LibrarianConfig } from "../types.ts"
import { type TokenUsage, usageFromOpenAI } from "./usage.ts"

// ============================================================================
// REQUEST BODY
// ============================================================================
// `max_completion_tokens` et non `max_tokens` : accepté par tous les modèles de chat
// (gpt-4o-mini compris), alors que les modèles récents refusent `max_tokens`. Certains
// modèles n'acceptent que leur température par défaut : `withTemperature: false`.

export function buildOpenAIBody(
  query: string,
  context: string,
  systemPrompt: string,
  config: LibrarianConfig,
  opts: { withTemperature?: boolean } = {},
): Record<string, unknown> {
  return {
    model: config.llm_model,
    messages: [
      { role: "system", content: systemPrompt + '\n\n' + context },
      { role: "user", content: query },
    ],
    ...(opts.withTemperature === false ? {} : { temperature: config.temperature }),
    max_completion_tokens: config.max_tokens,
    stream: true,
    stream_options: { include_usage: true },
  }
}

// Un 400 qui refuse la température → un second essai sans elle ; toute autre erreur remonte.
function refusesTemperature(status: number, text: string): boolean {
  return status === 400 && /temperature/i.test(text)
}

// ============================================================================
// STREAM GENERATE
// ============================================================================

export async function* generateWithOpenAIStream(
  query: string,
  context: string,
  systemPrompt: string,
  config: LibrarianConfig,
  openaiApiKey: string,
  onUsage?: (u: TokenUsage) => void,
  fetchFn: typeof fetch = fetch,
): AsyncGenerator<string, string, undefined> {
  const send = (withTemperature: boolean) => fetchFn("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildOpenAIBody(query, context, systemPrompt, config, { withTemperature })),
    signal: AbortSignal.timeout(120_000),
  })

  let response = await send(true)
  if (!response.ok) {
    const text = await response.text()
    if (!refusesTemperature(response.status, text)) throw new Error(`OpenAI error: ${text}`)
    console.warn(`[openai] ${config.llm_model} refuse la température, second essai sans elle`)
    response = await send(false)
    if (!response.ok) throw new Error(`OpenAI error: ${await response.text()}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error("No response body reader")

  const decoder = new TextDecoder()
  let fullContent = ''
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed === 'data: [DONE]' || !trimmed.startsWith('data: ')) continue

      try {
        const json = JSON.parse(trimmed.slice(6))
        const usage = usageFromOpenAI(json)
        if (usage) onUsage?.(usage)
        const content = json.choices?.[0]?.delta?.content
        if (content) {
          fullContent += content
          yield content
        }
      } catch {
        // skip malformed chunks
      }
    }
  }

  return fullContent
}
