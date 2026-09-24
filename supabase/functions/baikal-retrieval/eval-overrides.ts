// ============================================================================
// baikal-retrieval - Surcharges d'évaluation (Sprint 3 S3.2, Sprint 4 v2)
// ============================================================================
// Le banc d'éval (service_role) mesure des variantes sans modifier config.agent_prompts :
// `eval_overrides: { llm_model, gemini_thinking_budget, enable_reranking }` dans le corps.
// Tout autre appelant : ignoré et journalisé — jamais un 4xx (ARPET n'envoie jamais ce champ).
// ============================================================================

import type { FeatureFlags, LibrarianConfig } from "./types.ts"

export interface EvalOverrides {
  llm_model?: string
  gemini_thinking_budget?: number
  enable_reranking?: boolean
}

const MODEL_NAME = /^[a-z0-9][a-z0-9.\-]{1,63}$/i
const THINKING_BUDGET_MAX = 24576   // plafond Gemini 2.5 Flash

export function applyEvalOverrides(
  librarian: LibrarianConfig,
  features: FeatureFlags,
  overrides: unknown,
  callerKind: 'service' | 'user' | 'anonymous',
): { librarian: LibrarianConfig; features: FeatureFlags; applied: string[]; ignored: string[] } {
  if (!overrides || typeof overrides !== 'object') return { librarian, features, applied: [], ignored: [] }
  const o = overrides as Record<string, unknown>
  const applied: string[] = []
  const ignored: string[] = []
  let lib = librarian
  let feat = features
  const service = callerKind === 'service'

  if ('llm_model' in o) {
    const v = o.llm_model
    if (service && typeof v === 'string' && MODEL_NAME.test(v)) { lib = { ...lib, llm_model: v }; applied.push('llm_model') }
    else ignored.push('llm_model')
  }
  if ('gemini_thinking_budget' in o) {
    const v = o.gemini_thinking_budget
    if (service && typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= THINKING_BUDGET_MAX) {
      lib = { ...lib, gemini_thinking_budget: v }; applied.push('gemini_thinking_budget')
    } else ignored.push('gemini_thinking_budget')
  }
  if ('enable_reranking' in o) {
    const v = o.enable_reranking
    if (service && typeof v === 'boolean') { feat = { ...feat, enable_reranking: v }; applied.push('enable_reranking') }
    else ignored.push('enable_reranking')
  }
  return { librarian: lib, features: feat, applied, ignored }
}
