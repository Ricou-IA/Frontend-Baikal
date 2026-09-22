// ============================================================================
// baikal-retrieval - Generation: consommation de tokens (Sprint 3)
// ============================================================================
// Chaque appel de génération (OpenAI extraits, Gemini extraits, Gemini fichiers,
// boucle agentique) remonte ses tokens ; index.ts les cumule dans
// metrics.counts.tokens_in / tokens_out / llm_calls, rag.query_logs.counts et le
// payload SSE `sources.usage`. Le coût est calculé côté banc (grille de prix).
// ============================================================================

export interface TokenUsage {
  input_tokens: number
  output_tokens: number
  calls: number
}

export const EMPTY_USAGE: TokenUsage = { input_tokens: 0, output_tokens: 0, calls: 0 }

export function addUsage(a: TokenUsage, b: TokenUsage | null | undefined): TokenUsage {
  if (!b) return a
  return { input_tokens: a.input_tokens + b.input_tokens, output_tokens: a.output_tokens + b.output_tokens, calls: a.calls + b.calls }
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/** Événement OpenAI (stream_options.include_usage) : le dernier porte `usage`. */
export function usageFromOpenAI(json: unknown): TokenUsage | null {
  const usage = (json as { usage?: Record<string, unknown> } | null)?.usage
  if (!usage || typeof usage !== 'object') return null
  return { input_tokens: num(usage.prompt_tokens), output_tokens: num(usage.completion_tokens), calls: 1 }
}

/** Événement Gemini : `usageMetadata` (les tokens de réflexion sont facturés en sortie). */
export function usageFromGemini(json: unknown): TokenUsage | null {
  const meta = (json as { usageMetadata?: Record<string, unknown> } | null)?.usageMetadata
  if (!meta || typeof meta !== 'object') return null
  return {
    input_tokens: num(meta.promptTokenCount),
    output_tokens: num(meta.candidatesTokenCount) + num(meta.thoughtsTokenCount),
    calls: 1,
  }
}
