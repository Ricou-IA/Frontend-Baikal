# Hub Baikal — SEO v2 : parité avec le /admin de Pré-état-daté, en multi-sites

**Date :** 2026-08-25
**Statut :** validé en séance avec Eric le 24/08 tard (choix « Tout, y compris Bing »)
**Référence :** `C:\Dev\Pack Vendeur` — `AdminSeoPage` (AdsGscOverview,
AdsGscComparison, SeoBingVsGoogle), EF `pv-seo-snapshot`, helpers
`_shared/google-search-console.ts` et `_shared/bing-webmaster.ts`.

## 1. Objectif

Porter les trois blocs SEO de Pré-état-daté dans la console Baikal, chacun
piloté par le **site sélectionné** (droits par site déjà appliqués), et garder
la vue croisée « Tous les sites » propre à Baikal.

## 2. EF `admin-seo` enrichie

- `overview` (un seul appel) : `totaux` + `totauxPrecedents` (fenêtres J-3
  identiques à l'existant), `buckets` d'impressions par position (top3 ≤3,
  top10 ≤10, top20 ≤20, beyond >20, `hidden` = impressions totales − somme des
  requêtes détaillées), `topRequetes` (50 : clics, impressions, ctr_pct,
  position), `topPages` (25). Supprime les appels séparés `top`.
- `compare` (nouvelle) : fenêtre 7 ou 28 j vs la précédente, par requête —
  `cur`/`prev` joints, statut calculé côté EF : `regression` (position +2 ou
  clics −30 % avec volume), `lost` (disparue), `new`, `progress` (position −2
  ou clics +30 %), `stable` ; + `totalsDelta`. Seuils identiques à PV (relever
  les valeurs exactes dans `pv-admin-ads` au moment du code).
- `bing-vs-google` (nouvelle) : lit l'archive (série mensuelle clics
  Google/Bing du site + écarts de position par requête sur le dernier mois
  relevé). Mois sans mesure Bing = `null`, jamais 0 (règle PV).
- Chaque action garde `exigerSite` (droits par site).

## 3. Archive multi-sites `admin.seo_snapshots`

Schéma calqué sur PV, avec `app_id` et `source` :
`(id, app_id → config.apps, source 'google'|'bing', period_start, period_end,
granularity, dimension 'query'|'page'|'rank_traffic', key, clicks, impressions,
ctr, position, is_noise, captured_at)`, unique
`(app_id, source, period_start, period_end, dimension, key)`, RLS forcée,
GRANT service_role (leçon droits_sites). Les recherches en phrase exacte
(guillemets) sont marquées `is_noise` et écartées des agrégats (règle PV).

## 4. EF `admin-seo-snapshot` (archivage)

- Auth : header `X-Cron-Secret` = `ADMIN_SEO_CRON_SECRET` (généré, fail-closed),
  `verify_jwt = false` (appelée par pg_cron). Pattern `pv-seo-snapshot`.
- Boucle sur les sites actifs du registre ayant `gsc_propriete` ; Bing par site
  avec `siteUrl = https://<domaine>/` (site sans domaine ou non vérifié chez
  Bing → ignoré, consigné dans le résumé par site).
- Scopes : défaut = mois civil précédent (Google query+page + tops Bing) ;
  `daily` = série quotidienne Bing (rank&traffic) + refresh du mois en cours
  Google ; `{start, end}` = backfill Google d'une période arbitraire.
  Idempotent par upsert sur la contrainte unique.
- Helpers : `_shared/bing-webmaster.ts` porté de PV (siteUrl en paramètre) ;
  `admin-seo/gsc.ts` gagne `searchAnalyticsByDates` (dates arbitraires) et est
  déplacé en `_shared/gsc.ts` (partagé par les deux EF).
- Crons pg_cron (pattern admin-sync-diag-prospects) : `admin-seo-snapshot-mensuel`
  le 4 à 05h00 UTC, `admin-seo-snapshot-quotidien` à 04h15 UTC.
- Backfill initial après déploiement : Google sur les 3 derniers mois civils
  pour tous les sites à propriété GSC.

## 5. Frontend (`Seo.jsx` refondu, thème baikal-*)

Quatre blocs, dans l'ordre :
1. **Vue d'ensemble** : 4 cartes KPI avec accents métier (CTR : vert ≥5 %,
   bleu ≥3 % ; position : vert ≤3, bleu ≤10, ambre ≤20, rouge au-delà),
   distribution des impressions par bucket en barres **cliquables** qui
   filtrent le tableau, top 50 requêtes (CTR/position colorés), top pages,
   notes de lecture PV (recherches masquées, fenêtres J-3).
2. **Comparatif** : fenêtre 7/28, cartes delta, tableau par requête filtrable
   par statut (Régressions / Disparues / Nouvelles / Progressions / Stables).
3. **Bing vs Google** : série mensuelle Google vs Bing, écarts de position,
   avertissements PV (« Bing » = Bing+Yahoo+DuckDuckGo+Ecosia ; positions Bing
   = relevé ponctuel ; mois sans mesure = « — » jamais 0). Archive vide →
   message d'attente du cron.
4. **Tous les sites** : bloc croisé existant, conservé tel quel.
Petits composants locaux (`KpiCarte`, `Section`) dans `src/components/console/`.

## 6. Secrets et gestes d'Eric

- `ADMIN_SEO_CRON_SECRET` : généré et posé par Claude.
- `BING_WEBMASTER_API_KEY` : **geste d'Eric** — Bing Webmaster Tools →
  Settings → API access → copier la clé (elle y est relisible, contrairement à
  Google). Sans elle : les blocs Google marchent, Bing affiche « archive vide ».
  Les propriétés Bing des sites doivent être vérifiées dans son compte Bing.

## 7. Hors périmètre

Liens entrants Bing (scope `links` PV, à la demande), partage financier SEO
(PV l'affiche sur /admin/financier), archives Google antérieures à 16 mois
(limite Search Console).

## 8. Validation

`deno check` + déploiement des 2 EF ; capture manuelle (curl + secret) →
comptage des lignes `admin.seo_snapshots` par site/source ; crons listés dans
`cron.job` ; build Vite ; comparaison visuelle avec le /admin de Pré-état-daté
par Eric (mêmes chiffres sur pack-vendeur, aux fenêtres près).
