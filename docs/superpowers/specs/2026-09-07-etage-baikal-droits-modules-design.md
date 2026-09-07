# Étage Baikal et droits par module

**Date :** 2026-09-07
**Statut :** validé en séance avec Eric le 07/09/2026 (« c'est clair pour moi tu peux lancer »)
**Précède :** `2026-08-24-hub-baikal-droits-sites-design.md` (droits par site, un seul niveau)
et la migration `comptes_console_vs_clients` du 06/09 (comptes console vs clients de site).

## 1. Constat

La console est entièrement organisée par site. Baikal lui-même n'a pas d'étage :
ses comptes (les super admins) sont rangés sous ARPET par le repli par défaut,
les métiers (vocabulaire commun) sont affichés sous le site courant, et il faut
ouvrir chaque site pour savoir qui l'administre. Un accès console à un site vaut
lecture ET écriture sur tous les modules du site.

## 2. Décisions

### Deux étages, pas trois

- **Étage site** (existe) : modules métier (Clients, Prospects, Finances,
  Rapports, SEO, Partenariats) + administration du site (Utilisateurs,
  Paramétrage — ex-page Sites, renommée, même route `/sites`).
- **Étage Baikal** (nouveau, route `/baikal`, super_admin seulement) : entrée
  « Baikal » en tête du sélecteur de sites. Quatre blocs : Super admins, Accès
  par site, Registre des sites (lecture ; la création reste une migration faite
  ensemble), Métiers (déplacés depuis Paramétrage).
- Pas de console supplémentaire par page de site : un réglage par site va dans
  Paramétrage.

### Un compte, des portes

Le compte (auth) est unique et global. On lui attache ensuite : un rôle dans une
organisation (ARPET), un accès console à un site, ou le statut super admin. Les
deux premiers se cumulent sans se croiser : le rôle d'organisation ne donne
jamais les modules transverses ; l'accès console ne donne rien à l'intérieur
d'une organisation.

### Droits par module à trois positions

`admin.droits_sites.modules jsonb` : `{module: 'lecture' | 'ecriture'}`, module
absent = fermé. Modules : clients, prospects, finances, rapports, seo,
partenariats, users (users = lecture au plus, les actions restent super/org
admin). Défaut à la création et pour l'existant : tout en écriture (décision
Eric : « laisse en écriture je vais modifier derrière »).

- Source de vérité : `core.droits_modules(user_id)` → `{app_id: {module: niveau}}`
  (super_admin : toutes les apps actives, tout en écriture) ; exposée par
  `public.mes_droits_modules()`. `core.sites_autorises` reste la présence de la
  ligne (site visible).
- Enforcement serveur : `_shared/droits.ts` gagne `droitsModules(caller)` et
  `exigerModule(droits, appId, module, 'lecture'|'ecriture')`. Chaque EF
  classe ses actions : lecture (consultation) ou écriture (toute action qui
  modifie, envoie, génère ou coûte). Un module fermé refuse tout.
- Front : `AuthContext` charge `mes_droits_modules()` → `droitsModules`,
  `niveauModule(appId, module)`, `peutEcrire(appId, module)`. `ConsoleLayout`
  masque les modules fermés ; les pages masquent leurs actions d'écriture en
  lecture et affichent un bandeau « lecture seule ».

### Super admins

Gérés dans l'étage Baikal via `admin-droits` (super_admin only) : liste,
promotion d'un compte existant par email, rétrogradation (jamais soi-même,
jamais le dernier). Journalisé dans `core.role_changes_log`. Les super admins
n'appartiennent à aucun site : `get_users_for_admin` les exclut dès qu'un site
est demandé (profiles.app_id garde une FK vers config.apps, pas de pseudo-site).

## 3. Hors périmètre

Création de site depuis la console (migration ensemble). Droits à l'intérieur
des organisations ARPET (inchangés). Les modules propres à ARPET (Dashboard,
Connaissances, Prompts, Indexation) restent régis par l'appartenance à une
organisation et le super_admin.
