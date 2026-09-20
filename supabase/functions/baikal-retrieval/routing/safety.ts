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

// Bornage en début de mot : `\b` de JS est basé sur l'ASCII, une lettre accentuée
// (é, à, î...) n'est pas un caractère de mot pour lui, donc `\bécart` ne matche pas
// un mot commençant par « é ». On borne donc à gauche avec une lookbehind explicite
// sur les lettres (accentuées ou non), et les racines restent des préfixes pour que
// les flexions (« comparons », « présentation »...) continuent de matcher — seuls
// les mots qui doivent être entiers (vs, cite, citation, citer, extrait) sont aussi
// bornés à droite. Corrige les faux positifs « représente » (⊃ présente) et
// « explicite » (⊃ cite) qui changeaient l'intent détecté.
const COMPARISON = /(?<![a-zà-ÿ])(incohéren|écart|différen|compar|conform|cohéren|versus)|(?<![a-zà-ÿ])vs(?![a-zà-ÿ])|\bentre\b .+ \bet\b|\bpar rapport\b/i
const SYNTHESIS = /(?<![a-zà-ÿ])(résum|synthè|synthéti|expliqu|présent|décri)|\bparle-moi\b/i
const CITATION = /(?<![a-zà-ÿ])(cite|citation|citer|extrait)(?![a-zà-ÿ])|\btexte exact\b|\bmot pour mot\b/i

export function detectIntentByKeywords(query: string): Intent {
  if (isTrueSalutation(query)) return 'conversational'

  const q = query.toLowerCase()
  if (COMPARISON.test(q)) return 'comparison'
  if (SYNTHESIS.test(q)) return 'synthesis'
  if (CITATION.test(q)) return 'citation'
  if (/où|ou se trouve|emplacement|localisation|situe/i.test(q)) return 'factual'

  return 'factual'
}

/** Conservé pour `key_concepts` (analyse fallback) — même extracteur que le full-text. */
export function extractKeywords(query: string): string[] {
  return extractSearchTerms(query).slice(0, 5)
}
