# Hub Baikal — modules par site : vue d'ensemble sur le connecteur

**Date :** 2026-08-24
**Statut :** validé en séance avec Eric le 24/08/2026 (soir)
**Décisions :** une Edge Function `admin-site-stats` réservée super_admin, bâtie
sur `_shared/sites.ts` ; KPIs dédiés pack-vendeur / voirie / majordhome,
fallback générique pour les autres sites ; affichage sur `/admin` quand le site
sélectionné n'est pas ARPET.

## 1. Objectif et périmètre

Premier module métier du hub : une **vue d'ensemble par site** (KPIs 30 jours +
dernières entrées), première consommation réelle du canal lecture seule
(`baikal_reader` pour Pack Vendeur/Majord'home, `SUPABASE_DB_URL` pour les
schémas locaux).

Hors périmètre : listes complètes paginées/recherchables par site, écritures,
droits par site pour les admins délégués (v1 = super_admin uniquement, décision
explicite : un org_admin ARPET ne voit pas le CA des autres sites), ARPET
(garde son dashboard existant).

## 2. Edge Function `admin-site-stats`

- POST `{ action: "overview", appId, jours? (defaut 30) }`, auth par
  Authorization + `profiles.app_role = 'super_admin'` (pattern
  admin-partenariats, en plus strict).
- Charge le site via `chargerSite`, ouvre `lecteurSite`, ferme en `finally`.
- **Config par site** dans `admin-site-stats/stats-sites.ts` : par `app_id`,
  une fonction qui reçoit le tag `sql` + `db_schema` et rend
  `{ kpis: [{cle, libelle, valeur}], dernieres: {colonnes, lignes} }`.
  - `pack-vendeur` : dossiers créés 30 j, payés 30 j, CA 30 j, CA total
    (`sum(amount_paid) where paid_at is not null and is_test is not true`),
    10 derniers dossiers payés (date, ville, montant, canal).
  - `voirie` : demandes 30 j, payées 30 j (statut vérifié sur l'enum réel au
    plan), 10 dernières demandes (date, type_occupation, statut).
  - `majordhome` : rendez-vous 30 j, total, 10 derniers (colonnes vérifiées au
    plan sur `majordhome.appointments`).
- **Fallback générique** (site sans config) : liste des tables du `db_schema`
  avec volumes estimés (`pg_stat_user_tables.n_live_tup`) — aucune requête sur
  les données elles-mêmes.
- Réponses `{ data, error }` ; `ErreurSite` → 400 ; jamais de throw non catché.

## 3. Frontend

- `src/services/siteStats.service.js` : appel de l'EF (pattern seoService).
- `/admin`, site ≠ arpet : `VueSite` remplace le contenu — KPIs en cartes,
  tableau « dernières entrées », puis la carte registre existante (CarteSite)
  en dessous. États : chargement, erreur (message de l'EF), site en fallback
  (tableau tables/volumes). Visible uniquement si `isSuperAdmin` ; sinon la
  CarteSite seule (comportement actuel).
- ARPET : inchangé.

## 4. Validation

- `deno check` sur l'EF ; déploiement ; smoke : appel sans JWT → 401.
- Appel réel (via curl + JWT non disponible) : la vérité vient du clic d'Eric ;
  en amont, chaque requête KPI est exécutée telle quelle via SQL sur la base
  cible pour valider chiffres et colonnes (pack-vendeur via `baikal_reader`
  pour tester aussi le canal).
- Build Vite sans erreur.
