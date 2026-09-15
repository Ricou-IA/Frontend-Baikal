# Prompt de reprise — Documents nommés dans la question, résolution scalable (fin du Sprint 1 RAG)

> À coller tel quel dans une nouvelle session Claude Code ouverte sur **`C:\Dev\Frontend-Baikal\.claude\worktrees\sprint1-rag-retrieval`** (worktree git, branche `sprint1/rag-retrieval`). Ne pas travailler dans `C:\Dev\Frontend-Baikal` (main) : le code du sprint n'y est pas.

---

## Où on en est (état au 2026-09-15)

Le Sprint 1 « Colmater le retrieval » de la spec `C:\Dev\Frontend-ARPET\docs\SPEC_RAG_OPTIM_V1.md` est codé, revu tâche par tâche et par une revue de branche complète, et déployé en production sur l'Edge Function `baikal-retrieval` (projet Supabase `odspcxgafcqxjzrarsqf`), sauf le dernier commit.

Branche `sprint1/rag-retrieval`, 14 commits depuis `fe53f2b` (plan). Registre détaillé de l'exécution : `.superpowers/sdd/2026-09-13-sprint1-rag-retrieval/progress.md` (lire en premier : décisions, régressions, minors différés).

| Commit | Contenu | Déployé ? |
|---|---|---|
| `02fbd86`, `0e635b0` | `search/keywords.ts` — termes de recherche (codes, articles, normes, lots) + requête full-text OR-isée ; `toFtsQuery()` dans `search/retrieval.ts` | oui |
| `fb720d3` | migration `20260914100000_rag_match_documents_v15.sql` (pool ×4, enfants L1 hors LIMIT, `p_app_layer_weight`) + `MATCH_DOCUMENTS_FN` | migration appliquée, EF oui |
| `cab0855` | `search/layer-weight.ts` — poids 0,5 de la couche app dans un projet hors questions normatives | oui |
| `ef0b825`, `bfe24ab` | `routing/condenser.ts` — condensation des suivis elliptiques par Gemini flash-lite (800 ms, repli) | oui |
| `95bb9c7` | `agentic/gate.ts` — gate sur `n_vector` et `max_sim`, raison tracée dans `rag.query_logs.agentic` | oui |
| `2f97aea` | `sources.ts` — `page` lu depuis `page_start` (P11, citations cliquables ARPET) | oui |
| `dd46388`, `aa43c40` | version 2.1.0 | oui |
| `892241e` | revue finale : `toFtsQuery` dans `search_in_file`, salutations exclues de la condensation, raison `no_gemini_key` | oui |
| `5e7942b` | golden set synthétique v1.2 (3 critères corrigés) | — |
| `726888d` | règle 8 du prompt (document nommé inexistant) + liste `documentsCles` dans le prompt — **inefficace** (voir ci-dessous) | oui |
| `f385eaf` | liste réelle des fichiers du projet (`sources.files`, limite 50) dans le prompt + harnais : refus « ne sont pas explicitement détaillées » reconnu | **non déployé** |

Les rapports d'éval sont dans `eval/reports/` : `baseline-v2.0.0.*` (référence avant sprint, 35 questions réelles), `baseline-v2.0.0-synth.*` (60 synthétiques), puis `s1-v2.1.0.*`, `s1b-v2.1.0.*` et leurs `-synth` (après déploiement).

**Résultats Sprint 1 (avant le travail ci-dessous)** : réel recall doc 90 → 97 %, MRR 0,73 → 0,82, critères 71 % stable (5 gains, 5 pertes), pages des sources désormais mesurables 10/14 ; synthétique critères 68 → 82-85 % (numéros d'article 0/6 → 4/6, croisements 4/10 → 7/10), aucune classe en recul. Gate agentique : ~85 % `fast_path_ok`, ~10 % `too_few_vector_chunks`, ~1 % `low_max_similarity`.

**Régression restante** : la sentinelle anti-hallucination **C7-004** (« Dans le CCTP du gros œuvre, aborde-t-on le nettoyage extérieur ? », projet EHPAD qui n'a **pas** de CCTP gros œuvre) répond « Oui, dans le CCTP du gros œuvre… » en citant le CCAP. Le full-text OR-isé remonte désormais les chunks « nettoyage » du CCAP et le modèle attribue l'information au document nommé par l'utilisateur. Deux correctifs ont été tentés : la règle 8 avec la liste `documentsCles` (qui est en réalité la liste **générique** des types de documents issue de `config.concepts`, pas les fichiers du projet — d'où l'échec), puis la liste réelle des fichiers du projet plafonnée à 50 (`f385eaf`). **Eric a refusé le plafond** : « limité à 50 documents n'est pas pertinent, on doit réfléchir scalable ». D'où la tâche ci-dessous.

## La tâche

Remplacer la liste de fichiers du prompt par une **résolution ciblée du document nommé dans la question**, qui fonctionne avec 5 comme avec 5 000 fichiers.

### Design validé par Eric

1. **Extraction** (fonction pure, testée) — `extractNamedDocuments(query: string): NamedDocument[]` avec `NamedDocument = { type: string; phrase: string; qualifiers: string[] }`. Repérer les mentions de documents avec les motifs déjà présents dans `config.ts` `CROSS_REF_CONFIG.regex.projectDocs` (CCTP, CCAG, DOE, DPGF, planning, PV de réception, mémoire technique) complétés par : CCAP, PGC, RICT, charte, compte rendu / CR, procès-verbal / PV, acte d'engagement, plan, notice, mémoire. Capturer le qualifiant qui suit la mention, jusqu'à 4 mots, en s'arrêtant à une ponctuation ou à un verbe/mot-outil (« aborde-t-on », « prévoit », « dit », « sur », « pour », « ?»). Exemples attendus :
   - « Dans le CCTP du gros œuvre, aborde-t-on le nettoyage ? » → `{ type: "cctp", phrase: "CCTP du gros œuvre", qualifiers: ["gros", "œuvre"] }`
   - « Le dernier compte rendu de chantier, le 41, il date de quand ? » → `{ type: "cr", phrase: "compte rendu de chantier, le 41", qualifiers: ["chantier", "41"] }` (les mots-outils « de », « le » sont exclus des qualifiants ; « chantier » peut être gardé ou filtré, à trancher dans les tests — l'important est que « 41 » soit conservé)
   - « Que dit le CCAP sur les pénalités ? » → `{ type: "ccap", phrase: "CCAP", qualifiers: [] }`
   - « Quel est le délai global des travaux ? » → `[]`
   Réutiliser la logique de mots-outils de `search/keywords.ts` (`STOPWORDS`) plutôt que d'en créer une seconde ; les qualifiants numériques (« 41 », « 07 ») sont toujours conservés.
2. **Recherche** — `resolveNamedDocuments(supabase, projectId, named: NamedDocument[]): Promise<NamedDocumentResolution[]>` : pour chaque type nommé, **une** requête `sources.files` filtrée `project_id = projectId`, `processing_status = 'completed'`, `or(original_filename.ilike.%type%,display_name.ilike.%type%)`, `limit(20)`. Jamais de lecture de tous les fichiers. Si `projectId` est absent ou `named` vide → `[]`. Ne lève jamais (retourne une résolution « inconnue » en cas d'erreur, avec `console.warn`).
   Les types ont des synonymes de nom de fichier : `cr` doit chercher `%CR%` **et** `%compte rendu%` **et** `%PV%`/`%procès%` ; `pv` idem ; `mémoire` → `%memoire%`/`%mémoire%`. Prévoir une petite table `TYPE_FILENAME_PATTERNS` dans le module.
3. **Appariement** (fonction pure, testée) — `matchNamedDocument(named, candidateNames: string[]): NamedDocumentResolution` avec `NamedDocumentResolution = { phrase: string; type: string; found: string[]; similar: string[]; status: 'found' | 'not_found' | 'no_candidate' | 'unknown' }`. `found` = candidats dont le nom normalisé (minuscules, sans accents, `œ` → `oe`) contient **tous** les qualifiants significatifs ; sinon `similar` = jusqu'à 5 candidats du même type. Sans qualifiant et un seul candidat → `found`. Sans qualifiant et plusieurs candidats → `found` = tous (max 5).
4. **Prompt** — dans `generation/prompt.ts` `buildSystemPrompt`, un bloc `DOCUMENTS NOMMES DANS LA QUESTION :` (sans accents, comme le reste du prompt) avec une ligne par résolution :
   - `found` : `- « CCAP » → CCAP.pdf`
   - `not_found` : `- « CCTP du gros œuvre » → AUCUN fichier correspondant dans le projet ; fichiers proches : CCTP - Lot N°07 PLÂTRERIE.pdf, CCTP - Lot N°02 ETANCHEITE.pdf`
   - `no_candidate` : `- « PGC » → AUCUN fichier de ce type dans le projet`
   - `unknown` : ligne omise.
   Reformuler la **règle 8** de `ZERO_HALLUCINATION_PROMPT` pour qu'elle s'appuie sur ce bloc : si un document nommé est marqué AUCUN, commencer la réponse en le disant, répondre depuis les sources réellement fournies en les nommant, ne jamais attribuer une information à un document qui ne l'a pas fournie. Retirer toute référence à une « liste des documents du projet ».
5. **Câblage** — `index.ts` bloc A2 : `resolveNamedDocuments(supabase, project_id, extractNamedDocuments(query))` dans le `Promise.all` avec le contexte et l'embedding (pas de latence ajoutée) ; résultat posé sur `context.namedDocuments`. **Supprimer** le mécanisme de liste de `f385eaf` : `getProjectDocumentNames` dans `context.ts`, `projectDocuments` dans `types.ts`/`index.ts`/`prompt.ts`, et le test correspondant dans `prompt.test.ts` (remplacé par des tests sur le nouveau bloc). Le champ `AgentContext.namedDocuments: NamedDocumentResolution[]` remplace `projectDocuments`.
6. **Traçabilité** — ajouter `named_documents` (jsonb, la liste des résolutions, allégée) à `QueryLogEntry` dans `logging.ts` et l'écrire dans les `logQuery` des chemins fast et agentique. La colonne `rag.query_logs` n'existe pas : utiliser la colonne `agentic` ? Non — proposer une migration `alter table rag.query_logs add column named_documents jsonb` (à soumettre à Eric avant application, comme toute migration).

### Ce qui ne change pas
- Pas de filtrage de la recherche par le fichier trouvé : c'est la comparaison déterministe du Sprint 2 (S2.3), qui réutilisera ce module.
- Pas de Cohere, pas de changement d'embedding, pas de push GitHub sans accord, Eric déploie (ou donne un « ok » explicite).

### Méthode
- Plan écrit puis exécution par sous-agents avec revue par tâche (`superpowers:writing-plans` puis `superpowers:subagent-driven-development`), comme pour le reste du sprint. Le registre `.superpowers/sdd/2026-09-13-sprint1-rag-retrieval/progress.md` est à continuer (ne pas en créer un second).
- Tests Deno à côté des modules (`https://deno.land/std@0.224.0/assert/mod.ts`), TDD. `deno check supabase/functions/baikal-retrieval/index.ts` a **11 erreurs préexistantes** dans `routing/analyzer.ts:62-78` (fonction morte `analyzeQuery`) : le critère est « aucune erreur nouvelle ».
- `eval/config.json` et `eval/.env` sont présents dans le worktree (copiés, gitignorés). `GEMINI_API_KEY` y est vide : le juge de fidélité ne tourne pas tant qu'Eric ne l'a pas collée.

### Critères de fin
1. `deno test` sur les 7 fichiers de test du module retrieval : tout vert ; nouveau `routing/named-documents.test.ts` couvrant les 4 exemples d'extraction ci-dessus, l'appariement (trouvé / non trouvé avec proches / aucun candidat / sans qualifiant), et le bloc de prompt.
2. Déploiement (accord Eric) puis rejeu **sous le tag final** :
   ```
   deno run -A eval/run-eval.ts --tag baseline-v2.1.0 --baseline eval/reports/baseline-v2.0.0.json
   deno run -A eval/run-eval.ts --golden eval/golden-set.synthetic.json --tag baseline-v2.1.0-synth --baseline eval/reports/baseline-v2.0.0-synth.json
   ```
   Attendu : **C7-004 refusé** (« ce document n'existe pas dans le projet »), C7 réel 4/4 et synthétique 6/6, aucune autre classe en recul de plus d'une question par rapport à `s1b-*`. Lire chaque échec restant (`node -e` sur le JSON du rapport) et le classer : critère à revoir / Sprint 2 / corpus (Sprint 4).
3. Figer : les fichiers `eval/reports/baseline-v2.1.0.*` sont suivis par git (`eval/.gitignore` autorise `baseline-*`) → commit.
4. Docs : `C:\Dev\Frontend-ARPET\docs\SPEC_RAG_OPTIM_V1.md` §7 (tableau : Sprint 1 ✅, baseline avant `v2.0.0`, après `v2.1.0`), nouvelle sous-section « 7.3 Sprint 1 — résultats » (tableaux réel + synthétique, gains/pertes nominatifs, enseignements : condensation, gate, poids couche app, C2-003 qui répond désormais depuis le CCAP projet au lieu du plafond CCAG — réponse plus utile, critère du set réel à documenter), §3 P11 corrigé ; `C:\Dev\Frontend-ARPET\CLAUDE.md` § « État Courant » (date, prod = `baikal-retrieval v2.1.0`, résumé du sprint, prochaine étape Sprint 2). Commit ARPET.
5. Fusion de `sprint1/rag-retrieval` dans `main` (Baikal) avec l'accord d'Eric — `superpowers:finishing-a-development-branch` ; le worktree peut ensuite être supprimé (`git worktree remove`). **Attention** : `main` de Baikal porte des modifications non commitées d'Eric (admin-rapport, SEO, AppContext) — ne pas y toucher.
6. Ménage optionnel, sur demande d'Eric : ~300 conversations de test créées par les runs d'éval dans `rag.conversations` (listées dans `eval/reports/*.conversations.json`).

### Minors différés (revue finale) à garder en tête, pas à traiter maintenant
11 erreurs `deno check` de `routing/analyzer.ts` (code mort à supprimer hors sprint) ; entier nu « article 12 » non extrait par `keywords.ts` ; `p_children_per_parent` en dur ; `SECURITY DEFINER` sans `search_path` / `REVOKE PUBLIC` sur v14 et v15 (migration de hardening à part) ; pool graphrag non ×4 ; clé Gemini en query string (pattern existant) ; `condenseQuery` sans test réseau ; regex de refus du harnais « ne est pas » (n'attrape pas « n'est pas ») ; le condenser recopie parfois le contenu de la réponse précédente dans la question réécrite (« dans le ccap ? » → phrase du décompte final) — à corriger dans son prompt au Sprint 2.
