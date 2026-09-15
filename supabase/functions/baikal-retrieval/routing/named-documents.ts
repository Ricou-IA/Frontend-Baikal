// ============================================================================
// baikal-retrieval - Routing: Documents nommés dans la question (Sprint 1, fin)
// ============================================================================
// Repère les documents que l'utilisateur nomme (« le CCTP du gros œuvre »,
// « le compte rendu 41 »), les résout contre les fichiers réellement ingérés
// dans le projet (UNE requête ciblée par type, jamais de liste complète) et
// produit le bloc de prompt qui interdit au modèle d'attribuer une information
// à un document absent (régression C7-004). Même coût pour 5 ou 5 000 fichiers.
//
// Principe (revue finale) : le code établit des FAITS (quels fichiers de ce type
// existent, lesquels portent les qualifiants), c'est le modèle qui juge. Le bloc
// n'affirme une absence que lorsqu'aucun fichier du type n'existe dans le projet.
// ============================================================================

import type {
  Supabase, NamedDocument, NamedDocumentType, NamedDocumentResolution, NamedCandidate, CandidatesByType,
} from "../types.ts"
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
  // R7 : « plan » et « notice » sont des mots trop courants (« plan de paiement », « notice explicative »).
  // Les types restent définis et interrogeables, mais l'extraction ne les produit plus (réactivation
  // au Sprint 2 sur preuve des logs named_documents).
]

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

// Inversion interrogative : « aborde-t-on », « figure-t-il », « parlent-elles » ferment la mention.
const INTERROGATIVE_INVERSION = /-(t-)?(il|elle|on|ils|elles)$/

// Mots de liaison qui annoncent un vrai qualifiant.
const LINK_WORDS = new Set(["de", "du", "des", "lot", "lots", "no", "numero", "numéro"])

/**
 * R1 — garde positive : on ne collecte des qualifiants que si le premier mot qui suit la
 * mention est un lien (« CCTP **du** gros œuvre », « CCTP **lot** 15 », « CR **41** »).
 * Sinon le mot suivant est un verbe ou un complément de la question (« le CCTP **renvoie** »,
 * « le CCTP **TCE** de Bessières ») et la mention se réduit au nom du document.
 */
function opensQualifiers(raw: string): boolean {
  const word = cleanToken(raw).toLowerCase()
  if (word === "") return false
  if (LINK_WORDS.has(word)) return true
  if (/^d[’']\S/.test(word)) return true          // « d'exécution », « d’étanchéité »
  if (/^n[°º]/.test(word)) return true            // « n°07 »
  return /^\d/.test(word)                         // « CR 41 », « CCTP 12 »
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
    let first = true
    for (const m of tail.matchAll(/\S+/g)) {
      if (words >= MAX_QUALIFIER_WORDS) break
      const raw = m[0]
      if (first) {
        first = false
        if (!opensQualifiers(raw)) break                       // R1 : pas de lien → mention seule
      }
      const word = cleanToken(raw)
      if (word === "") break                                   // ponctuation seule
      const lower = word.toLowerCase()
      const base = lower.split("-")[0]
      if (PHRASE_BREAKERS.has(lower) || PHRASE_BREAKERS.has(base)) break
      if (INTERROGATIVE_INVERSION.test(lower)) break           // R1 : « figure-t-il », « aborde-t-on »
      words++
      const trailing = raw.length - raw.replace(TRAILING_PUNCT, "").length
      phraseEnd = span.end + (m.index ?? 0) + raw.length - trailing
      const q = toQualifier(word)
      if (isQualifier(q)) qualifiers.push(q)
      if (/[?!.;:]$/.test(raw)) break                          // fin de proposition
    }
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

// Une liste de CCTP par lot est courte : c'est elle qui permet au modèle de voir qu'un lot manque.
const MAX_LISTED = 12

/** Minuscules, sans diacritiques, ligatures dépliées : « GROS ŒUVRE » → « gros oeuvre ». */
export function normalizeName(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/œ/g, "oe").replace(/æ/g, "ae")
}

/**
 * R2 — mots du nom du projet (« OC014 - Bessières » → ["oc014", "bessieres"]). Un utilisateur
 * qui dit « le CCAP de CMP » nomme son projet, pas un qualifiant du fichier : ces mots sont
 * retirés des qualifiants avant appariement, sinon le CCAP du projet passe pour absent.
 */
export function projectNameTokens(identity: Record<string, unknown> | null): string[] {
  const name = identity?.name
  if (typeof name !== 'string') return []
  const tokens = normalizeName(name).split(/[^a-z0-9]+/).filter(t => t.length >= 3 && !STOPWORDS.has(t))
  return [...new Set(tokens)]
}

function qualifierMatches(qualifier: string, normalizedName: string): boolean {
  const q = normalizeName(qualifier)
  if (/^\d+$/.test(q)) {
    const n = q.replace(/^0+(?=\d)/, "")                // « 07 » → « 7 »
    return new RegExp(`(?<!\\d)0*${n}(?!\\d)`).test(normalizedName)
  }
  return normalizedName.includes(q)
}

/**
 * Apparie une mention sur les candidats du même type. `ignoreTokens` (R2) retire des qualifiants
 * les mots du nom du projet. L'appariement porte sur `searchText` (les deux noms du fichier, R5),
 * l'affichage sur `name` (le nom présenté). `truncated` est posé par la résolution (R4).
 */
export function matchNamedDocument(
  named: NamedDocument,
  candidates: NamedCandidate[],
  ignoreTokens: string[] = [],
): NamedDocumentResolution {
  const ignore = new Set(ignoreTokens)
  const qualifiers = named.qualifiers.filter(q => !ignore.has(normalizeName(q)))
  const base = { phrase: named.phrase, type: named.type, qualifiers, truncated: false }
  if (candidates.length === 0) {
    return { ...base, found: [], similar: [], status: 'no_candidate', total: 0 }
  }
  const names = candidates.map(c => c.name)
  if (qualifiers.length === 0) {
    return { ...base, found: names.slice(0, MAX_LISTED), similar: [], status: 'found', total: names.length }
  }
  const found = candidates
    .filter(c => qualifiers.every(q => qualifierMatches(q, c.searchText)))
    .map(c => c.name)
  if (found.length > 0) {
    return { ...base, found: found.slice(0, MAX_LISTED), similar: [], status: 'found', total: found.length }
  }
  return { ...base, found: [], similar: names.slice(0, MAX_LISTED), status: 'not_found', total: names.length }
}

// ============================================================================
// BLOC DE PROMPT (pur) — sans accents dans le texte fixe, comme le reste du prompt
// ============================================================================

function withRemainder(list: string[], total: number): string {
  const rest = total - list.length
  const suffix = rest > 0 ? ` (+${rest} autre${rest > 1 ? 's' : ''})` : ''
  return `${list.join(', ')}${suffix}`
}

/**
 * Le code établit des faits, le modèle juge (R3) : le bloc n'affirme une absence que
 * lorsqu'aucun fichier du type n'existe (`no_candidate`). Quand des fichiers du type existent
 * mais qu'aucun ne porte le qualifiant, il le dit et liste les fichiers du type ; la règle 8
 * demande au modèle de vérifier la liste avant de conclure.
 */
export function formatNamedDocumentsBlock(resolutions: NamedDocumentResolution[]): string | null {
  const lines: string[] = []
  for (const r of resolutions) {
    if (r.status === 'unknown') continue
    const partial = r.truncated ? ' (liste partielle)' : ''
    if (r.status === 'found') {
      lines.push(`- « ${r.phrase} » → ${withRemainder(r.found, r.total)}${partial}`)
    } else if (r.status === 'not_found') {
      const qualifiers = r.qualifiers.map(q => `« ${q} »`).join(', ')
      lines.push(`- « ${r.phrase} » → aucun fichier ${r.type} ne porte ${qualifiers} ; fichiers ${r.type} du projet : ${withRemainder(r.similar, r.total)}${partial}`)
    } else {
      lines.push(`- « ${r.phrase} » → AUCUN fichier de ce type dans le projet`)
    }
  }
  if (lines.length === 0) return null
  return `DOCUMENTS NOMMES DANS LA QUESTION (resolus sur les fichiers reellement ingeres du projet) :\n${lines.join('\n')}`
}

// ============================================================================
// RÉSOLUTION (une requête par type nommé, limitée, jamais de liste complète)
// ============================================================================

const MAX_CANDIDATES = 20

/**
 * Regex Postgres (~*) sur le nom de fichier, par type. Ni virgule ni parenthèse (contrainte .or()).
 * R6 — les bornes de mot de Postgres (antislash + m / antislash + M) considèrent « _ » comme un
 * caractère de mot : ainsi bornée, la recherche de « pgc » rate '2139_PGC.pdf' (vérifié en SQL).
 * On borne donc à la main sur les caractères non alphanumériques,
 * en quatre variantes (milieu, début, fin, nom entier) faute de pouvoir grouper avec des parenthèses.
 */
function bounded(core: string): string[] {
  return [`[^a-z0-9]${core}[^a-z0-9]`, `^${core}[^a-z0-9]`, `[^a-z0-9]${core}$`, `^${core}$`]
}

export const TYPE_FILENAME_PATTERNS: Record<NamedDocumentType, string[]> = {
  cctp:            ['cctp'],
  ccap:            ['ccap'],
  ccag:            ['ccag'],
  doe:             [...bounded('doe'), 'dossier.?d.?ouvrages?.?ex'],
  dpgf:            ['dpgf'],
  planning:        ['planning'],
  pv:              [...bounded('pv'), 'proc[eèé]s.?verba'],
  memoire:         ['m[eéè]moire'],
  pgc:             bounded('pgc'),
  rict:            bounded('rict'),
  charte:          ['charte'],
  cr:              [...bounded('cr'), 'compte.?s?.?rendu', ...bounded('pv'), 'proc[eèé]s.?verba'],
  acte_engagement: ['acte.?d.?engagement', ...bounded('ae')],
  plan:            bounded('plans?'),
  notice:          ['notice'],
}

/** Argument de .or() PostgREST : chaque motif sur les deux colonnes de nom. */
export function buildFilenameFilter(type: NamedDocumentType): string {
  return TYPE_FILENAME_PATTERNS[type]
    .flatMap(p => [`original_filename.imatch.${p}`, `display_name.imatch.${p}`])
    .join(',')
}

/** Fichiers du projet d'un type donné ; null en cas d'erreur (→ statut unknown). */
async function fetchCandidates(
  supabase: Supabase,
  projectId: string,
  type: NamedDocumentType,
): Promise<{ candidates: NamedCandidate[]; truncated: boolean } | null> {
  const { data, error } = await supabase
    .schema('sources')
    .from('files')
    .select('original_filename, display_name')
    .eq('project_id', projectId)
    .eq('processing_status', 'completed')
    .or(buildFilenameFilter(type))
    .order('original_filename')
    .limit(MAX_CANDIDATES)
  if (error) {
    console.warn(`[named-documents] ${type}:`, error.message)
    return null
  }
  const rows = data || []
  const candidates: NamedCandidate[] = []
  const seen = new Set<string>()
  for (const f of rows) {
    const original = typeof f.original_filename === 'string' ? f.original_filename : ''
    const display = typeof f.display_name === 'string' ? f.display_name : ''
    const name = (display || original).trim()
    if (name === '' || seen.has(name)) continue
    seen.add(name)
    // R5 : on apparie sur les deux noms, on affiche celui que l'utilisateur voit.
    candidates.push({ name, searchText: normalizeName(`${original} ${display}`) })
  }
  // R4 : la limite atteinte signifie que la liste est partielle — elle ne prouve aucune absence.
  return { candidates, truncated: rows.length >= MAX_CANDIDATES }
}

function unknownResolution(n: NamedDocument): NamedDocumentResolution {
  return { phrase: n.phrase, type: n.type, qualifiers: [], found: [], similar: [], status: 'unknown', total: 0, truncated: false }
}

/**
 * R8 — partie réseau : une requête par TYPE nommé (deux mentions du même type partagent la
 * même requête), lancée dans le `Promise.all` du bloc A2. Ne lève jamais ; aucune requête
 * sans `project_id` ni sans mention.
 */
export async function fetchNamedDocumentCandidates(
  supabase: Supabase,
  projectId: string | undefined,
  named: NamedDocument[],
): Promise<CandidatesByType> {
  const byType: CandidatesByType = new Map()
  if (!projectId || named.length === 0) return byType
  const types = [...new Set(named.map(n => n.type))]
  try {
    const lists = await Promise.all(types.map(t => fetchCandidates(supabase, projectId, t)))
    types.forEach((t, i) => byType.set(t, lists[i]))
  } catch (err) {
    console.warn('[named-documents] fetch error:', err)
    for (const t of types) byType.set(t, null)
  }
  return byType
}

/**
 * R8 — partie pure : apparie chaque mention aux candidats de son type. `ignoreTokens` vient de
 * `projectNameTokens(context.projectIdentity)`, disponible seulement après le contexte.
 * Type absent de la Map (aucune requête) ou en erreur (null) → statut unknown, ligne omise du bloc.
 */
export function resolveNamedDocuments(
  named: NamedDocument[],
  byType: CandidatesByType,
  ignoreTokens: string[] = [],
): NamedDocumentResolution[] {
  return named.map(n => {
    const entry = byType.get(n.type)
    if (!entry) return unknownResolution(n)
    return { ...matchNamedDocument(n, entry.candidates, ignoreTokens), truncated: entry.truncated }
  })
}
