# Hub Baikal — UI console : sélecteur global, onglets contextuels, users par site

**Date :** 2026-08-24
**Statut :** validé en séance avec Eric le 24/08/2026 (soir)
**Décisions d'architecture :** sélecteur de site global dans un layout console
partagé (pas d'accueil portefeuille, pas d'espace séparé) ; onglets contextuels
au site sélectionné ; page Utilisateurs filtrée par site via RPC paramétrées ;
le travail en cours du working tree est commité en lots thématiques avant le
chantier.

## 1. Objectif et périmètre

Transformer la console `/admin` (liste d'onglets à plat, mélange
ARPET/transverse) en console multi-sites : un **sélecteur de site global**
pilote ce que montrent les pages. S'appuie sur la fondation du matin (registre
`config.apps` complet — 11 sites actifs).

Hors périmètre : Organizations/Projets/Invitations (inchangés), accueil
portefeuille de cartes, modules dédiés aux sites non-ARPET (viendront avec le
connecteur `_shared/sites.ts`), RAG/chat (ARPET).

## 2. Préalable : committer le travail en cours

Le working tree porte un chantier précédent cohérent, non commité. Il est
commité en l'état, en lots thématiques, avant de toucher aux mêmes fichiers :

1. **Suppression de compte** : `supabase/functions/delete-user/`,
   `DeleteUserModal.jsx`, `UserRow.jsx`, `CreateUserModal.jsx`,
   `features/users/components/index.js`, `users.service.js`,
   `pages/admin/Users.jsx`, `deno.lock`.
2. **Auth et déverrouillage multi-app** : `OnboardingGuard.jsx`,
   `AuthContext.jsx`, `Login.jsx`, `App.jsx`, `Dashboard.jsx`,
   `projects.service.js` (retrait du filtre `app_id='arpet'`), `CLAUDE.md`.
3. **Logs retrieval et divers** : `baikal-retrieval/index.ts` + `logging.ts` +
   migration `20260612_rag_query_logs.sql`, `meeting-transcribe/index.ts`,
   migration `20260824090000_cloture_migration_majordhome_packvendeur.sql`.

La répartition exacte des fichiers par lot est affinée au plan après lecture
des diffs ; règle : chaque commit doit être cohérent seul.

## 3. `ConsoleLayout` partagé

Nouveau composant `src/components/console/ConsoleLayout.jsx` :

- Factorise le header sticky « BAIKAL_CONSOLE » aujourd'hui dupliqué dans
  `Admin.jsx`, `Seo.jsx`, `Partenariats.jsx`, `Sites.jsx`, `Users.jsx`
  (les pages gardent leur contenu, perdent leur enrobage).
- Monte `AppProvider` **une seule fois** (supabaseClient injecté) et affiche
  l'`AppSelector` existant dans le header. La persistance localStorage
  (`baikal-app`) fait suivre la sélection entre pages — comportement déjà en
  place, simplement centralisé.
- Porte la navigation (section 4) et les actions communes (Paramètres,
  Déconnexion, badge impersonation si présent dans l'existant).
- Les pages l'utilisent ainsi : `<ConsoleLayout actif="seo">…contenu…</ConsoleLayout>`.

## 4. Navigation contextuelle

Deux groupes dans la barre du layout :

- **Transverses** (toujours visibles) : SEO (`/seo`), Partenariats
  (`/partenariats`), Utilisateurs (`/admin/users`), et Sites (`/sites`,
  super_admin seulement).
- **Modules du site** (dépendent du site sélectionné) :
  - site = `arpet` → Dashboard, Connaissances, Prompts (super_admin),
    Indexation (super_admin) — les onglets internes actuels d'`Admin.jsx`.
  - autre site → aucun module dédié ; `/admin` affiche une carte sobre du site
    (nom, domaine, schéma, hébergement — lus du registre) avec renvoi vers les
    transverses.

`/admin` reste l'URL d'entrée de la console.

## 5. Utilisateurs par site

- Migration SQL (base partagée) : `core.get_pending_users(p_app_id text)` et
  la RPC de liste complète utilisée par l'onglet « Tous les utilisateurs »
  gagnent un paramètre `p_app_id` (NULL = tous, comportement super_admin
  explicite). Wrappers `public.*` alignés. Les signatures exactes sont
  relevées au plan (fonctions existantes en base).
- `users.service.js` passe le site sélectionné ; la page Utilisateurs suit le
  sélecteur global. Un client Autorisation-voirie n'apparaît plus sous ARPET
  mais sous son site.
- La création d'utilisateur (`create-user`) pose `app_id` : vérifier au plan
  qu'elle reste cohérente avec le site sélectionné.

## 6. Validation

- Navigation : sélection d'un site ≠ ARPET → onglets ARPET absents, transverses
  présents ; retour sur ARPET → tout revient. Sélection persistante entre
  pages et au rechargement.
- Users : file « En attente » vide côté ARPET du client voirie constaté ;
  celui-ci visible sous Autorisation Voirie.
- Build Vite sans erreur ; aucune régression sur les pages hors périmètre
  (Organizations/Projets/Invitations gardent leur comportement).
