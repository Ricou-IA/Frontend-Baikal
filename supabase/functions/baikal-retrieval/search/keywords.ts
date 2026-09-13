// ============================================================================
// baikal-retrieval - Search: Keywords (Sprint 1, S1.1)
// ============================================================================
// Transforme une question en termes de recherche full-text :
//   - codes conservés tels quels (normes « NF EN 1154 », « DTU 25.41 »,
//     articles « 3.7 », « 2.3.9 », références légales « 8221-3 », lots « lot 06 »)
//   - mots significatifs (≥ 4 lettres, hors mots-outils et mots-document)
//   - plafond de 8 termes, codes en premier
// La requête produite est destinée à websearch_to_tsquery('french', …) en OR :
// un chunk qui contient UN des termes est candidat, le ranking fait le reste.
// ============================================================================

const MAX_TERMS = 8

// Mots-outils français fréquents dans une question (le dictionnaire 'french'
// de Postgres en retire déjà beaucoup, mais pas tous) + mots-document qui
// apparaissent dans presque tous les chunks et n'aident pas à discriminer.
const STOPWORDS = new Set([
  "dans", "pour", "avec", "sans", "sous", "vers", "chez", "entre", "cette", "cela",
  "quel", "quelle", "quels", "quelles", "comment", "pourquoi", "combien", "quand",
  "sont", "être", "avoir", "faut", "peut", "peux", "doit", "dois", "fait", "fais",
  "donne", "donnez", "cite", "citez", "dites", "reprends", "résume", "résumez",
  "leur", "leurs", "nous", "vous", "elle", "elles", "mais", "donc", "ainsi", "aussi",
  "tout", "tous", "toute", "toutes", "plus", "moins", "très", "bien", "même",
  "prévu", "prévue", "prévus", "prévues", "dont", "quoi", "est-ce", "c'est",
  "trouve", "trouvent", "trouver", "situe", "situé", "située", "existe",
  "article", "articles", "document", "documents", "cctp", "ccap", "ccag",
  "norme", "normes", "marché", "projet", "chantier", "point", "section",
])
// « pièces » n'est PAS un mot-outil : sur un CCAP, « pièces constitutives » est un vrai sujet.

// Codes à conserver comme phrases (minuscules, espaces normalisés). L'ordre compte :
// les normes passent avant le motif numérique générique pour que « DTU 25.41 »
// reste entier au lieu de donner « 25.41 » seul.
// Note : « en » seul est retiré de l'alternation préfixe (la préposition française
// « en 2025 » n'est pas une norme) — « NF EN 1154 » reste capturé en entier car les
// 1 à 3 lettres optionnelles après « nf » absorbent le « EN ».
const CODE_PATTERNS: RegExp[] = [
  /\b(?:nf|iso|dtu|bt)\s*(?:[a-z]{1,3}\s*)?\d+(?:[.\-]\d+)*[a-z]?\b/gi,     // NF EN 1154, NF P 03-001, NF C 15-100, DTU 25.41, BT43
  /\blots?\s*(?:n\s*°?\s*)?\d{1,2}\b/gi,                                   // lot 06, lot n°7
  /\b[lrd]\.?\s?(\d{3,4}(?:-\d+)+)\b/gi,                                   // L. 8221-3 → groupe 1 « 8221-3 »
  /\b\d+(?:\.\d+)+\b/g,                                                    // 3.7, 2.3.9, 25.41
]

function normalizeSpaces(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim()
}

export function extractSearchTerms(query: string): string[] {
  const seen = new Set<string>()
  const codes: string[] = []
  let residue = query

  for (const pattern of CODE_PATTERNS) {
    pattern.lastIndex = 0
    // Chaque motif est appliqué sur le résidu (déjà amputé des correspondances
    // précédentes), pas sur la question d'origine, pour éviter qu'un numéro
    // pointé déjà capturé dans une norme (ex. « DTU 25.41 ») ne soit ré-extrait
    // seul par le motif générique suivant (« 25.41 »).
    for (const m of residue.matchAll(pattern)) {
      const term = normalizeSpaces(m[1] ?? m[0])
      if (!seen.has(term)) { seen.add(term); codes.push(term) }
      residue = residue.replace(m[0], " ")
    }
  }

  const words = residue
    .toLowerCase()
    .replace(/[’']/g, " ")            // « l'article » → « l article »
    .split(/[^a-zà-ÿ0-9\-]+/i)
    .map(w => w.replace(/^-+|-+$/g, ""))
    .filter(w => w.length >= 4 && !STOPWORDS.has(w) && !/^\d+$/.test(w))

  const uniqueWords: string[] = []
  for (const w of words) {
    if (!seen.has(w)) { seen.add(w); uniqueWords.push(w) }
  }

  return [...codes, ...uniqueWords].slice(0, MAX_TERMS)
}

/** Requête pour websearch_to_tsquery : chaque terme entre guillemets, joints par OR. */
export function buildFtsQuery(terms: string[]): string {
  return terms
    .map(t => t.replace(/"/g, "").trim())
    .filter(t => t.length > 0)
    .map(t => `"${t}"`)
    .join(" OR ")
}
