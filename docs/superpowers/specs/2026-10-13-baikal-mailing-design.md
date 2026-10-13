# Module Mailing — design (2026-10-13)

Un « petit Brevo maison » dans la console : sélectionner des destinataires d'un
site, composer un mail, lancer une campagne qui part toute seule par lots, et la
suivre dans un tableau de bord. Remplace Partenariats (brouillon jamais utilisé,
spec 2026-08-27 « lot 2 /mailing »).

## Décisions (Eric, 11-13/10/2026)

| # | Décision |
|---|---|
| 1 | Deux populations : les **prospects** (`baikal_prospects`) ET les **clients / comptes** du site (`baikal_dossiers`, `baikal_comptes_pro`). Une campagne vise une population. |
| 2 | **Le journal nominatif vit chez le site** (qui a reçu, ouvert, cliqué, rebondi, désinscrit). Baikal ne garde que la campagne (objet, corps, ciblage, statut). Règle « aucune donnée nominative dans `admin` » conservée. |
| 3 | Chaque site envoie **avec son compte Resend** et depuis son domaine (`config.apps.resend_key_ref`, nom du secret) et déclare son webhook Resend vers Baikal (`resend_webhook_secret_ref`). Sans compte : repli sur la clé et le domaine de Baikal. |
| 4 | Lot 1 = **envoi en une fois, en tâche de fond**, avec **plafond journalier par site** et **coupe-circuit** (rebonds, plaintes). Programmation et séquences : lot suivant. |
| 5 | Les prospects ne sont pas supprimés : ils vivent déjà chez le site (`baikal_prospects`). `admin.prospects` est une recopie (11 395 lignes toutes `nouveau`, 0 campagne) retirée après vérification de `/mailing` en réel. |

## Architecture

```
/mailing (console)
   │  composer, cibler (compteur + échantillon), tester, lancer, suspendre
   ▼
EF admin-mailing ──► admin.mail_campagnes (Baikal, rien de nominatif)
   │ lecture seule (_shared/sites.ts) : vues de population, mail_envoi, optout
   ▼
pg_cron (chaque minute, seulement si une campagne est en cours)
   ▼
EF admin-mailing-worker
   1. quota du jour = plafond du site − envoyés aujourd'hui (fuseau du site)
   2. coupe-circuit : ≥ 50 envois et (rebonds > 5 % ou plaintes > 0,3 %) → suspendue
   3. candidats = segment (source UNIQUE du WHERE) − optout − déjà dans la campagne
   4. réserver chez le site (mail_reserver) → envoyer (Resend, Idempotency-Key)
      → marquer chez le site (mail_marquer)
   5. plus de candidats → terminée
   ▼
Resend ──webhook──► EF admin-mailing-webhook?site=<id>
   signature Svix (secret du site ou de Baikal) → mail_evenement chez le site
   (resend_id inconnu = mail transactionnel du site → ignoré, 200)
   rebond dur / plainte → mail_desinscrire chez le site

Lien « Se désinscrire » + en-têtes List-Unsubscribe (RFC 8058, un clic)
   ──► EF mailing-desinscription (GET page, POST exécute) → mail_desinscrire
```

Transport des écritures chez le site, comme pour les prospects : base partagée →
RPC `public.baikal_mail_*(p_app_id, …)` qui délèguent à `<db_schema>.mail_*` ;
base dédiée → relais HTTP `config.apps.env_mailing_fn` (passe-plat
`docs/contrats/mailing-relais-v1.ts`).

## Côté site : module `docs/contrats/mailing-v1.sql`

- `@SCHEMA@.mail_envoi` : une ligne par (campagne, email). `population`,
  `destinataire_id`, `resend_id`, `statut` (reserve, envoye, erreur, delivre,
  ouvert, clique, rebond, plainte), un horodatage par événement, `rebond_type`,
  `nb_ouvertures`, `nb_clics`.
- `@SCHEMA@.baikal_mail_optout` (vue, **à adapter par site**) : toute adresse à
  ne jamais écrire — table d'opt-out locale, `prospect_etat` refus/désinscrit.
- Fonctions `mail_reserver`, `mail_marquer`, `mail_evenement`,
  `mail_desinscrire` (**à adapter par site** : écrit dans l'opt-out local).
- Annexe base dédiée : wrappers `public.baikal_mail_*` sans `p_app_id`.

Installé au lot 1 : **monsieurdpe** (opt-out `dpe.diag_optout` + `prospect_etat`).

## Côté Baikal

- `admin.mail_campagnes` : `app_id`, `nom`, `population`, `criteres` jsonb,
  `objet`, `corps_html`, `statut` (brouillon, en_cours, suspendue, terminee),
  `motif`, horodatages, `cree_par`. RLS forcée, service_role seul.
- `config.apps` : `resend_key_ref`, `resend_webhook_secret_ref`,
  `mailing_plafond_jour` (NULL = 200), `env_mailing_fn`.
- Module console `mailing` (`core.modules_console`, `admin-droits`,
  `ModulesDroits`) : lecture = consulter et prévisualiser, écriture = composer,
  tester, lancer, suspendre.
- Expéditeur : `expediteur_nom/email/reply_to` du registre ; repli
  `MAILING_EXPEDITEUR_REPLI` (secret, ex. `campagnes@mail.withbaikal.io`). Aucun
  des deux → test et lancement refusés avec un message clair.

### Ciblage (`_shared/mailing/segment.ts`, source unique du WHERE)

Toujours : email présent, hors tests, hors supprimés, hors optout, une ligne par
adresse. Puis par population, chaque filtre n'existant que si la colonne existe :

| Population | Vue | Filtres |
|---|---|---|
| prospects | `baikal_prospects` | métiers (presse exclue sauf demande explicite), statuts (refus/désinscrit toujours exclus), département, hors clients (défaut), jamais contactés |
| clients | `baikal_dossiers` | payé / non payé, catégories |
| comptes | `baikal_comptes_pro` | actifs (défaut), catégories |

Option commune : exclure toute adresse déjà écrite par une campagne Baikal.
Le compteur, l'échantillon et le worker appellent la même fonction.

### Rendu (`_shared/mailing/rendu.ts`)

Variables `{{nom}}`, `{{email}}`, `{{commune}}`, `{{site}}` avec repli
`{{nom|Madame, Monsieur}}`, valeurs échappées. Corps enveloppé dans un gabarit
sobre + pied « Se désinscrire » ; version texte dérivée. Jeton de désinscription
= `base64url({s,e}).hmac` (`ADMIN_UNSUBSCRIBE_SECRET`).

## Tableau de bord

Par campagne, lu en direct dans `mail_envoi` du site : ciblés restants, envoyés,
délivrés, ouverts (%), cliqués (%), rebonds, plaintes, désinscrits, erreurs ;
quota du jour. Détail : liste paginée des destinataires et de leur statut.

## Secrets

`ADMIN_SEO_CRON_SECRET` (secret commun des crons admin, + Vault `admin_seo_cron_secret`),
`MAILING_RESEND_WEBHOOK_SECRET` (webhook du compte Resend de Baikal),
`MAILING_EXPEDITEUR_REPLI` (optionnel), `RESEND_API_KEY` (existant),
`ADMIN_UNSUBSCRIBE_SECRET` (existant), et par site les secrets nommés dans le
registre.

## Hors lot 1

Programmation, séquences, A/B d'objet, génération IA du corps, relais des sites
dédiés installé chez pack-vendeur / Majord'home (le passe-plat est livré), retrait
de Partenariats (après vérification réelle et accord d'Eric).

## Vérification

Tests Deno : segment (normalisation), rendu (variables, échappement, jeton),
disjoncteur (quota, seuils), signature Svix. En réel : compteur = nombre de
lignes réservées ; test reçu ; webhook → statut délivré ; clic « Se
désinscrire » → adresse dans `dpe.diag_optout` et exclue du compteur.
