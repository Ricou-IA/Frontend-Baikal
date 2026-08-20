# Admin multi-sites : modules SEO et Partenariats greffés sur Baikal

**Date :** 2026-08-20
**Statut :** validé en séance avec Eric le 20/08/2026
**Décision d'architecture :** on greffe dans Baikal plutôt que de créer une application
admin autonome. Compromis assumé : front Vite + React Router en JSX (pas de Next/TS),
données de l'admin dans le projet Supabase de Baikal. En échange : auth, rôles,
impersonation, sélecteur multi-app et sidebar existent déjà et tournent en production.

## 1. Objectif

Un back-office unique pour piloter tous les sites d'Eric, avec un sélecteur de site
(le site est une dimension, comme dans un tableau croisé). Deux modules au lancement,
répliqués depuis le back-office de Pack Vendeur (`C:\Dev\Pack Vendeur`) :

1. **SEO** — suivi Search Console par site et croisé tous sites.
2. **Partenariats** — mini-CRM de prospection (agences, diagnostiqueurs) avec envoi
   de campagnes et suivi.

Le `/admin` de Pack Vendeur reste vivant, intouché, dans son repo et son projet
Supabase. Aucune migration forcée. Pack Vendeur rejoint l'admin quand un module y
trouve son intérêt (le SEO en premier : une ligne dans le registre suffit).

## 2. Le registre des sites : `config.apps`

Le mécanisme multi-app existant de Baikal devient le registre des sites. ARPET y est
déjà ; MonsieurDPE et Pack Vendeur entrent comme nouvelles lignes.

Colonnes à ajouter à `config.apps` (migration) :

- `domaine` (text) — ex. `monsieurdpe.fr`.
- `gsc_propriete` (text, nullable) — l'identifiant de propriété Search Console
  (`sc-domain:monsieurdpe.fr` ou URL-prefix). Null = module SEO inactif pour ce site.
- `env_url` (text, nullable) — URL du projet Supabase du site, pour les connecteurs.
- `env_secret_ref` (text, nullable) — **le nom du secret** (Supabase Edge Functions
  Secrets) qui porte la clé d'accès à cet environnement. La clé elle-même n'est
  jamais en table ni côté client.

Le front réutilise `AppContext` / `AppSelector` / header `x-app-id` sans modification
de principe. Les aliases `vertical` deprecated ne sont pas traités ici (hors scope).

## 3. Module SEO

### Écrans (nouvelle page `src/pages/Seo.jsx` + composants dédiés)

Transposition multi-sites de l'écran SEO de Pack Vendeur :

- **Vue d'ensemble par site** : clics, impressions, CTR, position moyenne, avec
  tendance. Toutes les fenêtres sont **ancrées à J-3** (retard de données GSC,
  constante partagée, pattern `GSC_DATA_LAG_DAYS` de Pack Vendeur).
- **Comparaison de périodes** : période vs période précédente de même longueur.
- **Top requêtes / top pages** du site sélectionné.
- **Vue croisée tous sites** : tableau une ligne par site (les sites visibles par
  l'utilisateur), mêmes indicateurs, pour comparer d'un coup d'œil.

### Serveur : Edge Function `admin-seo`

- POST unique, dispatch sur `{ action }` : `overview`, `compare`, `top-queries`,
  `top-pages`, `all-sites`.
- Proxy de l'API Search Console (Search Analytics). Authentification par **OAuth
  refresh token**, comme Pack Vendeur (`_shared/google-search-console.ts` : grant
  `refresh_token`, cache mémoire du token d'accès) — pas de compte de service.
  Secrets à répliquer dans le projet Baikal : `GOOGLE_GSC_OAUTH_CLIENT_ID`,
  `GOOGLE_GSC_OAUTH_CLIENT_SECRET`, `GOOGLE_GSC_OAUTH_REFRESH_TOKEN`. La propriété
  interrogée vient de `config.apps.gsc_propriete` (plus de `GOOGLE_GSC_SITE_URL`
  global).
- Vérifie la session et le droit de l'utilisateur sur l'`app_id` demandé avant tout
  appel sortant. Réponses `{ data, error }`, jamais de throw non catché.
- Pas de cache en v1 ; si les quotas GSC deviennent un sujet, un cache table viendra
  après mesure, pas avant.

### Dépendances (gestes d'Eric)

- Déclarer la propriété `monsieurdpe.fr` dans Search Console si absent.
- S'assurer que le **compte Google qui a émis le refresh token** de Pack Vendeur a
  accès (lecture suffit) à chaque propriété à suivre : MonsieurDPE, ARPET si
  souhaité, Pack Vendeur déjà fait.
- Copier les trois secrets `GOOGLE_GSC_OAUTH_*` de Pack Vendeur dans les secrets du
  projet Supabase Baikal.

## 4. Module Partenariats

### Écrans (nouvelle page `src/pages/Partenariats.jsx` + composants dédiés)

- **Prospects** : liste filtrable par site, type (`agence`, `diagnostiqueur`, autre à
  venir), statut de suivi (`nouveau`, `contacté`, `relancé`, `répondu`, `partenaire`,
  `refus`), recherche. Fiche prospect en drawer avec historique des envois.
- **Imports** :
  - **CSV** — import des agences depuis un export de la base Pack Vendeur
    (mapping de colonnes à l'import, dédoublonnage par email).
  - **Diagnostiqueurs MonsieurDPE** — import depuis `dpe.diag_certifie` via la
    connexion à l'environnement MonsieurDPE (`env_url` + secret), filtres simples
    (département, mention) au moment de l'import. Pas de synchronisation continue :
    import ponctuel, réimport à la demande, dédoublonnage par email.
- **Campagnes** : composer un message (objet + corps, variables `{{prenom}}`,
  `{{entreprise}}`…), choisir un segment (filtre sur les prospects), envoyer un test,
  puis envoyer. Suivi par campagne : envoyés, ouverts, cliqués, répondus, désinscrits.

Pas de scraping côté admin — décision explicite d'Eric (« pas de double scraping »).
La base agences se rafraîchit par réimport CSV depuis Pack Vendeur.

### Tables (schéma existant du projet Baikal, migration dédiée)

Toutes portent `app_id` (le site), RLS alignée sur les conventions du repo
(tables derrière vues `public.*` / RPC `SECURITY DEFINER` selon le pattern en place) :

- `prospects` — identité (nom, prénom, entreprise), contact (email, téléphone, site
  web), `type`, `app_id`, `statut`, `source` (`csv`, `diag_certifie`, `manuel`),
  `donnees` (jsonb pour les champs propres à une source), timestamps. Unicité
  `(app_id, email)`.
- `campagnes` — `app_id`, nom, objet, corps (HTML ou markdown rendu), définition du
  segment (jsonb), statut (`brouillon`, `envoyée`), timestamps.
- `campagne_envois` — `campagne_id`, `prospect_id`, statut d'acheminement
  (`envoyé`, `ouvert`, `cliqué`, `répondu`, `désinscrit`, `erreur`), identifiant
  Resend, timestamps. C'est ici que le webhook Resend écrit.

### Serveur : Edge Function `admin-partenariats`

- POST unique, dispatch `{ action }` : CRUD prospects, `import-csv`,
  `import-diagnostiqueurs`, CRUD campagnes, `preview-segment`, `send-test`,
  `send-campaign`, `campaign-stats`.
- `import-diagnostiqueurs` appelle l'environnement MonsieurDPE avec la clé lue depuis
  le secret référencé par `env_secret_ref` — la clé ne transite jamais par le client.
- Envoi via **Resend**, expéditeur au domaine du site de la campagne. Secrets
  namespacés `ADMIN_*` pour ne pas entrer en collision avec ceux des autres
  produits du projet. En v1, les statuts suivis sont `envoyé`/`erreur` (posés à
  l'envoi), `désinscrit` (via le lien de retrait) et `répondu` (posé à la main) ;
  le webhook Resend (ouvertures, clics, bounces) est reporté en v2.
- Chaque envoi porte un **lien de désinscription** (token par prospect) ; la
  désinscription pose `statut = 'désinscrit'` et exclut le prospect de tout envoi
  futur du même site.
- Vérification systématique du droit de l'utilisateur sur l'`app_id` avant toute
  action ; l'envoi de campagne exige un rôle >= `org_admin`.

### Dépendances (gestes d'Eric)

- Vérifier un domaine d'envoi Resend pour MonsieurDPE (et clé API dans les secrets).
- Exporter le CSV des agences depuis la base Pack Vendeur.
- Créer le secret d'accès à l'environnement MonsieurDPE dans les secrets Baikal.

## 5. Front : conventions

- Pages en JSX, cohérentes avec le repo (pas de TypeScript côté front).
- Services `seo.service.js` et `partenariats.service.js` sur le pattern
  `{ data, error }` + `apiCall` (`src/utils/apiHandler.js`).
- Entrées sidebar « SEO » et « Partenariats », visibles selon `app_role`
  (guards existants `OnboardingGuard` / `AdminRoute`) : lecture pour tous les rôles
  ayant accès à la console, actions d'écriture (imports, envois) réservées à
  `org_admin` et plus.
- Le sélecteur d'app existant filtre les deux modules ; la vue croisée SEO est le
  seul écran qui ignore la sélection courante (elle montre tous les sites visibles).

## 6. Ce qui est explicitement hors scope (v1)

- Écrans métier par site (dossiers Pack Vendeur, devis MonsieurDPE) et leurs
  connecteurs — plus tard.
- Écran de gestion des accès (qui voit quel site) — géré en table tant qu'Eric est
  seul utilisateur.
- Synchronisation continue des prospects, scoring, relances automatiques.
- Webhook Resend (ouvertures, clics, bounces) — v2.
- Refonte des aliases `vertical` deprecated d'`AppContext`.
- Migration du `/admin` de Pack Vendeur.

## 7. Risques et points de vigilance

- **Le repo Baikal a du travail non commité** (13 fichiers + nouveaux) — probablement
  une autre session en cours. Tout commit de ce chantier se fait **par pathspec**,
  jamais `git add -A`.
- **Quotas API Search Console** : la vue croisée fait N appels (un par site). N est
  petit (3 sites) ; à surveiller si le registre grossit.
- **Collision de secrets** : le projet Supabase de Baikal porte déjà des secrets ;
  tout nouveau secret est namespacé (préfixe `ADMIN_` ou nom explicite par site).
- **Envoi d'emails de prospection** : le suivi des désinscriptions est dans le
  périmètre v1 précisément pour que chaque campagne parte avec un lien de retrait
  fonctionnel dès le premier envoi.
