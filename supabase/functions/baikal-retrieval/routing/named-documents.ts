// ============================================================================
// baikal-retrieval - Routing: Documents nommés dans la question (Sprint 1, fin)
// ============================================================================
// Repère les documents que l'utilisateur nomme (« le CCTP du gros œuvre »,
// « le compte rendu 41 »), les résout contre les fichiers réellement ingérés
// dans le projet (UNE requête ciblée par type, jamais de liste complète) et
// produit le bloc de prompt qui interdit au modèle d'attribuer une information
// à un document absent (régression C7-004). Même coût pour 5 ou 5 000 fichiers.
// ============================================================================

import type { NamedDocument, NamedDocumentType, NamedDocumentResolution } from "../types.ts"
import { STOPWORDS } from "../search/keywords.ts"

const MAX_QUALIFIER_WORDS = 4

// Motifs ordonnés du plus spécifique au plus générique : un motif long
// (« PV de réception ») l'emporte sur le motif court qu'il contient (« PV »).
const DOC_TYPE_PATTERNS: Array<{ type: NamedDocumentType; regex: RegExp }> = [
  { type: 'pv',              regex: /\bPV\s+de\s+r[eé]ception\b/gi },
  { type: 'memoire',         regex: /\bm[eé]moires?\s+techniques?\b/gi },
  { type: 'cr',              regex: /\bcomptes?[\s-]rendus?\b/gi },
  { type: 'cr',              regex: /\bproc[eè]s[\s-]verba(?:l|ux)\b/gi },
  { type: 'acte_engagement', regex: /\bactes?\s+d[’']engagement\b/gi },
  { type: 'cctp',            regex: /\bCCTP\b/gi },
  { type: 'ccap',            regex: /\bCCAP\b/gi },
  { type: 'ccag',            regex: /\bCCAG\b/gi },
  { type: 'doe',             regex: /\bDOE\b/gi },
  { type: 'dpgf',            regex: /\bDPGF\b/gi },
  { type: 'pgc',             regex: /\bPGC\b/gi },
  { type: 'rict',            regex: /\bRICT\b/gi },
  { type: 'pv',              regex: /\bPV\b/gi },
  { type: 'cr',              regex: /\bCR\b/g },           // majuscules seules : « cr » n'est pas un mot
  { type: 'planning',        regex: /\bplannings?\b/gi },
  { type: 'charte',          regex: /\bchartes?\b/gi },
  { type: 'memoire',         regex: /\bm[eé]moires?\b/gi },
  { type: 'notice',          regex: /\bnotices?\b/gi },
  { type: 'plan',            regex: /\bplans?\b/gi },
]

// « plan de paiement », « plan d'action » : pas des pièces du dossier.
const PLAN_NON_DOCUMENT = new Set(["paiement", "action", "actions", "financement", "charge", "travail"])

// Mots qui terminent la mention : verbes de la question, pronoms, prépositions.
// Un token suffixé (« aborde-t-on », « prévoit-il ») est reconnu par sa base avant le tiret.
const PHRASE_BREAKERS = new Set([
  "aborde", "prévoit", "prevoit", "dit", "indique", "mentionne", "précise", "precise", "parle",
  "traite", "contient", "impose", "exige", "définit", "definit", "décrit", "decrit", "stipule",
  "couvre", "fixe", "donne", "autorise", "interdit", "demande", "est-il", "est-elle",
  "il", "elle", "ils", "elles", "on", "est", "sont", "a", "date", "y",
  "sur", "pour", "concernant", "à", "a-t-il", "que", "qui", "quoi", "quel", "quelle", "quels",
  "quelles", "combien", "quand", "comment", "où", "et", "ou", "avec", "dans", "en", "par", "selon",
])

// Complément de STOPWORDS (liste de recherche full-text, qui ignore déjà les mots < 4 lettres) :
// déterminants et possessifs de 3 lettres ou plus qu'une mention de document peut contenir
// sans qu'ils soient des qualifiants. Aucune entrée ne doit exister aussi dans STOPWORDS.
const DETERMINERS = new Set([
  "des", "les", "une", "aux", "cet", "ces", "son", "ses", "mon", "mes", "notre", "nos",
  "votre", "vos", "numero", "numéro",
])

const LEADING_PUNCT = /^[«"(\[]+/
const TRAILING_PUNCT = /[»")\]?!.;:,]+$/

function cleanToken(raw: string): string {
  return raw.replace(LEADING_PUNCT, "").replace(TRAILING_PUNCT, "")
}

/** « l'EHPAD » → « ehpad », « n°07 » → « 07 ». */
function toQualifier(word: string): string {
  return word.toLowerCase().replace(/^[ldcjmnst][’']/, "").replace(/^n[°º]/, "")
}

function isQualifier(q: string): boolean {
  if (/^\d+$/.test(q)) return true
  return q.length >= 3 && !DETERMINERS.has(q) && !STOPWORDS.has(q)
}

/**
 * Mentions de documents dans la question, avec le qualifiant qui suit chacune
 * (jusqu'à 4 mots, arrêt sur un verbe/mot-outil de la question ou une ponctuation forte).
 */
export function extractNamedDocuments(query: string): NamedDocument[] {
  // 1. Toutes les mentions, sans chevauchement (motifs déclarés du plus spécifique au plus générique)
  const spans: Array<{ type: NamedDocumentType; start: number; end: number }> = []
  for (const { type, regex } of DOC_TYPE_PATTERNS) {
    regex.lastIndex = 0
    for (const m of query.matchAll(regex)) {
      const start = m.index ?? 0
      const end = start + m[0].length
      if (spans.some(s => start < s.end && end > s.start)) continue
      spans.push({ type, start, end })
    }
  }
  spans.sort((a, b) => a.start - b.start)

  // 2. Pour chaque mention, le qualifiant qui la suit
  const results: NamedDocument[] = []
  const seen = new Set<string>()
  for (const span of spans) {
    const tail = query.slice(span.end)
    const qualifiers: string[] = []
    let phraseEnd = span.end
    let words = 0
    for (const m of tail.matchAll(/\S+/g)) {
      if (words >= MAX_QUALIFIER_WORDS) break
      const raw = m[0]
      const word = cleanToken(raw)
      if (word === "") break                                   // ponctuation seule
      const lower = word.toLowerCase()
      const base = lower.split("-")[0]
      if (PHRASE_BREAKERS.has(lower) || PHRASE_BREAKERS.has(base)) break
      words++
      const trailing = raw.length - raw.replace(TRAILING_PUNCT, "").length
      phraseEnd = span.end + (m.index ?? 0) + raw.length - trailing
      const q = toQualifier(word)
      if (isQualifier(q)) qualifiers.push(q)
      if (/[?!.;:]$/.test(raw)) break                          // fin de proposition
    }
    if (span.type === 'plan' && qualifiers.length > 0 && PLAN_NON_DOCUMENT.has(qualifiers[0])) continue
    const phrase = query.slice(span.start, phraseEnd).replace(/[\s,]+$/, "")
    const key = `${span.type}|${phrase.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    results.push({ type: span.type, phrase, qualifiers })
  }
  return results
}

// ============================================================================
// APPARIEMENT (pur)
// ============================================================================

const MAX_LISTED = 5

/** Minuscules, sans diacritiques, ligatures dépliées : « GROS ŒUVRE » → « gros oeuvre ». */
export function normalizeName(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/œ/g, "oe").replace(/æ/g, "ae")
}

function qualifierMatches(qualifier: string, normalizedName: string): boolean {
  const q = normalizeName(qualifier)
  if (/^\d+$/.test(q)) {
    const n = q.replace(/^0+(?=\d)/, "")                // « 07 » → « 7 »
    return new RegExp(`(?<!\\d)0*${n}(?!\\d)`).test(normalizedName)
  }
  return normalizedName.includes(q)
}

export function matchNamedDocument(named: NamedDocument, candidateNames: string[]): NamedDocumentResolution {
  const base = { phrase: named.phrase, type: named.type }
  if (candidateNames.length === 0) {
    return { ...base, found: [], similar: [], status: 'no_candidate', total: 0 }
  }
  if (named.qualifiers.length === 0) {
    return { ...base, found: candidateNames.slice(0, MAX_LISTED), similar: [], status: 'found', total: candidateNames.length }
  }
  const found = candidateNames.filter(name => {
    const n = normalizeName(name)
    return named.qualifiers.every(q => qualifierMatches(q, n))
  })
  if (found.length > 0) {
    return { ...base, found: found.slice(0, MAX_LISTED), similar: [], status: 'found', total: found.length }
  }
  return { ...base, found: [], similar: candidateNames.slice(0, MAX_LISTED), status: 'not_found', total: candidateNames.length }
}

// ============================================================================
// BLOC DE PROMPT (pur) — sans accents dans le texte fixe, comme le reste du prompt
// ============================================================================

function withRemainder(list: string[], total: number): string {
  const rest = total - list.length
  const suffix = rest > 0 ? ` (+${rest} autre${rest > 1 ? 's' : ''})` : ''
  return `${list.join(', ')}${suffix}`
}

export function formatNamedDocumentsBlock(resolutions: NamedDocumentResolution[]): string | null {
  const lines: string[] = []
  for (const r of resolutions) {
    if (r.status === 'unknown') continue
    if (r.status === 'found') {
      lines.push(`- « ${r.phrase} » → ${withRemainder(r.found, r.total)}`)
    } else if (r.status === 'not_found') {
      lines.push(`- « ${r.phrase} » → AUCUN fichier correspondant dans le projet ; fichiers proches : ${withRemainder(r.similar, r.total)}`)
    } else {
      lines.push(`- « ${r.phrase} » → AUCUN fichier de ce type dans le projet`)
    }
  }
  if (lines.length === 0) return null
  return `DOCUMENTS NOMMES DANS LA QUESTION (resolus sur les fichiers reellement ingeres du projet) :\n${lines.join('\n')}`
}
