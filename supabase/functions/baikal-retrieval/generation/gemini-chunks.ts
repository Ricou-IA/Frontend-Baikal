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

const REGLE_DE_FORME =
  "\n\nREGLE DE FORME (Gemini) : dans les tableaux markdown, n'aligne JAMAIS les colonnes avec des espaces ; une seule espace de chaque cote du contenu d'une cellule. Pas de lignes vides repetees. Pas de lignes de separation de tableau plus longues que necessaire (trois tirets par colonne suffisent)."

export function buildGeminiChunksBody(
  query: string,
  context: string,
  systemPrompt: string,
  config: LibrarianConfig,
): Record<string, unknown> {
  const thinkingConfig = thinkingConfigFor(config.llm_model)
  return {
    systemInstruction: { parts: [{ text: systemPrompt + '\n\n' + context + REGLE_DE_FORME }] },
    contents: [{ role: 'user', parts: [{ text: query }] }],
    generationConfig: {
      temperature: config.temperature,
      maxOutputTokens: config.max_tokens,
      ...(thinkingConfig ? { thinkingConfig } : {}),
    },
  }
}

// Longueur de la séquence du DERNIER caractère de `text`, en reportant l'état
// `prev` ({ ch, n }) de la séquence qui se terminait le morceau précédent :
// si `text` est entièrement composé de `prev.ch`, la séquence se prolonge
// (n = prev.n + text.length) ; sinon elle repart de la séquence finale du
// dernier caractère de `text`. `text` vide → `prev` inchangé.
export function repeatRun(prev: { ch: string; n: number }, text: string): { ch: string; n: number } {
  if (text.length === 0) return prev
  if (prev.ch !== '' && [...text].every(c => c === prev.ch)) {
    return { ch: prev.ch, n: prev.n + text.length }
  }
  return longestRepeatRunDetail(text, true)
}

// Détail (caractère + longueur) de la plus longue séquence d'un même caractère
// répété dans `text`. `fromEnd` restreint la recherche à la séquence finale
// (utilisé par `repeatRun`) plutôt qu'à la plus longue séquence globale.
function longestRepeatRunDetail(text: string, fromEnd = false): { ch: string; n: number } {
  if (text.length === 0) return { ch: '', n: 0 }
  if (fromEnd) {
    const lastChar = text[text.length - 1]
    let n = 1
    for (let i = text.length - 2; i >= 0 && text[i] === lastChar; i--) n++
    return { ch: lastChar, n }
  }
  let bestCh = text[0]
  let best = 1
  let curCh = text[0]
  let cur = 1
  for (let i = 1; i < text.length; i++) {
    if (text[i] === curCh) { cur++ } else { curCh = text[i]; cur = 1 }
    if (cur > best) { best = cur; bestCh = curCh }
  }
  return { ch: bestCh, n: best }
}

export const MAX_REPEAT_RUN = 200
// Alias conservé pour compatibilité (ancien nom de la garde, désormais générique).
export const MAX_WHITESPACE_RUN = MAX_REPEAT_RUN

// Plus longue séquence d'un même caractère répété trouvée n'importe où DANS
// `text` (pas seulement en fin de morceau) : 0 si `text` est vide.
export function longestRepeatRun(text: string): number {
  return longestRepeatRunDetail(text).n
}

export async function* generateWithGeminiChunksStream(
  query: string,
  context: string,
  systemPrompt: string,
  config: LibrarianConfig,
  geminiApiKey: string,
  onUsage?: (u: TokenUsage) => void,
  fetchFn: typeof fetch = fetch,
  onRunaway?: () => void,
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
  let runState: { ch: string; n: number } = { ch: '', n: 0 }
  let runaway = false

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
          if (!p.text) continue
          const nextRun = repeatRun(runState, p.text)
          const interior = longestRepeatRunDetail(p.text)
          if (Math.max(nextRun.n, longestRepeatRun(p.text)) > MAX_REPEAT_RUN) {
            const reported = nextRun.n >= interior.n ? nextRun : interior
            console.warn('[gemini-chunks] boucle de répétition détectée (« ' + reported.ch + ' » × ' + reported.n + '), flux interrompu')
            onRunaway?.()
            await reader.cancel()
            runaway = true
            break
          }
          runState = nextRun
          fullContent += p.text
          yield p.text
        }
      } catch {
        // événement SSE malformé : ignoré
      }
      if (runaway) break
    }
    if (runaway) break
  }
  if (runaway) {
    fullContent += '\n'
    yield '\n'
  }
  if (lastUsage) onUsage?.(lastUsage)
  return fullContent
}
