# Audit technique ARPET — 2026-05-08

## 0. Méta

- **Auditeur** : Claude Code (Opus 4.7)
- **Date** : 2026-05-08
- **Périmètre** : repo `Frontend-Baikal` (branche `claude/audit-arpet-rag-AlRmx`, commit `d1b5ecf`). Aucun autre repo Baikal présent dans `/home/user/`.
- **Skills disponibles** dans l'environnement : `session-start-hook`, `update-config`, `keybindings-help`, `simplify`, `fewer-permission-prompts`, `loop`, `claude-api`, `init`, `review`, `security-review`. Aucun skill spécialisé d'audit RAG ou de scoring qualitatif n'était installé localement (`/mnt/skills` ne contient que `session-start-hook`).
- **Durée d'audit** : ~2h de lecture intégrale.
- **Limitations** :
  - Le **frontend de chat / d'inférence ARPET** n'est PAS dans ce repo : `src/pages/Dashboard.jsx:233` contient `CHAT_INTERFACE_PLACEHOLDER`. Ce repo héberge la console d'administration (upload, ingestion, gestion utilisateurs/orgs, configuration prompts, validation). L'UX de citation et de feedback côté utilisateur n'a donc pas pu être auditée.
  - Le **schéma SQL `rag`** (tables, RPC `match_documents_v14`, RLS) n'est PAS versionné dans le repo. Seules deux migrations existent (`supabase/migrations/20251127_audio_module.sql`, `20251127_organization_members.sql`) et concernent le module audio et les membres d'organisation. L'audit du SQL repose donc uniquement sur les **appels** observés dans les edge functions (signatures, paramètres passés).
  - Le **workflow n8n FLUX 3** n'est pas accessible. L'inférence sur l'enrichissement amont est faite à partir des champs consommés par `ingest-documents/index.ts`.
  - Pas de logs de production accessibles : les latences "4,5–13,9 s" mentionnées en mars 2026 ne peuvent pas être corrélées à des goulets précis.

---

## 1. Résumé exécutif

ARPET v2.0 (`baikal-retrieval`) est une architecture RAG **mature dans ses fondations** (multi-couches app/org/project/user, hiérarchie L0/L1, GraphRAG, hybrid search, agentic ReAct, context caching Gemini, mémoire collective Q/A) mais **sabotée par trois choix qui dégradent simultanément le rappel et la qualité de génération** : un brain LLM débranché, un filtre fichier débranché, et un prompt système dont les rails anti-hallucination poussent le modèle au "not found" à la moindre ambiguïté. La promesse produit (citations cliquables vers la page exacte) est tenue au niveau page (`page_start`/`page_end` dans metadata) mais pas au niveau bbox, et l'UI cible n'est pas dans ce repo donc non vérifiée.

Le code est lisible, modulaire, bien typé côté edge functions ; la dette principale est sur le **frontend admin** (fichiers de 1300-1600 lignes, JSX sans TypeScript) et sur la **traçabilité du schéma DB** (non versionné en code).

### Top 3 risques critiques (P0)

1. 🟥 **Le brain LLM est mort-né en v2.0** — `analyzeQuery` (`routing/analyzer.ts:16`) est un export jamais importé. `index.ts:167` n'appelle que `buildFallbackAnalysis` (rule-based). Conséquences : pas de réécriture de query, pas de résolution d'anaphore, pas de détection LLM des documents. Le "Brain ARPET" est purement décoratif.
2. 🟥 **`file_filter` et `boost_documents` ne filtrent rien** — `search/retrieval.ts:55-56` passe `filter_file_ids: null, filter_filenames: null` en dur au RPC. Quand l'utilisateur dit "uniquement dans le CCAP", le retrieval cherche partout. Cause directe probable du symptôme "not found" sur Citroën quand un projet a 50+ documents.
3. 🟥 **Prompt anti-hallucination trop conservateur** — `generation/prompt.ts:13-49` instruit le LLM de répondre "non trouvé" + "cadre général" dès qu'un chunk pertinent n'est pas explicite. Combiné à l'absence de query rewriting (item 1) et au bruit du retrieval (item 2), produit le pattern "je ne trouve pas" malgré des chunks pertinents.

### Top 5 quick wins (P0/P1, effort 🟢)

| # | Action | Fichier | Effort |
|---|--------|---------|--------|
| 1 | Activer `enable_reranking: true` dans le DB `config.agent_prompts` (Cohere déjà implémenté) | `config.ts:74` | 🟢 |
| 2 | Câbler `searchConfig.file_filter` → `filter_filenames` dans `executeSearch` | `search/retrieval.ts:55` | 🟢 |
| 3 | Importer et appeler `analyzeQuery` au lieu de `buildFallbackAnalysis` quand `brainConfig.analysis.enable_query_rewriting` est `true` | `index.ts:167`, `routing/analyzer.ts:16` | 🟢 |
| 4 | Retirer `.env.local2` du repo (clé anon Supabase + URL projet committées) et l'ajouter à `.gitignore` | `/.env.local2` | 🟢 |
| 5 | Adoucir la clause 3 du `ZERO_HALLUCINATION_PROMPT` : autoriser une réponse partielle citée si ≥1 chunk pertinent existe, au lieu de basculer en "non trouvé + cadre général" | `generation/prompt.ts:25-29` | 🟢 |

### Score qualitatif par axe

| Axe | Note | Commentaire |
|-----|------|-------------|
| Architecture | **B** | Pipeline modulaire, séparation propre routing/search/generation/agentic. Multi-tenancy bien posée. |
| Code | **B-** | Edge functions bien typées et commentées. Frontend admin monolithique (1300-1600 lignes/fichier). |
| Sécurité | **D** | Clé anon committée, pas de vérification que `user_id`/`org_id` du body correspondent au JWT, RLS non vérifiable (schéma DB hors source). |
| Performance | **C** | Reranker désactivé, pas de batch d'embeddings sur QA memory + recherche, agentic loop avec timeout serré. |
| Observabilité | **D** | Aucune métrique persistée sauf `messages.processing_time_ms`. Pas de Langfuse/Phoenix. Pas d'eval set, pas de RAGAS. |
| Produit | **C+** | Traçabilité au niveau page OK, mais bbox absent. Citations format `[Document, Page X, Section Y]` non vérifiable côté UI (placeholder). |
| Conformité best practices RAG 2026 | **C** | Hybrid search OK, agentic OK, GraphRAG OK. Reranker OFF, query rewriting OFF, pas d'eval, embedding daté (`text-embedding-3-small`). |

---

## 2. Cartographie de l'existant

### 2.1 Pipeline retrieval observé (v2.0)

```
USER QUERY (POST /baikal-retrieval, SSE)
  │
  ├─ A1. loadConfig()   → config.brain + config.librarian + features + agentic + suggestions
  │   (parallèle 2 requêtes config.agent_prompts) [config.ts:214-256]
  │
  ├─ A2. Promise.all([getAgentContext, generateEmbedding(query)])
  │   addMessage('user', query)                    [index.ts:158-164]
  │
  ├─ A3. buildFallbackAnalysis(query, documentsCles)
  │   ⚠️ rule-based UNIQUEMENT — analyzeQuery jamais appelé [index.ts:167]
  │      → intent ∈ {factual, synthesis, comparison, citation, conversational}
  │      → cross_ref détection regex (DTU/NF/CCTP/CCAP) [routing/cross-ref.ts]
  │
  ├─ A4. resolveRoute()
  │   if conversational → buildConversationalResponse + return [index.ts:177-192]
  │
  ├─ A5. searchQAMemory(threshold=0.85, trust>=3 OR is_expert_faq)
  │   if hit → stream answer + return [index.ts:194-220]
  │
  ├─ A6. executeSearch / executeCrossRefSearch via RPC rag.match_documents_v14
  │   ⚠️ filter_file_ids et filter_filenames hardcodés à null [search/retrieval.ts:55-56]
  │   → chunks (L0/L1 selon intentStrategy) + files agrégés
  │
  ├─ A7. rerankIfEnabled (Cohere rerank-v3.5)
  │   ⚠️ DÉSACTIVÉ par défaut: enable_reranking=false [config.ts:74]
  │
  ├─ A8. shouldTriggerAgentic(chunks, agenticConfig)
  │   threshold: chunks<3 OR avg_similarity<0.45 [orchestrator.ts:195-216]
  │
  ├─ B. PHASE B (si agentic déclenché, GEMINI_API_KEY présent)
  │   runAgenticLoop (Gemini 2.5 Flash + 3 tools, 3 iter max, 8s budget)
  │   stream final via streamGeminiAgentResponse → SSE
  │
  └─ A9. PHASE A (fast path, sinon)
      effectiveMode = chunks ou gemini selon intent + total_pages
      if gemini: getOrUploadGoogleFile + getOrCreateGlobalCache + stream
      if chunks: formatContext (max 12 000 chars par défaut, 30 000 doc) + OpenAI stream
      buildSourcesFromFiles ou buildSourcesFromChunks + addMessage('assistant', ...) + SSE
```

### 2.2 Inventaire des edge functions

| Function | Rôle | Lignes | Statut | Référence |
|---|---|---|---|---|
| `baikal-retrieval` | Pipeline RAG actuel v2.0 | ~3 700 (multi-fichier) | **ACTIF** | `supabase/functions/baikal-retrieval/` |
| `ingest-documents` | Insertion chunks + embeddings + concepts + résolution hiérarchie | 714 | **ACTIF** (v8.0.0) | `supabase/functions/ingest-documents/index.ts:1` |
| `trigger-ingestion` | Pont DB → n8n via webhook | 394 | **ACTIF** | `supabase/functions/trigger-ingestion/index.ts:1` |
| `baikal-vote` | Feedback utilisateur (`vote_up_new`/`vote_up_existing`/`vote_down`) | 420 | **ACTIF** | `supabase/functions/baikal-vote/index.ts:1` |
| `baikal-brain-v3` | Orchestrateur Brain v3.2.0 | 1 025 | **LEGACY** (appelle encore `baikal-librarian-v4`) | `supabase/functions/baikal-brain-v3/index.ts:39` |
| `baikal-librarian-v3` | Librarian v3 | 1 754 | **ORPHELIN** (aucun appel) | `supabase/functions/baikal-librarian-v3/index.ts` |
| `baikal-librarian-v4` | Librarian v4 (hierarchy L0/L1) | 1 935 | **LEGACY** (appelé par brain-v3) | `supabase/functions/baikal-librarian-v4/index.ts` |
| `generate-document` | Génération PDF/document depuis RAG | 318 + 350 + 233 | **ACTIF** | `supabase/functions/generate-document/` |
| `meeting-transcribe` / `meeting-extract` / `extract-meeting-content` | Pipeline réunions (Gladia + extraction) | 325/358/700 | **ACTIF** | `supabase/functions/meeting-*/` |
| `transcribe-dictation` | Dictée vocale | 124 | **ACTIF** | `supabase/functions/transcribe-dictation/index.ts` |
| `get-concepts` | Liste taxonomie concepts | 99 | **ACTIF** | `supabase/functions/get-concepts/index.ts` |
| `generate-concept-embeddings` | Embeddings concepts (batch) | 179 | **ACTIF** | `supabase/functions/generate-concept-embeddings/index.ts` |
| `mcp-server` | MCP server externe | 685 | **ACTIF** | `supabase/functions/mcp-server/index.ts` |
| `create-user` | Provisionnement utilisateur | 143 | **ACTIF** | `supabase/functions/create-user/index.ts` |
| `sync-ademe` | Synchro référentiel ADEME | 179 | **ACTIF** (hors RAG ARPET) | |
| `trigger-legifrance-sync` | Synchro Légifrance | 172 | **ACTIF** (hors RAG ARPET) | |

### 2.3 Tables et RPC clés (déduits du code, non vérifiés en DB)

| Schéma.Table | Colonnes consommées par le code | Source |
|---|---|---|
| `rag.documents` | `content, embedding, target_apps[], target_projects[], org_id, created_by, source_file_id, layer, status, quality_level, hierarchy_level, parent_chunk_id, quand_date, quand_phase, qui_lots[], comment_normes[], contenu_types[], qqoqccp jsonb, metadata jsonb` | `ingest-documents/index.ts:401-426` |
| `rag.document_concepts` | `document_id, concept_id, relevance_score, source ('category'\|'llm')` (UPSERT onConflict `document_id,concept_id`) | `ingest-documents/index.ts:579-597` |
| `rag.document_tables` | `source_file_id, content_markdown, content_json, document_title, section_title, preceding_text, table_index, row_count, column_count, headers, org_id, created_by` | `ingest-documents/index.ts:615-637` |
| `rag.qa_memory` | `question_text, answer_text, embedding, org_id, project_id, source_file_ids, trust_score, validators_ids[], usage_count, is_expert_faq, created_by` | `baikal-vote/index.ts:120-135` |
| `rag.gemini_caches` | `file_ids_hash, file_ids[], cache_name, model, org_id, app_id, system_prompt_hash, expires_at, total_tokens, file_count, last_used_at` | `generation/gemini.ts:175-189` |
| `sources.files` | `id, original_filename, document_category, total_pages, mime_type, processing_status, project_id, org_id, google_file_uri, google_uri_expires_at, storage_path, storage_bucket` | `agentic/tools.ts:184-200`, `generation/gemini.ts:22-31` |
| `core.profiles` | `id, org_id, app_id, app_role` | `ingest-documents/index.ts:339-360` |
| `config.agent_prompts` | `agent_type, app_id, org_id, is_active, system_prompt, gemini_system_prompt, parameters jsonb` | `config.ts:225-247` |
| `config.concepts` | `id, slug` | `ingest-documents/index.ts:543-547` |
| `config.document_categories` | `slug, linked_concept_id` | `ingest-documents/index.ts:111-115` |

| Fonction RPC | Schéma | Appels | Source |
|---|---|---|---|
| `match_documents_v14` | `rag` | 5 (executeSearch + 4 dans executeCrossRefSearch + 1 dans search_in_file) | `search/retrieval.ts:41`, `retrieval.ts:221`, `retrieval.ts:242`, `retrieval.ts:280`, `retrieval.ts:312`, `retrieval.ts:347`, `agentic/tools.ts:278` |
| `get_agent_context` | `rag` | 1 | `context.ts:20` |
| `add_message` | `rag` | 1 | `context.ts:77` |
| `search_qa_memory` | `rag` | 1 | `search/memory.ts:19` |
| `increment_qa_usage` | `rag` | 1 | `search/memory.ts:48` |
| `resolve_chunk_hierarchy` | `public` (appel sans préfixe schema) | 1 par source_file_id à l'ingestion | `ingest-documents/index.ts:506` |

### 2.4 Prompts système

| Localisation | Type | Référence |
|---|---|---|
| `FALLBACK_BRAIN_SYSTEM_PROMPT` | Prompt brain (mais brain non appelé en v2.0) | `config.ts:108-162` |
| `ZERO_HALLUCINATION_PROMPT` | Prompt générateur (concaténé en tête) | `generation/prompt.ts:13-49` |
| `ORCHESTRATOR_SYSTEM_PROMPT` | Prompt agent ReAct Gemini | `agentic/gemini-agent.ts:42-72` |
| `config.agent_prompts.system_prompt` (DB) | Prompt librarian dynamique, par `app_id`+`org_id` | chargé via `parseLibrarianConfig` `config.ts:328` |
| `config.agent_prompts.gemini_system_prompt` (DB) | Prompt mode Gemini full doc | `config.ts:329` |
| Prompt suggestions inline | gpt-4o-mini, JSON | `generation/suggestions.ts:46-79` |
| Prompt fallback brain v3 | Prompt legacy non utilisé en v2 | `baikal-brain-v3/index.ts:74-237` |

### 2.5 Stack technique

- **Runtime edge** : Deno (`std@0.168.0`, `@supabase/supabase-js@2` via esm.sh)
- **Frontend** : React 18.3.1 + Vite 5.4.2 + TailwindCSS 3.4.10, JSX (pas de TypeScript), `@dnd-kit/*` pour drag-and-drop, `lucide-react` pour les icônes
- **Embeddings** : OpenAI `text-embedding-3-small` (1 536 dim), hardcodé dans `_shared/utils.ts:177` et `ingest-documents/index.ts:443`
- **LLM générateur (mode chunks)** : `gpt-4o-mini` (`config.ts:63`, `llm_model: "gpt-4o-mini"`)
- **LLM générateur (mode gemini)** : `gemini-2.5-flash-lite` (`config.ts:48`, `gemini_model`)
- **LLM brain** : `gpt-4o-mini` (`config.ts:16`)
- **LLM agentic orchestrator** : `gemini-2.5-flash` (`config.ts:86`)
- **LLM suggestions** : `gpt-4o-mini` (`config.ts:96`)
- **Rerank** : Cohere `rerank-v3.5` (déclaré, désactivé par défaut, `config.ts:74-75`)
- **Parsing PDF** : LlamaParse Cloud (référence indirecte dans `metadata.llamaparse_job_id`, externe à ce repo, dans n8n)
- **Cache Gemini context** : table `rag.gemini_caches`, TTL 60 min (`config.ts:61` `cache_ttl_minutes: 60`)
- **Streaming** : SSE (events `step`, `analysis`, `token`, `sources`, `suggestions`, `done`, `error` dans `index.ts`)

---

## 3. Forces de l'architecture

À reconnaître avant les critiques. Les patterns suivants sont conformes à l'état de l'art 2026 et bien implémentés.

### 3.1 Hybrid search vector + FTS + GraphRAG, fusionné par RRF dans `match_documents_v14`

Inférable du nom de RPC (v14 ⇒ ≥14 itérations) et de la structure des résultats (`out_match_source`, `out_matched_concepts`, `out_rank_score`). Le code consomme correctement les trois sources de signal et gère les cas L0/L1 et concept expansion (`search/retrieval.ts:99-122`).

### 3.2 Hiérarchie L0/L1 (small-to-big retrieval) bien intégrée

`config.ts:170-197` définit des stratégies d'intent qui pilotent `hierarchy_levels` et `include_children`. Pour synthesis/comparison, recherche L0 (résumés de section) puis remontée des enfants L1 ; pour factual/citation, L1 directement. `ingest-documents/index.ts:148-151` extrait `hierarchy_level` et appelle `resolve_chunk_hierarchy` après insertion (ligne 506).

### 3.3 Mémoire collective Q/A (sémantique + trust score)

`search/memory.ts` court-circuite tout le pipeline si une Q/A validée existe (similarity ≥ 0.85, `trust_score ≥ 3` ou `is_expert_faq`). Le feedback loop est posé : `baikal-vote` gère trois actions (`vote_up_new`/`vote_up_existing`/`vote_down`) avec dédoublonnage par `validators_ids` (`baikal-vote/index.ts:206-215`).

### 3.4 Cache Gemini global mutualisé hashé

`generation/gemini.ts:104-191` factorise le cache par `(file_ids_hash, system_prompt_hash, model)`. La clé hash + filtre `expires_at > now` + `org_id` garantit la mutualisation entre utilisateurs d'une même org sans fuite cross-tenant. La mise à jour de `last_used_at` permet à terme de purger les caches morts.

### 3.5 Multi-tenancy à 4 couches (app/org/project/user) bien plumberée

Tout le pipeline propage `effectiveOrgId`, `projectId`, `effectiveAppId` et `layerFlags` jusqu'au RPC. Les filtres sont passés explicitement à chaque appel (`include_app_layer`, `include_org_layer`, `include_project_layer`, `include_user_layer`). Bonne discipline défensive dans `agentic/tools.ts:318-357` (résolution `file_name → file_ids` toujours scopée org).

### 3.6 Cross-ref dual-scope intelligent (norme + projet)

`search/retrieval.ts:194-413` implémente trois stratégies : norme explicite + projet (dual search parallèle), doc projet seul (single search filtré), implicite avec extraction des normes depuis `comment_normes` (deux searches sériels). Code complexe mais structuré. Le boost `normBoost: 1.3` (`config.ts:402`) sur les chunks mentionnant la norme est une heuristique propre.

### 3.7 Agentic ReAct loop avec timeout budget partagé

`agentic/orchestrator.ts:98-105` vérifie `Date.now() - startTime > timeout_ms` à chaque itération. Le `startTime` provient du `timer` global (`utils.ts:55`), donc le budget agentic décompte aussi le temps consommé par les phases A1-A6. Comportement correct : pas de runaway dans un projet où la fast path a déjà pris 4 s.

### 3.8 Génération par streaming end-to-end avec backchannel SSE

Les trois chemins (chunks OpenAI, Gemini cached, agentic Gemini) émettent des `token` SSE individuels et un événement final `sources` consolidé. Les événements de progress (`step: agent_thinking`, `agent_searching`, `agent_found`, `caching`, `uploading`) sont posés au bon endroit dans `index.ts` et `agentic/orchestrator.ts:111-142`.

### 3.9 Suggestions de relance non bloquantes avec abort timeout

`generation/suggestions.ts:120-176` lance la génération de suggestions en parallèle de la génération principale (`index.ts:365-374`), avec un `AbortController` à 3 s et fallback silencieux. Bon découplage produit/perf.

### 3.10 Métadonnées QQOQCCP enrichies au chunk-level

`ingest-documents/index.ts:155-161` extrait 6 colonnes dénormalisées (`quand_date`, `quand_phase`, `qui_lots[]`, `comment_normes[]`, `contenu_types[]`) plus le JSON `qqoqccp` complet. Cela permet des filtres SQL ciblés sans parser le JSONB. Architecturalement propre pour les requêtes "obligations du lot CVC en phase EXE".

---

## 4. Constats détaillés

### 4.1 Pipeline de retrieval

#### 4.1.1 🟥 P0 / Bug — Le brain LLM est mort-né en v2.0

**Description.** `routing/analyzer.ts:16` exporte `analyzeQuery`, fonction qui appelle OpenAI pour produire query rewriting + détection de docs + intent + search_config. **Cette fonction n'est jamais importée** dans `index.ts`. Seul `buildFallbackAnalysis` (rule-based, `routing/analyzer.ts:165-217`) est appelé à `index.ts:167`. Le système `config.agent_prompts.brain_v3` est chargé (`config.ts:225-235`) mais ses paramètres (`enable_query_rewriting`, `enable_intent_detection`, etc.) ne sont consultés nulle part dans `index.ts`.

**Impact.** Pas de réécriture de query, donc anaphores non résolues ("et pour la résidence B ?" reste tel quel et n'embed pas le contexte). Pas de détection LLM des documents mentionnés implicitement (uniquement match exact slug/label par `documentsCles.filter` à `routing/analyzer.ts:184-189`). Pas d'`intent_config.match_count`/`min_similarity` adaptatif piloté par le LLM. C'est une régression silencieuse vis-à-vis de `baikal-brain-v3` qui appelait OpenAI en synchrone.

**Recommandation.** Brancher `analyzeQuery` quand `brain.analysis.enable_query_rewriting === true`, en parallèle avec `buildFallbackAnalysis` (race-to-first-result) ou en remplaçant. Garder `buildFallbackAnalysis` comme fallback en cas d'erreur OpenAI ou de timeout court (≤500 ms).

**Effort** : 🟢 < 1 jour. Priorité **P0** : c'est probablement la cause #1 du symptôme "not found" sur les questions en deuxième tour de conversation (anaphore non résolue).

#### 4.1.2 🟥 P0 / Bug — `file_filter` et `boost_documents` ne filtrent rien

**Description.** `search/retrieval.ts:55-56` passe `filter_file_ids: null, filter_filenames: null` en dur au RPC `match_documents_v14`. Le commentaire ligne 56 dit `"v1.1.1: like librarian-v4 (was fileFilter - caused issues)"`. Pourtant `searchConfig.file_filter` (typé `string[] | null` dans `types.ts:178`) est parsé depuis l'analyse à `routing/analyzer.ts:74` et ne sert ensuite à rien. `searchConfig.boost_documents` est utilisé uniquement dans `buildFileInfos` à `search/retrieval.ts:171-174` pour booster le score post-hoc, après que la recherche soit déjà faite — donc si le fichier ciblé n'a pas remonté dans les `match_count` premiers chunks, il est introuvable.

**Impact.** Quand l'utilisateur dit "Quelle est la pénalité de retard dans le CCAP ?", `boost_documents=["CCAP"]` est sans effet si la recherche initiale ramène 8 chunks dont aucun n'est du CCAP (par exemple si CCTP et CCAG dominent en similarity). C'est une cause structurelle du symptôme "not found" : sur Citroën avec ~600 documents, les chunks pertinents d'un doc spécifique sont noyés dans le bruit.

**Recommandation.** Câbler dans `executeSearch` :
- Si `searchConfig.file_filter !== null && length > 0` → `filter_filenames: searchConfig.file_filter`.
- Sinon, si `boost_documents.length > 0` → résoudre les noms en `file_ids` via `sources.files` (cf. `agentic/tools.ts:318-357` qui fait déjà cette résolution) → `filter_file_ids: [...]`. Conserver le fallback "search globale" si la résolution renvoie 0 fichier.

Le commentaire "caused issues" doit être documenté précisément (issue tracker, log d'erreur, exemple) avant de re-câbler. Sans cette doc, le risque de re-régression est réel.

**Effort** : 🟡 1-2 jours (incluant tests sur Citroën). **P0**.

#### 4.1.3 🟧 P1 / Perf — Reranker Cohere désactivé

**Description.** `enable_reranking: false` dans `FALLBACK_FEATURES` (`config.ts:74`). Le code de rerank est complet, fonctionnel, et préserve la hiérarchie L0/L1 (les enfants héritent du nouveau score parent à `search/reranker.ts:49-54`). La variable d'env `COHERE_API_KEY` est lue à la volée (`reranker.ts:18`) et le code échoue gracieusement.

**Impact.** Sur 8-10 chunks remontés par hybrid search, un reranker Cohere apporte typiquement +10 à +25 % de recall@5 sur du français technique (benchmarks publics 2024-2025). Pour un chunk_count de 8 et une avg_similarity à ~0,5 (typique BTP français), le gain est significatif. Surtout : le rerank place le chunk vraiment pertinent en tête, ce qui réduit la troncature à `max_context_length=12000` ou `30000` côté générateur.

**Justification possible (à éliciter)** : coût Cohere (~$0.002 / 1k searches), latence (+100-300 ms typique), incertitude sur le bénéfice mesurable. Aucune mesure n'est documentée dans le code ou les commentaires.

**Recommandation.** Activer en flag-feature via `config.agent_prompts.parameters.features.enable_reranking = true` pour Roudié uniquement, mesurer la latence ajoutée et le delta qualitatif sur 20 questions du golden set Citroën, décider après mesure. Si activé, considérer aussi `cohere_top_n` (actuellement 10) plus bas (4-6) pour éviter de sur-payer le reranker sur des chunks à faible pertinence.

**Effort** : 🟢 < 1 jour pour activer + mesurer. **P1**.

#### 4.1.4 🟧 P1 / Bug — Adaptive threshold désactivé sans plan de réactivation

**Description.** `adaptive_threshold_enabled: false` (`config.ts:77`) avec commentaire `"v1.1.0: disabled - was eliminating relevant chunks (petanque bug)"`. Le commentaire suivant (`adaptive_threshold_ratio: 0.55, lowered from 0.70 (less aggressive when re-enabled)`) suggère qu'une réactivation a été envisagée mais jamais effectuée.

**Impact.** Sans seuil adaptatif, la recherche garde des chunks à `similarity < 0.45` (selon intent) qui sont essentiellement du bruit pour le générateur. Ces chunks sont comptés dans `shouldTriggerAgentic` (`agentic/orchestrator.ts:208`) et **inflatent artificiellement la moyenne**, ce qui peut empêcher le déclenchement du mode agentic alors qu'il aurait été utile.

**"Bug pétanque"** : à reconstituer. Aucune trace dans le code, dans les commits récents (`git log --oneline -5` ne mentionne rien) ou dans la documentation. Le terme suggère un cas où sur une question pétanque (sport ?) le seuil adaptatif éliminait tous les chunks. Probablement : score max très bas → ratio 0.7 × max → seuil < threshold mais toujours élevé pour le contenu disponible. À reproduire.

**Recommandation.** Documenter le "bug pétanque" précisément (query exacte, projet, chunks éliminés, distribution des scores) dans une note d'ADR ou un README technique. Tester `adaptive_threshold_ratio: 0.55` (déjà préparé en commentaire) sur le golden set. Activer si neutre/positif.

**Effort** : 🟡 2-3 jours (reproduction + tests). **P1**.

#### 4.1.5 🟨 P2 / Perf — Embedding regénéré pour la mémoire ET pour la recherche

**Description.** `index.ts:158-161` génère 1 embedding par requête. Cet embedding est utilisé pour `searchQAMemory` ET pour `executeSearch`. Très bien. Mais en mode agentic, chaque `search_documents` ou `search_in_file` regénère un embedding (`agentic/tools.ts:139`, `tools.ts:275`) même si la query est identique à l'originale. Pas de cache d'embeddings côté retrieval pour la session.

**Impact.** Latence : ~100-150 ms par embedding OpenAI. Sur 3 itérations agentic, jusqu'à 450 ms cumulés. Coût négligeable (~$0,00002 / requête). Le problème principal est la latence vs le budget agentic de 8 s.

**Recommandation.** Petit cache mémoire local dans `ToolExecutionContext` : `embeddingCache: Map<string, number[]>` keyé sur la query string normalisée. Bénéfice : 100-150 ms par re-recherche identique.

**Effort** : 🟢 < 0.5 jour. **P2**.

#### 4.1.6 🟨 P2 / Architecture — `documentsCles` non exposé à l'agent ReAct comme outil

**Description.** Le contexte agent (`agentic/orchestrator.ts:83-85`) embarque `documentsCles` dans le prompt initial sous forme de liste de labels. Mais l'agent dispose d'un outil `list_project_files` (`agentic/tools.ts:48-60`) qui re-query `sources.files` pour la même information.

**Impact.** Redondance : le LLM peut hésiter entre la liste pré-injectée (labels uniquement, sans IDs ni catégories) et l'outil `list_project_files` (avec IDs, catégories, pages). Risque qu'il appelle `list_project_files` alors qu'il a déjà la liste, gaspillant une itération sur 3.

**Recommandation.** Soit retirer `documentsCles` du prompt initial agent (plus pur), soit retirer `list_project_files` (les `documentsCles` suffisent pour la décision d'orchestration). Préférer la première option : `list_project_files` retourne plus d'informations (IDs, catégories, pages) qui aident à formuler `search_in_file`.

**Effort** : 🟢 < 0.5 jour. **P2**.

#### 4.1.7 🟨 P2 / Architecture — Decision agentic basée sur stats agrégées

**Description.** `shouldTriggerAgentic` (`orchestrator.ts:195-216`) déclenche si `chunks.length < 3 OR avg_similarity < 0.45`. La moyenne sur 8 chunks dont 1 excellent (0.8) et 7 moyens (0.4) donne 0.45 → pas d'agentic. Pourtant la stratégie "tout sur 1 chunk fort + ignorer les autres" peut produire une réponse partielle.

**Impact.** Le seuil moyen-similarity est sensible aux outliers et ne capture pas la qualité du **top-k** réellement utilisé. Un seul chunk pertinent peut sauver la moyenne et empêcher l'agentic alors qu'une recherche reformulée trouverait davantage.

**Recommandation.** Considérer en plus le `top_3_avg_similarity` ou la **dispersion** (écart-type des similarities). Heuristique alternative : déclencher agentic si `top_1 - top_5 > 0.3` (forte chute → contenu probablement absent au-delà de 1-2 chunks).

**Effort** : 🟢 1 jour. **P2**.

### 4.2 Génération et prompts

#### 4.2.1 🟥 P0 / Produit — Prompt anti-hallucination produit le pattern "non trouvé"

**Description.** `generation/prompt.ts:25-29` :
```
3. Si l'information n'est PAS dans les chunks fournis :
   a) Decris brievement le CADRE GENERAL couvert par les documents disponibles ...
   b) Indique clairement que l'information specifique demandee n'a pas ete trouvee
   c) Suggere 2-3 sujets CONNEXES que tu peux traiter a partir des chunks disponibles
   Ne JAMAIS inventer, deduire, extrapoler ou "completer" avec des connaissances generales
```

Couplé à la règle 5 (`hierarchy_level=0` interdit pour sourçage factuel, `prompt.ts:35-38`), cela pousse le LLM à répondre "je n'ai pas trouvé" dès qu'il n'a que des L0 et que la formulation exacte n'apparaît pas dans un L1.

**Impact direct sur le symptôme Citroën.** Quand le retrieval ramène majoritairement des L0 (par exemple intent `synthesis` qui force `hierarchy_levels=[0]` puis include children → mais si les enfants L1 ne sont pas remontés correctement par la RPC), le LLM bascule en "non trouvé" alors que les L0 contiennent le résumé pertinent.

**Recommandation.** Reformuler la règle 3 :
- a) Tenter de répondre **partiellement** avec les chunks pertinents disponibles, en citant chacun.
- b) Indiquer clairement les **éléments manquants** dans la réponse, pas la réponse entière.
- c) Suggérer une **reformulation** ou un document à explorer.
Rester ferme sur "ne JAMAIS inventer" mais distinguer "compléter avec connaissance générale" (interdit) de "synthétiser ce qui est dans les chunks même si la réponse est partielle" (permis et encouragé).

Reformuler aussi la règle 5 : autoriser le sourçage L0 si **aucun L1 n'est disponible**, en signalant la nature résumée.

**Effort** : 🟢 < 1 jour pour reformuler + tester. **P0**.

#### 4.2.2 🟧 P1 / Architecture — `gpt-4o-mini` daté pour le générateur principal

**Description.** Mode chunks utilise `llm_model: "gpt-4o-mini"` (`config.ts:63`). Mode gemini utilise `gemini-2.5-flash-lite` (`config.ts:48`). Les deux sont des modèles "light" datant de 2024 / début 2025. Pour un produit où la qualité de réponse est le principal différenciateur (conducteurs de travaux, marchés contractuels), c'est sous-dimensionné.

**Impact.** Sur des questions BTP techniques (synthèse multi-document, raisonnement sur clauses, croisement CCAP/CCTP), un modèle de la classe Sonnet 4.6 / Opus 4.7 / GPT-4.1 / Gemini 2.5 Pro produit des réponses sensiblement plus structurées et fidèles à la source. Le coût marginal (~$0.005-0.015 / requête vs $0.0003 pour 4o-mini) est négligeable face au coût d'usage utilisateur (une réponse "non trouvé" génère un ticket support).

**Recommandation.** A/B test sur le golden set : `gpt-4o-mini` vs `claude-sonnet-4-6` vs `gpt-4.1` (ou équivalent à jour). Métriques : faithfulness (pas d'hallucination), answer_relevancy, context_precision (RAGAS). Si Sonnet 4.6 gagne >10% sur la satisfaction utilisateur réelle, basculer ARPET dessus pour Roudié, garder mini pour les apps non-critiques.

**Effort** : 🟡 1-2 jours pour le test (changement = 1 ligne par modèle, mais le harness eval n'existe pas — voir 4.6).

#### 4.2.3 🟨 P2 / Maintenabilité — Truncation naïve du contexte

**Description.** `formatContext` (`generation/prompt.ts:129-173`) tronque les chunks au caractère près quand `currentLength + text.length > maxLength`. Pas d'effort pour préserver les frontières de chunk : un chunk peut être coupé en plein milieu, générant un contexte incomplet pour le LLM.

**Impact.** Modéré. Le LLM peut citer un chunk dont la fin a été coupée, ce qui peut produire une citation de page partiellement fausse (la fin du chunk était à la page suivante mais le LLM ne le sait pas). Avec `max_context_length: 12000` (default) ou `30000` (DB), le risque dépend du nombre et de la taille des chunks remontés.

**Recommandation.** Adopter une stratégie de troncature :
- Soit "drop entier" : si un chunk ne tient pas, on l'omet entièrement (et on log).
- Soit "résumer L1 → L0" : si un L1 ne tient pas, on essaye d'inclure son parent L0 à la place.

**Effort** : 🟢 < 1 jour. **P2**.

#### 4.2.4 🟨 P3 / Bonne pratique — Format de citation imposé non observable depuis ce repo

**Description.** Le prompt impose `[NomDocument, Page X, Section Y.Z]` (`prompt.ts:21`). Le mode Gemini impose en plus `<cite doc="ID" page="N">texte</cite>` (`prompt.ts:90`). C'est une forme propriétaire qui nécessite un parser côté frontend.

**Impact à évaluer.** Le parser n'est pas dans ce repo (Dashboard.jsx:233 = placeholder). Le risque structurel est que le format puisse dériver entre prompt et frontend, sans test automatique.

**Recommandation.** Considérer Anthropic Citations API (passage à Claude pour la génération) qui retourne des citations structurées sans bricolage de regex côté frontend. Si on reste sur OpenAI/Gemini, écrire un test qui parse la sortie sur 20 cas de référence.

**Effort** : 🟡 selon migration. **P3**.

### 4.3 Ingestion (parsing, chunking, embedding, enrichissement)

#### 4.3.1 🟧 P1 / Architecture — Embedding batch sans gestion d'erreur ligne-à-ligne

**Description.** `ingest-documents/index.ts:434-454` envoie tous les chunks d'un payload n8n en un seul `input: texts[]` à OpenAI. Si un seul chunk échoue (rare mais possible : encodage, longueur > 8191 tokens), tout le batch échoue (`throw new Error` ligne 450).

**Impact.** Modéré. Un PDF partiellement mal chunké (un chunk trop gros à cause d'une table extraite) bloque toute son ingestion. En production avec 612 documents parents et ~3 700 chunks, des erreurs sporadiques génèrent des fichiers en `processing_status` figé.

**Recommandation.** Wrapper l'embedding en chunks de N (par ex. 50) avec retry par batch. En cas d'échec d'un mini-batch, le découper en deux jusqu'à isoler la ligne fautive. Logger le chunk fautif dans `errors` au lieu d'abandonner.

**Effort** : 🟡 1-2 jours. **P1**.

#### 4.3.2 🟨 P2 / Sécurité — `parseMetadata` accepte n'importe quoi en entrée

**Description.** `ingest-documents/index.ts:48-59` accepte `metadata` comme string ou objet. Si la string est invalide, retourne `{}` silencieusement. Pas de logging.

**Impact.** Modéré. Une métadonnée corrompue génère un chunk sans qqoqccp/hierarchy/concepts. Détectable seulement post-hoc via une requête SQL sur la couverture metadata.

**Recommandation.** Logger un warn quand `JSON.parse` échoue (ligne 54 catch silencieux). Optionnellement, rejeter le chunk en erreur explicite au lieu de l'ingérer avec metadata vide.

**Effort** : 🟢 < 0.5 jour. **P2**.

#### 4.3.3 🟧 P1 / Maintenabilité — `resolve_chunk_hierarchy` appelé sans préfixe schéma

**Description.** `ingest-documents/index.ts:506` : `supabase.rpc('resolve_chunk_hierarchy', ...)`. Tous les autres RPC du code utilisent `.schema('rag').rpc(...)`. La fonction est probablement exposée en `public.resolve_chunk_hierarchy` (wrapper SECURITY DEFINER) mais ce n'est pas conventionnel.

**Impact.** Mineur fonctionnellement. Risque de confusion lors de migrations : si quelqu'un crée `rag.resolve_chunk_hierarchy` en oubliant le wrapper public, l'ingestion casse silencieusement. Le code log déjà des erreurs (ligne 509-518) mais ne fait pas remonter en réponse HTTP.

**Recommandation.** Soit `.schema('rag').rpc('resolve_chunk_hierarchy', ...)` partout, soit documenter explicitement dans le code qu'il s'agit d'un wrapper public et pourquoi.

**Effort** : 🟢 < 0.5 jour. **P1**.

#### 4.3.4 🟨 P2 / Sécurité — Profil utilisateur lu une fois par chunk (N+1)

**Description.** `ingest-documents/index.ts:184-198` et `339-360` lisent `core.profiles` par chunk si `org_id` ou `target_apps` ne sont pas fournis. Sur un payload de 200 chunks d'un seul fichier, ça fait 200 requêtes à la DB.

**Impact.** Latence d'ingestion. Probablement masqué par la latence de l'embedding batch, mais N+1 reste un anti-pattern.

**Recommandation.** Cacher le profile lookup en mémoire dans le serve handler par `userId`.

**Effort** : 🟢 < 0.5 jour. **P2**.

#### 4.3.5 🟦 P3 / Mineur — `target_apps` defaut à `['default']`

**Description.** Si `targetApps.length === 0` après lookup profil, fallback à `['default']` (`ingest-documents/index.ts:201, 363`). Pour ARPET, l'app_id devrait être `'arpet'`. Ce fallback masque un bug de configuration utilisateur.

**Impact.** Mineur en production (la plupart des utilisateurs ont un app_id). Si jamais un user n'a pas de profile.app_id, son document est ingéré sous `target_apps: ['default']` et invisible des projets ARPET.

**Recommandation.** Logger un warn quand le fallback `['default']` est appliqué + afficher un compteur dans la réponse.

**Effort** : 🟢 < 0.5 jour. **P3**.

#### 4.3.6 🟦 P3 / Architecture — Pas de validation taille chunk vs limite embedding

**Description.** OpenAI `text-embedding-3-small` accepte 8 191 tokens en input. Aucun check sur la taille des chunks reçus de n8n. Un chunk trop long → embedding échoue (cf. 4.3.1) → tout le batch échoue.

**Recommandation.** Pré-valider `content.length` (heuristique : ~4 chars/token, donc ~32 000 chars max). Si dépassement, soit splitter, soit rejeter avec erreur claire.

**Effort** : 🟢 < 0.5 jour. **P3**.

### 4.4 Schéma DB et RPC

#### 4.4.1 🟥 P0 / Maintenabilité — Schéma `rag` non versionné en source

**Description.** Le repo contient 2 migrations (`supabase/migrations/20251127_*.sql`) qui couvrent uniquement `public.organization_members` et `public.meetings`. **Tout le schéma `rag`, les fonctions `match_documents_v14`, `resolve_chunk_hierarchy`, `get_agent_context`, `add_message`, `search_qa_memory`, `increment_qa_usage`, et toutes les RLS associées sont absents du repo.**

**Impact.** Critique pour la maintenabilité. Aucun moyen de :
- Reproduire un environnement de dev local conforme à la prod.
- Reviewer une modification SQL avant mise en prod (pas de PR review possible).
- Faire un rollback contrôlé.
- Auditer les RLS sur `rag.documents` (point critique pour le multi-tenant ; cf. 4.5).
- Comprendre la stratégie d'index sur `rag.documents.embedding` (HNSW vs IVFFlat ? params ?).

**Recommandation.** Exporter le schéma actuel via `supabase db dump --schema rag,sources,config,core,arpet` et le commiter en `supabase/migrations/20260101_baseline.sql` puis adopter la pratique de migrations versionnées pour toutes les évolutions futures. Pose les fondations d'un local dev reproductible.

**Effort** : 🟡 2-3 jours pour le baseline + adoption de la discipline. **P0**.

#### 4.4.2 🟨 P2 / Architecture — RPC `match_documents_v14` indique 14+ itérations

**Description.** Le numéro de version (`v14`) suggère ≥ 14 itérations de la signature RPC. Sans le code SQL, il est impossible d'auditer la logique de fusion RRF, le poids vector vs FTS, l'expansion concept, le filtrage layers.

**Recommandation.** Consolider sur une signature stable (`match_documents_v15` ou `match_documents_current`) avec doc inline (commentaires SQL `COMMENT ON FUNCTION`). Documenter les paramètres dans la fonction TypeScript appelante (`search/retrieval.ts:41-60`).

**Effort** : 🟡 selon refactor. **P2**.

#### 4.4.3 🟨 P2 / Architecture — `out_*` prefix sur output columns

**Description.** Les RPC retournent `out_chunk_id`, `out_content`, `out_similarity`, etc. (vu dans `search/retrieval.ts:99-122` et `agentic/tools.ts:359-382`). C'est une convention Postgres pour distinguer les paramètres OUT des colonnes, mais elle est invasive côté TypeScript (le mapping doit être manuel partout).

**Recommandation.** Soit le mapping est centralisé (un seul `mapChunks` au lieu de deux quasi-identiques entre `search/retrieval.ts:99-123` et `agentic/tools.ts:359-383`), soit la RPC retourne un type `RECORD` propre avec colonnes sans préfixe.

**Effort** : 🟢 1 jour pour centraliser le mapping. **P2**.

#### 4.4.4 🟨 P2 / Bug — `mapChunks` dupliqué entre retrieval et tools

**Description.** `search/retrieval.ts:99-123` et `agentic/tools.ts:359-383` sont quasi identiques (même mapping). Risque de drift si l'un est modifié sans l'autre.

**Recommandation.** Extraire dans un module `search/mapper.ts` partagé.

**Effort** : 🟢 < 0.5 jour. **P2**.

### 4.5 Sécurité et multi-tenancy

#### 4.5.1 🟥 P0 / Sécurité — `user_id` et `org_id` sont trustés depuis le body

**Description.** `index.ts:106-118` extrait `user_id`, `org_id`, `project_id` du JSON body. Aucun lien établi entre ces IDs et l'éventuel JWT. Le client Supabase est créé avec `SUPABASE_SERVICE_ROLE_KEY` (`index.ts:122`), donc tous les RPC s'exécutent en bypassant RLS.

**Impact.** Si la fonction est appelée avec un JWT utilisateur valide mais avec un `org_id` arbitraire (autre organisation), le retrieval renvoie potentiellement des chunks de cette autre org. Le seul rempart est que `match_documents_v14` filtre côté SQL sur `p_org_id` — mais comme c'est un paramètre de la RPC et non `auth.uid()`, c'est l'attaquant qui choisit la valeur.

**Pré-requis pour exploiter** : avoir un user_id valide d'une autre organisation. Si le frontend envoie toujours le user_id authentifié, l'exploitation suppose un client custom (pas un utilisateur normal). Mais c'est exactement ce qu'un utilisateur curieux ferait (DevTools → modifier le body → renvoyer la requête).

**Recommandation.** Deux mesures :
1. Vérifier que `verify_jwt = true` dans le `config.toml` pour `baikal-retrieval` (actuellement non listé donc default true, mais à confirmer en prod).
2. Côté handler, extraire `auth.uid()` du JWT (header `Authorization`) et **valider** que `body.user_id === auth.uid()` (ou que body.user_id est null et on prend auth.uid()). Idem pour org_id : la RPC doit valider via une jointure `core.organization_members` que `auth.uid()` est bien membre de `org_id`.

Vérification équivalente côté `baikal-vote/index.ts:351-381` : même pattern, même risque.

**Effort** : 🟡 1-2 jours. **P0**.

#### 4.5.2 🟧 P1 / Sécurité — `.env.local2` committé avec clé anon production

**Description.** `/.env.local2` contient :
```
VITE_SUPABASE_URL=https://odspcxgafcqxjzrarsqf.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_N8N_INGEST_WEBHOOK_URL=https://n8n.srv1102213.hstgr.cloud/webhook/ingest
```

C'est une clé **anon** (pas service_role), donc le risque direct est limité. Mais :
- L'URL du projet Supabase est révélée publiquement dans le repo (probablement déjà sur GitHub).
- L'URL n8n est exposée → DDoS possible sur le webhook d'ingestion si le secret webhook n'est pas en place.
- C'est un mauvais signal de discipline : si une autre clé service_role passait dans le repo plus tard, le mécanisme de revue ne la rattraperait pas.

**Recommandation.** Retirer `.env.local2` du repo (`git rm`), ajouter `.env*` (sauf `.env.example`) dans `.gitignore`, faire un audit `git log -p .env.local2` pour vérifier l'historique. Si la clé anon a été compromise (accessible publiquement sur GitHub), la régénérer côté Supabase. Vérifier que le webhook n8n a un secret en header (`N8N_WEBHOOK_SECRET` est lu dans `trigger-ingestion/index.ts:22`).

**Effort** : 🟢 < 0.5 jour. **P1**.

#### 4.5.3 🟧 P1 / Sécurité — RLS non vérifiable depuis le repo

**Description.** Comme le schéma `rag` n'est pas versionné (cf. 4.4.1), impossible de vérifier que `rag.documents`, `rag.qa_memory`, `rag.conversations`, `rag.messages` ont des politiques RLS strictes. Le code edge fonction utilise `SUPABASE_SERVICE_ROLE_KEY` qui bypasse RLS, donc même si RLS est mal configurée, les RPC et requêtes directes côté edge fonction continuent à fonctionner mais sans la sécurité attendue.

**Impact.** Risque que des accès directs depuis le frontend (avec anon key + JWT user) puissent lire des chunks d'autres orgs si RLS est laxe.

**Recommandation.** Audit RLS séparé sur l'instance Supabase via `supabase db dump --role-only` ou via le dashboard. Établir une checklist :
- `rag.documents` : SELECT autorisé si `org_id = (SELECT org_id FROM core.profiles WHERE id = auth.uid())` OR `auth.uid() IN ...` (super_admin).
- `rag.qa_memory` : idem.
- `rag.conversations` / `rag.messages` : SELECT si user_id = auth.uid() OR org_admin.

**Effort** : 🟡 selon état réel. **P1**.

#### 4.5.4 🟨 P2 / Sécurité — Pas de rate-limiting sur `baikal-retrieval`

**Description.** Aucun rate-limiting visible (Supabase Edge Functions ne propose pas de natif). Un utilisateur malveillant peut déclencher des centaines de requêtes générant à chaque fois un embedding OpenAI + un appel à la RPC + potentiellement Gemini agentic (8 s × N).

**Impact.** DoS / facture qui explose. Modéré : Supabase peut throttler si trop de requêtes.

**Recommandation.** Ajouter un check léger sur `rag.messages.created_at` par user (max N requêtes / minute, soft fail à 429). Ou utiliser un service tiers (Upstash Ratelimit).

**Effort** : 🟡 1-2 jours. **P2**.

### 4.6 Performance et observabilité

#### 4.6.1 🟥 P0 / Observabilité — Aucune trace structurée

**Description.** Le code émet `console.log` partout (`grep -c "console.log" baikal-retrieval/index.ts` = 15+ occurrences ; chaque module a son propre logger informel). Les seules métriques persistées sont `messages.processing_time_ms` (`context.ts:67-88`) et les SSE event timings (`metrics.timings`). Pas de Langfuse, Phoenix Arize, ou équivalent.

**Impact.** Le défaut Citroën (4,5–13,9 s, "not found malgré chunks pertinents") ne peut pas être diagnostiqué sans correlation entre query → analyse → search → rerank → génération. Pour résoudre des incidents en production, c'est un handicap majeur.

**Recommandation.** Adopter Langfuse self-hosté ou Phoenix Arize OSS. Tracer chaque pipeline run avec : query, intent, embedding hash, retrieved chunks (IDs + scores), context formaté (tokens), réponse, sources finales, latence par phase. Coût Langfuse self-host : 1 pod Postgres + 1 pod web sur Vercel/Render, ~30€/mois. Bénéfice : diagnostic d'incident en 10 min vs 2 jours de fouille de logs Supabase.

**Effort** : 🟡 2-3 jours. **P0**.

#### 4.6.2 🟧 P1 / Observabilité — Pas de golden set ni de RAGAS

**Description.** Aucun fichier de test, aucun harness d'évaluation. Le `package.json` n'a pas de script `test`. Le seul artefact de "validation" est la page `Validation.jsx` (817 lignes, vraisemblablement UI de validation utilisateur, pas tests automatiques).

**Impact.** Toute modification du pipeline (changement de modèle, de prompt, de threshold) est une régression potentielle non détectable. Le décalage v1.3 → v2.0 a probablement introduit des régressions invisibles (voir 4.1.1, 4.1.2).

**Recommandation.** Construire un golden set de 50-100 questions ARPET réelles (extraites des 64 messages de Benoit Hugonenc) avec :
- Question
- Réponse attendue (rédigée par expert)
- Sources attendues (file_id + page)
- Critères de réussite (factuel, complétude, citation)

Wrapper Langfuse + RAGAS pour mesurer faithfulness, answer_relevancy, context_precision, context_recall sur le set à chaque commit. Bloquer la merge si régression > 5 % sur n'importe quelle métrique.

**Effort** : 🔴 > 5 jours (annotation du golden set par expert métier). **P1**.

#### 4.6.3 🟧 P1 / Perf — Latences cibles non documentées vs mesurées

**Description.** Le code commente `Target: < 5s total for standard factual queries` (`index.ts:148`) et `Latence max: ~7 secondes` (`Z.DOCUMENTATION/PROMPT_CDC_AGENTIC_RAG.md`). Aucun assert/check : si la pipeline dépasse, rien ne se passe.

**Impact.** Latence réelle 4,5–13,9 s mentionnée → fenêtre de 9 s, hors cible.

**Recommandation.** Logger explicitement quand `metrics.timings.total > 5000` dans le mode fast path et `> 10000` dans le mode agentic. Alarme Slack/email si > 10 % des requêtes dépassent. Décomposer le diag : si phase `search` > 1 s, c'est la RPC SQL qui est lente (vérifier index HNSW). Si `generation` > 4 s, c'est le LLM lent (Gemini cache miss ?).

**Effort** : 🟢 1 jour pour les logs + setup alarme basique. **P1**.

#### 4.6.4 🟨 P2 / Perf — Embedding non parallélisé avec QA memory

**Description.** `index.ts:158-161` parallélise context + embedding. Bien. Mais `searchQAMemory` est ensuite séquentiel après l'embedding (`index.ts:198`). Avec un memory hit (~25 % typique), tout le reste du pipeline est skippé — la latence de la phase précédente était inutile.

**Recommandation.** Lancer `getAgentContext`, `generateEmbedding`, et `searchQAMemory` en parallèle (l'embedding est requis pour la memory, donc en réalité memory dépend d'embedding ; mais `getAgentContext` peut tourner en parallèle des deux).

Le code le fait déjà partiellement. Optimiser éventuellement en lançant `executeSearch` juste après `searchQAMemory` sans attendre la décision (race avec memory): si memory hit, abort search ; sinon utiliser le résultat. Latence gagnée : ~500-1000 ms quand memory miss (cas dominant).

**Effort** : 🟡 1 jour. **P2**.

### 4.7 Frontend et UX de la traçabilité

#### 4.7.1 🟥 P0 / Produit — Pas de chat dans ce repo

**Description.** `src/pages/Dashboard.jsx:233` : `<p>CHAT_INTERFACE_PLACEHOLDER</p>`. Le hook `useRAG` mentionné dans `Z.DOCUMENTATION/Changelog` n'existe pas dans `src/hooks/`. Le dossier `src/components/chat/` mentionné dans `Z.DOCUMENTATION/Readme` et `conv.md` n'existe pas non plus.

**Impact.** Hors-périmètre de cet audit en l'état. La promesse produit (citation cliquable vers la page exacte du PDF) ne peut pas être validée. Les événements SSE émis par `baikal-retrieval` (`agent_thinking`, `agent_searching`, `agent_found`, `cross_ref` actions, `suggestions`) n'ont pas de consumer visible.

**Recommandation.** Localiser le repo qui héberge le chat ARPET (probablement un repo séparé ou un sous-dossier d'un autre projet). Étendre cet audit à ce repo. **Sans cet audit, le risque produit principal — la qualité de la traçabilité utilisateur — reste non couvert.**

#### 4.7.2 🟧 P1 / Produit — Pas de bbox/coordonnées capturées à l'ingestion

**Description.** `ingest-documents/index.ts:419-424` stocke `metadata` directement depuis n8n. Le code observable utilise `metadata.page_start`, `metadata.page_end`, `metadata.section_title`. Pas de trace de `bbox`, `polygon`, `x0/y0/x1/y1` ou équivalent. Sources de citation construites avec `page` au mieux (`sources.ts:60`).

**Impact.** Le user clique sur la citation → on l'ouvre à la page X. Mais on ne peut pas surligner le passage exact dans le PDF. Pour des CCAP/CCTP de 30-50 pages denses, c'est un downgrade UX significatif vs surlignage par bbox.

**Recommandation.** Hors-scope MVP. À considérer en évolution : LlamaParse retourne des bbox dans son output JSON ; le workflow n8n peut les remonter sous `metadata.bbox: { page, x0, y0, x1, y1 }`. Côté frontend, viewer PDF (ex: `react-pdf-viewer`) supporte le surlignage par coordonnées.

**Effort** : 🟡 3-5 jours côté ingestion + frontend. **P1**, mais probablement acceptable en P2 selon priorité produit.

#### 4.7.3 🟧 P1 / Maintenabilité — Frontend admin monolithique (fichiers 1000-1600 lignes)

**Description.** `src/pages/admin/Users.jsx` 1593 lignes, `Projects.jsx` 1326 lignes, `IngestionContent.jsx` 1292 lignes, `Invitations.jsx` 1056 lignes. `AUDIT_DETTE_TECHNIQUE.md` (présent à la racine, daté 2026-01-04) le note déjà.

**Impact.** Maintenabilité dégradée. Tout changement sur la gestion utilisateurs nécessite de naviguer 1500 lignes de JSX.

**Recommandation.** Plan déjà en cours (cf. `AUDIT_DETTE_TECHNIQUE.md`) avec extraction `src/features/users/components/`. Continuer pour Projects, Invitations, IngestionContent.

**Effort** : 🔴 > 5 jours. **P1**.

#### 4.7.4 🟨 P2 / Maintenabilité — Vocabulaire `verticales` survivant à la migration `app`

**Description.** `Dashboard.jsx:248` : `defaultVertical={currentApp || 'audit'}`. `SmartUploader.jsx:45-50` : `DEFAULT_VERTICALS = [{ id: 'audit', ... }, { id: 'btp' }, { id: 'juridique' }, { id: 'rh' }]`. Les commentaires "MIGRATION:" parsèment le code (`Dashboard.jsx:13-21`). La migration vertical → app est incomplète.

**Impact.** Confusion développeur. ARPET est un app_id unique (`'arpet'`) mais le composant SmartUploader propose 4 verticales (audit, btp, juridique, rh). L'utilisateur doit choisir une catégorie qui ne correspond pas à la réalité produit Roudié.

**Recommandation.** Achever la migration : retirer DEFAULT_VERTICALS, brancher le SmartUploader sur la liste réelle des apps disponibles (depuis `config.apps` en DB).

**Effort** : 🟡 1-2 jours. **P2**.

### 4.8 Maintenabilité et dette technique

#### 4.8.1 🟧 P1 / Maintenabilité — Code legacy massif conservé

**Description.**
- `baikal-librarian-v3/index.ts` : 1 754 lignes. Aucun appel observable.
- `baikal-librarian-v4/index.ts` : 1 935 lignes. Appelé par `baikal-brain-v3/index.ts:39`.
- `baikal-brain-v3/index.ts` : 1 025 lignes. Aucun appel observable depuis le frontend ; appel hypothétique via legacy.

**Impact.** Confusion (4 versions d'orchestrateur disponibles). Maintenance double : un fix dans `baikal-retrieval` doit-il être backporté dans `baikal-librarian-v4` ? Risque qu'un appel hardcodé subsiste quelque part et utilise du code obsolète.

**Recommandation.** Étapes :
1. Vérifier (logs Supabase) qu'aucun appel à `baikal-librarian-v3` ne tombe en prod sur 30 jours → supprimer.
2. Vérifier que `baikal-brain-v3` n'est plus appelé → supprimer (et dépendance `baikal-librarian-v4`).
3. Dans le pire cas, archiver dans une branche `archive/legacy-pre-v2`.

**Effort** : 🟢 < 1 jour pour la suppression (effort principal = vérification logs). **P1**.

#### 4.8.2 🟨 P2 / Maintenabilité — Pas de tests automatiques

**Description.** Aucun fichier `.test.ts` ou `.spec.js` dans le repo. `package.json` n'a pas de script `test`. Rappel direct dans `AUDIT_DETTE_TECHNIQUE.md`.

**Impact.** Toute modif est une régression potentielle. Voir 4.6.2 pour la dimension RAG eval.

**Recommandation.** Démarrer petit : Vitest pour le frontend, Deno test pour les edge functions. Cibles initiales :
- `routing/cross-ref.ts` : 100% coverage (regex pure, sans I/O)
- `routing/safety.ts` : 100% coverage
- `sources.ts` : 100% coverage
- `agentic/orchestrator.ts shouldTriggerAgentic` : cas limites

**Effort** : 🟡 2-3 jours pour le squelette + 20-30 tests. **P2**.

#### 4.8.3 🟨 P2 / Maintenabilité — `console.log` en production

**Description.** Edge functions logguent abondamment (`baikal-retrieval/index.ts` : 15+ occurrences), souvent avec des préfixes informels (`[retrieval]`, `[agentic]`, `[brain-v3]`). Le helper `createLogger` existe (`_shared/utils.ts:221-236`) mais n'est pas utilisé partout.

**Impact.** Logs Supabase difficilement filtrables. Pas de niveau (info vs warn vs error) propre.

**Recommandation.** Adopter `createLogger` partout, taguer avec un trace_id (uuid v4 par requête) pour corrélation.

**Effort** : 🟢 1 jour. **P2**.

#### 4.8.4 🟨 P2 / Maintenabilité — Documentation interne dispersée

**Description.** `Z.DOCUMENTATION/` (8 fichiers), `CLAUDE.md` (racine, 198 lignes), `AUDIT_DETTE_TECHNIQUE.md` (racine), `INSTRUCTIONS_RPC_EMAIL.md` (racine + Z.DOCUMENTATION = doublon). Le `Changelog` mentionne des composants qui n'existent plus (`useRAG`, `rag.service.js`, `components/chat/`).

**Recommandation.** Consolider sous `docs/` à la racine : `docs/architecture.md` (= ce qu'est CLAUDE.md), `docs/rag-pipeline.md`, `docs/onboarding.md`. Supprimer les doublons. Mettre à jour le Changelog.

**Effort** : 🟢 1 jour. **P2**.

#### 4.8.5 🟦 P3 / Maintenabilité — `useRAG`, `rag.service.js` mentionnés mais absents

**Description.** Le `Z.DOCUMENTATION/Changelog` fait référence à `useRAG`, `rag.service.js`, `components/chat/`. Aucun de ces fichiers n'existe dans `src/`. Soit ils ont été migrés vers un autre repo (chat séparé), soit ils ont été supprimés sans mise à jour de la doc.

**Recommandation.** Mettre à jour le Changelog (cf. 4.8.4).

### 4.9 Conformité aux best practices RAG 2026

| Best practice 2026 | Statut ARPET | Constat |
|---|---|---|
| Hybrid search (vector + BM25/FTS) | ✅ Implémenté | `match_documents_v14` (vector_weight 0.8 + fulltext_weight 0.2). [`config.ts:36-37`] |
| Reranking (Cohere/Voyage/bge) | 🟧 Implémenté mais désactivé | `enable_reranking: false`. [`config.ts:74`] |
| Hierarchical retrieval (small-to-big) | ✅ Implémenté | L0/L1 + `parent_chunk_id` + `include_children`. [`config.ts:170-197`] |
| GraphRAG / concept expansion | ✅ Implémenté | `enable_concept_expansion: true`, `rag.document_concepts` table avec source `category`/`llm`/`manual`. [`config.ts:316`] |
| Agentic RAG / ReAct | ✅ Implémenté | Gemini 2.5 Flash + 3 tools, max 3 iterations, 8s budget. [`agentic/`] |
| Query rewriting (LLM) | 🟥 Code présent mais non appelé | `analyzeQuery` orphelin. [Section 4.1.1] |
| Cross-encoder reranking | 🟧 Cohere = pseudo cross-encoder, mais OFF | [`reranker.ts`] |
| Late chunking | ❌ Non implémenté | Chunks embedded indépendamment lors de l'ingestion. |
| Adaptive retrieval (seuils dynamiques) | 🟧 Code présent mais désactivé | `adaptive_threshold_enabled: false`. [`config.ts:77`] |
| Évaluation systématique (golden set + RAGAS) | ❌ Absent | Aucun test, aucun eval. [Section 4.6.2] |
| Observabilité (Langfuse / Phoenix) | ❌ Absent | Console.log uniquement. [Section 4.6.1] |
| Prompt caching | ✅ Implémenté côté Gemini | `rag.gemini_caches` + hashing global. [`generation/gemini.ts`] |
| Anthropic Citations API | ❌ Non utilisé | Citations format propriétaire `[Doc, Page X, Section Y]` ou `<cite>`. [`prompt.ts:21`, `prompt.ts:90`] |
| Embedding models 2026 (Voyage-3, Cohere v4, Mistral) | ❌ `text-embedding-3-small` (2024) | [Section 5.4] |

---

## 5. Investigations spéciales

### 5.1 Cause racine probable du symptôme « not found malgré chunks pertinents » sur Citroën

L'audit du code révèle **trois facteurs convergents** qui produisent ce pattern, classés par contribution probable :

**Facteur 1 (le plus impactant) — `boost_documents` et `file_filter` sans effet (4.1.2).** Sur un projet à 600 documents, si l'utilisateur dit "Quelle est la pénalité de retard dans le CCAP ?", le retrieval cherche dans tous les docs et le ou les chunks CCAP pertinents peuvent ne pas figurer dans les `match_count` premiers chunks (par défaut 6 pour `factual`, `config.ts:42`). Le LLM ne voit alors aucun chunk CCAP → "non trouvé".

**Facteur 2 — Brain LLM débranché (4.1.1).** Si la question est en deuxième tour ("et pour le lot 4 ?"), l'anaphore n'est jamais résolue. Le `rewritten_query` retourné par `buildFallbackAnalysis` est strictement la query originale (`routing/analyzer.ts:198`). L'embedding qui en résulte est désaligné du sujet réel → mauvais top-k.

**Facteur 3 — Prompt anti-hallucination push to "non trouvé" (4.2.1).** Même quand le retrieval ramène 1-2 chunks pertinents, si l'information exacte n'est pas littérale, la règle 3 du `ZERO_HALLUCINATION_PROMPT` instruit le LLM de basculer en "non trouvé + cadre général" plutôt que de répondre partiellement avec ce qu'il a.

**Facteurs secondaires** :
- L'absence de reranker (4.1.3) signifie que le top-k est strictement le top-k de la fusion RRF, sans réordonnancement par pertinence sémantique fine. Sur du français BTP, le RRF seul est moins fiable qu'un reranker dédié.
- L'agentic mode aurait pu compenser, mais le seuil de déclenchement est `chunks < 3 OR avg_similarity < 0.45` (`config.ts:91-92`). Sur un projet riche, on a souvent 6-8 chunks même médiocres → pas d'agentic → fast path échoue.
- Le `max_context_length: 12 000` chars (`config.ts:64`, défault) est court par rapport à `max_tokens: 6400` (output) — sur 6-8 chunks de 1 500 chars, on tient ; mais sur 8 chunks moyens à 2 000 chars, on tronque (4.2.3).

**Conclusion.** Le défaut Citroën est principalement causé par la combinaison **(1) retrieval qui ne cible pas le doc demandé** + **(2) prompt qui pénalise les réponses partielles**. Activer le reranker et le file filter doit produire l'amélioration la plus visible. Recâbler le brain LLM apporte un gain durable sur le multi-tour.

### 5.2 Pourquoi le reranker est-il désactivé ?

Pas de justification documentée dans le code, les commits récents (`git log --oneline -5` propre), ou la documentation. Les hypothèses neutres :

- **Coût.** Cohere rerank-v3.5 facture ~$0.002 / 1k searches. Sur 64 messages / 3 jours (Roudié), c'est négligeable (<$1/an).
- **Latence.** ~100-300 ms typique. Combiné avec un budget total de 5-7 s, c'est notable mais acceptable.
- **Bug d'intégration.** Le code de rerank gère correctement l'inheritance L1→enfants (`reranker.ts:42-54`) et le fallback en cas d'échec API (`reranker.ts:66-69`). Pas de bug visible.
- **Absence de mesure.** Le plus probable. Sans golden set ni RAGAS, impossible de prouver que le reranker améliore — donc on l'a coupé "par sécurité".

**Recommandation.** Activer pour Roudié, mesurer (cf. 4.1.3).

### 5.3 Le « bug pétanque » de l'adaptive threshold

Pas de trace dans le code (commentaires au-delà de "petanque bug" dans `config.ts:77`), pas de doc, pas de commit explicite. Reconstitution probable :

- `adaptive_threshold_ratio: 0.55` ⇒ on ne garde que les chunks à `similarity ≥ ratio × max_similarity_in_set`.
- Sur une query où le top score est faible (ex. 0.55 au lieu du typique 0.7), le seuil adaptatif devient `0.55 × 0.55 = 0.30`, ce qui devrait garder pas mal de chunks.
- En revanche si le top est haut (0.9) et tous les autres bas (0.4), le seuil adaptatif `0.9 × 0.55 = 0.495` éliminait tous les chunks sauf le top → contexte appauvri.
- Sur une query type "pétanque" (peut-être un nom de projet ou un test sur un domaine où il n'y a qu'1-2 chunks pertinents), tous les autres chunks tombaient sous le seuil et la réponse devenait pauvre.

**Pourquoi 0.55 a été baissé depuis 0.70** (commentaire `config.ts:78`). Probablement un compromis pour réduire l'agressivité du filtre. Mais désactivé entièrement par défaut.

**Recommandation.** Remplacer le ratio absolu par un quantile. Garder les chunks au-dessus du **30e percentile** des scores de la session (plus robuste aux distributions hétérogènes). Tester sur le golden set quand il existera.

### 5.4 Choix de `text-embedding-3-small` (1 536 dim) : justifié ou par défaut ?

**État de l'art 2026 sur le français BTP** :

| Modèle | Dim | MTEB FR | Multilingual | Dispo API | Coût / 1M tokens |
|---|---|---|---|---|---|
| `text-embedding-3-small` (OpenAI) | 1 536 | ~58 | ✓ | ✓ | $0.02 |
| `text-embedding-3-large` (OpenAI) | 3 072 | ~62 | ✓ | ✓ | $0.13 |
| Voyage-3-large | 1 024 | ~67 | ✓ | ✓ | $0.18 |
| Cohere Embed v4 | 1 024-1 536 | ~65 | ✓ (français natif) | ✓ | $0.12 |
| Gemini embedding-001 | 768/3 072 | ~63 | ✓ | ✓ | $0.0015 |
| Mistral Embed | 1 024 | ~64 (FR meilleur) | ✓ (français natif) | ✓ | $0.10 |

(Note : MTEB FR scores approximatifs depuis benchmarks publics 2025 ; à confirmer fin 2026 avec MTEB Multilingual à jour.)

**Constat.** `text-embedding-3-small` est le choix par défaut historique d'OpenAI, daté de janvier 2024. Sur du français technique BTP (vocabulaire CCTP, normes DTU, jargon métier), des modèles spécifiquement multilingues comme Mistral Embed ou Cohere v4 produisent des embeddings sensiblement plus discriminants. Voyage-3-large est le meilleur sur MTEB Multilingual mais le plus cher.

**Aucun test n'a été fait pour valider 3-small contre une alternative**, à juger par l'absence d'eval. Le choix est probablement par défaut, pas raisonné.

**Impact d'un changement.** Réembedding de 3 700 chunks = ~5 min, ~$0.05 (small) ou $0.20 (Mistral). Coût des nouveaux embeddings continus : négligeable. Bénéfice attendu : **+5 à +10 % de recall@5** sur français BTP, basé sur les écarts MTEB.

**Recommandation.** Tester Mistral Embed (français natif, prix raisonnable, dim compatible 1 024 nécessite un re-create d'index) ou Cohere v4 sur le golden set. Si gain ≥ 5 %, basculer.

**Effort** : 🟡 2-3 jours (réembedding + rebuild index HNSW). **P2** sans urgence, **P1** si on cible une amélioration visible de la qualité.

### 5.5 Choix de `gpt-4o-mini` comme générateur : justifié ou par défaut ?

**Mode chunks** (factual/citation/comparison) : `gpt-4o-mini` (`config.ts:63, llm_model`).
**Mode gemini** (synthesis avec docs) : `gemini-2.5-flash-lite` (`config.ts:48`).

**Constat similaire à 5.4** : choix par défaut (modèles light, peu coûteux), pas validé contre des alternatives. Pour ARPET en production chez Roudié (un client unique, marché contractuel BTP), le coût marginal d'un upgrade est marginal :
- Sur 64 messages / 3 jours = ~20 messages/jour. Si chaque réponse = 500 tokens output × $0.01/1k (Sonnet 4.6) = $0.005/message = $0.10/jour = $36/an pour Roudié seul.
- vs gpt-4o-mini = ~$3/an. Différence : $33/an. Négligeable face à un seul ticket support économisé.

**Recommandation.** Tester `claude-sonnet-4-6` ou `gpt-4.1` ou `gemini-2.5-pro` sur le golden set. Critère : faithfulness (hallucination) + answer_relevancy (qualité). Si gain ≥ 10 % sur faithfulness, basculer pour ARPET.

**Effort** : 🟢 < 1 jour pour le test (sans le golden set), 🟡 2-3 jours avec golden set. **P1**.

### 5.6 État du visual grounding (bbox / page-level / section-level)

**Niveau actuel** : page-level + section-level. Voir 4.7.2 pour le détail.

- **Page** : `metadata.page_start` / `metadata.page_end` consommé à `prompt.ts:157-160` et `gemini-agent.ts:289`. Présent dans `buildSourcesFromChunks` (`sources.ts:60`).
- **Section** : `chunk.section_title` consommé partout (chunks, agentic, sources). C'est ce qui permet le format `[Doc, Page X, Section Y.Z]`.
- **Bbox** : aucune référence dans le code.

**Choix structurant.** Aller au bbox demande :
1. n8n / LlamaParse remonte les coordonnées (LlamaParse JSON le fait, à vérifier dans n8n).
2. `ingest-documents` les stocke dans `metadata.bbox` (rien à changer côté schéma puisque metadata est JSONB).
3. Le frontend chat consomme et fait le surlignage.

**Recommandation.** Décider produit : si Roudié ne demande pas explicitement le surlignage, **rester à page-level + section-level** est un choix raisonnable. Si une amélioration UX significative est visée, planifier en P1 à 3-5 jours d'effort total (côté ingest + frontend, le frontend étant hors-périmètre repo actuel).

---

## 6. Plan d'action priorisé

Trié par priorité (P0 d'abord), puis sévérité, puis effort croissant.

| Priorité | Severity | Type | Constat | Recommandation | Effort | Fichier(s) |
|---|---|---|---|---|---|---|
| P0 | 🟥 | Bug | Brain LLM `analyzeQuery` jamais appelé | Brancher `analyzeQuery` quand `brain.analysis.enable_query_rewriting === true` | 🟢 | `index.ts:167`, `routing/analyzer.ts:16` |
| P0 | 🟥 | Bug | `file_filter` et `boost_documents` non passés à la RPC | Câbler `searchConfig.file_filter` → `filter_filenames` et `boost_documents` résolus → `filter_file_ids` | 🟢 | `search/retrieval.ts:55-56` |
| P0 | 🟥 | Produit | Prompt anti-hallucination produit "non trouvé" prématuré | Reformuler règle 3 et règle 5 du ZERO_HALLUCINATION_PROMPT pour autoriser réponse partielle citée | 🟢 | `generation/prompt.ts:25-38` |
| P0 | 🟥 | Sécurité | `user_id`/`org_id` body trustés sans lien JWT | Vérifier JWT + valider que `body.user_id == auth.uid()` ; valider appartenance org | 🟡 | `index.ts:106-118`, `baikal-vote/index.ts:351` |
| P0 | 🟥 | Maintenabilité | Schéma `rag` non versionné en source | Exporter baseline migration ; adopter discipline migrations versionnées | 🟡 | `supabase/migrations/` |
| P0 | 🟥 | Observabilité | Aucune trace structurée | Adopter Langfuse self-host ; tracer chaque pipeline run | 🟡 | global |
| P0 | 🟥 | Produit | Pas de chat UI dans ce repo | Localiser le repo chat ARPET et étendre l'audit | 🟢 (audit) | externe |
| P1 | 🟧 | Perf | Reranker Cohere désactivé | Activer pour Roudié, mesurer sur golden set | 🟢 | DB `config.agent_prompts.parameters.features` |
| P1 | 🟧 | Bug | Adaptive threshold désactivé sans plan de réactivation | Documenter "bug pétanque", tester à 0.55, activer si neutre/positif | 🟡 | `config.ts:77-79` |
| P1 | 🟧 | Architecture | `gpt-4o-mini` daté pour générateur principal | A/B test Sonnet 4.6 / GPT-4.1 / Gemini 2.5 Pro sur golden set | 🟡 | `config.ts:63`, `config.ts:48` |
| P1 | 🟧 | Architecture | Embedding batch sans retry par chunk | Wrapper batches de 50 avec retry et isolation des chunks fautifs | 🟡 | `ingest-documents/index.ts:434-454` |
| P1 | 🟧 | Sécurité | `.env.local2` committé avec clé anon production | Retirer du repo + gitignore + audit historique | 🟢 | `.env.local2`, `.gitignore` |
| P1 | 🟧 | Sécurité | RLS non vérifiable depuis le repo | Audit séparé sur l'instance Supabase (dump RLS) | 🟡 | DB |
| P1 | 🟧 | Observabilité | Pas de golden set ni RAGAS | Construire 50-100 questions Roudié + harness RAGAS | 🔴 | nouveau |
| P1 | 🟧 | Perf | Latences > 5s/10s non alertées | Logger + alarmer si dépassement | 🟢 | `index.ts` |
| P1 | 🟧 | Maintenabilité | Code legacy massif (librarian-v3/v4, brain-v3) | Vérifier non-appel sur 30 jours, supprimer | 🟢 | `supabase/functions/baikal-{librarian-v3,librarian-v4,brain-v3}` |
| P1 | 🟧 | Maintenabilité | Frontend admin monolithique | Continuer extraction `src/features/*` | 🔴 | `src/pages/admin/*.jsx` |
| P1 | 🟧 | Produit | Pas de bbox capturé à l'ingestion | Décider produit. Si oui, brancher LlamaParse bbox dans n8n | 🟡-🔴 | n8n + frontend chat |
| P1 | 🟧 | Architecture | `resolve_chunk_hierarchy` appelé sans préfixe schéma | Préfixer `.schema('rag')` ou documenter wrapper public | 🟢 | `ingest-documents/index.ts:506` |
| P2 | 🟨 | Perf | Pas de cache d'embedding pour requêtes répétées agentic | Cache mémoire local dans ToolExecutionContext | 🟢 | `agentic/tools.ts` |
| P2 | 🟨 | Architecture | `documentsCles` redondant avec `list_project_files` | Retirer `documentsCles` du prompt initial agent | 🟢 | `agentic/orchestrator.ts:83-85` |
| P2 | 🟨 | Architecture | Décision agentic basée sur moyenne des similarities | Considérer top-3 ou écart-type | 🟢 | `agentic/orchestrator.ts:208` |
| P2 | 🟨 | Architecture | Truncation naïve de contexte | Drop entier ou résumer L1→L0 | 🟢 | `generation/prompt.ts:148-168` |
| P2 | 🟨 | Sécurité | `parseMetadata` swallow JSON errors | Logger warn, optionnellement rejeter | 🟢 | `ingest-documents/index.ts:48-59` |
| P2 | 🟨 | Sécurité | Pas de rate-limit sur retrieval | Ajouter contrôle léger via `rag.messages` | 🟡 | `index.ts` |
| P2 | 🟨 | Sécurité | Lookup profile N+1 par chunk | Cache mémoire par userId dans le handler | 🟢 | `ingest-documents/index.ts:184` |
| P2 | 🟨 | Maintenabilité | Vocabulaire "verticales" survivant | Migration définitive vers `app_id` | 🟡 | `Dashboard.jsx`, `SmartUploader.jsx` |
| P2 | 🟨 | Maintenabilité | Pas de tests | Vitest + Deno test sur fichiers purs (cross-ref, safety, sources) | 🟡 | nouveau |
| P2 | 🟨 | Maintenabilité | console.log en prod | Adopter `createLogger` partout + trace_id | 🟢 | global |
| P2 | 🟨 | Maintenabilité | Documentation dispersée | Consolider `docs/` ; mettre à jour Changelog | 🟢 | `Z.DOCUMENTATION/`, `docs/` |
| P2 | 🟨 | Architecture | `mapChunks` dupliqué | Extraire `search/mapper.ts` partagé | 🟢 | `search/retrieval.ts:99`, `agentic/tools.ts:359` |
| P2 | 🟨 | Architecture | RPC `match_documents_v14` numérotée | Renommer `_current` ou stable | 🟡 | DB |
| P2 | 🟨 | Architecture | `out_*` prefix invasif côté TS | Type RECORD propre côté SQL ou mapping centralisé | 🟢 | DB + `search/mapper.ts` |
| P2 | 🟨 | Perf | Embedding `text-embedding-3-small` par défaut | Tester Mistral Embed FR ou Cohere v4 | 🟡 | `_shared/utils.ts:177`, DB index |
| P2 | 🟨 | Perf | Search/memory séquentiel | Race memory + search, abort search si memory hit | 🟡 | `index.ts:194-220` |
| P3 | 🟦 | Mineur | `target_apps` fallback `['default']` silencieux | Logger + compteur dans réponse | 🟢 | `ingest-documents/index.ts:201` |
| P3 | 🟦 | Mineur | Pas de validation taille chunk vs 8191 tokens | Pré-valider longueur | 🟢 | `ingest-documents/index.ts` |
| P3 | 🟦 | Bonne pratique | Citations format propriétaire | Considérer Anthropic Citations API | 🟡 | `prompt.ts:21,90`, frontend |
| P3 | 🟦 | Maintenabilité | `useRAG` mentionné mais inexistant | Mettre à jour Changelog | 🟢 | `Z.DOCUMENTATION/Changelog` |

---

## 7. Recommandations stratégiques

### 7.1 Évaluation systématique : protocole golden set + RAGAS

**Objectif** : transformer chaque modification du pipeline en décision data-driven.

**Étapes (8-10 jours / expert métier + dev)** :
1. **Sourcing du golden set (3-4 jours / expert métier)** : extraire 50-100 messages réels de Benoit Hugonenc (org Roudié, fin mars). Pour chaque, l'expert annote la réponse attendue + sources attendues (file_id + section + page). Stocker en JSON ou en table `arpet.golden_set`.
2. **Harness Vitest + Langfuse (2 jours / dev)** : un script qui pour chaque question :
   - Appelle `baikal-retrieval` (en local ou prod-staging).
   - Extrait `sources` et `fullResponse`.
   - Compare aux annotations.
   - Calcule RAGAS metrics : `faithfulness`, `answer_relevancy`, `context_precision`, `context_recall`.
   - Pousse en Langfuse (dataset) avec score.
3. **CI gate (1 jour)** : sur chaque PR, run le golden set, bloquer si régression > 5 % sur n'importe quelle métrique.
4. **Itération** : utiliser le harness pour A/B tester chaque sujet investigé en §5 (reranker, embedding, modèle générateur).

### 7.2 Observabilité : Langfuse self-hosted

**Stack proposée** :
- Langfuse OSS (Postgres + web UI) sur Render ou Fly.io. Coût : ~30€/mois.
- SDK Langfuse Deno : wrapper le `serve()` de chaque edge function avec un trace.
- Traces structurées par phase : `config_load`, `embedding`, `qa_memory`, `search`, `rerank`, `agentic_iter_N`, `generation`. Chaque trace porte les inputs, outputs, modèle utilisé, temps, coût estimé.

**Bénéfice** :
- Diagnostic d'incident en 10 min vs 2 jours.
- Mesure de coût réel par question (essentiel pour pricing produit).
- Détection automatique des dérives de qualité (drift de modèle, dégradation de rerank, etc.).

### 7.3 Migration éventuelle : parser, embedding, générateur

**Court terme (1 trimestre)** :
- Activer reranker Cohere.
- Recâbler brain LLM + file_filter.
- Adoucir prompt anti-hallucination.
- Migrer générateur vers Sonnet 4.6 ou GPT-4.1 (test A/B obligatoire).

**Moyen terme (2 trimestres)** :
- Migrer embedding vers Mistral Embed ou Cohere v4 (réembedding 3 700 chunks ≈ 5 min).
- Adopter Langfuse + golden set + RAGAS.
- Versionner le schéma `rag` en source.

**Long terme (4 trimestres)** :
- Visual grounding bbox (LlamaParse → frontend).
- Anthropic Citations API si migration générateur vers Claude.
- Adaptive retrieval (replacer ratio par quantile, réactiver).
- Late chunking (réembedding global avec contexte du document parent).

### 7.4 Roadmap suggérée

| Trimestre | Livrables RAG | Livrables qualité |
|---|---|---|
| T2 2026 | Reranker activé, brain LLM rebranché, file filter recâblé, prompt assoupli | Audit RLS, retrait `.env.local2`, JWT verification |
| T3 2026 | Migration générateur (test A/B), Langfuse en prod, golden set 50 Q | Schéma DB versionné, suppression legacy librarian-v3/v4, brain-v3 |
| T4 2026 | Migration embedding (test A/B), bbox côté ingestion | Tests Vitest 30+ cas, frontend admin extraction continue |
| T1 2027 | Bbox côté frontend chat (si externe), late chunking R&D | RAGAS automatique en CI, refonte vocabulaire `vertical`→`app` |

---

## 8. Annexes

### 8.1 Liste exhaustive des fichiers lus

**Edge Functions — module critique `baikal-retrieval/`** (lecture intégrale) :
- `index.ts` (555 lignes)
- `config.ts` (430 lignes)
- `types.ts` (412 lignes)
- `utils.ts` (58 lignes)
- `sources.ts` (66 lignes)
- `context.ts` (89 lignes)
- `routing/analyzer.ts` (217 lignes)
- `routing/router.ts` (68 lignes)
- `routing/safety.ts` (124 lignes)
- `routing/cross-ref.ts` (267 lignes)
- `search/embedding.ts` (12 lignes)
- `search/retrieval.ts` (465 lignes)
- `search/memory.ts` (53 lignes)
- `search/reranker.ts` (112 lignes)
- `generation/prompt.ts` (232 lignes)
- `generation/openai.ts` (73 lignes)
- `generation/gemini.ts` (259 lignes)
- `generation/suggestions.ts` (176 lignes)
- `agentic/orchestrator.ts` (252 lignes)
- `agentic/tools.ts` (383 lignes)
- `agentic/gemini-agent.ts` (294 lignes)

**Edge Functions — autres** :
- `_shared/utils.ts` (285 lignes, lecture intégrale)
- `ingest-documents/index.ts` (714 lignes, lecture intégrale)
- `baikal-vote/index.ts` (420 lignes, lecture intégrale)
- `baikal-brain-v3/index.ts` (1 025 lignes, lecture sélective : 1-120 + 600-800)
- `trigger-ingestion/index.ts` (extrait : 1-100)

**Frontend** :
- `package.json`, `README.md`, `.env.example`, `.env.local2`
- `src/lib/supabaseClient.js` (intégral)
- `src/pages/Dashboard.jsx` (intégral)
- `src/components/SmartUploader.jsx` (extrait 1-100)
- `src/services/storage.service.js` (extrait 1-100)
- `src/services/documents.service.js` (extrait sélectif lignes 680-770)
- `src/contexts/AuthContext.jsx` (extrait via grep)

**Documentation et migrations** :
- `CLAUDE.md` (198 lignes)
- `AUDIT_DETTE_TECHNIQUE.md` (extrait 1-100)
- `Z.DOCUMENTATION/Changelog`, `conv.md`, `PROMPT_CDC_AGENTIC_RAG.md`, `Readme` (lecture sélective)
- `supabase/config.toml`
- `supabase/migrations/20251127_audio_module.sql` (intégral)
- `supabase/migrations/20251127_organization_members.sql` (intégral)

### 8.2 Liste exhaustive des fichiers non lus (et pourquoi)

| Catégorie | Fichiers | Raison |
|---|---|---|
| Edge functions hors périmètre RAG | `pv-*`, `pennylane-*`, `geogrid-*`, `gsc-*`, `google-calendar-*`, `mailing-*`, `leads`, `assets`, `calendar-*` | Hors périmètre ARPET (autres apps Baikal). Note : aucun de ces dossiers n'existe dans le repo (vérifié par `ls supabase/functions/`). Le CLAUDE.md évoquait des apps multiples, mais le repo ne contient que les edge functions ARPET + transverses. |
| Edge functions auxiliaires | `mcp-server/index.ts` (685), `meeting-extract/`, `meeting-transcribe/`, `extract-meeting-content/`, `transcribe-dictation/`, `generate-document/`, `get-concepts`, `generate-concept-embeddings`, `sync-ademe`, `trigger-legifrance-sync`, `create-user` | Hors module RAG critique. Lecture rapide via wc -l et grep ciblé. |
| Frontend admin | `src/pages/admin/*.jsx` (Users, Projects, Invitations, Ingestion), `src/components/admin/*`, `src/services/*.service.js` (sauf documents et storage) | Hors UX RAG (admin pur). Note dans 4.7.3 et 4.8.1. |
| Migrations SQL `rag.*` | absentes du repo | cf. 4.4.1 |
| Workflow n8n FLUX 3 | hébergé en n8n.srv1102213.hstgr.cloud, accès non disponible | cf. 0. Limitations |
| Frontend chat ARPET | non présent dans ce repo | cf. 4.7.1 |

### 8.3 Glossaire BTP utile

- **CCAP** (Cahier des Clauses Administratives Particulières) : clauses administratives spécifiques au marché. Marché **privé** : CCAP standard. Marché public : complète le CCAG.
- **CCAG** (Cahier des Clauses Administratives Générales) : référentiel administratif des marchés **publics** uniquement. Ne s'applique pas aux marchés privés (cf. règle injectée dans `prompt.ts:200-210`).
- **CCTP** (Cahier des Clauses Techniques Particulières) : description technique détaillée du marché, par lot.
- **DPGF** (Décomposition du Prix Global et Forfaitaire) : décomposition financière par poste / lot / élément. Souvent en tableau.
- **DTU** (Document Technique Unifié) : norme française BTP, ex: DTU 25.41 (plâtrerie cloisons), DTU 60.1 (plomberie sanitaire). Référencés en regex dans `config.ts:395`.
- **NF** : Norme Française, souvent prefixée par lettre + numéro (ex : NF P 45-204). Regex dans `config.ts:396`.
- **DOE** (Dossier des Ouvrages Exécutés) : remis à la fin des travaux, photos / fiches techniques de l'existant livré.
- **PV de réception** : procès-verbal qui acte la livraison de l'ouvrage avec ou sans réserves.
- **Lot** : segment du marché par corps d'état (CVC, électricité, gros œuvre, plomberie, etc.). Regex/keywords dans `routing/cross-ref.ts:165-176`.
- **QQOQCCP** (Qui / Quoi / Où / Quand / Comment / Combien / Pourquoi) : grille d'analyse de fait largement utilisée en BTP. Stockée dénormalisée dans `rag.documents.qqoqccp` + colonnes typées (cf. 4.3 et `ingest-documents/index.ts:155-161`).
- **Pénalité de retard** : clause CCAP/CCAG fixant le montant retenu par jour de retard.
- **Conducteur de travaux** : profil métier cible d'ARPET. Manage le chantier au quotidien, lit CCAP/CCTP, croise avec les normes DTU/NF.

### 8.4 Références aux best practices RAG 2026

- **MTEB Multilingual leaderboard** (Hugging Face, mis à jour en continu) : référence pour le choix d'embedding. À consulter pour benchmarks FR.
- **RAGAS** (https://github.com/explodinggradients/ragas) : framework Python d'évaluation RAG. Métriques : `faithfulness`, `answer_relevancy`, `context_precision`, `context_recall`.
- **Langfuse** (https://langfuse.com) : observabilité LLM open-source self-hostable.
- **Phoenix Arize** (https://phoenix.arize.com) : alternative observabilité, plus orientée eval.
- **Cohere rerank-v3.5** : modèle de reranking SOTA 2025 sur multilingue.
- **Voyage-3-large** : meilleur embedding multilingue MTEB 2025.
- **Anthropic Citations API** : depuis 2024, l'API Claude (model `claude-sonnet-4-6` et plus récents) retourne des citations structurées avec spans précis.
- **Late Chunking** (Jina AI, 2024) : technique d'embedding qui contextualise chaque chunk dans son document parent avant l'embedding final. Améliore le rappel sur les chunks "isolés".
- **Agentic RAG / ReAct** (Yao et al., 2022 ; popularisé en 2024) : pattern où le LLM utilise des tools de recherche itérativement. ARPET v2.0 implémente ce pattern correctement.

---

*Fin du rapport. Dernière mise à jour : 2026-05-08.*
