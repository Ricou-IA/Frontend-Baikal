// ============================================================================
// baikal-retrieval - Surcharges d'évaluation (Sprint 3, S3.2)
// ============================================================================
// Le banc d'éval (service_role) compare plusieurs modèles de génération sans
// modifier config.agent_prompts : `eval_overrides: { llm_model }` dans le corps.
// Tout autre appelant : ignoré et journalisé — jamais un 4xx (ARPET n'envoie
// jamais ce champ ; un client qui l'enverrait n'obtient rien).
// ============================================================================

import type { LibrarianConfig } from "./types.ts"

export interface EvalOverrides {
  llm_model?: string
}

const MODEL_NAME = /^[a-z0-9][a-z0-9.\-]{1,63}$/i

export function applyEvalOverrides(
  librarian: LibrarianConfig,
  overrides: unknown,
  callerKind: 'service' | 'user' | 'anonymous',
): { librarian: LibrarianConfig; applied: string[]; ignored: string[] } {
  if (!overrides || typeof overrides !== 'object') return { librarian, applied: [], ignored: [] }
  const o = overrides as Record<string, unknown>
  const applied: string[] = []
  const ignored: string[] = []
  let result = librarian

  if ('llm_model' in o) {
    const v = o.llm_model
    if (callerKind === 'service' && typeof v === 'string' && MODEL_NAME.test(v)) {
      result = { ...result, llm_model: v }
      applied.push('llm_model')
    } else {
      ignored.push('llm_model')
    }
  }
  return { librarian: result, applied, ignored }
}
