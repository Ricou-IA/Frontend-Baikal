// ============================================================================
// baikal-retrieval - Routing: Documents nommés dans la question (Sprint 1, fin)
// ============================================================================
// Repère les documents que l'utilisateur nomme (« le CCTP du gros œuvre »,
// « le compte rendu 41 »), les résout contre les fichiers réellement ingérés
// dans le projet (UNE requête ciblée par type, jamais de liste complète) et
// produit le bloc de prompt qui interdit au modèle d'attribuer une information
// à un document absent (régression C7-004). Même coût pour 5 ou 5 000 fichiers.
// ============================================================================

import type { NamedDocument, NamedDocumentType } from "../types.ts"
import { STOPWORDS } from "../search/keywords.ts"

const MAX_QUALIFIER_WORDS = 4

// Motifs ordonnés du plus spécifique au plus générique : un motif long
// (« PV de réception ») l'emporte sur le motif court qu'il contient (« PV »).
const DOC_TYPE_PATTERNS: Array<{ type: NamedDocumentType; regex: RegExp }> = [
  { type: 'pv',              regex: /\bPV\s+de\s+r[eé]ception\b/gi },
  { type: 'memoire',         regex: /\bm[eé]moires?\s+techniques?\b/gi },
  { type: 'cr',              regex: /\bcomptes?[\s-]rendus?\b/gi },
  { type: 'cr',              regex: /\bproc[eè]s[\s-]verba(?:l|ux)\b/gi },
  { type: 'acte_engagement', regex: /\bactes?\s+d['']engagement\b/gi },
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

// Mots-outils que la mention peut contenir sans qu'ils soient des qualifiants
// (ceux de moins de 3 lettres sont de toute façon écartés par isQualifier).
const TOOL_WORDS = new Set([
  "des", "les", "une", "aux", "cet", "cette", "ces", "son", "ses", "mon", "mes", "notre", "nos",
  "votre", "vos", "numero", "numéro",
])

const LEADING_PUNCT = /^[«"(\[]+/
const TRAILING_PUNCT = /[»")\]?!.;:,]+$/

function cleanToken(raw: string): string {
  return raw.replace(LEADING_PUNCT, "").replace(TRAILING_PUNCT, "")
}

/** « l'EHPAD » → « ehpad », « n°07 » → « 07 ». */
function toQualifier(word: string): string {
  return word.toLowerCase().replace(/^[ldcjmnst]['']/, "").replace(/^n[°º]/, "")
}

function isQualifier(q: string): boolean {
  if (/^\d+$/.test(q)) return true
  return q.length >= 3 && !TOOL_WORDS.has(q) && !STOPWORDS.has(q)
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
