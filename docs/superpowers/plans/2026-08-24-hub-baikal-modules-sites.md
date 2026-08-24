# Hub Baikal — modules par site : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vue d'ensemble par site sur `/admin` (KPIs 30 j + dernières entrées), servie par une EF `admin-site-stats` bâtie sur le connecteur lecture seule.

**Architecture:** Spec : `docs/superpowers/specs/2026-08-24-hub-baikal-modules-sites-design.md`. EF super_admin only ; config KPI par site dans `stats-sites.ts` ; fallback générique tables/volumes ; front = service + composant `VueSite` dans `Admin.jsx`.

**Tech Stack:** Deno EF + postgres-js (via `_shared/sites.ts`), React JSX.

**Faits vérifiés :** `voirie.demandes.status` ∈ DRAFT(29)/PAID(3)/SENT_TO_MAIRIE(0)/MANUAL_FALLBACK(1)/ERROR(0) — payées = PAID+SENT_TO_MAIRIE+MANUAL_FALLBACK. `pack_vendeur.dossiers` : `paid_at`, `amount_paid`, `is_test`, `deleted_at`, `property_city`, `acquisition_channel`. `majordhome.appointments` : `scheduled_date`, `client_name`, `city`, `appointment_type`, `status`.

---

### Task 1: EF `admin-site-stats`

**Files:**
- Create: `supabase/functions/admin-site-stats/index.ts`, `supabase/functions/admin-site-stats/stats-sites.ts`
- Modify: `supabase/config.toml` (entrée verify_jwt = true)

- [x] **Step 1.1:** Écrire `stats-sites.ts` — une fonction par site (pack-vendeur, voirie, majordhome) qui reçoit `(sql, jours)` et rend `{ kpis, dernieres }` ; requêtes exactes de la spec, `make_interval(days => ...)` pour la fenêtre, montants marqués `format: 'eur'`.
- [x] **Step 1.2:** Écrire `index.ts` — CORS + auth super_admin (pattern admin-partenariats durci), action `overview`, `chargerSite`/`lecteurSite` + `finally sql.end()`, fallback générique `pg_stat_user_tables` pour les sites sans config, `ErreurSite` → 400.
- [x] **Step 1.3:** `deno check supabase/functions/admin-site-stats/index.ts` → OK.
- [x] **Step 1.4:** `config.toml` : bloc `[functions.admin-site-stats] verify_jwt = true`.
- [x] **Step 1.5:** Déployer (`npx supabase functions deploy admin-site-stats --project-ref odspcxgafcqxjzrarsqf`) ; smoke : POST avec clé anon → 401 `Non authentifie`.
- [x] **Step 1.6:** Commit.

### Task 2: Validation des chiffres à la source

- [x] **Step 2.1:** Exécuter chaque requête KPI telle quelle via SQL sur sa base (partagée pour voirie ; dédiées pour pack-vendeur/majordhome — pack-vendeur via une connexion `baikal_reader` de préférence) et noter les valeurs attendues (référence pour le clic d'Eric).

### Task 3: Frontend

**Files:**
- Create: `src/services/siteStats.service.js`
- Modify: `src/pages/Admin.jsx` (VueSite au-dessus de CarteSite quand super_admin et site ≠ arpet)

- [x] **Step 3.1:** Service : `siteStatsService.getOverview(appId, jours)` → EF (pattern seoService, session token).
- [x] **Step 3.2:** `VueSite` : cartes KPI (format eur via Intl), tableau « dernières entrées », état fallback (tables/volumes), chargement/erreur ; CarteSite rendue en dessous. Non-super_admin : CarteSite seule.
- [x] **Step 3.3:** `npm run build` → OK ; commit.

### Task 4: Documentation

- [x] **Step 4.1:** Mémoire hub mise à jour ; entrée proposed-updates ; plan coché ; commit final.
