// ============================================================================
// baikal-retrieval - Generation: dispatch « extraits » par fournisseur (Sprint 3)
// ============================================================================
// providerFor(config.llm_model) choisit OpenAI ou Gemini. Gemini indisponible
// AVANT le premier token → repli OpenAI (gpt-4o-mini). Après un token, l'erreur
// remonte : le chemin rapide ne peut plus écrire une seconde réponse.
// ============================================================================

import type { LibrarianConfig } from "../types.ts"
import { providerFor, type ChunksProvider } from "../config.ts"
import { generateWithOpenAIStream } from "./openai.ts"
import { generateWithGeminiChunksStream } from "./gemini-chunks.ts"
import type { TokenUsage } from "./usage.ts"

export const FALLBACK_CHUNKS_MODEL = 'gpt-4o-mini'

export interface ChunksGenerationHooks {
  onUsage?: (u: TokenUsage) => void
  onModel?: (model: string, provider: ChunksProvider) => void
}

export interface ChunksDeps {
  openai: typeof generateWithOpenAIStream
  gemini: typeof generateWithGeminiChunksStream
}

const DEFAULT_DEPS: ChunksDeps = { openai: generateWithOpenAIStream, gemini: generateWithGeminiChunksStream }

export async function* generateChunksStream(
  query: string,
  context: string,
  systemPrompt: string,
  config: LibrarianConfig,
  keys: { openai: string; gemini: string },
  hooks: ChunksGenerationHooks = {},
  deps: ChunksDeps = DEFAULT_DEPS,
): AsyncGenerator<string, string, undefined> {
  const provider = providerFor(config.llm_model)

  if (provider === 'gemini' && keys.gemini) {
    hooks.onModel?.(config.llm_model, 'gemini')
    const gen = deps.gemini(query, context, systemPrompt, config, keys.gemini, hooks.onUsage)
    let first: IteratorResult<string, string>
    try {
      first = await gen.next()
    } catch (err) {
      console.warn(`[chunks] Gemini ${config.llm_model} indisponible avant le premier token, repli OpenAI ${FALLBACK_CHUNKS_MODEL}:`, err instanceof Error ? err.message : err)
      return yield* openaiFallback(query, context, systemPrompt, config, keys.openai, hooks, deps)
    }
    if (first.done && !first.value) {
      console.warn(`[chunks] Gemini ${config.llm_model} a rendu une réponse vide, repli OpenAI ${FALLBACK_CHUNKS_MODEL}`)
      return yield* openaiFallback(query, context, systemPrompt, config, keys.openai, hooks, deps)
    }
    let full = ''
    while (!first.done) {
      full += first.value
      yield first.value
      first = await gen.next()   // une erreur ici remonte : des tokens sont déjà partis
    }
    return full
  }

  if (provider === 'gemini') {
    console.warn(`[chunks] GEMINI_API_KEY absente : ${config.llm_model} remplacé par ${FALLBACK_CHUNKS_MODEL}`)
    return yield* openaiFallback(query, context, systemPrompt, config, keys.openai, hooks, deps)
  }

  hooks.onModel?.(config.llm_model, 'openai')
  return yield* deps.openai(query, context, systemPrompt, config, keys.openai, hooks.onUsage)
}

async function* openaiFallback(
  query: string, context: string, systemPrompt: string, config: LibrarianConfig,
  openaiKey: string, hooks: ChunksGenerationHooks, deps: ChunksDeps,
): AsyncGenerator<string, string, undefined> {
  const fallbackConfig: LibrarianConfig = { ...config, llm_model: FALLBACK_CHUNKS_MODEL }
  hooks.onModel?.(FALLBACK_CHUNKS_MODEL, 'openai')
  return yield* deps.openai(query, context, systemPrompt, fallbackConfig, openaiKey, hooks.onUsage)
}
