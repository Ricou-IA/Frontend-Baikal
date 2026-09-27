// ============================================================================
// baikal-retrieval - Réglages de réflexion Gemini (v2.5.0)
// ============================================================================
// Les tokens de réflexion comptent dans maxOutputTokens et dans la latence : sans
// réglage, un Gemini 3.x réfléchit ~100-250 tokens même sur une question triviale.
// Les réglages acceptés varient d'un modèle à l'autre (relevé du 27/09/2026) :
//   thinkingBudget 0 : ok 3.5-flash, 3.8-flash, 3.1-flash-lite ; 400 sur 3.5-flash-lite, 3.1-pro
//   thinkingLevel minimal : ok 3.5-flash, 3.5-flash-lite, 3.1-flash-lite ; 400 sur 3.8-flash, 3.1-pro
// → une liste de réglages essayés dans l'ordre, le suivant sur un 400.
// 2.x : comportement historique (budget 0, *-pro sans thinkingConfig, plancher 128).
// ============================================================================

export type ThinkingConfig = { thinkingBudget: number } | { thinkingLevel: string }

const GEMINI_3_PLUS = /^gemini-[3-9]/i
const PRO = /-pro\b/i
const LITE = /-lite\b/i

// Profil « sans réflexion » (génération sur extraits, lecture intégrale, condensation).
// `budget` > 0 : budget explicite (banc d'éval, generation.gemini_thinking_budget).
export function thinkingCandidates(model: string, budget = 0): (ThinkingConfig | undefined)[] {
  const b = Number.isFinite(budget) ? Math.max(0, Math.floor(budget)) : 0
  const pro = PRO.test(model)
  if (GEMINI_3_PLUS.test(model)) {
    if (pro) return b > 0 ? [{ thinkingBudget: Math.max(128, b) }, { thinkingLevel: 'low' }] : [{ thinkingLevel: 'low' }]
    if (b > 0) return [{ thinkingBudget: b }, { thinkingLevel: 'low' }]
    // *-lite : minimal d'abord (3.5-flash-lite refuse le budget 0) ; sinon budget 0 d'abord
    // (3.8-flash refuse minimal) — un aller-retour de moins sur le modèle retenu.
    return LITE.test(model)
      ? [{ thinkingLevel: 'minimal' }, { thinkingBudget: 0 }, { thinkingLevel: 'low' }]
      : [{ thinkingBudget: 0 }, { thinkingLevel: 'minimal' }, { thinkingLevel: 'low' }]
  }
  if (pro) return [b > 0 ? { thinkingBudget: Math.max(128, b) } : undefined]
  return [{ thinkingBudget: b }]
}

// Profil « agent » (appels d'outils) : réflexion basse sur 3.x ; 2.x inchangé (réflexion
// dynamique par défaut, pas de thinkingConfig).
export function agentThinkingCandidates(model: string): (ThinkingConfig | undefined)[] {
  if (GEMINI_3_PLUS.test(model)) return [{ thinkingLevel: 'low' }, { thinkingBudget: 512 }]
  return [undefined]
}

// POST vers Gemini en essayant chaque réglage : un 400 passe au suivant, toute autre
// réponse (succès ou erreur) est rendue telle quelle à l'appelant. Le corps est
// reconstruit pour chaque essai (`makeBody(thinkingConfig)`).
export async function fetchGeminiWithThinking(
  url: string,
  makeBody: (thinkingConfig: ThinkingConfig | undefined) => Record<string, unknown>,
  candidates: (ThinkingConfig | undefined)[],
  makeSignal: () => AbortSignal | undefined,
  fetchFn: typeof fetch = fetch,
): Promise<Response> {
  let response: Response | null = null
  for (let i = 0; i < candidates.length; i++) {
    response = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeBody(candidates[i])),
      signal: makeSignal(),
    })
    if (response.status !== 400 || i === candidates.length - 1) return response
    await response.body?.cancel()
    console.warn(`[gemini-thinking] réglage ${JSON.stringify(candidates[i])} refusé, essai suivant`)
  }
  return response!
}

// Ajoute thinkingConfig à un generationConfig quand il est défini.
export function withThinking(generationConfig: Record<string, unknown>, tc: ThinkingConfig | undefined): Record<string, unknown> {
  return tc ? { ...generationConfig, thinkingConfig: tc } : generationConfig
}
