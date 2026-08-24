# Partenariats : synchronisation nocturne des diagnostiqueurs vers les prospects

**Date :** 2026-08-24
**Statut :** validé en séance avec Eric le 24/08/2026
**Décisions d'architecture :** (1) la sync est une **fonction SQL** appelée
directement par pg_cron — pas d'Edge Function ni de pg_net ; (2) elle **insère
uniquement les nouveaux** (`ON CONFLICT DO NOTHING`), jamais de réécriture d'une
fiche existante ; (3) le bouton « Import diagnostiqueurs » devient
« Synchroniser maintenant » et appelle la même fonction ; (4) horaire **03h30
chaque nuit**, juste après la chaîne amont MonsieurDPE (02h30 sync annuaire,
02h50 géocodage).

## 1. Objectif et périmètre

Remplacer l'import manuel des diagnostiqueurs (action `import-diagnostiqueurs`
de l'EF `admin-partenariats`) par une synchronisation planifiée : chaque nuit,
les diagnostiqueurs certifiés nouvellement apparus dans `dpe.diag_certifie`
deviennent des prospects `admin.prospects` (type `diagnostiqueur`, statut
`nouveau`) pour le site MonsieurDPE.

Hors périmètre, volontairement :

- La synchronisation de `dpe.diag_certifie`/`dpe.diag_site` elle-même : **elle
  existe déjà** (repo DPE, EF `dpe-annuaire-diag`, cron `dpe-annuaire-diag-sync`
  à 02h30). On ne touche à rien côté DPE.
- Aucune intégration d'API externe : pas de clé, pas d'appel ADEME/data.gouv
  depuis Baikal (voir §2).
- La mise à jour des coordonnées des prospects existants : écarté en séance
  (risque sur les statuts du funnel et les désinscrits, bénéfice faible).
- Un journal de sync dédié : `cron.job_run_details` + `RAISE LOG` suffisent.

## 2. État des lieux — ce qui a réorienté le design

L'énoncé initial supposait d'appeler « l'API des diagnostiqueurs certifiés
(probablement l'annuaire ADEME) » avec une clé. Vérification faite :

- La source officielle est le jeu de données **data.gouv.fr « Annuaire des
  diagnostiqueurs immobiliers »** (Ministère de la Cohésion des territoires) :
  CSV ~16,8 Mo republié **quotidiennement**, URL de ressource stable, licence
  ouverte, **sans clé**. L'API tabulaire de data.gouv plafonne à 200 lignes/page
  (mesuré par le projet DPE le 14/08/2026) — le CSV est la seule voie viable.
- Le projet DPE (`C:\Dev\DPE`) consomme **déjà** ce CSV chaque nuit à 02h30 et
  alimente `dpe.diag_site` / `dpe.diag_certifie` **dans la même base partagée**
  (projet odspcxgafcqxjzrarsqf) que `admin.prospects`.

Le maillon manquant se réduit donc à un pont interne à la base :
`dpe.diag_certifie` → `admin.prospects`. D'où la décision fonction SQL +
pg_cron, contre les options rejetées :

- **EF de sync + pg_net + jeton Vault** (pattern `dpe-annuaire-diag-sync`) :
  pertinent quand il faut sortir sur le réseau ; ici tout est dans la même base,
  ce serait trois pièces mobiles (secret, HTTP, déploiement) pour un
  `INSERT … SELECT`. Réserve levée : si MonsieurDPE migre un jour sur une base
  dédiée, cette sync devra être revue (connecteur `_shared/sites.ts`) — assumé,
  YAGNI.
- **Étendre la sync du repo DPE pour pousser aussi les prospects** : couple les
  deux repos et fait écrire un produit dans le schéma `admin` du hub — refusé.

## 3. La fonction `admin.sync_diagnostiqueurs(p_app_id text)`

Une fonction plpgsql, `SECURITY DEFINER` (owner `postgres`),
`SET search_path = ''`, qui :

1. Lit `config.apps.db_schema` pour `p_app_id` ; erreur claire si absent, ou si
   `<schema>.diag_certifie` n'existe pas (`to_regclass`).
2. Insère dans `admin.prospects` via SQL dynamique (`format('%I', db_schema)`)
   le même mapping que l'import actuel :
   - source : `<schema>.diag_certifie c JOIN <schema>.diag_site s ON s.slug = c.slug`
     avec `c.email IS NOT NULL` et contenant un `@` ;
   - dédoublonnage par email normalisé (`lower(trim(email))`), première
     occurrence gardée (`DISTINCT ON`) ;
   - colonnes : `type='diagnostiqueur'`, `email`, `nom`, `prenom`,
     `entreprise = s.nom_affiche`, `telephone`, `code_postal`,
     `source='diag_certifie'`, `donnees = {commune}` ;
   - `ON CONFLICT (app_id, email) DO NOTHING` — un email déjà présent (quel que
     soit son statut, désinscrit compris) n'est jamais réécrit.
3. Retourne un jsonb `{lus, avecEmail, inseres, doublons}` (mêmes clés que
   l'action actuelle, l'UI ne change pas son message) et trace un `RAISE LOG`
   pour les nuits sans témoin.

Pas de filtre département : la sync prend tout (l'import actuel plafonnait à
10 000 lignes, ordre de grandeur confirmé tenable) ; le ciblage géographique se
fait au moment des campagnes (`segment.departement`), comme aujourd'hui.

Droits : `REVOKE ALL FROM public, anon, authenticated` ;
`GRANT EXECUTE TO service_role` (pour l'appel RPC de l'EF). Le cron s'exécute en
`postgres`, owner de la fonction.

## 4. Le cron `admin-sync-diag-prospects`

Dans la même migration, pattern rejouable du repo DPE (`cron.unschedule` si le
job existe, puis `cron.schedule`) :

- nom : `admin-sync-diag-prospects` ;
- planification : `30 3 * * *` (même horloge que les crons DPE — la chaîne
  02h30 → 02h50 → 03h30 reste ordonnée quel que soit le fuseau du serveur) ;
- commande : `select admin.sync_diagnostiqueurs('monsieurdpe');` — appel SQL
  direct, aucun secret, aucune Edge Function.

MonsieurDPE est aujourd'hui le seul site avec des tables `diag_*` ; si un autre
site en avait un jour, on ajoute un appel, pas une mécanique.

## 5. L'EF `admin-partenariats` : `import-diagnostiqueurs` → `sync-diagnostiqueurs`

- L'action `import-diagnostiqueurs` (lecture via le connecteur
  `_shared/sites.ts` + mapping TS) est **supprimée**, remplacée par une action
  `sync-diagnostiqueurs` qui appelle
  `admin.schema('admin').rpc('sync_diagnostiqueurs', { p_app_id: appId })`
  (le schéma `admin` est exposé à PostgREST depuis la migration du 25/08) et
  renvoie son jsonb tel quel. Même chemin d'auth que les autres actions
  (`exigerSite`), plus de paramètre `departement`.
- L'import et le cron partagent ainsi **un seul code de mapping** : la fonction
  SQL.
- Nettoyage : l'EF n'utilisant plus `_shared/sites.ts`, l'import
  `chargerSite`/`lecteurSite`/`ErreurSite` et le catch `ErreurSite` sortent
  d'`admin-partenariats/index.ts`.

## 6. Frontend (page Partenariats)

- `partenariats.service.js` : `importDiagnostiqueurs(appId, departement)` →
  `syncDiagnostiqueurs(appId)`.
- `Partenariats.jsx` : le bouton devient « Synchroniser les diagnostiqueurs »,
  sans `window.prompt` de département ; message de résultat au même format
  (« X insérés, Y doublons (Z certifiés lus, N avec email) ») complété d'un
  rappel que la sync tourne aussi chaque nuit à 03h30.

## 7. Erreurs et cas limites

- `db_schema` NULL ou tables `diag_*` absentes : la fonction lève une erreur
  explicite ; l'EF la renvoie en message lisible (chemin d'erreur existant) ;
  côté cron, l'échec est visible dans `cron.job_run_details`.
- Sync amont en panne : la fonction tourne sur les données existantes — zéro
  inséré, aucun dégât ; la panne amont se diagnostique côté DPE.
- Rejeu (cron + clic manuel le même jour) : idempotent par construction
  (`ON CONFLICT DO NOTHING`).
- PostgREST et la nouvelle fonction RPC : la migration se termine par
  `NOTIFY pgrst, 'reload schema'`.

## 8. Tests

- Migration appliquée sur la base : appel direct
  `select admin.sync_diagnostiqueurs('monsieurdpe')` → compteurs cohérents,
  deuxième appel → `inseres = 0`.
- Cas d'erreur : appel avec un `app_id` sans `db_schema` (ex. un id inventé) →
  erreur explicite, pas d'insertion.
- EF : action `sync-diagnostiqueurs` depuis la console → mêmes compteurs,
  refus pour un utilisateur sans droit sur le site (chemin `exigerSite`
  inchangé).
- Cron : `select * from cron.job where jobname = 'admin-sync-diag-prospects'`
  puis contrôle de `cron.job_run_details` après la première nuit.
