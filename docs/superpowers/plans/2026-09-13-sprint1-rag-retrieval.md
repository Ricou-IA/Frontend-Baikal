# Sprint 1 « Colmater le retrieval » — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire remonter les bons chunks sans dépense supplémentaire : numéros d'article et codes de norme exploités par le full-text, enfants L1 rendus aux synthèses, couche projet privilégiée sur la couche application, questions de suivi condensées, contrôle qualité agentique lisible, numéro de page dans les sources.

**Architecture:** Tout se joue dans l'Edge Function `baikal-retrieval` (Deno) et dans une nouvelle fonction SQL `rag.match_documents_v15` (copie de v14 avec trois changements : entonnoir ×4, enfants hors LIMIT, pondération de couche). Trois modules purs nouveaux (`search/keywords.ts`, `routing/condenser.ts`, `agentic/gate.ts`) testés unitairement avec `Deno.test`; le reste est du câblage dans `index.ts` et `search/retrieval.ts`. Deux portes de déploiement, chacune suivie d'un passage du banc d'éval réel (35 q) et synthétique (60 q) comparé aux baselines figées.

**Tech Stack:** Deno 2.8 (Edge Functions Supabase), Postgres 17 + pgvector (fonction plpgsql), Gemini 2.5 Flash-Lite (condensation, REST `generateContent`), OpenAI `text-embedding-3-small`, banc `eval/run-eval.ts`.

**Spec:** `C:\Dev\Frontend-ARPET\docs\SPEC_RAG_OPTIM_V1.md` — §3 (P2, P3, P4, P5, P8, P11), §5 Sprint 1 (S1.1 → S1.5) + S4.4 remontée, §7.1 et §7.2 (baselines).

## Global Constraints

- **Claude Code modifie le code, Eric déploie** : `npx supabase functions deploy baikal-retrieval --project-ref odspcxgafcqxjzrarsqf` (gate G2a, G2b). Aucun déploiement par MCP sans accord explicite.
- **Toute migration SQL est soumise avant application** (gate G1) ; application via MCP `apply_migration` après accord, nom `rag_match_documents_v15` ; le fichier est aussi versionné dans `supabase/migrations/`.
- **Rien n'est poussé sur GitHub sans accord** ; commits locaux à chaque tâche.
- **Aucun comportement RAG ne change avant la baseline** : les baselines sont figées (`eval/reports/baseline-v2.0.0.*` et `baseline-v2.0.0-synth.*`, commits `af43037`, `60a9d13`).
- **Pas de reranker Cohere dans ce sprint** (S3), pas de changement d'embedding (hors périmètre V1).
- **Latence** : +300–800 ms tolérés sur les seules questions de suivi (S1.4) ; le chemin rapide factuel reste < 5 s.
- Conventions repo : Edge Functions en TypeScript Deno, tests `*.test.ts` à côté du module avec `https://deno.land/std@0.224.0/assert/mod.ts`, lancés par `deno test <fichier>` ; commentaires et messages de commit en français ; `deno check` avant tout commit d'un `.ts`.
- **Clés** : `GEMINI_API_KEY` et `OPENAI_API_KEY` sont déjà des secrets de l'Edge Function (utilisés par le mode agentique et l'embedding) — rien à ajouter.

---

## Fichiers

| Action | Chemin (repo Frontend-Baikal) | Responsabilité |
|---|---|---|
| Créer | `supabase/functions/baikal-retrieval/search/keywords.ts` | Extraction de termes de recherche (codes, articles, mots) + construction de la requête `websearch` OR-isée |
| Créer | `supabase/functions/baikal-retrieval/search/keywords.test.ts` | Tests unitaires de l'extraction |
| Modifier | `supabase/functions/baikal-retrieval/search/retrieval.ts` | Requête FTS OR-isée, appel `match_documents_v15`, paramètre de pondération de couche |
| Modifier | `supabase/functions/baikal-retrieval/routing/safety.ts:118-124` | `extractKeywords` délègue à `keywords.ts` (un seul extracteur) |
| Créer | `supabase/migrations/20260914100000_rag_match_documents_v15.sql` | Fonction SQL v15 (entonnoir ×4, enfants hors LIMIT, `p_app_layer_weight`, `p_children_per_parent`) |
| Modifier | `supabase/functions/baikal-retrieval/config.ts` | Constante `MATCH_DOCUMENTS_FN`, `app_layer_weight` dans le fallback et le parseur librarian |
| Modifier | `supabase/functions/baikal-retrieval/types.ts` | `LibrarianConfig.app_layer_weight`, `GateDecision` importé, `PipelineMetrics.decisions.agentic_gate_reason` |
| Modifier | `supabase/functions/baikal-retrieval/agentic/tools.ts:278` | `search_in_file` appelle `MATCH_DOCUMENTS_FN` |
| Créer | `supabase/functions/baikal-retrieval/search/layer-weight.ts` (+ `.test.ts`) | Décision pure : quel poids donner à la couche app pour cette requête |
| Créer | `supabase/functions/baikal-retrieval/routing/condenser.ts` (+ `.test.ts`) | Détection d'une question elliptique + condensation par Gemini flash-lite avec timeout et fallback |
| Créer | `supabase/functions/baikal-retrieval/agentic/gate.ts` (+ `.test.ts`) | Contrôle qualité agentique : décision + raison tracée |
| Modifier | `supabase/functions/baikal-retrieval/agentic/orchestrator.ts:195-224` | `shouldTriggerAgentic` retiré (remplacé par `gate.ts`) |
| Modifier | `supabase/functions/baikal-retrieval/index.ts` | Câblage : condensation, requête effective, gate, `gate_reason` dans les logs, version 2.1.0 |
| Modifier | `supabase/functions/baikal-retrieval/logging.ts:31-36` | `agentic.gate_reason`, `agentic.n_vector`, `agentic.max_sim` |
| Modifier | `supabase/functions/baikal-retrieval/sources.ts:60` | `page` lu depuis `metadata.page` puis `metadata.page_start` (P11) |
| Créer | `supabase/functions/baikal-retrieval/sources.test.ts` | Test du fallback de page |
| Modifier | `C:\Dev\Frontend-ARPET\docs\SPEC_RAG_OPTIM_V1.md` §7 | Résultats S1 (rapports `s1a-*`, `s1b-*`) |

Les rapports d'éval intermédiaires (`eval/reports/s1a-*`, `s1b-*`) sont gitignorés (`reports/*` sauf `baseline-*`) : on les cite dans la spec, on ne les commite pas — sauf le rapport final que l'on renomme `baseline-v2.1.0.*` pour le figer.

---

### Task 1: Termes de recherche et requête full-text OR-isée (S1.1 — cible P2)

**Files:**
- Create: `supabase/functions/baikal-retrieval/search/keywords.ts`
- Create: `supabase/functions/baikal-retrieval/search/keywords.test.ts`
- Modify: `supabase/functions/baikal-retrieval/search/retrieval.ts:15-60`, `:194-262`, `:280-299`, `:312-331`, `:347-366`
- Modify: `supabase/functions/baikal-retrieval/routing/safety.ts:118-124`

**Interfaces:**
- Consumes: rien.
- Produces: `extractSearchTerms(query: string): string[]` (max 8 termes, codes d'abord) et `buildFtsQuery(terms: string[]): string` (chaîne `websearch_to_tsquery`, `""` si aucun terme). `safety.ts` continue d'exporter `extractKeywords(query): string[]` (même signature, délègue).

Pourquoi : `websearch_to_tsquery('french', question entière)` fait un AND de tous les mots ; « Que dit l'article 3.7 du CCAP CMP ? » exige `article & 3.7 & ccap & cmp` et le chunk qui contient « 3.7 » mais pas « CMP » est éliminé (vérifié en base le 2026-09-13 : `m_ws=false`, `m_or=true`, rang 2,9). Avec des termes en OR, le chunk remonte et le boost d'intersection vector+fulltext s'applique enfin.

- [ ] **Step 1.1 : Écrire les tests (échec attendu)**

`supabase/functions/baikal-retrieval/search/keywords.test.ts` :

```ts
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { extractSearchTerms, buildFtsQuery } from "./keywords.ts"

Deno.test("numéro d'article conservé, mots-outils et mots-document écartés", () => {
  const t = extractSearchTerms("Que dit l'article 3.7 du CCAP CMP ?")
  assert(t.includes("3.7"), `attendu 3.7 dans ${t}`)
  assert(!t.includes("article"))
  assert(!t.includes("ccap"))
})

Deno.test("références légales L. 8221-3 à L. 8221-5", () => {
  const t = extractSearchTerms("Que disent les pièces du marché sur les articles L. 8221-3 à L. 8221-5 ?")
  assert(t.includes("8221-3"), `attendu 8221-3 dans ${t}`)
  assert(t.includes("8221-5"))
  assert(t.includes("pièces"))
})

Deno.test("normes multi-mots conservées comme phrase", () => {
  const t = extractSearchTerms("Que dit le CCTP sur la NF EN 1154 et le DTU 25.41 ?")
  assert(t.includes("nf en 1154"), `attendu 'nf en 1154' dans ${t}`)
  assert(t.includes("dtu 25.41"), `attendu 'dtu 25.41' dans ${t}`)
})

Deno.test("numéro de lot conservé", () => {
  const t = extractSearchTerms("Qu'est-ce qu'il y a dans le 3.6 du CCTP du lot 06 ?")
  assert(t.includes("3.6"))
  assert(t.includes("lot 06"), `attendu 'lot 06' dans ${t}`)
})

Deno.test("question ordinaire : mots significatifs, accents conservés", () => {
  const t = extractSearchTerms("Où se trouve le terrain de pétanque ?")
  assertEquals(t, ["terrain", "pétanque"])
})

Deno.test("plafond de 8 termes, codes en premier", () => {
  const t = extractSearchTerms("article 2.3.9 pénalités retard chantier résidence Dunant Ecoles Lassalle Presbytère Cannas Faubourg")
  assertEquals(t.length, 8)
  assertEquals(t[0], "2.3.9")
})

Deno.test("buildFtsQuery : termes entre guillemets joints par OR", () => {
  assertEquals(buildFtsQuery(["3.7", "nf en 1154", "pétanque"]), '"3.7" OR "nf en 1154" OR "pétanque"')
  assertEquals(buildFtsQuery([]), "")
})
```

- [ ] **Step 1.2 : Vérifier l'échec**

Run : `deno test supabase/functions/baikal-retrieval/search/keywords.test.ts`
Attendu : échec de résolution de `./keywords.ts`.

- [ ] **Step 1.3 : Écrire le module**

`supabase/functions/baikal-retrieval/search/keywords.ts` :

```ts
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
const CODE_PATTERNS: RegExp[] = [
  /\b(?:nf|en|iso|dtu|bt)\s*(?:[a-z]{1,3}\s*)?\d+(?:[.\-]\d+)*[a-z]?\b/gi,   // NF EN 1154, NF P 03-001, NF C 15-100, DTU 25.41, BT43
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
    for (const m of query.matchAll(pattern)) {
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
```

- [ ] **Step 1.4 : Vérifier que les tests passent**

Run : `deno test supabase/functions/baikal-retrieval/search/keywords.test.ts`
Attendu : 7 tests OK. Si « lot 06 » ou « nf en 1154 » manque, c'est l'ordre des regex (les codes normes doivent passer avant le motif numérique générique) — ne pas assouplir le test.

- [ ] **Step 1.5 : Brancher la requête OR-isée dans `retrieval.ts`**

En tête de `search/retrieval.ts` (après l'import de `CROSS_REF_CONFIG`) :

```ts
import { extractSearchTerms, buildFtsQuery } from "./keywords.ts"

/** Requête full-text OR-isée ; retombe sur la question brute si aucun terme n'est extrait. */
export function toFtsQuery(queryText: string): string {
  return buildFtsQuery(extractSearchTerms(queryText)) || queryText
}
```

Dans `executeSearch` (ligne 41) et dans les **cinq** appels RPC de `executeCrossRefSearch` (lignes 221, 242, 280, 312, 347), remplacer `query_text: queryText,` par `query_text: ftsQuery,` après avoir ajouté au début de chaque fonction :

```ts
  const ftsQuery = toFtsQuery(queryText)
  console.log(`[retrieval] FTS query: ${ftsQuery}`)
```

(une seule déclaration par fonction : ligne ~36 dans `executeSearch`, ligne ~213 dans `executeCrossRefSearch`).

- [ ] **Step 1.6 : Un seul extracteur — `safety.ts` délègue**

Remplacer `supabase/functions/baikal-retrieval/routing/safety.ts:118-124` par :

```ts
import { extractSearchTerms } from "../search/keywords.ts"

/** Conservé pour `key_concepts` (analyse fallback) — même extracteur que le full-text. */
export function extractKeywords(query: string): string[] {
  return extractSearchTerms(query).slice(0, 5)
}
```

(placer l'import en tête de fichier, avec les autres imports).

- [ ] **Step 1.7 : Vérifier les types et la requête en base**

Run : `deno check supabase/functions/baikal-retrieval/index.ts` → OK.

Vérification SQL (lecture seule, via MCP `execute_sql`) que la requête produite matche bien les chunks visés par le baseline synthétique C8 :

```sql
select id, metadata->>'section_title' as section,
       fts @@ websearch_to_tsquery('french', '"3.7" OR "paiement"') as art_3_7,
       fts @@ websearch_to_tsquery('french', '"8.2" OR "pénalités" OR "retard"') as art_8_2
from rag.documents where id in (40927, 41576);
```

Attendu : `art_3_7 = true` pour 40927, `art_8_2 = true` pour 41576.

- [ ] **Step 1.8 : Commit**

```bash
git add supabase/functions/baikal-retrieval/search/keywords.ts supabase/functions/baikal-retrieval/search/keywords.test.ts supabase/functions/baikal-retrieval/search/retrieval.ts supabase/functions/baikal-retrieval/routing/safety.ts
git commit -m "feat(retrieval): requête full-text OR-isée, codes et numéros d'article conservés (S1.1)"
```

---

### Task 2: `rag.match_documents_v15` — entonnoir ×4, enfants hors LIMIT, pondération de couche (S1.2 + S1.3 + S4.4)

**Files:**
- Create: `supabase/migrations/20260914100000_rag_match_documents_v15.sql`
- Modify: `supabase/functions/baikal-retrieval/config.ts` (constante `MATCH_DOCUMENTS_FN`)
- Modify: `supabase/functions/baikal-retrieval/search/retrieval.ts` (6 appels RPC), `supabase/functions/baikal-retrieval/agentic/tools.ts:278`

**Interfaces:**
- Consumes: `toFtsQuery` (Task 1).
- Produces: fonction SQL `rag.match_documents_v15(... , p_app_layer_weight double precision DEFAULT 1.0, p_children_per_parent integer DEFAULT 3)` — même table de sortie que v14 ; constante `MATCH_DOCUMENTS_FN = 'match_documents_v15'` exportée par `config.ts`. Task 3 passera `p_app_layer_weight`.

Trois changements par rapport à v14 (le reste est copié à l'identique) :
1. `vector_matches` et `fulltext_matches` : `LIMIT match_count * 4` au lieu de `* 2` (le seuil d'intent reste appliqué) — P10 entonnoir.
2. `aggregated` : le score RRF est multiplié par `p_app_layer_weight` quand `dlayer = 'app'` — P8.
3. Résultat final : `match_count` primaires, **puis** les enfants L1 des primaires retenus (au plus `p_children_per_parent` par parent, au plus `match_count` au total), retournés **en plus** — P3. En v14, `ORDER BY primary-first … LIMIT match_count` éliminait tous les enfants dès que les primaires remplissaient la limite.

- [ ] **Step 2.1 : Écrire la migration**

`supabase/migrations/20260914100000_rag_match_documents_v15.sql` :

```sql
-- Sprint 1 RAG (S1.2, S1.3, S4.4) — match_documents_v15
-- v14 + (1) pool vector/fulltext ×4, (2) pondération couche app, (3) enfants L1 hors LIMIT.
-- Même table de sortie que v14 : l'Edge Function bascule par simple changement de nom.

CREATE OR REPLACE FUNCTION rag.match_documents_v15(
  query_embedding vector,
  query_text text,
  p_user_id uuid,
  p_org_id uuid,
  p_project_id uuid,
  p_app_id text,
  match_count integer DEFAULT 8,
  similarity_threshold double precision DEFAULT 0.35,
  include_app_layer boolean DEFAULT true,
  include_org_layer boolean DEFAULT true,
  include_project_layer boolean DEFAULT true,
  include_user_layer boolean DEFAULT false,
  filter_source_types text[] DEFAULT NULL::text[],
  filter_file_ids uuid[] DEFAULT NULL::uuid[],
  filter_filenames text[] DEFAULT NULL::text[],
  enable_concept_expansion boolean DEFAULT true,
  max_concepts_for_expansion integer DEFAULT 5,
  concept_relevance_threshold double precision DEFAULT 0.3,
  p_hierarchy_levels integer[] DEFAULT ARRAY[1],
  p_include_children boolean DEFAULT false,
  p_app_layer_weight double precision DEFAULT 1.0,
  p_children_per_parent integer DEFAULT 3
)
RETURNS TABLE(
  out_chunk_id bigint, out_content text, out_similarity double precision, out_metadata jsonb,
  out_layer text, out_source_file_id uuid, out_matched_concepts text[], out_rank_score double precision,
  out_match_source text, out_filter_applied boolean, out_file_storage_path text, out_file_storage_bucket text,
  out_file_original_filename text, out_file_mime_type text, out_file_total_pages integer,
  out_file_max_similarity double precision, out_file_chunk_count integer, out_hierarchy_level integer,
  out_parent_chunk_id bigint, out_retrieval_role text, out_section_title text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    k_rrf CONSTANT INTEGER := 60;
    intersection_boost CONSTANT DOUBLE PRECISION := 1.5;
    v_has_filters BOOLEAN;
    v_pool INTEGER := GREATEST(match_count * 4, 8);
BEGIN
    v_has_filters := (filter_file_ids IS NOT NULL AND array_length(filter_file_ids, 1) > 0)
                  OR (filter_filenames IS NOT NULL AND array_length(filter_filenames, 1) > 0);

    RETURN QUERY
    WITH
    -- ÉTAPE 1 : recherche vectorielle (pool ×4)
    vector_matches AS (
        SELECT d.id AS did, d.content AS dcontent, d.metadata AS dmeta, d.layer AS dlayer,
               d.source_file_id AS dfile_id, d.hierarchy_level AS dhier, d.parent_chunk_id AS dparent,
               (1 - (d.embedding <=> query_embedding)) AS dsim,
               ROW_NUMBER() OVER (ORDER BY d.embedding <=> query_embedding) AS drn
        FROM rag.documents d
        LEFT JOIN sources.files f ON f.id = d.source_file_id
        WHERE d.status = 'approved'
          AND d.embedding IS NOT NULL
          AND d.target_apps @> ARRAY[p_app_id]
          AND (p_hierarchy_levels IS NULL OR d.hierarchy_level = ANY(p_hierarchy_levels))
          AND (
              (include_app_layer AND d.layer = 'app')
              OR (include_org_layer AND d.layer = 'org' AND d.org_id = p_org_id)
              OR (include_project_layer AND d.layer = 'project' AND p_project_id = ANY(d.target_projects))
              OR (include_user_layer AND d.layer = 'user' AND d.created_by = p_user_id)
          )
          AND (filter_source_types IS NULL OR d.metadata->>'source_type' = ANY(filter_source_types))
          AND (1 - (d.embedding <=> query_embedding)) >= similarity_threshold
          AND (
              NOT v_has_filters
              OR (
                  (filter_file_ids IS NULL OR array_length(filter_file_ids, 1) IS NULL OR d.source_file_id = ANY(filter_file_ids))
                  AND
                  (filter_filenames IS NULL OR array_length(filter_filenames, 1) IS NULL
                   OR EXISTS (SELECT 1 FROM unnest(filter_filenames) fn
                              WHERE LOWER(f.original_filename) LIKE '%' || LOWER(fn) || '%'))
              )
          )
        ORDER BY d.embedding <=> query_embedding
        LIMIT v_pool
    ),

    -- ÉTAPE 2 : full-text (pool ×4) — query_text arrive déjà OR-isée depuis l'Edge Function
    fulltext_matches AS (
        SELECT d.id AS did, d.content AS dcontent, d.metadata AS dmeta, d.layer AS dlayer,
               d.source_file_id AS dfile_id, d.hierarchy_level AS dhier, d.parent_chunk_id AS dparent,
               ts_rank_cd(d.fts, websearch_to_tsquery('french', query_text)) AS dsim,
               ROW_NUMBER() OVER (ORDER BY ts_rank_cd(d.fts, websearch_to_tsquery('french', query_text)) DESC) AS drn
        FROM rag.documents d
        LEFT JOIN sources.files f ON f.id = d.source_file_id
        WHERE d.status = 'approved'
          AND d.fts IS NOT NULL
          AND query_text IS NOT NULL AND query_text <> '' AND length(query_text) > 2
          AND d.fts @@ websearch_to_tsquery('french', query_text)
          AND d.target_apps @> ARRAY[p_app_id]
          AND (p_hierarchy_levels IS NULL OR d.hierarchy_level = ANY(p_hierarchy_levels))
          AND (
              (include_app_layer AND d.layer = 'app')
              OR (include_org_layer AND d.layer = 'org' AND d.org_id = p_org_id)
              OR (include_project_layer AND d.layer = 'project' AND p_project_id = ANY(d.target_projects))
              OR (include_user_layer AND d.layer = 'user' AND d.created_by = p_user_id)
          )
          AND (filter_source_types IS NULL OR d.metadata->>'source_type' = ANY(filter_source_types))
          AND (
              NOT v_has_filters
              OR (
                  (filter_file_ids IS NULL OR array_length(filter_file_ids, 1) IS NULL OR d.source_file_id = ANY(filter_file_ids))
                  AND
                  (filter_filenames IS NULL OR array_length(filter_filenames, 1) IS NULL
                   OR EXISTS (SELECT 1 FROM unnest(filter_filenames) fn
                              WHERE LOWER(f.original_filename) LIKE '%' || LOWER(fn) || '%'))
              )
          )
        ORDER BY ts_rank_cd(d.fts, websearch_to_tsquery('french', query_text)) DESC
        LIMIT v_pool
    ),

    -- ÉTAPES 3-5 : concepts + GraphRAG (identiques à v14)
    chunk_concepts AS (
        SELECT DISTINCT c.id AS cid, c.slug AS cslug, c.parent_id AS cparent,
               COUNT(*) OVER (PARTITION BY c.id) AS chunk_count_with_concept
        FROM vector_matches vm
        JOIN rag.document_concepts dc ON dc.document_id = vm.did
        JOIN config.concepts c ON c.id = dc.concept_id
        WHERE enable_concept_expansion AND c.status = 'active' AND c.target_apps @> ARRAY[p_app_id]
        ORDER BY chunk_count_with_concept DESC
        LIMIT max_concepts_for_expansion
    ),
    expanded_concepts AS (
        SELECT cid, cslug FROM chunk_concepts
        UNION
        SELECT ch.id AS cid, ch.slug AS cslug
        FROM chunk_concepts cc
        JOIN config.concepts ch ON ch.parent_id = cc.cid
        WHERE cc.cparent IS NULL AND ch.status = 'active' AND ch.target_apps @> ARRAY[p_app_id]
    ),
    graphrag_matches AS (
        SELECT d.id AS did, d.content AS dcontent, d.metadata AS dmeta, d.layer AS dlayer,
               d.source_file_id AS dfile_id, d.hierarchy_level AS dhier, d.parent_chunk_id AS dparent,
               (COUNT(DISTINCT ec.cid)::double precision / GREATEST(1, (SELECT COUNT(*) FROM expanded_concepts))) AS dsim,
               ROW_NUMBER() OVER (ORDER BY COUNT(DISTINCT ec.cid) DESC) AS drn
        FROM rag.documents d
        JOIN rag.document_concepts dc ON dc.document_id = d.id
        JOIN expanded_concepts ec ON ec.cid = dc.concept_id
        LEFT JOIN sources.files f ON f.id = d.source_file_id
        WHERE enable_concept_expansion
          AND EXISTS (SELECT 1 FROM expanded_concepts)
          AND d.status = 'approved'
          AND d.target_apps @> ARRAY[p_app_id]
          AND d.id NOT IN (SELECT did FROM vector_matches)
          AND (p_hierarchy_levels IS NULL OR d.hierarchy_level = ANY(p_hierarchy_levels))
          AND (
              (include_app_layer AND d.layer = 'app')
              OR (include_org_layer AND d.layer = 'org' AND d.org_id = p_org_id)
              OR (include_project_layer AND d.layer = 'project' AND p_project_id = ANY(d.target_projects))
              OR (include_user_layer AND d.layer = 'user' AND d.created_by = p_user_id)
          )
          AND (filter_source_types IS NULL OR d.metadata->>'source_type' = ANY(filter_source_types))
          AND (
              NOT v_has_filters
              OR (
                  (filter_file_ids IS NULL OR array_length(filter_file_ids, 1) IS NULL OR d.source_file_id = ANY(filter_file_ids))
                  AND
                  (filter_filenames IS NULL OR array_length(filter_filenames, 1) IS NULL
                   OR EXISTS (SELECT 1 FROM unnest(filter_filenames) fn
                              WHERE LOWER(f.original_filename) LIKE '%' || LOWER(fn) || '%'))
              )
          )
        GROUP BY d.id, d.content, d.metadata, d.layer, d.source_file_id, d.hierarchy_level, d.parent_chunk_id
        HAVING COUNT(DISTINCT ec.cid) >= 1
        LIMIT match_count
    ),

    -- ÉTAPE 6 : fusion avec détection d'intersection (identique à v14)
    vector_ids AS (SELECT did FROM vector_matches),
    fulltext_ids AS (SELECT did FROM fulltext_matches),
    primary_matches AS (
        SELECT did, dcontent, dmeta, dlayer, dfile_id, dhier, dparent, dsim, drn,
               CASE WHEN EXISTS (SELECT 1 FROM fulltext_ids fi WHERE fi.did = vm.did)
                    THEN 'intersection'::text ELSE 'vector'::text END AS msrc,
               'primary'::text AS mrole
        FROM vector_matches vm
        UNION ALL
        SELECT f.did, f.dcontent, f.dmeta, f.dlayer, f.dfile_id, f.dhier, f.dparent, f.dsim, f.drn,
               'fulltext'::text, 'primary'::text
        FROM fulltext_matches f
        WHERE NOT EXISTS (SELECT 1 FROM vector_ids v WHERE v.did = f.did)
        UNION ALL
        SELECT g.did, g.dcontent, g.dmeta, g.dlayer, g.dfile_id, g.dhier, g.dparent, g.dsim, g.drn,
               'graphrag'::text, 'primary'::text
        FROM graphrag_matches g
        WHERE NOT EXISTS (SELECT 1 FROM vector_ids v WHERE v.did = g.did)
          AND NOT EXISTS (SELECT 1 FROM fulltext_ids ft WHERE ft.did = g.did)
    ),

    -- ÉTAPE 7 : enfants L1 des L0 primaires (identique à v14)
    children_matches AS (
        SELECT d.id AS did, d.content AS dcontent, d.metadata AS dmeta, d.layer AS dlayer,
               d.source_file_id AS dfile_id, d.hierarchy_level AS dhier, d.parent_chunk_id AS dparent,
               pm.dsim AS dsim,
               (ROW_NUMBER() OVER (PARTITION BY pm.did ORDER BY d.id))::bigint + 1000 AS drn,
               'child'::text AS msrc, 'child'::text AS mrole
        FROM primary_matches pm
        JOIN rag.documents d ON d.parent_chunk_id = pm.did
        WHERE p_include_children = true
          AND pm.dhier = 0
          AND d.hierarchy_level = 1
          AND d.status = 'approved'
          AND NOT EXISTS (SELECT 1 FROM primary_matches pm2 WHERE pm2.did = d.id)
    ),
    all_matches AS (
        SELECT * FROM primary_matches
        UNION ALL
        SELECT * FROM children_matches
    ),

    -- ÉTAPE 9 (v15) : RRF avec boost d'intersection ET pondération de couche
    aggregated AS (
        SELECT am.did, am.dcontent, am.dmeta, am.dlayer, am.dfile_id, am.dhier, am.dparent,
               MAX(am.dsim) AS best_sim,
               SUM(
                   (1.0 / (k_rrf + am.drn))
                   * CASE WHEN am.msrc = 'intersection' THEN intersection_boost ELSE 1.0 END
               ) * CASE WHEN am.dlayer = 'app' THEN p_app_layer_weight ELSE 1.0 END AS rrf,
               (ARRAY_AGG(am.msrc ORDER BY
                   CASE am.msrc WHEN 'intersection' THEN 0 WHEN 'vector' THEN 1
                                WHEN 'fulltext' THEN 2 WHEN 'graphrag' THEN 3 WHEN 'child' THEN 4 END
               ))[1] AS psrc,
               (ARRAY_AGG(am.mrole ORDER BY am.dsim DESC))[1] AS prole
        FROM all_matches am
        GROUP BY am.did, am.dcontent, am.dmeta, am.dlayer, am.dfile_id, am.dhier, am.dparent
    ),

    -- ÉTAPES 10-12 : concepts liés, agrégation fichier, métadonnées (identiques à v14)
    with_concepts AS (
        SELECT a.*,
               COALESCE((SELECT ARRAY_AGG(DISTINCT c2.slug)
                         FROM rag.document_concepts dc2
                         JOIN config.concepts c2 ON c2.id = dc2.concept_id
                         WHERE dc2.document_id = a.did), ARRAY[]::text[]) AS dconcepts
        FROM aggregated a
    ),
    file_aggregation AS (
        SELECT wc.dfile_id, MAX(wc.best_sim) AS file_max_sim, COUNT(*)::integer AS file_chunk_count
        FROM with_concepts wc
        WHERE wc.dfile_id IS NOT NULL
        GROUP BY wc.dfile_id
    ),
    final_result AS (
        SELECT wc.did, wc.dcontent, wc.best_sim, wc.dmeta, wc.dlayer, wc.dfile_id, wc.dhier, wc.dparent,
               wc.dconcepts, wc.rrf, wc.psrc, wc.prole,
               v_has_filters AS filter_applied,
               f.storage_path AS file_storage_path,
               f.storage_bucket AS file_storage_bucket,
               COALESCE(f.display_name, f.original_filename, wc.dmeta->>'filename') AS file_original_filename,
               f.mime_type AS file_mime_type,
               COALESCE(f.total_pages, (wc.dmeta->>'total_pages')::integer, 1) AS file_total_pages,
               fa.file_max_sim, fa.file_chunk_count,
               COALESCE(wc.dmeta->>'section_title',
                        wc.dmeta->'enrichment'->'hierarchy'->>'section_title',
                        wc.dmeta->'enrichment'->'hierarchy'->>'section_number', NULL) AS section_title
        FROM with_concepts wc
        LEFT JOIN sources.files f ON f.id = wc.dfile_id
        LEFT JOIN file_aggregation fa ON fa.dfile_id = wc.dfile_id
    ),

    -- ÉTAPE 13 (v15) : primaires limités, puis enfants des primaires retenus EN PLUS
    ranked_primary AS (
        SELECT fr.*, 0 AS ord
        FROM final_result fr
        WHERE fr.prole = 'primary'
        ORDER BY fr.rrf DESC
        LIMIT match_count
    ),
    ranked_children AS (
        SELECT fr.*, 1 AS ord,
               ROW_NUMBER() OVER (PARTITION BY fr.dparent ORDER BY fr.rrf DESC) AS rn_in_parent
        FROM final_result fr
        WHERE fr.prole = 'child'
          AND fr.dparent IN (SELECT rp.did FROM ranked_primary rp)
    ),
    selected AS (
        SELECT did, dcontent, best_sim, dmeta, dlayer, dfile_id, dhier, dparent, dconcepts, rrf, psrc, prole,
               filter_applied, file_storage_path, file_storage_bucket, file_original_filename, file_mime_type,
               file_total_pages, file_max_sim, file_chunk_count, section_title, ord
        FROM ranked_primary
        UNION ALL
        (SELECT did, dcontent, best_sim, dmeta, dlayer, dfile_id, dhier, dparent, dconcepts, rrf, psrc, prole,
                filter_applied, file_storage_path, file_storage_bucket, file_original_filename, file_mime_type,
                file_total_pages, file_max_sim, file_chunk_count, section_title, ord
         FROM ranked_children
         WHERE rn_in_parent <= p_children_per_parent
         ORDER BY rrf DESC
         LIMIT match_count)
    )
    SELECT
        s.did::bigint, s.dcontent::text, s.best_sim::double precision, s.dmeta::jsonb, s.dlayer::text,
        s.dfile_id::uuid, s.dconcepts::text[], s.rrf::double precision, s.psrc::text, s.filter_applied::boolean,
        s.file_storage_path::text, s.file_storage_bucket::text, s.file_original_filename::text, s.file_mime_type::text,
        s.file_total_pages::integer, s.file_max_sim::double precision, s.file_chunk_count::integer,
        s.dhier::integer, s.dparent::bigint, s.prole::text, s.section_title::text
    FROM selected s
    ORDER BY s.ord, s.rrf DESC;
END;
$function$;

COMMENT ON FUNCTION rag.match_documents_v15 IS
  'Sprint 1 RAG : v14 + pool ×4, pondération couche app (p_app_layer_weight), enfants L1 retournés en plus des match_count primaires (p_children_per_parent).';

GRANT EXECUTE ON FUNCTION rag.match_documents_v15 TO service_role;
```

- [ ] **Step 2.2 — GATE G1 : soumettre la migration à Eric**

Présenter les trois changements et le fichier ; après accord explicite, appliquer via MCP `apply_migration` (nom `rag_match_documents_v15`). Ne pas toucher à v14 (les fonctions legacy `librarian-v4` l'utilisent encore).

- [ ] **Step 2.3 : Vérifier la fonction en base (lecture seule)**

Un appel avec l'embedding d'un chunk existant, en mode synthèse (L0 + enfants), pour constater que des enfants sont bien retournés en plus des primaires :

```sql
with q as (select embedding from rag.documents where id = 40968)  -- L1 « 9.5 Délai de garantie », CCAP CMP
select out_chunk_id, out_hierarchy_level, out_retrieval_role, out_parent_chunk_id, out_layer, round(out_rank_score::numeric, 4) as rrf
from rag.match_documents_v15(
  (select embedding from q), '"garantie" OR "réception"',
  '00000000-0000-0000-0000-000000000000'::uuid,  -- p_user_id : indifférent, la couche user est désactivée ci-dessous
  'bcfa4a1d-c133-4139-8911-f15241699466'::uuid,
  '2ff1cd34-a2e8-4350-95c5-67c5fd64102e'::uuid,
  'arpet', 6, 0.30, true, true, true, false,
  null, null, null, true, 5, 0.3, ARRAY[0], true, 0.5, 3);
```

Attendu : ≤ 6 lignes `primary` suivies de lignes `child` (hierarchy_level 1) dont `out_parent_chunk_id` appartient aux primaires ; les lignes `app` (CCAG, NFP03-001) ont un `rrf` divisé par deux par rapport à un appel avec `1.0`.

- [ ] **Step 2.4 : Basculer l'Edge Function sur v15**

Dans `config.ts`, après `CROSS_REF_CONFIG` :

```ts
// Sprint 1 : fonction de recherche hybride (v15 = pool ×4, enfants hors LIMIT, poids de couche)
export const MATCH_DOCUMENTS_FN = 'match_documents_v15'
```

Dans `search/retrieval.ts` : `import { CROSS_REF_CONFIG, MATCH_DOCUMENTS_FN } from "../config.ts"` et remplacer les six `.rpc('match_documents_v14', {` par `.rpc(MATCH_DOCUMENTS_FN, {`.

Dans `agentic/tools.ts` : ajouter `import { MATCH_DOCUMENTS_FN } from "../config.ts"` et remplacer, ligne 278, `.rpc('match_documents_v14', {` par `.rpc(MATCH_DOCUMENTS_FN, {`.

Mettre à jour le commentaire d'en-tête de `search/retrieval.ts` (ligne 2) : `(match_documents_v15 + intersection boost + poids de couche)`.

- [ ] **Step 2.5 : Vérifier les types**

Run : `deno check supabase/functions/baikal-retrieval/index.ts` → OK. `grep -rn "match_documents_v14" supabase/functions/baikal-retrieval/` → ne doit plus rien renvoyer.

- [ ] **Step 2.6 : Commit**

```bash
git add supabase/migrations/20260914100000_rag_match_documents_v15.sql supabase/functions/baikal-retrieval/config.ts supabase/functions/baikal-retrieval/search/retrieval.ts supabase/functions/baikal-retrieval/agentic/tools.ts
git commit -m "feat(rag): match_documents_v15 — pool ×4, enfants L1 hors LIMIT, pondération couche app (S1.2, S1.3, S4.4)"
```

---

### Task 3: Poids de la couche application décidé par requête (S4.4 remontée — cible P8)

**Files:**
- Create: `supabase/functions/baikal-retrieval/search/layer-weight.ts`
- Create: `supabase/functions/baikal-retrieval/search/layer-weight.test.ts`
- Modify: `supabase/functions/baikal-retrieval/types.ts` (`LibrarianConfig`), `config.ts` (fallback + parseur), `search/retrieval.ts` (`executeSearch` passe `p_app_layer_weight`)

**Interfaces:**
- Consumes: `MATCH_DOCUMENTS_FN` et le paramètre SQL `p_app_layer_weight` (Task 2) ; `CrossRefAnalysis.detected_norms` (existant, `types.ts:215`).
- Produces: `resolveAppLayerWeight(input: { projectId: string | undefined; detectedNorms: string[]; queryText: string; configuredWeight: number }): number` ; `LibrarianConfig.app_layer_weight: number` (DB : `parameters.search.app_layer_weight`, fallback `0.5`).

Règle : quand la question est posée **dans un projet** et ne cite **aucune norme** (ni via `detected_norms`, ni par le motif `DTU|NF|CCAG|norme` dans la question), les chunks de la couche app (CCAG générique, NFP 03-001) pèsent `configuredWeight` (0,5 par défaut). Sinon poids 1,0. Sans projet, poids 1,0. Le baseline synthétique a montré 4 réponses sur 60 qui citaient le CCAG ou la norme générique à la place du CCAP du projet (SC2-004, SC5-001, C4-004 réel « résume le CCAG » doit rester possible : la question cite « CCAG » → poids 1,0).

- [ ] **Step 3.1 : Tests (échec attendu)**

`supabase/functions/baikal-retrieval/search/layer-weight.test.ts` :

```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { resolveAppLayerWeight } from "./layer-weight.ts"

const base = { projectId: "2ff1cd34-a2e8-4350-95c5-67c5fd64102e", detectedNorms: [] as string[], configuredWeight: 0.5 }

Deno.test("question projet sans norme → poids configuré", () => {
  assertEquals(resolveAppLayerWeight({ ...base, queryText: "comment on est réglés chaque mois ?" }), 0.5)
})

Deno.test("norme détectée par le cross-ref → poids 1", () => {
  assertEquals(resolveAppLayerWeight({ ...base, detectedNorms: ["DTU 25.41"], queryText: "quel DTU pour les renforts ?" }), 1.0)
})

Deno.test("mention textuelle CCAG / norme / NF → poids 1", () => {
  assertEquals(resolveAppLayerWeight({ ...base, queryText: "Résume le CCAG" }), 1.0)
  assertEquals(resolveAppLayerWeight({ ...base, queryText: "que dit la norme NFP 03-001 sur les situations ?" }), 1.0)
})

Deno.test("hors projet → poids 1", () => {
  assertEquals(resolveAppLayerWeight({ ...base, projectId: undefined, queryText: "pénalités de retard" }), 1.0)
})

Deno.test("poids configuré borné entre 0.1 et 1", () => {
  assertEquals(resolveAppLayerWeight({ ...base, configuredWeight: 0, queryText: "délai de paiement" }), 0.1)
  assertEquals(resolveAppLayerWeight({ ...base, configuredWeight: 3, queryText: "délai de paiement" }), 1.0)
})
```

- [ ] **Step 3.2 : Vérifier l'échec**

Run : `deno test supabase/functions/baikal-retrieval/search/layer-weight.test.ts` → échec de résolution de `./layer-weight.ts`.

- [ ] **Step 3.3 : Écrire le module**

`supabase/functions/baikal-retrieval/search/layer-weight.ts` :

```ts
// ============================================================================
// baikal-retrieval - Search: Layer weight (Sprint 1, S4.4 remontée — P8)
// ============================================================================
// Dans un projet, les documents de la couche application (CCAG générique,
// NFP 03-001) ne doivent pas prendre la place du CCAP/CCTP du projet, sauf
// quand la question porte explicitement sur une norme ou sur le CCAG.
// ============================================================================

const NORMATIVE_PATTERN = /\b(dtu|nf\s?[a-z]?\s?\d|ccag|norme|normes|eurocode|réglementation|reglementation)\b/i

export interface LayerWeightInput {
  projectId: string | undefined
  detectedNorms: string[]
  queryText: string
  configuredWeight: number
}

export function resolveAppLayerWeight(input: LayerWeightInput): number {
  if (!input.projectId) return 1.0
  if (input.detectedNorms.length > 0) return 1.0
  if (NORMATIVE_PATTERN.test(input.queryText)) return 1.0
  const w = Number.isFinite(input.configuredWeight) ? input.configuredWeight : 0.5
  return Math.min(1.0, Math.max(0.1, w))
}
```

- [ ] **Step 3.4 : Vérifier que les tests passent**

Run : `deno test supabase/functions/baikal-retrieval/search/layer-weight.test.ts` → 5 tests OK.

- [ ] **Step 3.5 : Config et types**

`types.ts`, interface `LibrarianConfig` : ajouter après `min_chunks_for_inclusion: number` :

```ts
  app_layer_weight: number          // Sprint 1 : poids RRF des chunks 'app' dans un projet (0.1–1, défaut 0.5)
```

`config.ts`, `FALLBACK_LIBRARIAN` : ajouter `app_layer_weight: 0.5,` après `min_chunks_for_inclusion: 1,`.

`config.ts`, `parseLibrarianConfig`, dans l'objet retourné : ajouter

```ts
    app_layer_weight: typeof search.app_layer_weight === 'number' ? search.app_layer_weight : FALLBACK_LIBRARIAN.app_layer_weight,
```

- [ ] **Step 3.6 : Passer le poids dans `executeSearch`**

`search/retrieval.ts` : ajouter un paramètre optionnel en fin de signature de `executeSearch` :

```ts
  features: FeatureFlags,
  detectedNorms: string[] = [],
): Promise<SearchResult> {
```

puis, après `const ftsQuery = …` :

```ts
  const appLayerWeight = resolveAppLayerWeight({
    projectId, detectedNorms, queryText, configuredWeight: config.app_layer_weight,
  })
  console.log(`[retrieval] app_layer_weight=${appLayerWeight}`)
```

et dans l'appel RPC de `executeSearch` (après `p_include_children`) :

```ts
    p_app_layer_weight: appLayerWeight,
    p_children_per_parent: 3,
```

Import en tête : `import { resolveAppLayerWeight } from "./layer-weight.ts"`.

Les appels cross-ref (`executeCrossRefSearch`) gardent le poids par défaut 1,0 : ils cherchent la couche app délibérément.

Dans `index.ts` ligne 263-268, passer les normes détectées :

```ts
            searchResult = await executeSearch(
              supabase, queryEmbedding, query, user_id, context.effectiveOrgId,
              project_id, context.effectiveAppId, config.librarian,
              layerFlags, filter_source_types,
              fastAnalysis.search_config, fastAnalysis.intent, intentStrategy, config.features,
              fastAnalysis.cross_ref?.detected_norms ?? [],
            )
```

(`agentic/tools.ts:155` appelle `executeSearch` sans ce paramètre : la valeur par défaut `[]` s'applique, le poids configuré aussi — c'est voulu.)

- [ ] **Step 3.7 : Types + commit**

Run : `deno check supabase/functions/baikal-retrieval/index.ts` → OK.

```bash
git add supabase/functions/baikal-retrieval/search/layer-weight.ts supabase/functions/baikal-retrieval/search/layer-weight.test.ts supabase/functions/baikal-retrieval/search/retrieval.ts supabase/functions/baikal-retrieval/config.ts supabase/functions/baikal-retrieval/types.ts supabase/functions/baikal-retrieval/index.ts
git commit -m "feat(retrieval): couche app pondérée dans un projet hors questions normatives (S4.4 → S1)"
```

---

### Task 4: GATE G2a — déploiement et mesure du retrieval (S1.1 + S1.2 + S1.3 + S4.4)

**Files:**
- Modify: `supabase/functions/baikal-retrieval/index.ts:2` (version `v2.1.0-a`)
- Modify (docs) : `C:\Dev\Frontend-ARPET\docs\SPEC_RAG_OPTIM_V1.md` §7

**Interfaces:**
- Consumes: Tasks 1–3 déployées.
- Produces: rapports `eval/reports/s1a-v2.1.0.*` et `s1a-v2.1.0-synth.*` (non commités), chiffres dans la spec.

- [ ] **Step 4.1 : Version**

`index.ts` ligne 2 : `// baikal-retrieval v2.1.0-a - "Agentic RAG" + Sprint 1 retrieval (S1.1-S1.3, S4.4)`.

- [ ] **Step 4.2 — GATE G2a : Eric déploie**

```bash
npx supabase functions deploy baikal-retrieval --project-ref odspcxgafcqxjzrarsqf
```

Puis fumée : `deno run -A eval/run-eval.ts --smoke` → une réponse, et `select query, generation_mode, match_sources from rag.query_logs order by id desc limit 1;` montre des `fulltext`/`intersection` dans `match_sources`.

- [ ] **Step 4.3 : Éval réelle et synthétique, comparées aux baselines**

```bash
deno run -A eval/run-eval.ts --tag s1a-v2.1.0 --baseline eval/reports/baseline-v2.0.0.json
deno run -A eval/run-eval.ts --golden eval/golden-set.synthetic.json --tag s1a-v2.1.0-synth --baseline eval/reports/baseline-v2.0.0-synth.json
```

Critères de succès de cette porte (spec §5 S1) : C8 synthétique > 0 % (cible ≥ 4/6), C6-003 et C8-001 réels passent, C4-004 réel (« résume le CCAG ») répond au lieu de refuser, SC2-004 et SC5-001 citent le document du projet, **aucune classe ne perd plus d'une question** par rapport au baseline. Si une régression apparaît : lire les réponses (`node -e` sur le JSON du rapport, comme en §7.1), corriger, redéployer, rejouer — ne pas passer à la Task 5 avec une régression non expliquée.

- [ ] **Step 4.4 : Consigner et commiter**

Ajouter dans `SPEC_RAG_OPTIM_V1.md` §7 une sous-section « 7.3 Sprint 1a (retrieval) » avec le tableau par classe réel + synthétique et le diff vs baseline. Commit ARPET : `docs(rag): résultats Sprint 1a (retrieval)`. Commit Baikal : `chore(retrieval): v2.1.0-a`.

---

### Task 5: Condensation des questions de suivi (S1.4 — cible P4)

**Files:**
- Create: `supabase/functions/baikal-retrieval/routing/condenser.ts`
- Create: `supabase/functions/baikal-retrieval/routing/condenser.test.ts`
- Modify: `supabase/functions/baikal-retrieval/index.ts:159-270`, `:311-314`, `:273`

**Interfaces:**
- Consumes: `context.recentMessages: ConversationMessage[]` (`types.ts:153`, `{ role, content }`), `generateEmbedding(text, key)` (`search/embedding.ts`), `GEMINI_API_KEY`.
- Produces: `isElliptical(query: string): boolean` ; `buildCondensePrompt(query, recent: ConversationMessage[]): string` ; `condenseQuery(query, recent, geminiApiKey, opts?: { model?: string; timeoutMs?: number }): Promise<string>` (renvoie la question condensée, ou `query` inchangée en cas d'échec, de timeout ou de réponse suspecte).

Comportement : uniquement si l'historique est non vide **et** la question est elliptique (moins de 8 mots, ou commence par « et / puis / pareil / idem / aussi / dans l'autre sens / ok et / donc », ou par un pronom sans nom : « il / elle / on / ça / c'est / la / le / les / lui / celui / celle » avec ≤ 12 mots). Appel Gemini 2.5 Flash-Lite, température 0, 80 tokens max, timeout 800 ms, fallback = question brute. Si la question condensée diffère, l'embedding est recalculé sur elle (+~300 ms) et elle devient la requête effective pour l'analyse, la recherche, l'agentique et la génération ; elle est tracée dans `rag.query_logs.rewritten_query`.

- [ ] **Step 5.1 : Tests (échec attendu)**

`supabase/functions/baikal-retrieval/routing/condenser.test.ts` :

```ts
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { isElliptical, buildCondensePrompt } from "./condenser.ts"

Deno.test("question courte → elliptique", () => {
  assertEquals(isElliptical("dans le ccap ?"), true)
  assertEquals(isElliptical("et les autres lots ?"), true)
  assertEquals(isElliptical("Sors-moi l'article correspondant"), true)
})

Deno.test("connecteur de suivi en tête → elliptique même si longue", () => {
  assertEquals(isElliptical("et dans l'autre sens, si c'est le maître d'ouvrage qui paie en retard ?"), true)
  assertEquals(isElliptical("pareil pour la résidence Dunant mais avec le lot menuiseries extérieures cette fois"), true)
})

Deno.test("pronom sans antécédent en tête → elliptique", () => {
  assertEquals(isElliptical("on peut la remplacer par autre chose ?"), true)
  assertEquals(isElliptical("il a combien de temps pour lever les réserves ?"), true)
})

Deno.test("question autonome → pas elliptique", () => {
  assertEquals(isElliptical("Quel est le délai global d'exécution des travaux d'après le mémoire technique ?"), false)
  assertEquals(isElliptical("Sur CMP, c'est quoi la retenue qu'ils nous prennent sur chaque situation ?"), false)
})

Deno.test("prompt : historique borné, question en dernier, consigne de réécriture", () => {
  const recent = [
    { role: "assistant", content: "B".repeat(2000) },
    { role: "user", content: "Quel est le délai de paiement sur le marché CMP ?" },
  ]
  const p = buildCondensePrompt("et si le maître d'ouvrage paie en retard ?", recent as never)
  assert(p.includes("USER: Quel est le délai de paiement"))
  assert(!p.includes("B".repeat(700)), "l'historique doit être tronqué à 600 caractères par message")
  assert(p.trim().endsWith("et si le maître d'ouvrage paie en retard ?"))
  assert(/question autonome/i.test(p))
})
```

- [ ] **Step 5.2 : Vérifier l'échec**

Run : `deno test supabase/functions/baikal-retrieval/routing/condenser.test.ts` → échec de résolution de `./condenser.ts`.

- [ ] **Step 5.3 : Écrire le module**

`supabase/functions/baikal-retrieval/routing/condenser.ts` :

```ts
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
const PRONOUN_OPENERS = /^(il|elle|ils|elles|on|ça|ca|c'est|c est|la|le|les|lui|celui|celle|ceux|celles|y)\b/i
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
    console.log(`[condenser] "${query.substring(0, 50)}" → "${candidate.substring(0, 80)}"`)
    return candidate
  } catch (err) {
    console.warn(`[condenser] échec (${err instanceof Error ? err.name : 'erreur'}), question brute conservée`)
    return query
  } finally {
    clearTimeout(timer)
  }
}
```

- [ ] **Step 5.4 : Vérifier que les tests passent**

Run : `deno test supabase/functions/baikal-retrieval/routing/condenser.test.ts` → 5 tests OK.

- [ ] **Step 5.5 : Câbler dans `index.ts`**

En tête : `import { isElliptical, condenseQuery } from "./routing/condenser.ts"`.

Remplacer les lignes 159-168 (bloc A2 + A3) par :

```ts
          const [context, initialEmbedding] = await Promise.all([
            getAgentContext(supabase, user_id, org_id, project_id, app_id, conversation_id, config.brain),
            generateEmbedding(query, OPENAI_API_KEY),
          ])
          let queryEmbedding = initialEmbedding
          metrics.timings.context_embed = timer.mark('context_embed')

          await addMessage(supabase, context.conversationId, 'user', query)

          // A2b. CONDENSATION (Sprint 1, S1.4) — questions de suivi elliptiques uniquement
          let effectiveQuery = query
          if (GEMINI_API_KEY && context.recentMessages.length > 0 && isElliptical(query)) {
            const condensed = await condenseQuery(query, context.recentMessages, GEMINI_API_KEY)
            if (condensed !== query) {
              effectiveQuery = condensed
              queryEmbedding = await generateEmbedding(condensed, OPENAI_API_KEY)
            }
            metrics.timings.condense = timer.mark('condense')
          }

          // A3. FAST ANALYSIS (synchronous, ~0ms) — sur la question effective
          const fastAnalysis = buildFallbackAnalysis(effectiveQuery, context.documentsCles)
```

(`queryEmbedding` devient un `let` réaffecté quand la question est condensée ; tout le reste du pipeline continue de lire `queryEmbedding`.)

Puis remplacer `query` par `effectiveQuery` aux endroits suivants : ligne 256 et 264 (`queryText` des deux recherches), ligne 273 (`rerankIfEnabled(searchResult, effectiveQuery, …)`), ligne 312 (`runAgenticLoop(effectiveQuery, …)`). Les appels `addMessage(... 'user', query)`, `generateSuggestions(query, …)` et `logQuery({ query, … })` gardent la question brute : `rewritten_query` (ligne 546) devient automatiquement la question condensée car `buildFallbackAnalysis` pose `rewritten_query = effectiveQuery`.

Pour la sortie agentique (`logQuery` ligne 349) et conversationnelle, ajouter `rewritten_query: effectiveQuery !== query ? effectiveQuery : null,` après `query,`.

- [ ] **Step 5.6 : Types + commit**

Run : `deno check supabase/functions/baikal-retrieval/index.ts` → OK.

```bash
git add supabase/functions/baikal-retrieval/routing/condenser.ts supabase/functions/baikal-retrieval/routing/condenser.test.ts supabase/functions/baikal-retrieval/index.ts
git commit -m "feat(retrieval): condensation des questions de suivi elliptiques par Gemini flash-lite (S1.4)"
```

---

### Task 6: Contrôle qualité agentique lisible (S1.5 — cible P5)

**Files:**
- Create: `supabase/functions/baikal-retrieval/agentic/gate.ts`
- Create: `supabase/functions/baikal-retrieval/agentic/gate.test.ts`
- Modify: `supabase/functions/baikal-retrieval/agentic/orchestrator.ts:191-224` (suppression), `index.ts:281`, `:349-360`, `:542-556`, `logging.ts:31-36`, `types.ts` (`PipelineMetrics.decisions`)

**Interfaces:**
- Consumes: `ChunkResult[]` (`types.ts:236`), `AgenticConfig` (`types.ts:335`).
- Produces: `evaluateAgenticGate(chunks, cfg): GateDecision` avec `GateDecision = { trigger: boolean; reason: 'disabled' | 'too_few_vector_chunks' | 'low_max_similarity' | 'fast_path_ok'; n_vector: number; max_sim: number; avg_sim: number }`.

Règle (spec S1.5) : statistiques sur les seuls chunks `vector` / `intersection` ; déclenchement si `n_vector < quality_threshold` **ou** `max_sim < similarity_threshold` (la moyenne, sensible aux enfants et au full-text, n'est plus décisionnelle — elle est tracée). La raison est écrite dans `rag.query_logs.agentic` sur les deux chemins, pour pouvoir compter les déclenchements par cause.

- [ ] **Step 6.1 : Tests (échec attendu)**

`supabase/functions/baikal-retrieval/agentic/gate.test.ts` :

```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { evaluateAgenticGate } from "./gate.ts"
import type { ChunkResult, AgenticConfig } from "../types.ts"

const cfg: AgenticConfig = { enabled: true, model: "gemini-2.5-flash", max_iterations: 3, timeout_ms: 8000, temperature: 0.2, quality_threshold: 3, similarity_threshold: 0.45 }

function chunk(similarity: number, match_source: string): ChunkResult {
  return { chunk_id: Math.floor(Math.random() * 1e6), content: "", similarity, metadata: {}, layer: "project",
    source_file_id: null, matched_concepts: [], rank_score: 0, match_source, filter_applied: false,
    file_storage_path: null, file_storage_bucket: null, file_original_filename: null, file_mime_type: null,
    file_total_pages: 1, file_max_similarity: null, file_chunk_count: null, hierarchy_level: 1,
    parent_chunk_id: null, retrieval_role: "primary", section_title: null }
}

Deno.test("désactivé → jamais", () => {
  const d = evaluateAgenticGate([chunk(0.1, "vector")], { ...cfg, enabled: false })
  assertEquals(d.trigger, false); assertEquals(d.reason, "disabled")
})

Deno.test("trop peu de chunks vectoriels (les fulltext/child ne comptent pas)", () => {
  const d = evaluateAgenticGate([chunk(0.9, "vector"), chunk(0.9, "fulltext"), chunk(0.9, "child"), chunk(0.9, "graphrag")], cfg)
  assertEquals(d.trigger, true); assertEquals(d.reason, "too_few_vector_chunks"); assertEquals(d.n_vector, 1)
})

Deno.test("meilleure similarité sous le seuil → agentique, même si la moyenne serait trompeuse", () => {
  const d = evaluateAgenticGate([chunk(0.44, "vector"), chunk(0.43, "intersection"), chunk(0.42, "vector")], cfg)
  assertEquals(d.trigger, true); assertEquals(d.reason, "low_max_similarity"); assertEquals(d.max_sim, 0.44)
})

Deno.test("un seul excellent chunk + deux faibles → chemin rapide (max décide, pas la moyenne)", () => {
  const d = evaluateAgenticGate([chunk(0.71, "intersection"), chunk(0.30, "vector"), chunk(0.30, "vector")], cfg)
  assertEquals(d.trigger, false); assertEquals(d.reason, "fast_path_ok")
  assertEquals(Number(d.avg_sim.toFixed(3)), 0.437)
})
```

- [ ] **Step 6.2 : Vérifier l'échec**

Run : `deno test supabase/functions/baikal-retrieval/agentic/gate.test.ts` → échec de résolution de `./gate.ts`.

- [ ] **Step 6.3 : Écrire le module**

`supabase/functions/baikal-retrieval/agentic/gate.ts` :

```ts
// ============================================================================
// baikal-retrieval - Agentic: Quality gate (Sprint 1, S1.5 — P5)
// ============================================================================
// Décide si le chemin rapide suffit. Seuls les chunks portés par une vraie
// similarité cosine (vector / intersection) comptent ; la décision repose sur
// leur NOMBRE et sur la MEILLEURE similarité, pas sur une moyenne mélangeant
// des échelles hétérogènes. La raison est tracée dans rag.query_logs.
// ============================================================================

import type { ChunkResult, AgenticConfig } from "../types.ts"

export type GateReason = 'disabled' | 'too_few_vector_chunks' | 'low_max_similarity' | 'fast_path_ok'

export interface GateDecision {
  trigger: boolean
  reason: GateReason
  n_vector: number
  max_sim: number
  avg_sim: number
}

export function evaluateAgenticGate(chunks: ChunkResult[], cfg: AgenticConfig): GateDecision {
  const cosine = chunks.filter(c => c.match_source === 'vector' || c.match_source === 'intersection')
  const n_vector = cosine.length
  const max_sim = n_vector ? Math.max(...cosine.map(c => c.similarity)) : 0
  const avg_sim = n_vector ? cosine.reduce((s, c) => s + c.similarity, 0) / n_vector : 0

  if (!cfg.enabled) return { trigger: false, reason: 'disabled', n_vector, max_sim, avg_sim }
  if (n_vector < cfg.quality_threshold) return { trigger: true, reason: 'too_few_vector_chunks', n_vector, max_sim, avg_sim }
  if (max_sim < cfg.similarity_threshold) return { trigger: true, reason: 'low_max_similarity', n_vector, max_sim, avg_sim }
  return { trigger: false, reason: 'fast_path_ok', n_vector, max_sim, avg_sim }
}
```

- [ ] **Step 6.4 : Vérifier que les tests passent**

Run : `deno test supabase/functions/baikal-retrieval/agentic/gate.test.ts` → 4 tests OK.

- [ ] **Step 6.5 : Câblage et traçabilité**

`orchestrator.ts` : supprimer la section « QUALITY GATE » (lignes 191-224, fonction `shouldTriggerAgentic`).

`logging.ts`, interface `QueryLogEntry`, champ `agentic` : remplacer par

```ts
  agentic?: {
    triggered: boolean
    reason?: string
    n_vector?: number
    max_sim?: number
    iterations?: number
    timed_out?: boolean
    steps?: unknown[]
  } | null
```

`types.ts`, `PipelineMetrics.decisions` : ajouter `agentic_gate_reason: string` après `agentic_iterations: number`. Dans `index.ts` ligne 136, initialiser `agentic_gate_reason: '',`.

`index.ts` : remplacer l'import `import { runAgenticLoop, shouldTriggerAgentic } from "./agentic/orchestrator.ts"` par

```ts
import { runAgenticLoop } from "./agentic/orchestrator.ts"
import { evaluateAgenticGate } from "./agentic/gate.ts"
```

Ligne 281 : remplacer `const useAgentic = shouldTriggerAgentic(searchResult.chunks, config.agentic)` par

```ts
          const gate = evaluateAgenticGate(searchResult.chunks, config.agentic)
          metrics.decisions.agentic_gate_reason = gate.reason
          console.log(`[agentic] gate: ${gate.reason} (n_vector=${gate.n_vector}, max_sim=${gate.max_sim.toFixed(3)}, avg=${gate.avg_sim.toFixed(3)})`)
          const useAgentic = gate.trigger
```

Ligne 355 (sortie agentique) : `agentic: { triggered: true, reason: gate.reason, n_vector: gate.n_vector, max_sim: gate.max_sim, iterations: agenticResult.iterations, timed_out: agenticResult.timedOut, steps: agenticResult.steps },`

Ligne 551 (sortie chemin rapide) : remplacer `agentic: null,` par `agentic: { triggered: false, reason: gate.reason, n_vector: gate.n_vector, max_sim: gate.max_sim },`.

- [ ] **Step 6.6 : Types + commit**

Run : `deno check supabase/functions/baikal-retrieval/index.ts` → OK ; `grep -rn shouldTriggerAgentic supabase/functions/` → vide.

```bash
git add supabase/functions/baikal-retrieval/agentic/gate.ts supabase/functions/baikal-retrieval/agentic/gate.test.ts supabase/functions/baikal-retrieval/agentic/orchestrator.ts supabase/functions/baikal-retrieval/index.ts supabase/functions/baikal-retrieval/logging.ts supabase/functions/baikal-retrieval/types.ts
git commit -m "feat(agentic): gate sur n_vector et max_sim, raison tracée dans query_logs (S1.5)"
```

---

### Task 7: Numéro de page dans les sources (P11)

**Files:**
- Modify: `supabase/functions/baikal-retrieval/sources.ts:29-66`
- Create: `supabase/functions/baikal-retrieval/sources.test.ts`

**Interfaces:**
- Consumes: `ChunkResult.metadata` (`page`, `page_start`, `page_end` — le pipeline v5.x n'écrit que `page_start`/`page_end`, vérifié en base le 2026-09-13).
- Produces: `SourceItem.page` renseigné ; `SourceItem.page_end?: number` ajouté (`types.ts:318-329`).

- [ ] **Step 7.1 : Test (échec attendu)**

`supabase/functions/baikal-retrieval/sources.test.ts` :

```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { buildSourcesFromChunks } from "./sources.ts"
import type { ChunkResult } from "./types.ts"

function chunk(id: number, metadata: Record<string, unknown>): ChunkResult {
  return { chunk_id: id, content: "x", similarity: 0.6, metadata, layer: "project",
    source_file_id: `file-${id}`, matched_concepts: [], rank_score: 0, match_source: "vector", filter_applied: false,
    file_storage_path: "p", file_storage_bucket: "b", file_original_filename: "CCTP TCE", file_mime_type: "application/pdf",
    file_total_pages: 172, file_max_similarity: null, file_chunk_count: null, hierarchy_level: 1,
    parent_chunk_id: null, retrieval_role: "primary", section_title: "2.3.9" }
}

Deno.test("page lue depuis page_start quand page est absent (pipeline v5.x)", () => {
  const [s] = buildSourcesFromChunks([chunk(1, { page_start: "56", page_end: "57" })])
  assertEquals(s.page, 56)
  assertEquals(s.page_end, 57)
})

Deno.test("page explicite prioritaire, valeurs non numériques ignorées", () => {
  const [a] = buildSourcesFromChunks([chunk(2, { page: 12, page_start: "3" })])
  assertEquals(a.page, 12)
  const [b] = buildSourcesFromChunks([chunk(3, { page_start: "n/a" })])
  assertEquals(b.page, undefined)
})
```

- [ ] **Step 7.2 : Vérifier l'échec**

Run : `deno test supabase/functions/baikal-retrieval/sources.test.ts` → 2 échecs (`page` vaut `undefined`, `page_end` n'existe pas).

- [ ] **Step 7.3 : Corriger `sources.ts` et le type**

`types.ts`, interface `SourceItem` : ajouter `page_end?: number` après `page?: number`.

`sources.ts` : ajouter avant `buildSourcesFromChunks`

```ts
/** P11 : le pipeline d'ingestion écrit page_start/page_end, pas page. */
function toPage(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? parseInt(value, 10) : NaN
  return Number.isFinite(n) && n > 0 ? n : undefined
}
```

et remplacer la ligne 60 `page: chunk.metadata?.page as number | undefined,` par

```ts
        page: toPage(chunk.metadata?.page) ?? toPage(chunk.metadata?.page_start),
        page_end: toPage(chunk.metadata?.page_end),
```

- [ ] **Step 7.4 : Vérifier que les tests passent, puis commit**

Run : `deno test supabase/functions/baikal-retrieval/sources.test.ts` → 2 tests OK ; `deno check supabase/functions/baikal-retrieval/index.ts` → OK.

```bash
git add supabase/functions/baikal-retrieval/sources.ts supabase/functions/baikal-retrieval/sources.test.ts supabase/functions/baikal-retrieval/types.ts
git commit -m "fix(retrieval): page des sources lue depuis page_start (P11) — citations cliquables ARPET"
```

---

### Task 8: GATE G2b — déploiement final, mesure, baseline v2.1.0 figée

**Files:**
- Modify: `supabase/functions/baikal-retrieval/index.ts:2` (version `v2.1.0`)
- Create (par renommage) : `eval/reports/baseline-v2.1.0.*`, `eval/reports/baseline-v2.1.0-synth.*`
- Modify: `C:\Dev\Frontend-ARPET\docs\SPEC_RAG_OPTIM_V1.md` §7 et §3 (P11 ✅), `C:\Dev\Frontend-ARPET\CLAUDE.md` § État courant

**Interfaces:**
- Consumes: Tasks 5–7 déployées.
- Produces: la nouvelle référence pour le Sprint 2.

- [ ] **Step 8.1 : Version**

`index.ts` ligne 2 : `// baikal-retrieval v2.1.0 - "Agentic RAG" + Sprint 1 (S1.1–S1.5, S4.4, P11)`. Mettre à jour le bloc de commentaire d'en-tête : ajouter la ligne `//   - Condensation des suivis (routing/condenser.ts), gate agentique (agentic/gate.ts), FTS OR-isé (search/keywords.ts)`.

- [ ] **Step 8.2 — GATE G2b : Eric déploie**

```bash
npx supabase functions deploy baikal-retrieval --project-ref odspcxgafcqxjzrarsqf
```

Fumée : `deno run -A eval/run-eval.ts --smoke` puis `select query, rewritten_query, agentic->>'reason' as gate, sources->0->>'page' as page from rag.query_logs order by id desc limit 1;` → `gate` renseigné, `page` non nul.

- [ ] **Step 8.3 : Éval complète**

```bash
deno run -A eval/run-eval.ts --tag s1b-v2.1.0 --baseline eval/reports/baseline-v2.0.0.json
deno run -A eval/run-eval.ts --golden eval/golden-set.synthetic.json --tag s1b-v2.1.0-synth --baseline eval/reports/baseline-v2.0.0-synth.json
```

Critères de succès de fin de sprint (spec §5 S1) : recall@k en hausse sur C1/C2/C5/C6, C5 réel et synthétique ≥ 75 %, taux agentique cohérent (chaque déclenchement a une raison, lisible par `select agentic->>'reason', count(*) from rag.query_logs where created_at > now() - interval '1 day' group by 1`), « Page OK » désormais mesuré (> 50 % attendu sur les 14 entrées réelles à page), **zéro régression** de classe > 1 question. Lire chaque échec restant et le classer : critère à revoir / défaut Sprint 2 (multi-docs) / défaut corpus (Sprint 4).

- [ ] **Step 8.4 : Figer la nouvelle baseline**

```bash
cp eval/reports/s1b-v2.1.0.json eval/reports/baseline-v2.1.0.json
cp eval/reports/s1b-v2.1.0.md eval/reports/baseline-v2.1.0.md
cp eval/reports/s1b-v2.1.0-synth.json eval/reports/baseline-v2.1.0-synth.json
cp eval/reports/s1b-v2.1.0-synth.md eval/reports/baseline-v2.1.0-synth.md
```

Si le juge est disponible (clé `GEMINI_API_KEY` posée dans `eval/.env`) : `deno run -A eval/judge-groundedness.ts --from-report eval/reports/baseline-v2.1.0.json`.

- [ ] **Step 8.5 : Documentation et commits**

Spec ARPET : §7 tableau (Sprint 1 ✅, baseline avant `v2.0.0`, après `v2.1.0`), sous-section « 7.4 Sprint 1b » avec les tableaux réel + synthétique et le diff, §3 : P11 marqué corrigé. `CLAUDE.md` ARPET § État courant : version de prod `baikal-retrieval v2.1.0`, résumé de ce que fait le Sprint 1, prochaine étape Sprint 2.

```bash
# Baikal
git add supabase/functions/baikal-retrieval/index.ts eval/reports/baseline-v2.1.0.json eval/reports/baseline-v2.1.0.md eval/reports/baseline-v2.1.0-synth.json eval/reports/baseline-v2.1.0-synth.md
git commit -m "chore(retrieval): v2.1.0 + baseline v2.1.0 (fin Sprint 1)"
# ARPET
git add docs/SPEC_RAG_OPTIM_V1.md CLAUDE.md
git commit -m "docs(rag): Sprint 1 terminé — résultats v2.1.0, P11 corrigé, état courant à jour"
```

Aucun push : proposer le push des deux repos à Eric une fois la baseline validée.

---

## Ordre et dépendances

```
Task 1 (keywords) ─┐
Task 2 (v15 SQL)  ─┼─► Task 3 (layer weight) ─► Task 4 GATE G2a (déploiement + éval 1a)
                   │
Task 5 (condenser) ─┐
Task 6 (gate)       ┼─► Task 8 GATE G2b (déploiement + éval 1b + baseline v2.1.0)
Task 7 (page P11)  ─┘
```

Task 2 dépend de G1 (migration appliquée) ; Tasks 5, 6, 7 sont indépendantes entre elles et peuvent commencer pendant que l'éval 1a tourne. Coût API des deux évals : ~95 requêtes chacune, négligeable.

## Self-review (fait à la rédaction)

- **Couverture spec** : S1.1 → Task 1 ; S1.2 + S1.3 → Task 2 ; S1.4 → Task 5 ; S1.5 → Task 6 ; S4.4 (remontée sur décision du 2026-09-13, cf. §7.2) → Tasks 2 + 3 ; P11 (§3, ajouté le 2026-09-13) → Task 7 ; « chaque sprint se conclut par un passage du banc d'éval » → Tasks 4 et 8. S2.x (multi-docs), S3 (Cohere, modèle), S4.1-S4.3 (corpus) : hors de ce plan, volontairement.
- **Placeholders** : aucun. La requête de vérification du Step 2.3 utilise un uuid nul pour `p_user_id` parce que la couche user est désactivée dans l'appel ; les autres identifiants sont ceux du projet CMP (`core.projects`).
- **Cohérence des noms** : `toFtsQuery` (Task 1) utilisé en Task 2/3 ; `MATCH_DOCUMENTS_FN` (Task 2) utilisé en Task 2 seulement ; `resolveAppLayerWeight` et `LibrarianConfig.app_layer_weight` (Task 3) ; `isElliptical`/`condenseQuery` (Task 5) ; `evaluateAgenticGate`/`GateDecision` (Task 6) remplace `shouldTriggerAgentic` partout ; `SourceItem.page_end` (Task 7). Les paramètres SQL `p_app_layer_weight` et `p_children_per_parent` sont déclarés en Task 2 et passés en Task 3.
- **Risque identifié** : la requête FTS en OR élargit les candidats full-text ; un mot fréquent non filtré peut faire remonter du bruit. Il est borné par `LIMIT v_pool` et la fusion RRF, et mesuré par l'éval de la Task 4 avant d'aller plus loin. Si le bruit apparaît, enrichir `STOPWORDS` (Task 1) plutôt que de toucher au SQL.
