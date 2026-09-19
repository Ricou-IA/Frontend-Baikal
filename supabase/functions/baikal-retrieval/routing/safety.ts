// ============================================================================
// baikal-retrieval - Routing: Safety (salutation detection + override)
// ============================================================================

import type { Intent } from "../types.ts"
import { extractSearchTerms } from "../search/keywords.ts"

// ============================================================================
// SALUTATION DETECTION
// ============================================================================

const SALUTATIONS = new Set([
  'bonjour', 'bonsoir', 'salut', 'hello', 'hi', 'hey', 'coucou',
  'merci', 'thanks', 'thank you', 'merci beaucoup', 'merci bien',
  'au revoir', 'bye', 'goodbye', 'à bientôt', 'a bientot',
  'ok', 'okay', "d'accord", 'daccord', 'compris', 'parfait', 'super',
])

export function isTrueSalutation(query: string): boolean {
  const q = query.trim().toLowerCase()
  const cleaned = q.replace(/[\s\?\!\.\,\;\:]+$/g, '').trim()

  if (SALUTATIONS.has(cleaned)) return true

  for (const salut of SALUTATIONS) {
    if (q.startsWith(salut) && q.length <= salut.length + 5) {
      const after = q.slice(salut.length).trim()
      if (!after || /^[\?\!\.\,\s]*$/.test(after)) return true
    }
  }

  return false
}

// ============================================================================
// KEYWORD-BASED INTENT DETECTION (fallback)
// ============================================================================

export function detectIntentByKeywords(query: string): Intent {
  if (isTrueSalutation(query)) return 'conversational'

  const q = query.toLowerCase()
  if (/incohéren|écart|différen|compar|conforme|conformité|cohéren|entre .+ et|versus|vs\b|par rapport/i.test(q)) return 'comparison'
  if (/résume|synthèse|synthétise|explique|présente|décris|parle-moi/i.test(q)) return 'synthesis'
  if (/cite|citation|extrait|texte exact|mot pour mot/i.test(q)) return 'citation'
  if (/où|ou se trouve|emplacement|localisation|situe/i.test(q)) return 'factual'

  return 'factual'
}

/** Conservé pour `key_concepts` (analyse fallback) — même extracteur que le full-text. */
export function extractKeywords(query: string): string[] {
  return extractSearchTerms(query).slice(0, 5)
}
