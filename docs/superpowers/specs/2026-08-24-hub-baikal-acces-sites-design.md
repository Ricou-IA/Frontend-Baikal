# Hub Baikal : canal de lecture des sites, registre complet, connecteur partagé

**Date :** 2026-08-24
**Statut :** validé en séance avec Eric le 24/08/2026
**Décisions d'architecture :** (1) la lecture des bases dédiées se fait par un rôle
Postgres **lecture seule** `baikal_reader` créé dans chaque projet dédié, jamais par
leur `service_role` ; (2) `config.apps` devient le registre exhaustif des produits
(13 lignes, 2 colonnes ajoutées) ; (3) l'accès aux données d'un site passe par un
module partagé `_shared/sites.ts` à interface SQL lecture seule unifiée.

## 1. Objectif et périmètre

Frontend-Baikal devient la console d'accès unique à tous les sites et SaaS gérés.
Cette spec couvre la **fondation d'accès aux données** : comment un module du hub
lit les données d'un produit, où qu'elles vivent (schéma de la base partagée ou
projet Supabase dédié).

Hors périmètre, volontairement :

- Le RAG et le chat : affaire d'ARPET (repo `Frontend-ARPET`), on n'y touche pas.
- L'UI du hub (sélecteur global de site, réorganisation des onglets ARPET vs
  transverses) : chantier suivant, qui s'appuiera sur cette fondation.
- La suppression des schémas obsolètes `majordhome` et `pack_vendeur` de la base
  partagée (instantanés figés depuis la migration du 2026-08-09) : nettoyage
  séparé, non bloquant.
- Le canal d'**écriture** vers les projets dédiés : le principe est acté (Edge
  Functions d'admin déployées dans le projet cible, modèle `pv-*` de
  Pré-état-daté ; le `service_role` ne quitte jamais son projet), mais rien n'est
  construit tant qu'aucun module n'écrit (YAGNI).
- La correction de la fuite `/admin/users` (clients d'autres produits dans « En
  attente ») : rendue possible par le registre complet (filtrage par `app_id`),
  traitée dans le chantier UI.

## 2. Décision 1 — lecture des bases dédiées : rôle `baikal_reader`

### Le choix

Pour lire les données d'un projet Supabase dédié depuis Baikal, on crée **dans
chaque projet dédié** un rôle Postgres `baikal_reader`, `LOGIN`, lecture seule,
et Baikal s'y connecte **en SQL direct via le pooler** (Supavisor). Options
rejetées :

- `service_role` de chaque projet dans les secrets Baikal : Baikal deviendrait le
  trousseau maître (lecture + écriture + RLS contournée + API admin auth sur tous
  les sites d'un coup en cas de fuite). L'isolation volontaire de Pré-état-daté
  sur une org séparée deviendrait cosmétique.
- JWT maison `role: baikal_reader` via PostgREST : fragile (signé avec le secret
  JWT legacy HS256, meurt à la migration vers les clés de signature asymétriques)
  et soumis à la contrainte des exposed schemas.

### Contenu de la migration à écrire pour chaque projet dédié

1. `CREATE ROLE baikal_reader LOGIN PASSWORD '<généré>' NOINHERIT;`
   avec `ALTER ROLE baikal_reader SET default_transaction_read_only = on;`
   (ceinture : les GRANTs restent la vraie barrière).
2. `GRANT USAGE` sur les schémas à lire + `GRANT SELECT` sur leurs tables +
   `ALTER DEFAULT PRIVILEGES ... GRANT SELECT` pour les tables futures. Le
   périmètre exact des schémas (le `db_schema` du registre, plus `core` et
   assimilés s'ils existent dans le projet) est énuméré par projet au moment du
   plan, après inventaire.
3. **Policies RLS** : `BYPASSRLS` est impossible (postgres n'est pas superuser
   chez Supabase), donc toute table sous RLS rend 0 ligne au rôle sans policy.
   Le script pose `CREATE POLICY baikal_read ... FOR SELECT TO baikal_reader
   USING (true)` sur chaque table du périmètre, via une boucle sur `pg_tables`,
   **idempotente et rejouable** (à relancer quand une nouvelle table apparaît —
   les default privileges ne couvrent pas les policies ; geste documenté dans le
   CLAUDE.md des projets concernés).

Projets concernés aujourd'hui : Majord'home (`ejqqqwudmizqisdkxohw`) et
Pré-état-daté (`ycmavnmtyvodqawvwrrd`). Chaque futur projet dédié reçoit la même
migration.

### Côté Baikal

Un secret par projet dédié dans les Edge Function Secrets de Baikal, contenant le
**DSN complet** (pooler, port transaction, utilisateur `baikal_reader`) :
`ADMIN_RO_MAJORDHOME_DSN`, `ADMIN_RO_PACKVENDEUR_DSN`. La table `config.apps` ne
porte que le **nom** du secret (`db_ro_secret_ref`), conformément à la règle de
partage existante. Rotation : changer le mot de passe du rôle n'impacte que ce
canal, rien d'autre.

### Ce qu'une fuite coûte

Lecture seule sur les tables accordées du projet concerné. Grave (données
clients, RGPD) mais : pas d'écriture, pas de destruction, pas de prise de
contrôle de l'auth, et un seul projet touché par secret.

## 3. Décision 2 — registre `config.apps` complet

### Deux colonnes ajoutées (migration sur la base partagée)

- `db_schema` (text, nullable) — le schéma qui porte les données du produit.
  Rend explicite le lien `monsieurdpe` → `dpe`, aujourd'hui implicite.
- `db_ro_secret_ref` (text, nullable) — nom du secret DSN lecture seule, pour
  les produits sur base dédiée uniquement. NULL pour les produits de la base
  partagée (les Edge Functions de Baikal y lisent en direct).

Le statut passe par `is_active` (existant). Pas d'autre colonne.

### Les 13 lignes du registre

État constaté le 24/08 sur la base partagée (tables / lignes estimées) à l'appui.

| id | hébergement | db_schema | action |
|----|-------------|-----------|--------|
| `arpet` | partagée | `arpet` | renseigner `db_schema` |
| `monsieurdpe` | partagée | `dpe` (20 t., ~147k l.) | renseigner `db_schema` ; `env_url`/`env_secret_ref` conservés |
| `linktrack` | partagée | `linktrack` | renseigner `db_schema`, domaine |
| `voirie` | partagée | `voirie` (13 t.) | **créer** — priorité : encaisse (Stripe live, 9,90 € one-shot) |
| `duerp` | partagée | `duerp` (21 t.) | créer |
| `cosette` | partagée | `cosette` (10 t., ~15k l.) | créer |
| `legifrance` | partagée | `legifrance` (7 t., ~4,5k l.) | créer |
| `snapstudio` | partagée | `snapstudio` (9 t.) | créer |
| `karedas` | partagée | `karedas` (5 t.) | créer |
| `zelty` | partagée | `zelty` (2 t., 0 l.) | créer en `is_active = false` |
| `majordhome` | **dédiée** `ejqqqwudmizqisdkxohw` | `majordhome` | `env_url` → base dédiée, `db_ro_secret_ref` = `ADMIN_RO_MAJORDHOME_DSN` |
| `pack-vendeur` | **dédiée** `ycmavnmtyvodqawvwrrd` | schéma unique de la base dédiée (19 tables ; nom exact vérifié au plan) | `env_url` → base dédiée, `db_ro_secret_ref` = `ADMIN_RO_PACKVENDEUR_DSN` |
| `perfec` | — | — | **supprimer la ligne** (0 table, produit fantôme) |

Non déclarés, assumé : `imports` et `invoicing` (schémas utilitaires
Pennylane/imports, pas des produits) ; les copies obsolètes `majordhome` et
`pack_vendeur` de la base partagée (les lignes du registre pointent
exclusivement les bases dédiées).

### Notes d'exécution de la migration

- Le trigger `tr_create_documents_cles_on_app_insert` casse tout INSERT avec
  `is_active = true` (slug de concept constant déjà pris). La migration le
  corrige ou insère inactif puis active par UPDATE — à trancher au moment du
  plan, le contournement est connu.
- Les domaines des 7 nouvelles lignes (`voirie`, `duerp`, `cosette`,
  `legifrance`, `snapstudio`, `karedas`, `zelty`) sont fournis par Eric au
  moment de la migration ; `domaine`/`gsc_propriete` restent NULL en attendant
  (le module SEO les ignore proprement : NULL = module inactif pour ce site).

## 4. Décision 3 — module partagé `_shared/sites.ts`

### Le problème

Le seul connecteur cross-projets existant est enterré dans le
`case "import-diagnostiqueurs"` de `admin-partenariats/index.ts` (~lignes
200-263) : chargement `env_url`/`env_secret_ref`, résolution du secret par nom,
appel PostgREST distant (`apikey` + `Bearer` + `Accept-Profile`). Ironie
constatée : pour MonsieurDPE, `env_url` pointe la base partagée elle-même — la
fonction s'auto-appelle en HTTP pour lire un schéma local.

### La forme retenue

Un module `supabase/functions/_shared/sites.ts` (le dossier `_shared/` existe :
`cors.ts`, `utils.ts`), importé par toutes les Edge Functions du hub. Deux
fonctions :

- **`chargerSite(admin, appId)`** — lit la ligne `config.apps` (dont
  `db_schema`, `db_ro_secret_ref`), la valide, erreurs explicites : « site
  inconnu », « secret X absent des Edge Function Secrets », « site sans base
  configurée ». Type `Site` exporté.
- **`lecteurSite(site)`** — retourne une connexion SQL **lecture seule**
  (postgres-js pour Deno), quel que soit l'hébergement :
  - base dédiée → DSN lu dans `Deno.env.get(site.db_ro_secret_ref)` ;
  - schéma local → `SUPABASE_DB_URL` (fourni d'office aux Edge Functions).
  Dans **les deux cas** le module force `default_transaction_read_only = on` à
  la connexion : un module du hub ne peut pas écrire par ce canal, même en
  local. Les écritures passent par les clients `service_role` explicites
  (local) ou, plus tard, par les EF du projet cible (dédié).
  Cycle de vie : connexion ouverte paresseusement, 1 connexion max par
  invocation, fermée en fin de requête (pattern compatible pooler en mode
  transaction).

Rejeté : une Edge Function passerelle `baikal-connecteur` (saut HTTP interne,
surface d'auth en plus, latence pour rien).

`env_url`/`env_secret_ref` gardent leur rôle actuel (canal API/HTTP vers
l'environnement d'un site). Une future fonction `appelerSite(site, fonction,
payload)` portera le canal d'écriture quand un module en aura besoin — pas
avant.

### Refactor accompagnant

`import-diagnostiqueurs` devient le premier consommateur du module : lecture
directe du schéma `dpe` (jointure `diag_certifie` / `diag_site` en SQL),
suppression du self-appel HTTP. Comportement fonctionnel identique (mêmes
filtres département, même dédoublonnage par email, même upsert
`ignoreDuplicates`).

## 5. Dépendances (gestes d'Eric)

- Fournir les domaines des 7 nouveaux produits déclarés (au moment de la
  migration registre).
- Confirmer le statut réel de `zelty` (0 ligne : produit pas lancé ou abandonné ?).
- Générer/stocker les 2 secrets `ADMIN_RO_MAJORDHOME_DSN` et
  `ADMIN_RO_PACKVENDEUR_DSN` dans les Edge Function Secrets de Baikal (les
  migrations créant le rôle sortiront le mot de passe une seule fois).

## 6. Validation

- **Rôle lecture seule** : depuis une connexion `baikal_reader`, un `SELECT`
  sur chaque schéma accordé rend des lignes (policies effectives) ; un
  `INSERT`/`UPDATE`/`DELETE` échoue ; un `SET transaction_read_only = off` ne
  donne toujours aucun droit d'écriture (GRANTs absents).
- **Registre** : `SELECT` de contrôle après migration — 13 lignes attendues,
  `perfec` absente, `zelty` inactive, les 2 lignes dédiées portant `env_url` +
  `db_ro_secret_ref`.
- **Module** : `import-diagnostiqueurs` iso-fonctionnel (mêmes comptes
  lus/insérés/doublons sur un département témoin, avant/après refactor) ;
  tentative d'écriture via `lecteurSite` sur schéma local → erreur
  `read-only transaction`.
