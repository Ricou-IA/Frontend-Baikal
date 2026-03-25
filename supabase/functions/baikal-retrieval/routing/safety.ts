// ============================================================================
// baikal-retrieval - Routing: Safety (salutation detection + override)
// ============================================================================

import type { Intent, SafeAnalysisOverride } from "../types.ts"

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
// QUESTION DETECTION
// ============================================================================

const QUESTION_WORDS = [
  'où', 'ou',
  'quel', 'quelle', 'quels', 'quelles',
  'qui', 'quand', 'combien', 'comment', 'pourquoi',
  'est-ce que', 'est ce que',
  'y a-t-il', 'y a t il', 'y-a-t-il',
  'existe-t-il', 'existe t il',
]

const QUESTION_PATTERNS = [
  /^trouve/i, /^cherche/i, /^donne/i, /^liste/i,
  /^explique/i, /^décris/i, /^résume/i, /^compare/i,
  /se trouve/i, /se situe/i,
  /est prévu/i, /est mentionné/i, /est indiqué/i,
]

export function containsRealQuestion(query: string): boolean {
  const q = query.trim().toLowerCase()

  for (const word of QUESTION_WORDS) {
    if (q.includes(word)) return true
  }

  if (q.endsWith('?')) return true

  for (const pattern of QUESTION_PATTERNS) {
    if (pattern.test(q)) return true
  }

  return false
}

// ============================================================================
// SAFE OVERRIDE
// ============================================================================

export function safeRequiresSearch(
  query: string,
  llmRequiresSearch: boolean,
  llmIntent: Intent,
): SafeAnalysisOverride {
  // LLM says search needed -> trust it
  if (llmRequiresSearch) {
    return { requires_search: true, intent: llmIntent, was_overridden: false }
  }

  // LLM says no search -> verify it's a real salutation
  if (isTrueSalutation(query)) {
    return { requires_search: false, intent: 'conversational', was_overridden: false }
  }

  // LLM was wrong - contains a real question
  if (containsRealQuestion(query)) {
    return { requires_search: true, intent: 'factual', was_overridden: true }
  }

  // Not a salutation, not clearly a question -> force search by safety
  return {
    requires_search: true,
    intent: llmIntent !== 'conversational' ? llmIntent : 'factual',
    was_overridden: true,
  }
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

export function extractKeywords(query: string): string[] {
  const stopwords = ['dans', 'pour', 'avec', 'cette', 'quel', 'quelle', 'comment', 'pourquoi']
  return query.toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 4 && !stopwords.includes(w))
    .slice(0, 5)
}
