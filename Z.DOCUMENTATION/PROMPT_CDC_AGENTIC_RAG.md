# Prompt de démarrage — Cahier des charges Agentic RAG

Copie ce prompt dans une nouvelle conversation Claude Code sur le repo Baikal.

---

## PROMPT

Tu es un architecte logiciel expert en systèmes RAG (Retrieval-Augmented Generation) pour le domaine BTP. Tu travailles sur la plateforme **Baikal** (voir CLAUDE.md pour le contexte complet du projet).

### Contexte

Nous voulons faire évoluer notre pipeline RAG actuel vers une architecture **Agentic RAG multi-step**. L'objectif est de combler le gap de qualité entre ce que Claude Code peut faire en mode projet (accès itératif aux données, croisement de sources, raisonnement multi-étapes) et ce que notre RAG produit actuellement (single-shot : 1 recherche → 1 génération).

### Architecture actuelle (à améliorer)

Notre pipeline actuel fonctionne en 2 appels HTTP :

```
Brain v3 (gpt-4o-mini)
  → Analyse d'intent (factual/synthesis/comparison/citation)
  → Query rewriting
  → Routing config (max_files, match_count, min_similarity)

Librarian v4 / baikal-retrieval
  → 1 seule recherche hybride (vector + FTS + GraphRAG)
  → RRF fusion
  → [Cohere reranking — implémenté mais désactivé]
  → Formatage contexte (max 30K chars)
  → Génération LLM (gpt-4o-mini ou gemini-2.5-flash-lite)
  → Streaming SSE
```

**Limites identifiées :**
1. **Single-shot** : 1 seule requête de recherche, pas de capacité à reformuler si les résultats sont insuffisants
2. **Pas de tools** : le LLM ne peut pas interroger la base (lister des fichiers, chercher par lot, par phase, etc.)
3. **Pas d'évaluation intermédiaire** : le LLM ne sait pas si les chunks récupérés suffisent à répondre
4. **Intent rigide** : le routing est figé par l'intent, pas adaptatif au contenu trouvé
5. **Pas de croisement intelligent** : quand une question implique 2 docs (CCAP + CCTP), la recherche ne garantit pas de trouver les infos dans les deux

### Ce qu'on veut construire

Un pipeline **Agentic RAG** où le LLM peut :
1. **Évaluer** si les résultats de recherche suffisent à répondre
2. **Reformuler** et relancer une recherche si nécessaire
3. **Utiliser des tools** (lister les documents du projet, chercher par métadonnées QQOQCCP, chercher par lot/phase)
4. **Croiser** les résultats de plusieurs recherches
5. **Raisonner** avant de générer la réponse finale

### Contraintes techniques

- **Latence max** : ~7 secondes (actuellement ~5s) — on accepte +2s pour un gain qualitatif significatif
- **Streaming** : la réponse doit être streamée en SSE (l'utilisateur voit la réponse s'écrire)
- **Coût** : raisonnable — pas de modèle à $60/M tokens pour chaque étape
- **Backend** : Supabase Edge Functions (Deno, max 150s timeout, mais on vise <10s)
- **DB** : PostgreSQL avec pgvector, toutes les données sont dans les schémas rag, sources, config, core
- **Reranking Cohere** : déjà implémenté, prêt à activer
- **Modèles disponibles** : OpenAI (gpt-4o-mini, gpt-4o), Gemini (flash-lite, flash, pro), Cohere (rerank-v3.5)

### Infrastructure existante réutilisable

- `rag.match_documents_v14` : recherche hybride (vector + FTS + GraphRAG + intersection boost)
- `rag.get_agent_context` : charge le contexte complet (prompts, projet, concepts)
- `sources.files` : inventaire des fichiers par projet
- `rag.documents` : chunks avec métadonnées QQOQCCP, hierarchy (L0/L1), concepts
- `config.agent_prompts` : configuration dynamique en DB
- Cohere reranking : code existant dans `baikal-retrieval/search/reranker.ts`
- SSE streaming : déjà implémenté dans librarian-v4 et baikal-retrieval

### Données structurées disponibles pour les tools

Chaque chunk a des métadonnées exploitables :
- `qqoqccp` (JSONB) : qui (lots, intervenants), quoi (ouvrages, matériaux), où (localisation), quand (phase, date), comment (normes, procédures), pourquoi (type, motif)
- `hierarchy_level` (0=section, 1=détail) avec `parent_chunk_id`
- `document_concepts` : liens vers la taxonomie de concepts BTP
- `contenu_types` : type de contenu (specification, obligation, information...)
- `layer` : app/org/project/user

### Livrables attendus

Je veux qu'on définisse ensemble :

1. **Architecture cible** : flow diagram du pipeline agentic (étapes, décisions, boucles)
2. **Tools disponibles** : liste des tools que le LLM peut appeler, avec input/output
3. **Prompt d'orchestration** : le system prompt qui guide le LLM dans sa stratégie de recherche
4. **Stratégie de fallback** : que faire quand le budget latence est épuisé
5. **Plan d'implémentation** : étapes de migration depuis l'architecture actuelle, avec un MVP rapide
6. **Métriques de qualité** : comment mesurer l'amélioration vs le pipeline actuel

### Comment travailler

- Commence par lire le CLAUDE.md et explorer le code existant (baikal-retrieval, baikal-librarian-v4, baikal-brain-v3)
- Propose-moi un premier draft d'architecture, on itère ensemble
- Sois concret : du code, des schémas, des exemples de flow pour des questions types
- N'hésite pas à me poser des questions si tu as besoin de clarifier des choix

Commence par explorer le code et propose-moi une première vision de l'architecture agentic.
