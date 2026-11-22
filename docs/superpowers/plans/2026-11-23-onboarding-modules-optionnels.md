# Onboarding : modules optionnels — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** le prompt d'onboarding fait aussi publier Comptes (liste + historique) quand l'app a des comptes, et le test les contrôle sans jamais bloquer l'ouverture.

**Architecture:** deux manifestes JSON `optionnel: true` (niveau 2) ajoutés à la copie embarquée ; `recetter` saute un contrat optionnel dont aucune vue n'est publiée ; `fabriquerPromptAgent` ajoute une étape « modules optionnels ». La page et `baikal-test` lisent `MANIFESTES` : rien d'autre à brancher.

**Tech Stack:** Deno (tests `deno test`), TypeScript partagé par l'EF `baikal-test` et la page React.

**Spec:** `docs/superpowers/specs/2026-11-23-onboarding-modules-optionnels-design.md`

## Global Constraints

- Un contrat optionnel absent : aucun contrôle produit. Publié : contrôles de niveau 2 uniquement ; `niveau1_pret` inchangé.
- Le prompt dit « si l'app a de quoi le remplir ; sinon ne crée pas la vue ».
- `raison_sociale` = la société, à défaut le nom, à défaut l'email (compte pro ou particulier).
- Aucune donnée ni structure de production dans le dépôt (dépôt public).

## Review Focus

- Site qui publie `baikal_compte_historique` sans `baikal_comptes_pro` : le contrat historique est contrôlé, son contrôle « chaque événement a son compte » échoue proprement (pas d'exception) — test en tâche 2.
- Site sans aucune vue Comptes : le rapport est identique à aujourd'hui (même nombre de contrôles niveau 1, `niveau1_pret` identique) — test en tâche 2.
- `fabriquerPrompt` (chemin manuel) reçoit aussi les manifestes optionnels : son « niveau 1 tient en deux vues » ne doit pas lister les vues optionnelles — test en tâche 3.
- Budget de 58 s de `baikal-test` : les contrôles en plus ne sont joués que si les vues existent (couvert par tâche 2).

---

### Task 1: Manifestes Comptes

**Files:**
- Create: `docs/contrats/manifestes/comptes-pro-v1.json`, `docs/contrats/manifestes/comptes-historique-v1.json`
- Modify: `supabase/functions/_shared/recette/manifeste.ts` (champ `optionnel?: boolean` sur `Manifeste`), `docs/contrats/manifestes/generer.ts` (`MANIFESTES` += les deux), `docs/contrats/manifestes/manifestes.test.ts` (boucle sur les quatre)
- Regenerate: `supabase/functions/_shared/recette/contrats.gen.ts`

**Interfaces:**
- Produces: `Manifeste.optionnel?: boolean` ; manifestes `comptes-pro-v1` (vue `baikal_comptes_pro`, `obligatoire: true`, niveau 2) et `comptes-historique-v1` (vue `baikal_compte_historique`, `obligatoire: true`, niveau 2).

- [ ] Écrire les deux JSON depuis les .sql : colonnes du noyau `obligatoire: true`, colonnes de blocs `obligatoire: false` ; contrôles niveau 2 = §3 (1) noyau complet, §3 (2) identifiant unique pour comptes-pro ; §2 (1), (2), (3) pour historique (le (3) lit `@SCHEMA@.baikal_comptes_pro`). Concordance niveau 2 `comptes.categorie` : `baikal_comptes_pro.categorie` ↔ `baikal_dossiers.categorie` sur `email`. `verifications_manuelles` : §3 (4 bis) catégorie subie.
- [ ] Régénérer : `deno run -A docs/contrats/manifestes/generer.ts`
- [ ] `deno test --allow-read docs/contrats/manifestes/manifestes.test.ts` → PASS (parité des quatre)
- [ ] Commit

### Task 2: Recette — contrat optionnel

**Files:**
- Modify: `supabase/functions/_shared/recette/controles.ts` (`recetter`)
- Test: `supabase/functions/_shared/recette/recette.test.ts`

- [ ] Test `contrat optionnel absent : aucun contrôle, niveau 1 inchangé` : structure sans vue comptes → aucun contrôle dont `vue` commence par `baikal_compte`, `resume.niveau1` identique à la recette sans le manifeste.
- [ ] Test `contrat optionnel publié et faux : échec de niveau 2, niveau1_pret vrai` : `baikal_comptes_pro` avec un doublon de `compte_id` → contrôle en `echec`, `bloquant: true`, `niveau: 2` ; `niveau1_pret === true`.
- [ ] Test `historique sans liste` : seule `baikal_compte_historique` publiée → le contrôle §2 (3) rend un résultat (échec ou non mesuré), pas d'exception.
- [ ] Implémenter : dans `recetter`, `if (manifeste.optionnel && !manifeste.vues.some((v) => structure.has(v.nom))) continue;`
- [ ] `deno test -A supabase/functions/_shared/recette/` → PASS ; commit

### Task 3: Prompt

**Files:**
- Modify: `supabase/functions/_shared/recette/prompt.ts`
- Test: `supabase/functions/_shared/recette/prompt-agent.test.ts`, `prompt.test.ts`

- [ ] Tests : le prompt d'agent contient `baikal_comptes_pro`, « sinon ne crée pas la vue », la règle `raison_sociale` ; la phrase « Le niveau 1 tient en deux vues » ne cite que les vues des manifestes non optionnels (les deux prompts) ; les contrôles d'auto-vérification niveau 1 n'incluent rien des optionnels.
- [ ] Implémenter : `fabriquerPromptAgent` et `fabriquerPrompt` filtrent `!m.optionnel` pour la phrase du niveau 1 et les étapes de contrat ; une étape « Les modules optionnels » après les contrats obligatoires : pour chaque optionnel, quand le publier, son texte de contrat, ses contrôles niveau 2 à jouer soi-même. Le récapitulatif final de l'agent liste les modules publiés ou écartés et pourquoi.
- [ ] `deno test -A supabase/functions/_shared/recette/` et `npx vite build` → PASS ; commit

### Task 4: Mise en ligne (accord d'Eric)

- [ ] Redéployer `baikal-test` (`--use-api`, verify_jwt off), pousser `main` (relire `git diff origin/main..main`).
- [ ] Vérifier en ligne : /tester sert un prompt qui contient `baikal_comptes_pro`.
