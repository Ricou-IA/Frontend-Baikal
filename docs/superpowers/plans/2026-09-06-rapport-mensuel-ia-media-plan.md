# Rapport mensuel IA MEDIA — plan d'implémentation

Spec : `docs/superpowers/specs/2026-09-06-rapport-mensuel-ia-media-design.md`.
Ordre choisi pour que chaque étape soit vérifiable seule.

## 1. Socle de données
- Migration `20260906130000_rapports_mensuels.sql` : colonne
  `config.apps.repo_github`, table `admin.rapports` (RLS forcée, grant
  service_role), bucket privé `rapports`.
- Appliquer par MCP, vérifier `select * from storage.buckets where id='rapports'`.

## 2. Edge Function `admin-rapport`
- `highlights.ts` : fonctions pures `calculerHighlights(faits)` +
  `variation(a, b)` ; test Deno `highlights.test.ts` (cas : M-1 vide, base
  < 20 sans %, progression de requête, nouvelle origine).
- `faits.ts` : `construireFaits(admin, appId, mois)` → sections partenariat,
  ventes, seo (totaux + tops) ; sources manquantes listées, jamais d'erreur
  pour une source absente (Bing avant le cron, pas de contrat).
- `github.ts` : `commitsDuMois(repo, token, mois)` paginé, hors merges.
- `redaction.ts` : `redigerEvolutions(commits)` et
  `redigerCommentaire(ebauche, highlights)` sur OpenAI `gpt-4o-mini`.
- `index.ts` : actions `preparer`, `rediger`, `enregistrer`, `liste` ;
  droits par site (`_shared/droits.ts`) ; upload Storage + insertion.
- Déployer, tester `preparer` sur pack-vendeur 2026-08 en SQL/EF.

## 3. Front
- `src/services/rapport.service.js`.
- `src/components/rapports/RapportPdf.jsx` (`@react-pdf/renderer`).
- `src/pages/Rapports.jsx` : sélecteur de mois, Préparer, aperçu, champs
  Évolutions / Ébauche / Commentaire, Générer, liste des rapports.
- Route `/rapports` + entrée sidebar + champ « Dépôt GitHub » dans `/sites`.
- Lint, build, commit, push.

## 4. Paramétrage (Eric)
- Créer le jeton GitHub lecture seule et poser `ADMIN_GITHUB_TOKEN`.
- Renseigner `Ricou-IA/Packvendeur` dans `/sites` pour Pack Vendeur.
