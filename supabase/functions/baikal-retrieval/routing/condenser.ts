// ============================================================================
// baikal-retrieval - Routing: Condenser (Sprint 1, S1.4 — P4)
// ============================================================================
// Les questions de suivi (« et dans le CCAP ? », « on peut la remplacer ? »)
// étaient embeddées brutes : le vecteur ne portait pas le sujet. On les
// réécrit en question autonome avec Gemini Flash-Lite, seulement quand
// elles sont elliptiques, avec un timeout court et un repli sur la question brute.
// ============================================================================

import type { ConversationMessage } from "../types.ts"

const FOLLOW_UP_OPENERS = /^(et|puis|ensuite|pareil|idem|aussi|donc|ok et|d'accord et|dans l'autre sens|même chose|meme chose)\b/i
const PRONOUN_OPENERS = /^(il|elle|ils|elles|on|ça|ca|c'est|c est|lui|celui|celle|ceux|celles|y)\b/i
const SHORT_WORDS = 8
const PRONOUN_MAX_WORDS = 12
const HISTORY_MESSAGES = 4
const HISTORY_CHARS = 600

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length
}

export function isElliptical(query: string): boolean {
  const q = query.trim()
  if (!q) return false
  const n = wordCount(q)
  if (n < SHORT_WORDS) return true
  if (FOLLOW_UP_OPENERS.test(q)) return true
  if (PRONOUN_OPENERS.test(q) && n <= PRONOUN_MAX_WORDS) return true
  return false
}

export function buildCondensePrompt(query: string, recent: ConversationMessage[]): string {
  // recentMessages arrive du plus récent au plus ancien (cf. analyzer.ts:126) → on remet dans l'ordre
  const history = recent
    .slice(0, HISTORY_MESSAGES)
    .slice()
    .reverse()
    .map(m => `${m.role === 'user' ? 'USER' : 'ASSISTANT'}: ${(m.content || '').substring(0, HISTORY_CHARS)}`)
    .join('\n')

  return [
    "Tu réécris la dernière question d'un conducteur de travaux en une question autonome et complète,",
    "en résolvant les références implicites (« la », « il », « et pour… ») à partir de l'historique.",
    "Conserve les termes techniques, les numéros d'article et les noms de documents tels quels.",
    "La question réécrite reformule UNIQUEMENT ce que l'utilisateur demande : n'y recopie jamais une phrase,",
    "un chiffre ou une conclusion des réponses de l'ASSISTANT — l'historique sert à retrouver le sujet, pas à répondre.",
    "Exemple : USER « Le marché est actualisable ou révisable ? » / ASSISTANT « … formule de révision à l'article 18.2 … » /",
    "DERNIÈRE QUESTION « dans le ccap ? » → « Le marché est-il actualisable ou révisable d'après le CCAP ? »",
    "Réponds uniquement par la question réécrite, sans commentaire ni guillemets.",
    "Si la question est déjà autonome, renvoie-la telle quelle.",
    "",
    "HISTORIQUE :",
    history,
    "",
    "DERNIÈRE QUESTION :",
    query.trim(),
  ].join('\n')
}

/** Garde-fou : on ne remplace la question que par une seule ligne plausible, jamais par un commentaire du modèle. */
function looksSane(candidate: string): boolean {
  const c = candidate.trim()
  if (c.length < 8 || c.length > 400) return false
  if (/\n/.test(c)) return false
  if (/^(je |voici|réécriture|question réécrite)/i.test(c)) return false
  return true
}

const COPY_WINDOW_WORDS = 8

function contentWords(s: string): string[] {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean)
}

/**
 * Garde-fou (C5-002, C5-003) : le modèle recopie parfois une phrase de la réponse précédente
 * dans la question réécrite. Toute fenêtre de 8 mots consécutifs d'un message ASSISTANT
 * retrouvée dans la réécriture vaut recopie → la question brute est conservée.
 */
export function copiesAssistant(candidate: string, recent: ConversationMessage[]): boolean {
  const cand = ' ' + contentWords(candidate).join(' ') + ' '
  for (const m of recent) {
    if (m.role !== 'assistant') continue
    const w = contentWords(m.content || '')
    for (let i = 0; i + COPY_WINDOW_WORDS <= w.length; i++) {
      if (cand.includes(' ' + w.slice(i, i + COPY_WINDOW_WORDS).join(' ') + ' ')) return true
    }
  }
  return false
}

export async function condenseQuery(
  query: string,
  recent: ConversationMessage[],
  geminiApiKey: string,
  opts: { model?: string; timeoutMs?: number } = {},
): Promise<string> {
  const model = opts.model ?? 'gemini-2.5-flash-lite'
  const timeoutMs = opts.timeoutMs ?? 800
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: buildCondensePrompt(query, recent) }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 80 },
      }),
    })
    if (!response.ok) {
      console.warn(`[condenser] HTTP ${response.status}, question brute conservée`)
      return query
    }
    const data = await response.json()
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    const candidate = text.replace(/^["«\s]+|["»\s]+$/g, '').trim()
    if (!looksSane(candidate)) {
      console.warn(`[condenser] réponse suspecte ignorée: "${candidate.substring(0, 80)}"`)
      return query
    }
    if (copiesAssistant(candidate, recent)) {
      console.warn(`[condenser] réécriture qui recopie la réponse précédente, question brute conservée: "${candidate.substring(0, 80)}"`)
      return query
    }
    console.log(`[condenser] "${query.substring(0, 50)}" → "${candidate.substring(0, 80)}"`)
    return candidate
  } catch (err) {
    console.warn(`[condenser] échec (${err instanceof Error ? err.name : 'erreur'}), question brute conservée`)
    return query
  } finally {
    clearTimeout(timer)
  }
}
