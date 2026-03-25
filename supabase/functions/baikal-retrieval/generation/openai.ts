// ============================================================================
// baikal-retrieval - Generation: OpenAI Streaming (chunks mode)
// ============================================================================

import type { LibrarianConfig } from "../types.ts"

// ============================================================================
// STREAM GENERATE
// ============================================================================

export async function* generateWithOpenAIStream(
  query: string,
  context: string,
  systemPrompt: string,
  config: LibrarianConfig,
  openaiApiKey: string,
): AsyncGenerator<string, string, undefined> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.llm_model,
      messages: [
        { role: "system", content: systemPrompt + '\n\n' + context },
        { role: "user", content: query },
      ],
      temperature: config.temperature,
      max_tokens: config.max_tokens,
      stream: true,
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI error: ${await response.text()}`)
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
