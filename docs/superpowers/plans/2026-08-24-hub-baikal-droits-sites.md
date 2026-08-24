# Hub Baikal — droits par site : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins délégués par site (table `admin.droits_sites`), enforcement dans toutes les EF du hub, console filtrée, gestion depuis la page Sites. Ferme le trou « org_admin voit tous les sites ».

**Architecture:** Spec : `docs/superpowers/specs/2026-08-24-hub-baikal-droits-sites-design.md`. Source de vérité unique `core.sites_autorises(uuid)` exposée par `public.mes_droits_sites()` (appelée par le front ET par les EF via le client caller).

**Tech Stack:** Postgres (RPC SECURITY DEFINER), Deno EF, React JSX.

---

### Task 1: Migration `droits_sites` (base partagée)

- [x] **1.1** Fichier `supabase/migrations/20260824230000_droits_sites.sql` + `apply_migration` : table `admin.droits_sites` (PK user_id+app_id, FK cascade, RLS forcée sans policy comme le reste du schéma admin) ; `core.sites_autorises(p_user_id)` (super_admin → toutes les apps actives, sinon droits ∩ actives) ; `public.mes_droits_sites()` ; v3 des RPC users : `get_pending_users` accepte un délégué avec `p_app_id` ∈ ses droits ; `get_users_for_admin` ajoute le chemin délégué (accès aux lignes de son app, sans restriction d'org).
- [x] **1.2** Vérifs SQL : `core.sites_autorises` pour Eric (11 apps), pour un uuid sans droit (`{}`) ; insertion d'un droit de test puis résultat, puis nettoyage.
- [x] **1.3** Commit.

### Task 2: Enforcement EF

**Files:** Create `supabase/functions/_shared/droits.ts`, `supabase/functions/admin-droits/index.ts` ; Modify `admin-seo/index.ts`, `admin-partenariats/index.ts`, `admin-site-stats/index.ts`, `supabase/config.toml`.

- [x] **2.1** `_shared/droits.ts` : `ErreurAcces`, `sitesAutorises(caller)` (RPC `mes_droits_sites`), `exigerSite(sites, appId)`.
- [x] **2.2** `admin-seo` : accès = super_admin ∨ droits non vides ; `overview`/`top` → `exigerSite` ; `all-sites` → filtré aux sites autorisés.
- [x] **2.3** `admin-partenariats` : même règle d'accès ; actions par app → `exigerSite` ; `list-sites` → filtré, champs env/db réservés super_admin ; `save-site` inchangé (super_admin).
- [x] **2.4** `admin-site-stats` : super_admin → OK ; sinon `exigerSite(appId)`.
- [x] **2.5** `admin-droits` (nouvelle EF, super_admin only) : `list {appId}` (droits + email/nom via core.profiles), `grant {appId, email}` (profil existant requis), `revoke {appId, userId}`. Accès à `core.profiles` : vérifier le schéma exposé ; sinon passer par la vue publique `profiles`.
- [x] **2.6** `deno check` sur les 4 EF ; config.toml : bloc `admin-droits` verify_jwt=true ; déployer les 4 ; smoke anon → 401 sur chacune.
- [x] **2.7** Commit.

### Task 3: Frontend

**Files:** Modify `src/contexts/AuthContext.jsx`, `src/components/OnboardingGuard.jsx`, `src/components/console/ConsoleLayout.jsx`, `src/pages/Sites.jsx`, `src/pages/admin/Users.jsx` ; Create `src/services/droits.service.js`.

- [x] **3.1** `AuthContext` : au chargement du profil, `rpc('mes_droits_sites')` → `sitesAdmin` (tableau, `[]` par défaut) exposé dans le contexte ; `hasConsoleAccess` = super ∨ org_admin ∨ sitesAdmin non vide.
- [x] **3.2** `AdminRoute` : accepte `isOrgAdmin ∨ sitesAdmin.length > 0`.
- [x] **3.3** `ConsoleLayout` : sites visibles du sélecteur = super ? tous : `sitesAdmin ∪ (org_admin ? [COALESCE(profile.app_id,'arpet')] : [])` ; onglets transverses (SEO/Partenariats/Utilisateurs) si super ∨ `sitesAdmin.includes(currentApp)` ; Sites si super ; modules ARPET si currentApp==='arpet' ∧ (super ∨ org ARPET ∨ droit arpet).
- [x] **3.4** `Sites.jsx` : bloc « Admins délégués » par fiche (liste, ajout par email, retrait) via `droits.service.js` → EF `admin-droits`.
- [x] **3.5** `Users.jsx` : `peutAgir = isSuperAdmin ∨ isOrgAdmin` ; sans lui, bouton NOUVEL_USER et actions de ligne masqués (consultation).
- [x] **3.6** `npm run build` ; commit.

### Task 4: Documentation

- [x] **4.1** Mémoire hub + proposed-updates + plan coché ; commit final.
