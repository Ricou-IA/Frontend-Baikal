# Documents nommés dans la question — résolution scalable (fin du Sprint 1 RAG)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quand l'utilisateur nomme un document (« le CCTP du gros œuvre », « le compte rendu 41 »), le pipeline vérifie par une requête ciblée si ce document existe dans le projet et le dit au modèle, pour qu'il refuse d'attribuer une information à un document absent (régression C7-004) — avec le même coût pour 5 ou 5 000 fichiers.

**Architecture:** Un module pur `routing/named-documents.ts` (extraction par motifs, appariement par qualifiants, bloc de prompt) plus une fonction de résolution qui lance **une** requête `sources.files` par type de document nommé (regex insensible à la casse, `limit 20`), exécutée dans le `Promise.all` du bloc A2 d'`index.ts` (aucune latence ajoutée). Le mécanisme de liste plafonnée à 50 fichiers du commit `f385eaf` est supprimé. La résolution est injectée dans le prompt du chemin rapide (`buildSystemPrompt`) **et** dans le contexte de l'agent (`orchestrator.ts`), et tracée dans `rag.query_logs.named_documents` (nouvelle colonne).

**Tech Stack:** Deno 2.8 (Edge Function Supabase `baikal-retrieval`), PostgREST via supabase-js (`.or()` avec opérateur `imatch` = `~*`), Postgres (migration `ALTER TABLE`), banc `eval/run-eval.ts`.

**Spec:** `docs/superpowers/prompts/2026-09-15-documents-nommes-scalable.md` (design validé par Eric, section « La tâche ») ; spec cadre `C:\Dev\Frontend-ARPET\docs\SPEC_RAG_OPTIM_V1.md` §3 (P7 sentinelle anti-hallucination), §5 Sprint 1, §7.

## Global Constraints

- **On travaille sur `main` du repo `C:\Dev\Frontend-Baikal`** (Eric a fusionné `sprint1/rag-retrieval` dans `main` le 2026-09-15, commit `51dc191`). `main` porte des modifications non commitées d'Eric (`src/contexts/AppContext.jsx`, `src/pages/Seo.jsx`, `supabase/functions/admin-rapport/*`, `supabase/functions/admin-seo/index.ts`, `supabase/functions/_shared/seo-bing-google*.ts`) : **ne jamais les toucher ni les `git add`** ; chaque commit liste explicitement ses fichiers.
- **Claude Code modifie le code, Eric déploie** : `npx supabase functions deploy baikal-retrieval --project-ref odspcxgafcqxjzrarsqf` (porte G2'). Aucun déploiement sans « ok » explicite.
- **Toute migration SQL est soumise avant application** (porte G1') ; application via MCP `apply_migration` après accord, nom `rag_query_logs_named_documents` ; fichier versionné dans `supabase/migrations/`. **G1' précède G2'** : si le code déployé écrit `named_documents` avant que la colonne existe, l'insertion `query_logs` échoue (warn console, ligne perdue).
- **Rien n'est poussé sur GitHub sans accord.**
- **Pas de filtrage de la recherche par le fichier trouvé** (c'est S2.3, Sprint 2, qui réutilisera ce module). Pas de Cohere, pas de changement d'embedding.
- **Latence** : la résolution tourne en parallèle du contexte et de l'embedding ; aucune requête quand la question ne nomme pas de document ou qu'il n'y a pas de `project_id`.
- **Prod actuelle** : `baikal-retrieval` v2.1.0 au commit `726888d` ; `f385eaf` (liste 50 fichiers) n'a jamais été déployé. La version reste **2.1.0** ; le rejeu final est tagué `baseline-v2.1.0`.
- Conventions : tests `*.test.ts` à côté du module avec `https://deno.land/std@0.224.0/assert/mod.ts`, lancés par `deno test <fichier>` depuis la racine du repo ; commentaires et messages de commit en français ; `deno check supabase/functions/baikal-retrieval/index.ts` avant tout commit d'un `.ts` — il a **11 erreurs préexistantes** dans `routing/analyzer.ts:62-78` (fonction morte `analyzeQuery`) : le critère est **« aucune erreur nouvelle »**.
- Le registre d'exécution `.superpowers/sdd/2026-09-13-sprint1-rag-retrieval/progress.md` est **continué** (pas de second registre).
- Le texte injecté dans le prompt est **sans accents** (comme le reste de `ZERO_HALLUCINATION_PROMPT`), sauf la phrase de l'utilisateur recopiée telle quelle et les noms de fichiers.

---

## Fichiers

| Action | Chemin (repo Frontend-Baikal) | Responsabilité |
|---|---|---|
| Modifier | `supabase/functions/baikal-retrieval/types.ts:137-153` | `AgentContext.namedDocuments` remplace `projectDocuments` ; nouveaux types `NamedDocument*` |
| Modifier | `supabase/functions/baikal-retrieval/search/keywords.ts:18` | `STOPWORDS` exporté (réutilisé par l'extraction) |
| Créer | `supabase/functions/baikal-retrieval/routing/named-documents.ts` | Extraction, appariement, bloc de prompt, résolution DB |
| Créer | `supabase/functions/baikal-retrieval/routing/named-documents.test.ts` | Tests des fonctions pures |
| Modifier | `supabase/functions/baikal-retrieval/generation/prompt.ts:50-56`, `:86-90` | Règle 8 réécrite ; bloc `DOCUMENTS NOMMES DANS LA QUESTION` à la place de la liste |
| Modifier | `supabase/functions/baikal-retrieval/generation/prompt.test.ts` | Tests du bloc (présent / absent) à la place des tests de liste |
| Modifier | `supabase/functions/baikal-retrieval/context.ts:60`, `:64-93` | `namedDocuments: []` ; `getProjectDocumentNames` supprimée |
| Modifier | `supabase/functions/baikal-retrieval/index.ts:35`, `:167-172`, `:181-186` | Import, résolution dans le `Promise.all` A2, re-résolution après condensation |
| Modifier | `supabase/functions/baikal-retrieval/agentic/orchestrator.ts:83-85` | Bloc injecté dans le contexte de l'agent |
| Modifier | `supabase/functions/baikal-retrieval/logging.ts:17-48` | `QueryLogEntry.named_documents` |
| Modifier | `supabase/functions/baikal-retrieval/index.ts` (4 appels `logQuery` : conversationnel, mémoire, agentique, fast path) | `named_documents: context.namedDocuments` |
| Créer | `supabase/migrations/20260915100000_rag_query_logs_named_documents.sql` | Colonne `rag.query_logs.named_documents jsonb` |
| Modifier | `eval/run-eval.ts:120-128` | `REFUSAL_PATTERNS` reconnaît « n'existe pas » / « aucun fichier … projet » |
| Créer (git) | `eval/reports/baseline-v2.1.0.*`, `baseline-v2.1.0-synth.*` | Baseline figée après déploiement |
| Modifier | `C:\Dev\Frontend-ARPET\docs\SPEC_RAG_OPTIM_V1.md` §3, §7 | P11 corrigé ; tableau des baselines ; §7.3 résultats Sprint 1 |
| Modifier | `C:\Dev\Frontend-ARPET\CLAUDE.md` § « État Courant » | Prod v2.1.0, résumé, prochaine étape Sprint 2 |

---

### Task 1: Types et extraction des documents nommés

**Files:**
- Modify: `supabase/functions/baikal-retrieval/types.ts:162-165` (ajout d'une section après `DocumentCle`)
- Modify: `supabase/functions/baikal-retrieval/search/keywords.ts:18`
- Create: `supabase/functions/baikal-retrieval/routing/named-documents.ts`
- Create: `supabase/functions/baikal-retrieval/routing/named-documents.test.ts`

**Interfaces:**
- Consumes: `STOPWORDS` de `search/keywords.ts` (Set de mots-outils, à exporter).
- Produces (dans `types.ts`) :
  ```ts
  export type NamedDocumentType =
    | 'cctp' | 'ccap' | 'ccag' | 'doe' | 'dpgf' | 'planning' | 'pv' | 'memoire'
    | 'pgc' | 'rict' | 'charte' | 'cr' | 'acte_engagement' | 'plan' | 'notice'
  export interface NamedDocument { type: NamedDocumentType; phrase: string; qualifiers: string[] }
  export type NamedDocumentStatus = 'found' | 'not_found' | 'no_candidate' | 'unknown'
  export interface NamedDocumentResolution {
    phrase: string; type: NamedDocumentType; found: string[]; similar: string[]
    status: NamedDocumentStatus
    total: number   // fichiers derrière la liste affichée (found ou similar), avant troncature à 5
  }
  ```
- Produces (dans `routing/named-documents.ts`) : `extractNamedDocuments(query: string): NamedDocument[]`.

- [ ] **Step 1: Ajouter les types dans `types.ts`**

Après l'interface `DocumentCle` (ligne 165), insérer :

```ts
// ============================================================================
// NAMED DOCUMENTS (Sprint 1, fin) — documents nommés dans la question
// ============================================================================

export type NamedDocumentType =
  | 'cctp' | 'ccap' | 'ccag' | 'doe' | 'dpgf' | 'planning' | 'pv' | 'memoire'
  | 'pgc' | 'rict' | 'charte' | 'cr' | 'acte_engagement' | 'plan' | 'notice'

/** Une mention de document dans la question : « CCTP du gros œuvre » → type cctp, qualifiants [gros, œuvre]. */
export interface NamedDocument {
  type: NamedDocumentType
  phrase: string          // texte exact de la question, du nom du document au dernier qualifiant
  qualifiers: string[]    // mots significatifs qui suivent la mention (numéros toujours conservés)
}

export type NamedDocumentStatus = 'found' | 'not_found' | 'no_candidate' | 'unknown'

/** Résolution d'une mention contre les fichiers du projet (sources.files). */
export interface NamedDocumentResolution {
  phrase: string
  type: NamedDocumentType
  found: string[]         // fichiers dont le nom contient tous les qualifiants (max 5)
  similar: string[]       // à défaut : fichiers du même type (max 5)
  status: NamedDocumentStatus
  total: number           // nombre réel de fichiers derrière found (si found) ou similar, avant troncature
}
```

- [ ] **Step 2: Exporter `STOPWORDS` dans `keywords.ts`**

Ligne 18 : `const STOPWORDS = new Set([` → `export const STOPWORDS = new Set([`. Rien d'autre ne change.

- [ ] **Step 3: Écrire les tests d'extraction (qui échouent)**

Créer `supabase/functions/baikal-retrieval/routing/named-documents.test.ts` :

```ts
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { extractNamedDocuments } from "./named-documents.ts"

Deno.test("extraction : CCTP avec qualifiant, arrêt sur le verbe de la question", () => {
  const r = extractNamedDocuments("Dans le CCTP du gros œuvre, aborde-t-on le nettoyage extérieur ?")
  assertEquals(r, [{ type: "cctp", phrase: "CCTP du gros œuvre", qualifiers: ["gros", "œuvre"] }])
})

Deno.test("extraction : compte rendu numéroté, mots-outils exclus, numéro conservé", () => {
  const r = extractNamedDocuments("Le dernier compte rendu de chantier, le 41, il date de quand ?")
  assertEquals(r.length, 1)
  assertEquals(r[0].type, "cr")
  assertEquals(r[0].phrase, "compte rendu de chantier, le 41")
  assert(r[0].qualifiers.includes("41"), `41 attendu dans ${r[0].qualifiers}`)
  assert(!r[0].qualifiers.includes("de") && !r[0].qualifiers.includes("le"))
})

Deno.test("extraction : document sans qualifiant (arrêt sur « sur »)", () => {
  assertEquals(extractNamedDocuments("Que dit le CCAP sur les pénalités ?"),
    [{ type: "ccap", phrase: "CCAP", qualifiers: [] }])
})

Deno.test("extraction : aucune mention", () => {
  assertEquals(extractNamedDocuments("Quel est le délai global des travaux ?"), [])
})

Deno.test("extraction : numéro de lot avec n° et virgule", () => {
  const r = extractNamedDocuments("Dans le CCTP du lot n°07, quelles sont les tolérances ?")
  assertEquals(r[0].phrase, "CCTP du lot n°07")
  assertEquals(r[0].qualifiers, ["lot", "07"])
})

Deno.test("extraction : deux mentions du même type restent distinctes", () => {
  const r = extractNamedDocuments("Compare le CCTP du lot 02 et le CCTP du lot 07")
  assertEquals(r.map(x => x.qualifiers), [["lot", "02"], ["lot", "07"]])
})

Deno.test("extraction : verbe suffixé (prévoit-il) arrête la mention", () => {
  assertEquals(extractNamedDocuments("Le CCTP prévoit-il un paratonnerre sur l'EHPAD ?"),
    [{ type: "cctp", phrase: "CCTP", qualifiers: [] }])
})

Deno.test("extraction : motif long prioritaire (PV de réception, procès-verbal, mémoire technique)", () => {
  assertEquals(extractNamedDocuments("Le PV de réception est-il signé ?")[0].type, "pv")
  assertEquals(extractNamedDocuments("Que dit le procès-verbal 72 ?"), [{ type: "cr", phrase: "procès-verbal 72", qualifiers: ["72"] }])
  const mt = extractNamedDocuments("D'après le mémoire technique, quel est le délai ?")
  assertEquals(mt, [{ type: "memoire", phrase: "mémoire technique", qualifiers: [] }])
})

Deno.test("extraction : question elliptique minuscule", () => {
  assertEquals(extractNamedDocuments("dans le ccap ?"), [{ type: "ccap", phrase: "ccap", qualifiers: [] }])
})

Deno.test("extraction : « plan de paiement » n'est pas un document", () => {
  assertEquals(extractNamedDocuments("Quel est le plan de paiement prévu ?"), [])
  assertEquals(extractNamedDocuments("Que montre le plan de masse ?")[0]?.type, "plan")
})

Deno.test("extraction : charte chantier vert (chantier est un mot-outil, vert un qualifiant)", () => {
  const r = extractNamedDocuments("Que prévoit la charte chantier vert sur CMP ?")
  assertEquals(r, [{ type: "charte", phrase: "charte chantier vert", qualifiers: ["vert"] }])
})
```

- [ ] **Step 4: Lancer les tests pour vérifier l'échec**

Run (racine du repo) : `deno test supabase/functions/baikal-retrieval/routing/named-documents.test.ts`
Expected: échec de compilation, `named-documents.ts` introuvable.

- [ ] **Step 5: Écrire le module d'extraction**

Créer `supabase/functions/baikal-retrieval/routing/named-documents.ts` :

```ts
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
  return word.toLowerCase().replace(/^[ldcjmnst][’']/, "").replace(/^n[°º]/, "")
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
```

Points d'attention pour l'implémenteur :
- `STOPWORDS` de `keywords.ts` contient déjà « chantier », « cctp », « ccap », « ccag », « document », « projet », « marché » : c'est voulu, « chantier » n'est pas un qualifiant discriminant.
- Le motif `\bCR\b` est sensible à la casse (pas de flag `i`) : « cr » minuscule n'existe pas en français et créerait des faux positifs.
- La règle des 4 mots compte **tous** les mots après la mention, mots-outils compris (« de chantier, le 41 » = 4).

- [ ] **Step 6: Lancer les tests jusqu'au vert**

Run : `deno test supabase/functions/baikal-retrieval/routing/named-documents.test.ts`
Expected: 11 tests PASS. Si un cas échoue, corriger le module (pas le test) — sauf si le test contredit le design du prompt de reprise, auquel cas le signaler dans le rapport.

- [ ] **Step 7: Vérifier que les tests existants passent encore et que `deno check` n'a pas d'erreur nouvelle**

Run : `deno test supabase/functions/baikal-retrieval/search/keywords.test.ts`
Expected: PASS (l'export de `STOPWORDS` ne change rien).
Run : `deno check supabase/functions/baikal-retrieval/index.ts`
Expected: 11 erreurs, toutes dans `routing/analyzer.ts`.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/baikal-retrieval/types.ts supabase/functions/baikal-retrieval/search/keywords.ts supabase/functions/baikal-retrieval/routing/named-documents.ts supabase/functions/baikal-retrieval/routing/named-documents.test.ts
git commit -m "feat(retrieval): extraction des documents nommés dans la question (routing/named-documents.ts)"
```

---

### Task 2: Appariement et bloc de prompt

**Files:**
- Modify: `supabase/functions/baikal-retrieval/routing/named-documents.ts` (ajout en fin de fichier)
- Modify: `supabase/functions/baikal-retrieval/routing/named-documents.test.ts` (ajout)

**Interfaces:**
- Consumes: `NamedDocument`, `NamedDocumentResolution` (Task 1).
- Produces:
  - `normalizeName(s: string): string` — minuscules, sans diacritiques, `œ` → `oe`.
  - `matchNamedDocument(named: NamedDocument, candidateNames: string[]): NamedDocumentResolution`
  - `formatNamedDocumentsBlock(resolutions: NamedDocumentResolution[]): string | null` — bloc de prompt, `null` si rien à dire.

- [ ] **Step 1: Écrire les tests d'appariement et de bloc (qui échouent)**

Ajouter à `named-documents.test.ts` :

```ts
import { matchNamedDocument, formatNamedDocumentsBlock, normalizeName } from "./named-documents.ts"

// Noms réels du projet EHPAD (eval/config.json → ehpad), vérifiés en base le 2026-09-15
const EHPAD_CCTP = [
  "CCTP -  N°12 PEINTURE.pdf",
  "CCTP - Lot N°02 ETANCHEITE.pdf",
  "CCTP - Lot N°03 REVÊTEMENT DE FACADES.pdf",
  "CCTP - Lot N°05 MENUISERIES EXTERIEURES ALUMINIUM.pdf",
  "CCTP - Lot N°07 PLÂTRERIE.pdf",
  "CCTP - Lot N°08 FAUX-PLAFONDS.pdf",
]
const EHPAD_PV = [
  "72 PROCES VERBAL CHANTIER_Lézignan-Corbières_EHPAD.pdf.pdf",
  "73 PROCES VERBAL CHANTIER_Lézignan-Corbières_EHPAD.pdf.pdf",
]

Deno.test("normalizeName : accents, œ, casse", () => {
  assertEquals(normalizeName("GROS ŒUVRE Lézignan"), "gros oeuvre lezignan")
})

Deno.test("appariement : trouvé quand tous les qualifiants sont dans le nom (accents et n° ignorés)", () => {
  const r = matchNamedDocument({ type: "cctp", phrase: "CCTP du lot 7", qualifiers: ["lot", "7"] }, EHPAD_CCTP)
  assertEquals(r.status, "found")
  assertEquals(r.found, ["CCTP - Lot N°07 PLÂTRERIE.pdf"])
  assertEquals(r.total, 1)
})

Deno.test("appariement : qualifiant numérique apparié comme nombre entier (07 ≠ 070, 7 = 07)", () => {
  const cand = ["CR 07.pdf", "CR 070.pdf", "CR 107.pdf"]
  const r = matchNamedDocument({ type: "cr", phrase: "CR 7", qualifiers: ["7"] }, cand)
  assertEquals(r.found, ["CR 07.pdf"])
})

Deno.test("appariement : non trouvé → fichiers proches (max 5) du même type", () => {
  const r = matchNamedDocument({ type: "cctp", phrase: "CCTP du gros œuvre", qualifiers: ["gros", "œuvre"] }, EHPAD_CCTP)
  assertEquals(r.status, "not_found")
  assertEquals(r.found, [])
  assertEquals(r.similar.length, 5)
  assertEquals(r.total, 6)
})

Deno.test("appariement : aucun candidat", () => {
  const r = matchNamedDocument({ type: "pgc", phrase: "PGC", qualifiers: [] }, [])
  assertEquals(r.status, "no_candidate")
  assertEquals(r.total, 0)
})

Deno.test("appariement : sans qualifiant, un seul candidat → trouvé", () => {
  const r = matchNamedDocument({ type: "ccap", phrase: "CCAP", qualifiers: [] }, ["2139_CCAP.pdf"])
  assertEquals(r, { phrase: "CCAP", type: "ccap", found: ["2139_CCAP.pdf"], similar: [], status: "found", total: 1 })
})

Deno.test("appariement : sans qualifiant, plusieurs candidats → tous (max 5), total réel", () => {
  const r = matchNamedDocument({ type: "cctp", phrase: "CCTP", qualifiers: [] }, EHPAD_CCTP)
  assertEquals(r.status, "found")
  assertEquals(r.found.length, 5)
  assertEquals(r.total, 6)
})

Deno.test("appariement : compte rendu 72 trouvé parmi les procès-verbaux", () => {
  const r = matchNamedDocument({ type: "cr", phrase: "compte rendu de chantier, le 72", qualifiers: ["72"] }, EHPAD_PV)
  assertEquals(r.found, ["72 PROCES VERBAL CHANTIER_Lézignan-Corbières_EHPAD.pdf.pdf"])
})

Deno.test("bloc de prompt : une ligne par statut, unknown omis, null si vide", () => {
  const block = formatNamedDocumentsBlock([
    { phrase: "CCAP", type: "ccap", found: ["2139_CCAP.pdf"], similar: [], status: "found", total: 1 },
    { phrase: "CCTP du gros œuvre", type: "cctp", found: [], similar: ["CCTP - Lot N°07 PLÂTRERIE.pdf", "CCTP - Lot N°02 ETANCHEITE.pdf"], status: "not_found", total: 6 },
    { phrase: "PGC", type: "pgc", found: [], similar: [], status: "no_candidate", total: 0 },
    { phrase: "DOE", type: "doe", found: [], similar: [], status: "unknown", total: 0 },
    { phrase: "CCTP", type: "cctp", found: ["a.pdf", "b.pdf", "c.pdf", "d.pdf", "e.pdf"], similar: [], status: "found", total: 6 },
  ])!
  assert(block.startsWith("DOCUMENTS NOMMES DANS LA QUESTION"))
  assert(block.includes("- « CCAP » → 2139_CCAP.pdf"))
  assert(block.includes("- « CCTP du gros œuvre » → AUCUN fichier correspondant dans le projet ; fichiers proches : CCTP - Lot N°07 PLÂTRERIE.pdf, CCTP - Lot N°02 ETANCHEITE.pdf"))
  assert(block.includes("- « PGC » → AUCUN fichier de ce type dans le projet"))
  assert(!block.includes("DOE"))
  assert(block.includes("e.pdf (+1 autre)"))
  assertEquals(formatNamedDocumentsBlock([]), null)
  assertEquals(formatNamedDocumentsBlock([{ phrase: "DOE", type: "doe", found: [], similar: [], status: "unknown", total: 0 }]), null)
})
```

- [ ] **Step 2: Lancer les tests pour vérifier l'échec**

Run : `deno test supabase/functions/baikal-retrieval/routing/named-documents.test.ts`
Expected: erreur d'import (`matchNamedDocument` non exporté).

- [ ] **Step 3: Implémenter l'appariement et le bloc**

Ajouter en fin de `named-documents.ts` (et compléter l'import de types : `NamedDocumentResolution`) :

```ts
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
```

Note : le test « fichiers proches » attend exactement `CCTP - Lot N°07 PLÂTRERIE.pdf, CCTP - Lot N°02 ETANCHEITE.pdf` suivi de ` (+4 autres)` (total 6, 2 listés) — le `includes` du test passe car la partie attendue est un préfixe de la ligne.

- [ ] **Step 4: Lancer les tests jusqu'au vert**

Run : `deno test supabase/functions/baikal-retrieval/routing/named-documents.test.ts`
Expected: 20 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/baikal-retrieval/routing/named-documents.ts supabase/functions/baikal-retrieval/routing/named-documents.test.ts
git commit -m "feat(retrieval): appariement des documents nommés et bloc de prompt (named-documents.ts)"
```

---

### Task 3: Résolution ciblée contre `sources.files`

**Files:**
- Modify: `supabase/functions/baikal-retrieval/routing/named-documents.ts` (ajout)
- Modify: `supabase/functions/baikal-retrieval/routing/named-documents.test.ts` (ajout)

**Interfaces:**
- Consumes: `Supabase` (`types.ts`), `matchNamedDocument` (Task 2).
- Produces:
  - `TYPE_FILENAME_PATTERNS: Record<NamedDocumentType, string[]>` — regex Postgres (`~*`) de nom de fichier par type.
  - `buildFilenameFilter(type: NamedDocumentType): string` — argument de `.or()` PostgREST.
  - `resolveNamedDocuments(supabase: Supabase, projectId: string | undefined, named: NamedDocument[]): Promise<NamedDocumentResolution[]>` — ne lève jamais.

Contexte pour l'implémenteur : `sources.files` a les colonnes `original_filename text`, `display_name text` (souvent `null`), `project_id uuid`, `processing_status text` (vérifié en base le 2026-09-15). Le nom présenté au modèle est `display_name` sinon `original_filename` — la même règle que `COALESCE(f.display_name, f.original_filename)` dans `match_documents_v15`, donc cohérent avec le header `DOCUMENT: "…"` des chunks. L'opérateur PostgREST `imatch` correspond à `~*` (regex insensible à la casse) ; dans une chaîne `.or()` la valeur ne doit contenir **ni virgule ni parenthèse** — d'où `.?.?.?` à la place de `.{0,3}`.

- [ ] **Step 1: Écrire le test du filtre (qui échoue)**

Ajouter à `named-documents.test.ts` :

```ts
import { buildFilenameFilter, TYPE_FILENAME_PATTERNS } from "./named-documents.ts"

Deno.test("filtre PostgREST : deux colonnes par motif, imatch, aucune virgule ni parenthèse dans les motifs", () => {
  assertEquals(buildFilenameFilter("ccap"), "original_filename.imatch.ccap,display_name.imatch.ccap")
  const cr = buildFilenameFilter("cr")
  assert(cr.includes("original_filename.imatch.\\mcr\\M"))
  assert(cr.includes("display_name.imatch.compte.?s?.?rendu"))
  assert(cr.includes("proc[eèé]s.?verba"))
  for (const patterns of Object.values(TYPE_FILENAME_PATTERNS)) {
    for (const p of patterns) assert(!/[,()]/.test(p), `motif interdit dans .or() : ${p}`)
  }
})
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run : `deno test supabase/functions/baikal-retrieval/routing/named-documents.test.ts`
Expected: erreur d'import (`buildFilenameFilter` non exporté).

- [ ] **Step 3: Implémenter la résolution**

Ajouter en fin de `named-documents.ts` (compléter l'import : `import type { Supabase, NamedDocument, NamedDocumentType, NamedDocumentResolution } from "../types.ts"`) :

```ts
// ============================================================================
// RÉSOLUTION (une requête par type nommé, limitée, jamais de liste complète)
// ============================================================================

const MAX_CANDIDATES = 20

/** Regex Postgres (~*) sur le nom de fichier, par type. \m et \M = limites de mot. Ni virgule ni parenthèse (contrainte .or()). */
export const TYPE_FILENAME_PATTERNS: Record<NamedDocumentType, string[]> = {
  cctp:            ['cctp'],
  ccap:            ['ccap'],
  ccag:            ['ccag'],
  doe:             ['\\mdoe\\M', 'dossier.?d.?ouvrages?.?ex'],
  dpgf:            ['dpgf'],
  planning:        ['planning'],
  pv:              ['\\mpv\\M', 'proc[eèé]s.?verba'],
  memoire:         ['m[eéè]moire'],
  pgc:             ['\\mpgc\\M'],
  rict:            ['\\mrict\\M'],
  charte:          ['charte'],
  cr:              ['\\mcr\\M', 'compte.?s?.?rendu', '\\mpv\\M', 'proc[eèé]s.?verba'],
  acte_engagement: ['acte.?d.?engagement', '\\mae\\M'],
  plan:            ['\\mplans?\\M'],
  notice:          ['notice'],
}

/** Argument de .or() PostgREST : chaque motif sur les deux colonnes de nom. */
export function buildFilenameFilter(type: NamedDocumentType): string {
  return TYPE_FILENAME_PATTERNS[type]
    .flatMap(p => [`original_filename.imatch.${p}`, `display_name.imatch.${p}`])
    .join(',')
}

/** Noms des fichiers du projet d'un type donné ; null en cas d'erreur (→ statut unknown). */
async function fetchCandidates(supabase: Supabase, projectId: string, type: NamedDocumentType): Promise<string[] | null> {
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
  const names = (data || [])
    .map(f => (f.display_name as string | null) || (f.original_filename as string | null))
    .filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
  return [...new Set(names)]
}

function unknownResolution(n: NamedDocument): NamedDocumentResolution {
  return { phrase: n.phrase, type: n.type, found: [], similar: [], status: 'unknown', total: 0 }
}

/**
 * Résout chaque mention contre les fichiers du projet. Une requête par TYPE nommé
 * (deux mentions du même type partagent la même requête). Ne lève jamais.
 */
export async function resolveNamedDocuments(
  supabase: Supabase,
  projectId: string | undefined,
  named: NamedDocument[],
): Promise<NamedDocumentResolution[]> {
  if (!projectId || named.length === 0) return []
  try {
    const types = [...new Set(named.map(n => n.type))]
    const lists = await Promise.all(types.map(t => fetchCandidates(supabase, projectId, t)))
    const byType = new Map(types.map((t, i) => [t, lists[i]]))
    return named.map(n => {
      const candidates = byType.get(n.type)
      return candidates ? matchNamedDocument(n, candidates) : unknownResolution(n)
    })
  } catch (err) {
    console.warn('[named-documents] resolve error:', err)
    return named.map(unknownResolution)
  }
}
```

- [ ] **Step 4: Lancer les tests et `deno check`**

Run : `deno test supabase/functions/baikal-retrieval/routing/named-documents.test.ts`
Expected: 21 tests PASS.
Run : `deno check supabase/functions/baikal-retrieval/routing/named-documents.ts`
Expected: aucune erreur (ce fichier n'importe pas `analyzer.ts`).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/baikal-retrieval/routing/named-documents.ts supabase/functions/baikal-retrieval/routing/named-documents.test.ts
git commit -m "feat(retrieval): résolution ciblée des documents nommés contre sources.files (1 requête par type, limit 20)"
```

---

### Task 4: Intégration prompt, règle 8, câblage A2, suppression de la liste de `f385eaf`

**Files:**
- Modify: `supabase/functions/baikal-retrieval/types.ts:152` (`projectDocuments` → `namedDocuments`)
- Modify: `supabase/functions/baikal-retrieval/context.ts:60`, `:64-93`
- Modify: `supabase/functions/baikal-retrieval/generation/prompt.ts:5-7`, `:50-56`, `:86-90`
- Modify: `supabase/functions/baikal-retrieval/generation/prompt.test.ts`
- Modify: `supabase/functions/baikal-retrieval/index.ts:35`, `:167-172`, `:181-186`
- Modify: `supabase/functions/baikal-retrieval/agentic/orchestrator.ts:83-85`

**Interfaces:**
- Consumes: `extractNamedDocuments`, `resolveNamedDocuments`, `formatNamedDocumentsBlock` (Tasks 1-3).
- Produces: `AgentContext.namedDocuments: NamedDocumentResolution[]` (lu par Task 5 pour le log).

- [ ] **Step 1: Réécrire les tests de `prompt.test.ts` (qui échouent)**

Remplacer tout le fichier `supabase/functions/baikal-retrieval/generation/prompt.test.ts` par :

```ts
import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { buildSystemPrompt } from "./prompt.ts"
import type { AgentContext, FeatureFlags, NamedDocumentResolution } from "../types.ts"

const features: FeatureFlags = {
  enable_reranking: false, cohere_model: "rerank-v3.5", cohere_top_n: 10,
  adaptive_threshold_enabled: false, adaptive_threshold_ratio: 0.55, no_results_min_similarity: 0.15,
  use_response_format_json: true, inject_conversation_in_generation: false,
}

function ctx(namedDocuments: NamedDocumentResolution[], documentsCles: { slug: string; label: string }[] = []): AgentContext {
  return {
    effectiveOrgId: null, effectiveAppId: "arpet", systemPrompt: null, geminiSystemPrompt: null,
    parameters: {}, configSource: "test", projectIdentity: null, conversationId: "c",
    conversationSummary: null, conversationFirstMessage: null, recentMessages: [], messageCount: 0,
    previousSourceFileIds: [], documentsCles, namedDocuments,
  }
}

Deno.test("regle 8 : document nomme absent → refus explicite, s'appuie sur le bloc, sans liste des documents du projet", () => {
  const p = buildSystemPrompt(null, ctx([]), [], "factual", "paragraph", [], false, features)
  assertStringIncludes(p, "8. DOCUMENT NOMME PAR L'UTILISATEUR")
  assertStringIncludes(p, "n'existe pas dans le projet")
  assertStringIncludes(p, "DOCUMENTS NOMMES DANS LA QUESTION")
  assert(!p.includes("liste des documents du projet"))
})

Deno.test("bloc des documents nommes injecte quand il y a des resolutions, absent sinon", () => {
  const avec = buildSystemPrompt(null, ctx([
    { phrase: "CCTP du gros œuvre", type: "cctp", found: [], similar: ["CCTP - Lot N°07 PLÂTRERIE.pdf"], status: "not_found", total: 1 },
  ]), [], "factual", "paragraph", [], false, features)
  assertStringIncludes(avec, "DOCUMENTS NOMMES DANS LA QUESTION (resolus")
  assertStringIncludes(avec, "- « CCTP du gros œuvre » → AUCUN fichier correspondant dans le projet ; fichiers proches : CCTP - Lot N°07 PLÂTRERIE.pdf")
  const sans = buildSystemPrompt(null, ctx([]), [], "factual", "paragraph", [], false, features)
  assert(!sans.includes("DOCUMENTS NOMMES DANS LA QUESTION (resolus"))
  assert(!sans.includes("DOCUMENTS DU PROJET"))
})

Deno.test("liste de concepts (documentsCles) ne doit jamais etre presentee comme des fichiers du projet", () => {
  const p = buildSystemPrompt(null, ctx([], [{ slug: "cctp", label: "CCTP" }]), [], "factual", "paragraph", [], false, features)
  assert(!p.includes("DOCUMENTS DU PROJET"))
  assert(!p.includes("- « CCTP »"))
})
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

Run : `deno test supabase/functions/baikal-retrieval/generation/prompt.test.ts`
Expected: erreur de type (`namedDocuments` n'existe pas dans `AgentContext`).

- [ ] **Step 3: `types.ts` — remplacer le champ**

Ligne 152, remplacer :
```ts
  projectDocuments: string[]        // Sprint 1 : noms des fichiers réellement ingérés dans le projet (sources.files)
```
par :
```ts
  namedDocuments: NamedDocumentResolution[]   // Sprint 1 (fin) : documents nommés dans la question, résolus sur sources.files
```

- [ ] **Step 4: `context.ts` — retirer la liste**

Ligne 60 : `projectDocuments: [],` → `namedDocuments: [],`.
Supprimer entièrement la section « GET PROJECT DOCUMENT NAMES » (lignes 64-93, fonction `getProjectDocumentNames` et son en-tête de section).

- [ ] **Step 5: `prompt.ts` — règle 8 et bloc**

Import (lignes 5-7) : ajouter `import { formatNamedDocumentsBlock } from "../routing/named-documents.ts"` après l'import de types.

Remplacer la règle 8 (lignes 50-55) par :

```
8. DOCUMENT NOMME PAR L'UTILISATEUR :
   Quand la question nomme un document (ex: "le CCTP du gros oeuvre", "le CCAP", "le PGC"), le bloc
   "DOCUMENTS NOMMES DANS LA QUESTION" ci-dessous indique le fichier du projet qui lui correspond, ou AUCUN.
   - Si un document nomme est marque AUCUN : commence ta reponse en disant explicitement que ce document
     n'existe pas dans le projet (cite les fichiers proches s'il y en a), puis reponds a partir des sources
     reellement fournies en les nommant.
   - N'attribue JAMAIS une information a un document qui ne l'a pas fournie : chaque affirmation est
     rattachee au fichier du chunk d'ou elle vient (header DOCUMENT), jamais au document nomme par l'utilisateur.
```

Remplacer le bloc lignes 86-90 (`// Sprint 1 : liste des fichiers ...` jusqu'à la fermeture du `if`) par :

```ts
  // Sprint 1 (fin) : resolution des documents nommes dans la question (regle 8)
  const namedBlock = formatNamedDocumentsBlock(context.namedDocuments || [])
  if (namedBlock) parts.push(namedBlock)
```

- [ ] **Step 6: `index.ts` — import et câblage A2**

Ligne 35 : `import { getAgentContext, addMessage, getProjectDocumentNames } from "./context.ts"` → `import { getAgentContext, addMessage } from "./context.ts"`, puis ajouter juste après : `import { extractNamedDocuments, resolveNamedDocuments } from "./routing/named-documents.ts"`.

Lignes 167-172, remplacer :
```ts
          const [context, initialEmbedding, projectDocuments] = await Promise.all([
            getAgentContext(supabase, user_id, org_id, project_id, app_id, conversation_id, config.brain),
            generateEmbedding(query, OPENAI_API_KEY),
            getProjectDocumentNames(supabase, project_id),
          ])
          context.projectDocuments = projectDocuments
```
par :
```ts
          const initialNamed = extractNamedDocuments(query)
          const [context, initialEmbedding, namedDocuments] = await Promise.all([
            getAgentContext(supabase, user_id, org_id, project_id, app_id, conversation_id, config.brain),
            generateEmbedding(query, OPENAI_API_KEY),
            resolveNamedDocuments(supabase, project_id, initialNamed),
          ])
          context.namedDocuments = namedDocuments
```

Lignes 181-186 (bloc condensation), remplacer :
```ts
            if (condensed !== query) {
              effectiveQuery = condensed
              queryEmbedding = await generateEmbedding(condensed, OPENAI_API_KEY)
            }
```
par :
```ts
            if (condensed !== query) {
              effectiveQuery = condensed
              queryEmbedding = await generateEmbedding(condensed, OPENAI_API_KEY)
              // La question réécrite peut nommer un document que l'ellipse ne nommait pas
              const condensedNamed = extractNamedDocuments(condensed)
              if (condensedNamed.length > 0 && JSON.stringify(condensedNamed) !== JSON.stringify(initialNamed)) {
                context.namedDocuments = await resolveNamedDocuments(supabase, project_id, condensedNamed)
              }
            }
```

- [ ] **Step 7: `orchestrator.ts` — le chemin agentique voit aussi le bloc**

Ajouter l'import en tête (après les imports de types) : `import { formatNamedDocumentsBlock } from "../routing/named-documents.ts"`.

Après le bloc lignes 83-85 (`if (context.documentsCles?.length > 0) {...}`), ajouter :

```ts
  const namedBlock = formatNamedDocumentsBlock(context.namedDocuments || [])
  if (namedBlock) {
    contextParts.push(`${namedBlock}\nSi un document nommé est marqué AUCUN, dis-le explicitement en début de réponse et n'attribue jamais une information à ce document.`)
  }
```

- [ ] **Step 8: Tests et `deno check`**

Run : `deno test supabase/functions/baikal-retrieval/generation/prompt.test.ts`
Expected: 3 tests PASS.
Run : `deno test supabase/functions/baikal-retrieval/routing/named-documents.test.ts supabase/functions/baikal-retrieval/search/keywords.test.ts supabase/functions/baikal-retrieval/search/layer-weight.test.ts supabase/functions/baikal-retrieval/routing/condenser.test.ts supabase/functions/baikal-retrieval/agentic/gate.test.ts supabase/functions/baikal-retrieval/sources.test.ts`
Expected: tout PASS.
Run : `deno check supabase/functions/baikal-retrieval/index.ts`
Expected: 11 erreurs, toutes dans `routing/analyzer.ts` — **aucune** mention de `projectDocuments`, `getProjectDocumentNames` ou `namedDocuments`.
Run : `grep -rn "projectDocuments\|getProjectDocumentNames" supabase/functions/baikal-retrieval`
Expected: aucune ligne.

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/baikal-retrieval/types.ts supabase/functions/baikal-retrieval/context.ts supabase/functions/baikal-retrieval/generation/prompt.ts supabase/functions/baikal-retrieval/generation/prompt.test.ts supabase/functions/baikal-retrieval/index.ts supabase/functions/baikal-retrieval/agentic/orchestrator.ts
git commit -m "feat(retrieval): documents nommés résolus dans le prompt (règle 8) et le contexte agentique ; liste des 50 fichiers de f385eaf supprimée"
```

---

### Task 5: Traçabilité `query_logs`, migration, harnais d'éval

**Files:**
- Modify: `supabase/functions/baikal-retrieval/logging.ts:17-48`
- Modify: `supabase/functions/baikal-retrieval/index.ts` — les 4 appels `logQuery` qui disposent de `context` (conversationnel ~l.212, mémoire ~l.248, agentique ~l.380, fast path ~l.575 ; **pas** celui du `catch` ~l.622 qui n'a pas de contexte)
- Create: `supabase/migrations/20260915100000_rag_query_logs_named_documents.sql`
- Modify: `eval/run-eval.ts:120-128`

**Interfaces:**
- Consumes: `context.namedDocuments` (Task 4).
- Produces: `QueryLogEntry.named_documents?: NamedDocumentResolution[] | null`.

- [ ] **Step 1: `logging.ts` — le champ**

Import : `import type { Supabase, NamedDocumentResolution } from "./types.ts"`.
Dans `QueryLogEntry`, après `agentic?: {...} | null` (ligne 40), ajouter :
```ts
  named_documents?: NamedDocumentResolution[] | null   // Sprint 1 (fin) : documents nommés dans la question et leur résolution
```

- [ ] **Step 2: `index.ts` — écrire le champ dans les 4 appels**

Dans chacun des 4 appels `logQuery` listés ci-dessus, ajouter une ligne après `rewritten_query: ...,` :
```ts
              named_documents: context.namedDocuments.length > 0 ? context.namedDocuments : null,
```
(indentation à aligner sur l'appel concerné).

- [ ] **Step 3: Migration**

Créer `supabase/migrations/20260915100000_rag_query_logs_named_documents.sql` :

```sql
-- ============================================================================
-- Sprint 1 (fin) — Traçabilité des documents nommés dans la question
-- Spec : docs/superpowers/prompts/2026-09-15-documents-nommes-scalable.md (§ 6)
-- Colonne jsonb, nullable, sans index : lue par les analyses hors ligne uniquement.
-- À appliquer AVANT le déploiement de l'Edge Function qui l'écrit (sinon
-- l'insertion query_logs échoue : warn console, ligne perdue).
-- ============================================================================

ALTER TABLE rag.query_logs ADD COLUMN IF NOT EXISTS named_documents jsonb;

COMMENT ON COLUMN rag.query_logs.named_documents IS
  'Documents nommés dans la question et leur résolution sur sources.files : [{phrase, type, status, found[], similar[], total}]';
```

- [ ] **Step 4: Harnais — reconnaître le refus attendu de C7-004**

Dans `eval/run-eval.ts`, `REFUSAL_PATTERNS` (lignes 120-128), ajouter avant le `]` fermant :
```ts
  /n['’]existe pas (dans|parmi)/i, /aucun (fichier|document)[^.]{0,60}(projet|corpus)/i,
```
Raison : la réponse attendue commence par « Le CCTP du gros œuvre n'existe pas dans le projet… », qu'aucun motif actuel n'attrape (`/n'est pas (mentionn|…)/` ne couvre pas « n'existe pas »).

- [ ] **Step 5: `deno check` et tests**

Run : `deno check supabase/functions/baikal-retrieval/index.ts`
Expected: 11 erreurs `analyzer.ts` seulement.
Run : `deno check eval/run-eval.ts`
Expected: aucune erreur.
Run : `deno test supabase/functions/baikal-retrieval/generation/prompt.test.ts supabase/functions/baikal-retrieval/routing/named-documents.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/baikal-retrieval/logging.ts supabase/functions/baikal-retrieval/index.ts supabase/migrations/20260915100000_rag_query_logs_named_documents.sql eval/run-eval.ts
git commit -m "feat(retrieval): named_documents tracé dans rag.query_logs (migration) ; harnais : refus « n'existe pas dans le projet » reconnu"
```

---

### Task 6: Portes G1' / G2', rejeu `baseline-v2.1.0`, baseline figée

Cette tâche est conduite par le contrôleur (pas par un sous-agent) : elle contient les deux portes qui exigent l'accord d'Eric.

**Files:**
- Create (suivis par git) : `eval/reports/baseline-v2.1.0.json`, `.md`, `.conversations.json`, `baseline-v2.1.0-synth.json`, `.md`, `.conversations.json`

- [ ] **Step 1: Récupérer les rapports intermédiaires du worktree (gitignorés, donc absents de `main`)**

```bash
cp .claude/worktrees/sprint1-rag-retrieval/eval/reports/s1*-v2.1.0* eval/reports/
ls eval/reports/ | grep s1
```
Expected: `s1-v2.1.0.*`, `s1-v2.1.0-synth.*`, `s1b-v2.1.0.*`, `s1b-v2.1.0-synth.*` présents (comparaison de référence pour « aucune classe en recul de plus d'une question »). Ils restent gitignorés.

- [ ] **Step 2: Porte G1' — soumettre la migration à Eric**

Présenter le contenu de `supabase/migrations/20260915100000_rag_query_logs_named_documents.sql`. Sur « ok g1 » : appliquer via MCP `apply_migration` (projet `odspcxgafcqxjzrarsqf`, nom `rag_query_logs_named_documents`), puis vérifier :
```sql
select column_name, data_type from information_schema.columns
where table_schema='rag' and table_name='query_logs' and column_name='named_documents';
```
Expected: une ligne, `jsonb`.

- [ ] **Step 3: Porte G2' — déploiement**

Sur « ok g2 » d'Eric, depuis la racine du repo :
```bash
npx supabase functions deploy baikal-retrieval --project-ref odspcxgafcqxjzrarsqf
```
Le banc n'a pas d'option pour rejouer une seule question : le fumigène est le rejeu réel de l'étape 4, dont on lit C7-004 en premier.

- [ ] **Step 4: Rejeu complet sous le tag final, C7-004 lue en premier**

```bash
deno run -A eval/run-eval.ts --tag baseline-v2.1.0 --baseline eval/reports/baseline-v2.0.0.json
node -e "const r=require('./eval/reports/baseline-v2.1.0.json');const x=r.results.find(x=>x.id==='C7-004');console.log(x.ok_criteria,x.refusal_detected,'\n',x.answer.slice(0,600))"
```
Attendu : `true true` et une réponse qui commence par l'absence du CCTP gros œuvre. Vérifier aussi en base :
```sql
select query, named_documents from rag.query_logs where query ilike '%gros œuvre%' order by created_at desc limit 1;
```
Expected: `named_documents` = un élément `status: "not_found"`, `similar` = 5 CCTP, `total: 6`.

Si C7-004 échoue encore : lire la réponse et le `named_documents` loggé, corriger (prompt ou extraction), redéployer sur « ok » d'Eric, relancer sous le **même** tag (le rapport est écrasé). Puis le synthétique :
```bash
deno run -A eval/run-eval.ts --golden eval/golden-set.synthetic.json --tag baseline-v2.1.0-synth --baseline eval/reports/baseline-v2.0.0-synth.json
```
Attendu : C7 réel 4/4, synthétique C7 6/6 ; aucune classe en recul de plus d'une question par rapport à `s1b-v2.1.0.*` ; recall réel ≥ 97 %.

- [ ] **Step 5: Lire chaque échec restant et le classer**

```bash
node -e "const r=require('./eval/reports/baseline-v2.1.0.json');r.results.filter(x=>x.ok_criteria===false).forEach(x=>console.log(x.id,'|',x.question,'\n  ',String(x.answer).slice(0,400),'\n'))"
```
Pour chaque échec, une ligne dans le registre : `critère à revoir` / `Sprint 2 (multi-doc, condenser)` / `corpus (Sprint 4)`. Une régression nouvelle sur une classe (> 1 question vs `s1b`) est un **arrêt** : la signaler à Eric avant de figer.

- [ ] **Step 6: Figer la baseline**

```bash
git add eval/reports/baseline-v2.1.0.json eval/reports/baseline-v2.1.0.md eval/reports/baseline-v2.1.0.conversations.json eval/reports/baseline-v2.1.0-synth.json eval/reports/baseline-v2.1.0-synth.md eval/reports/baseline-v2.1.0-synth.conversations.json
git commit -m "feat(eval): baseline v2.1.0 figée (réel 35 q + synthétique 60 q) — fin du Sprint 1"
```

---

### Task 7: Documentation, registre, ménage

**Files:**
- Modify: `C:\Dev\Frontend-ARPET\docs\SPEC_RAG_OPTIM_V1.md` §3 (P11), §7 (tableau des baselines), nouvelle §7.3
- Modify: `C:\Dev\Frontend-ARPET\CLAUDE.md` § « État Courant »
- Modify: `.superpowers/sdd/2026-09-13-sprint1-rag-retrieval/progress.md`
- (proposition à Eric) `C:\Dev\Frontend-Baikal\CLAUDE.md` ligne `baikal-retrieval | **Main pipeline v2.0**` → `v2.1.0`

- [ ] **Step 1: Spec ARPET §7 — tableau et §7.3**

Dans le tableau de §7 : ligne Sprint 1 → `✅`, baseline avant `v2.0.0`, après `v2.1.0` (rapports `eval/reports/baseline-v2.1.0.*`). Ajouter une sous-section « 7.3 Sprint 1 — résultats » avec deux tableaux (réel 35 q, synthétique 60 q) reprenant les colonnes recall doc / critères / MRR / Page OK / p50 / agentique, valeurs lues dans `eval/reports/baseline-v2.1.0.md` et `baseline-v2.1.0-synth.md` (v2.0.0 → v2.1.0), puis gains et pertes nominatifs (ids), puis « Enseignements » : condensation des suivis (réécritures pertinentes, 2 sur-remplies → prompt à corriger au Sprint 2), gate agentique (distribution `fast_path_ok` / `too_few_vector_chunks` / `low_max_similarity`), poids couche app (C2-003 répond depuis le CCAP projet au lieu du plafond CCAG — réponse plus utile, critère du set réel à documenter), documents nommés (C7-004 refusé, mécanisme scalable : une requête ciblée par type nommé).

- [ ] **Step 2: Spec ARPET §3 — P11**

Marquer P11 (« `sources.ts` lit `metadata.page` mais les chunks portent `page_start` ») comme corrigé au Sprint 1 (commit `2f97aea`, pages mesurables : valeur « Page OK » du rapport).

- [ ] **Step 3: CLAUDE.md ARPET — État Courant**

Section « 📌 État Courant » : date `2026-09-15`, prod = `baikal-retrieval v2.1.0` (Sprint 1 fusionné dans `main` Baikal, commit de merge `51dc191` + commits de cette reprise), résumé en 5 lignes (FTS OR-isé, v15, poids couche app, condenser, gate, page, documents nommés), résultats (valeurs de la baseline v2.1.0), prochaine étape : Sprint 2 (multi-docs S2.x, prompt du condenser). Ne pas réécrire le reste du fichier.

- [ ] **Step 4: Commit ARPET**

```bash
git -C C:/Dev/Frontend-ARPET add docs/SPEC_RAG_OPTIM_V1.md CLAUDE.md
git -C C:/Dev/Frontend-ARPET commit -m "docs(rag): Sprint 1 clos — baseline v2.1.0, §7.3 résultats, P11 corrigé, état courant"
```
(le repo ARPET est sur `main` ; ses fichiers modifiés non commités — `Sidebar.tsx`, `MeetingRecordModal.tsx`, `meeting.service.ts`, `ConnectorsModal.tsx` supprimé, `settings.local.json` — ne sont **pas** ajoutés).

- [ ] **Step 5: Registre et CLAUDE.md Baikal**

Ajouter au registre `progress.md` les lignes de cette reprise (tâches 1-7, décisions, minors). Proposer à Eric la mise à jour d'une ligne du `CLAUDE.md` Baikal (`v2.0` → `v2.1.0`) — n'éditer qu'avec son accord (règle du hook d'auto-doc).

- [ ] **Step 6: Ménage (sur accord d'Eric uniquement)**

Après l'étape 1 de la Task 6 (rapports copiés) :
```bash
git worktree remove .claude/worktrees/sprint1-rag-retrieval
git branch -d sprint1/rag-retrieval
```
Optionnel, sur demande : suppression des ~300 conversations de test dans `rag.conversations` (ids dans `eval/reports/*.conversations.json`).

---

## Minors différés (hors périmètre, à garder en tête)

Hérités de la revue finale du Sprint 1 : 11 erreurs `deno check` dans `routing/analyzer.ts` (code mort `analyzeQuery`) ; entier nu « article 12 » non extrait par `keywords.ts` ; `p_children_per_parent` en dur ; `SECURITY DEFINER` sans `search_path` / `REVOKE PUBLIC` sur v14 et v15 (migration de hardening à part) ; pool graphrag non ×4 ; clé Gemini en query string ; `condenseQuery` sans test réseau ; regex de refus « ne est pas » du harnais ; le condenser recopie parfois la réponse précédente dans la question réécrite (prompt à corriger au Sprint 2).

Nouveaux, propres à ce plan : `plan`/`notice`/`charte` sont des mots courants — la liste `PLAN_NON_DOCUMENT` est un garde-fou minimal, à enrichir si les logs `named_documents` montrent des faux positifs ; `\mcr\M` en regex Postgres ne distingue pas « CR » d'un sigle homonyme dans un nom de fichier ; la résolution ignore `display_name` quand il est `null` (cas général aujourd'hui).
