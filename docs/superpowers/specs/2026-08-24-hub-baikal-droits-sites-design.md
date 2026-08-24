# Hub Baikal — droits par site : admins délégués

**Date :** 2026-08-24
**Statut :** validé en séance avec Eric le 24/08/2026 (nuit)
**Décisions :** table `admin.droits_sites` ; pouvoirs délégués v1 = vue
d'ensemble + SEO + Partenariats + consultation des utilisateurs de son site +
visibilité des modules ARPET si droit sur `arpet` ; gestion depuis la page
Sites (super_admin) ; une seule source de vérité (`mes_droits_sites()`)
consommée par le front et les Edge Functions.

## 1. Objectif

Eric (super_admin) partage des sites avec d'autres personnes depuis Baikal.
Elles se connectent avec leur compte et n'accèdent qu'aux sites partagés.
Au passage, fermeture du trou actuel : les `org_admin` (clients ARPET)
passent `AdminRoute` et peuvent appeler `admin-seo`/`admin-partenariats` pour
n'importe quel site — le contrôle actuel est « admin », jamais « admin de ce
site ».

## 2. Modèle de droits

Deux notions distinctes, jamais confondues :

- **Appartenance org** (existant : `app_role` org_admin/team_leader/user +
  `org_id`) → donne les *modules du site* de son app (console ARPET pour une
  org ARPET). Ne donne **aucun** module transverse.
- **Droit délégué** (`admin.droits_sites`) → donne les *modules transverses*
  du site : vue d'ensemble (stats), SEO, Partenariats, consultation des
  utilisateurs du site. Réservé aux personnes de confiance d'Eric.

`super_admin` = tout, partout (inchangé, basé sur le profil réel, jamais
l'impersonation).

### Table (migration, schéma `admin` : RLS forcée sans policy, service_role only)

```sql
CREATE TABLE admin.droits_sites (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  app_id  text NOT NULL REFERENCES config.apps(id) ON DELETE CASCADE,
  cree_par uuid,
  cree_le timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, app_id)
);
```

Un seul niveau de droit en v1 (« admin du site »). Pas de colonne role — YAGNI.

### Source de vérité

- `core.sites_autorises(p_user_id uuid) RETURNS text[]` (SECURITY DEFINER) :
  super_admin → tous les `config.apps.id` actifs ; sinon les `app_id` de
  `admin.droits_sites` (∩ apps actives).
- `public.mes_droits_sites() RETURNS text[]` → `core.sites_autorises(auth.uid())`,
  exécutable par `authenticated`. Le front ET les EF (via le client caller,
  Authorization de l'utilisateur) l'appellent — aucune duplication de règle.

## 3. Enforcement serveur

- `_shared/droits.ts` : `sitesAutorises(caller)` (RPC `mes_droits_sites`) et
  `exigerDroitSite(caller, appId)` (throw `ErreurAcces` → 403).
- `admin-site-stats` : super_admin **ou** droit sur l'`appId`.
- `admin-seo` : actions par site → droit requis ; `all-sites` → restreint aux
  sites autorisés.
- `admin-partenariats` : actions par site → droit requis ; `list-sites` →
  filtré aux sites autorisés (les champs env/secret ne sortent que pour
  super_admin) ; `save-site` et l'accès registre complet restent super_admin.
- RPC users (v3 de `get_pending_users` / `get_users_for_admin`) : super_admin
  → tout ; org_admin → sa propre org (inchangé) ; délégué → uniquement avec
  `p_app_id` ∈ `core.sites_autorises(auth.uid())`, lignes de cette app.
  Consultation seule pour les délégués : les actions (création, suppression,
  rôles, assignation) restent gardées par leurs RPC/EF existantes
  (super_admin/org_admin) et leurs boutons sont masqués côté UI.

## 4. Frontend

- `AuthContext` : charge `mes_droits_sites()` avec le profil → `sitesAdmin`
  (array). `hasConsoleAccess` devient : super_admin ∨ org_admin ∨
  `sitesAdmin.length > 0`.
- `AdminRoute` : laisse passer `isOrgAdmin ∨ sitesAdmin.length > 0`.
- `ConsoleLayout` : sélecteur limité aux sites visibles = super_admin ? tous :
  `sitesAdmin ∪ (org_admin ? [app de son org, COALESCE(profile.app_id,'arpet')] : [])`.
  Onglets transverses (SEO, Partenariats, Utilisateurs) affichés si
  super_admin ∨ droit sur le site sélectionné ; Sites reste super_admin.
  Modules ARPET affichés si site sélectionné = arpet **et** (membre d'une org
  ARPET ∨ droit délégué sur arpet ∨ super_admin).
- Page Sites (super_admin) : bloc « Admins délégués » par fiche site — liste,
  ajout par email d'un compte existant, retrait. EF dédiée `admin-droits`
  (actions `list`, `grant` par email, `revoke`), super_admin only.
- Page Users : pour un délégué non org_admin, boutons d'action masqués
  (consultation).

### Limite assumée (documentée)

Un délégué avec droit sur `arpet` voit les onglets ARPET, mais la profondeur
des données reste régie par la RLS existante (documents de son org) : pour un
accès complet aux connaissances ARPET, le rattacher aussi à une org ARPET via
le mécanisme existant. Pas de contournement RLS dans ce chantier.

## 5. Validation

- SQL : `core.sites_autorises` testé pour les 3 cas (super_admin, délégué,
  sans droit). RPC users : délégué sans `p_app_id` ou hors droit → exception.
- EF : `deno check`, déploiement, smoke 401 sans JWT ; 403 vérifiable
  seulement en session réelle (clic d'Eric avec un compte de test).
- Front : build ; parcours délégué simulable en attribuant un droit à un
  compte de test existant.
