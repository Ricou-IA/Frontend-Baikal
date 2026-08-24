# Hub Baikal — SEO v2 : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parité SEO avec le /admin de Pré-état-daté, en multi-sites : vue riche (buckets cliquables, top 50), comparatif période/période avec statuts, Bing vs Google sur archive `admin.seo_snapshots` alimentée par crons.

**Architecture:** Spec : `docs/superpowers/specs/2026-08-25-hub-baikal-seo-v2-design.md`. Sources portées de PV : `_shared/google-search-console.ts` (logique compareWindows, statuts ±1 rang, filtre <10 impressions, tri regression→lost→stable→new→progress), `_shared/bing-webmaster.ts` (211 l., siteUrl paramétré), `pv-seo-snapshot` (3 rythmes, upsert idempotent, dimension site pour la série datée Bing).

**Tech Stack:** Deno EF, pg_cron + pg_net + Vault (secret cron), React JSX thème baikal.

---

### Task 1: Migration archive + secret + crons
- [x] **1.1** Générer `ADMIN_SEO_CRON_SECRET` (random 32o base64url) ; le poser dans les secrets Edge Functions ET dans Vault (`vault.create_secret(..., 'admin_seo_cron_secret')`).
- [x] **1.2** Migration `20260825020000_seo_snapshots.sql` : table `admin.seo_snapshots` (app_id FK, source google|bing, period_start/end, granularity month|day|observation, dimension query|page|site, key, clicks, impressions, ctr numeric(8,5), position numeric(6,2), is_noise, captured_at ; unique (app_id, source, period_start, period_end, dimension, key)) + 2 index + RLS forcée + **GRANT service_role** ; crons `admin-seo-snapshot-mensuel` (`0 5 4 * *`) et `admin-seo-snapshot-quotidien` (`15 4 * * *`) via `net.http_post` avec `X-Cron-Secret` lu depuis `vault.decrypted_secrets`.
- [x] **1.3** Appliquer + vérifier (`cron.job` contient les 2 jobs ; table présente ; relacl porte service_role). Commit.

### Task 2: Helpers partagés
- [x] **2.1** Déplacer `admin-seo/gsc.ts` → `_shared/gsc.ts` ; ajouter `searchAnalyticsByDates(site, start, end, dimensions, limit)` et `isExactPhraseQuery` (guillemets droits/typographiques, logique PV). Adapter l'import d'admin-seo.
- [x] **2.2** Porter `_shared/bing-webmaster.ts` depuis PV : `loadBingConfig()` → clé seule ; chaque fonction prend `siteUrl` en paramètre.
- [x] **2.3** `deno check` admin-seo. Commit.

### Task 3: EF `admin-seo-snapshot`
- [x] **3.1** `index.ts` : auth `X-Cron-Secret` (comparaison temps constant, fail-closed) ; boucle sites actifs avec `gsc_propriete` ; scopes défaut (mois civil précédent Google query+page avec is_noise + tops Bing query/page en granularity observation), `daily` (série Bing GetRankAndTrafficStats → lignes dimension site/day + refresh mois courant Google), `{start,end}` backfill Google ; upsert `onConflict` sur la contrainte unique ; résumé par site. Bing seulement si `BING_WEBMASTER_API_KEY` et `domaine` présents (siteUrl `https://<domaine>/`).
- [x] **3.2** config.toml (`verify_jwt = false`, auth par secret) ; `deno check` ; deploy ; smoke : POST sans secret → 401, avec secret + `{start,end}` court → 200 et lignes en base. Commit.

### Task 4: EF `admin-seo` enrichie
- [x] **4.1** `overview` : un appel → totaux + précédents + `buckets` (impressions par position ; `hidden` = impressions totales(sans dimension) − somme requêtes) + `topRequetes` 50 (ctr_pct, position) + `topPages` 25.
- [x] **4.2** `compare` : port exact de la logique PV (jointure cur/prev par requête, statuts ±1 rang, filtre <10 impressions cumulées, totals_delta, summary, tri PV).
- [x] **4.3** `bing-vs-google` : lecture archive du site — série mensuelle {mois, google (somme clics query month is_noise=false), bing (somme clics site/day par mois, null si aucune ligne)} + `ecarts` (dernier relevé observation Bing query vs dernier mois Google query : requêtes où Bing classe ≥5 rangs mieux, avec positions des deux) + `dernierReleve`.
- [x] **4.4** `exigerSite` partout ; `deno check` ; deploy ; smoke 401. Commit.

### Task 5: Frontend
- [x] **5.1** `src/components/console/KpiCarte.jsx` + `Section.jsx` (accents success/info/warning/danger, thème baikal).
- [x] **5.2** Refonte `Seo.jsx` : bloc VueEnsemble (4 KPI accents CTR ≥5 vert/≥3 bleu, position ≤3/≤10/≤20 ; barres buckets cliquables filtrantes + ligne « masquées » non cliquable ; top 50 filtrable, top pages ; notes de lecture PV), bloc Comparatif (fenêtres 7/28, cartes delta, filtres de statut, tableau trié), bloc BingVsGoogle (série mensuelle, écarts, avertissements PV, état archive vide), bloc TousLesSites (existant). `seoService` : `getOverview` (nouveau format), `getCompare`, `getBingVsGoogle` ; suppression `getTop`.
- [x] **5.3** `npm run build` ; commit.

### Task 6: Mise en route et vérification
- [x] **6.1** Backfill Google 3 derniers mois civils (curl + secret) pour tous les sites GSC ; comptage `admin.seo_snapshots` par site/source/mois.
- [x] **6.2** Push (Vercel) ; vérifs Eric : chiffres identiques au /admin PV sur pack-vendeur ; poser `BING_WEBMASTER_API_KEY` (Bing Webmaster Tools → Settings → API access) pour activer Bing.
- [x] **6.3** Docs : proposed-updates, mémoire, plan coché. Commit final.
