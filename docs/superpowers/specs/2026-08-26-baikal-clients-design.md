# Baikal — module Clients : vue transverse des dossiers clients par site

**Date :** 2026-08-26
**Statut :** design validé en séance avec Eric.
**Références :** spec `2026-08-24-hub-baikal-acces-sites-design.md` (canal
`baikal_reader`, écritures via Edge Functions du projet cible), spec
`2026-08-25-baikal-financier-design.md` (cascade d'attribution,
`admin.ventes`, règle « pas de vue, pas de module »), onglet Dossiers du
`/admin` de Pré-état-daté (modèle fonctionnel).

## 1. Objectif

Reprendre les principes de l'onglet Dossiers du `/admin` de Pré-état-daté et en
faire une vue générique de la console : pour un site donné, tous les clients,
leur position dans le funnel, leur transaction, leur origine, leur abonnement.
Le module remplace à terme l'onglet Dossiers des `/admin` locaux — Baikal est
le back-office unique.

Trois écarts assumés avec le modèle Pré-état-daté :

- la colonne « Bien » disparaît, remplacée par un champ optionnel `libelle`
  que chaque site remplit ou non ;
- le funnel devient paramétrable par site — un SaaS sans funnel n'affiche que
  Payé / non payé ;
- l'abonnement entre au contrat de données (Pré-état-daté n'en a pas, ARPET,
  Majord'home et MonsieurDPE en ont ou en auront).

## 2. Décisions actées

| Décision | Raison |
|---|---|
| **Lecture directe** dans la base de chaque site via `baikal_reader`, jamais d'archive de dossiers dans Baikal | Toujours à jour, et zéro donnée nominative dupliquée dans le schéma `admin` — l'archive Financier a délibérément zéro nominatif, on garde cette ligne. |
| **Écritures via une Edge Function déployée dans le projet cible** (modèle `pv-*`), appelée par Baikal | Décision de la spec accès-sites : `baikal_reader` est en lecture seule, pas de `service_role` étranger dans Baikal. L'administration des comptes se fait depuis Baikal, mais le code qui écrit vit chez le site. |
| **La capacité d'un site se lit à la présence des colonnes** de sa vue | Un site sans abonnement n'expose pas les colonnes `abo_*`, l'UI n'affiche que ce qui existe. Pas de registre de capacités à maintenir en double. |
| **Le funnel est une donnée du registre** (`config.apps.funnel_etapes`) | Les étapes sont du métier par produit ; la console n'en connaît aucune en dur. |
| **« Supprimer » devient « Purger les documents »** | La suppression actuelle côté Pré-état-daté efface aussi les emails. On conserve l'email, la transaction et l'historique d'envois ; on ne supprime que les documents uploadés et les données extraites. |
| **L'abonnement est lu dans la vue du site**, pas dans Stripe | Le site est déjà synchronisé avec Stripe par ses webhooks ; zéro appel API pour afficher une liste. |
| **Fiche = socle générique + extensions par site** | Vue, Emails, Events sont communs ; Documents, Résultat, Chat, Logs IA sont du métier Pré-état-daté, branchés comme composants d'extension (principe `VueSite`). |
| **Pas de vue, pas de module** | Un site qui n'expose pas `baikal_dossiers` n'a pas l'onglet Clients — il n'est pas approximé (règle Financier). |
| **Attribution : même forme et même cascade que le Financier** | Un seul vocabulaire d'origine dans toute la console ; le badge « SEO · google.com » de la liste sort de `admin.canal_vente`. |

## 3. Contrat de données — vues exposées par chaque site

Chaque site publie dans son projet une vue `public.baikal_dossiers`
(`GRANT SELECT TO baikal_reader`), sur le modèle de `pv_ventes_baikal`. Le
contrat a un noyau obligatoire et des blocs optionnels.

### 3.1 `public.baikal_dossiers`

| Bloc | Colonne | Type | Note |
|---|---|---|---|
| Noyau | `dossier_id` | text | identifiant côté site |
| | `email` | text, nullable | |
| | `contact_nom` | text, nullable | |
| | `statut` | text, nullable | slug d'une étape de `funnel_etapes` ; NULL → l'UI dérive Payé/— de `paye_le` (SaaS sans funnel) |
| | `perimetre` | text | `b2c` / `b2b`, vocabulaire Financier |
| | `cree_le`, `paye_le` | timestamptz | `paye_le` nullable |
| | `est_test` | boolean | toggle « Exclure tests » |
| | `supprime_le` | timestamptz, nullable | toggle « Inclure supprimés » |
| Transaction | `montant_ttc`, `devise` | numeric, text | |
| | `stripe_payment_intent_id` | text, nullable | pont vers `admin.ventes` et Stripe |
| Attribution | `attribution` | jsonb | même forme que le Financier (`channel`, `referrer_domaine`, `a_gclid`, `utm_*`, `landing_page`, `porte_entree`) ; bucket dérivé par `admin.canal_vente`, jamais stocké |
| Emails | `emails_envoyes`, `emails_ouverts` | int | compteurs de la liste |
| Abonnement | `abo_statut` | text | vocabulaire Stripe : `trialing`, `active`, `past_due`, `canceled`… |
| | `abo_plan` | text | slug du plan |
| | `abo_montant_mensuel` | numeric | |
| | `abo_prochaine_echeance` | timestamptz | |
| | `abo_resilie_le` | timestamptz, nullable | |
| Optionnels | `libelle` | text, nullable | remplaçant générique de « Bien » |
| | `apporteur` | text, nullable | le « via Antique Immo » de Pré-état-daté |
| | `documents_purges_le` | timestamptz, nullable | badge « documents purgés » dans la fiche |

Les blocs Abonnement et Optionnels peuvent être **absents de la vue** : c'est
ainsi qu'un site déclare ne pas avoir la capacité.

### 3.2 `public.baikal_dossier_emails`

Pour l'onglet Emails de la fiche : `dossier_id`, `envoye_le`, `sujet`,
`statut` (`delivre` / `ouvert` / `bounce`…), `ouvert_le` nullable.

### 3.3 `public.baikal_dossier_events` — optionnelle

Timeline de la fiche : `dossier_id`, `survenu_le`, `type`, `detail` (jsonb).
Un site sans cette vue n'a pas l'onglet Events.

## 4. Registre — `config.apps`

Une colonne nouvelle : `funnel_etapes` jsonb, nullable. Liste ordonnée
d'objets `{slug, libelle, couleur, masquee_par_defaut}`.

- Pré-état-daté : Visiteur (`masquee_par_defaut: true` — c'est le toggle
  « Inclure visiteurs » rendu générique) → Lead → Engagé → Payé.
- Site sans funnel : colonne NULL ; la liste n'affiche que Payé/— dérivé de
  `paye_le`, et le filtre de statut disparaît.

Les filtres de statut de la page se construisent dynamiquement depuis cette
colonne. Les colonnes `env_url` / `env_secret_ref` existantes servent au
lot 2 (appel de l'Edge Function d'écriture du site).

## 5. Lecture — Edge Function `admin-dossiers`

Proxy en lecture sur le modèle `admin-seo` :

- **Droits** identiques à `/seo` et `/finances` : super_admin et admins
  délégués du site, via `_shared/droits.ts` (client caller).
- **Connexion** : `chargerSite()` + `lecteurSite()` de `_shared/sites.ts`
  (postgres-js, `default_transaction_read_only=on`).
- **Actions** :
  - `liste` — recherche ILIKE sur `email`, `contact_nom`, `libelle` ;
    filtres période (Tout / 7 / 30 / 90 j sur `cree_le`), statut, périmètre
    B2C/B2B, `est_test`, `supprime_le`, étapes masquées par défaut ; tri
    (`cree_le` desc par défaut) ; pagination LIMIT/OFFSET + compteur total.
  - `fiche` — un dossier + ses emails (+ events si la vue existe).
- **Tolérance aux blocs optionnels** : l'EF fait `SELECT *` et retourne les
  colonnes présentes ; c'est elle qui porte l'adaptation, le front affiche ce
  qu'il reçoit.
- La vue d'un site absente → réponse explicite « module non disponible pour ce
  site », distincte d'une erreur.

## 6. Page `/clients`

Dans la console, calée sur le site de la colonne de gauche, droits identiques
à `/seo`.

**Liste** — les principes de l'onglet Dossiers de Pré-état-daté :

- recherche plein champ (email, nom, libellé) ;
- filtres : période Tout / 7 / 30 / 90 j, type Tous / B2C / B2B, statuts
  dynamiques depuis `funnel_etapes`, toggles « Inclure visiteurs » (étapes
  masquées par défaut) / « Exclure tests » / « Inclure supprimés » ;
- colonnes : ID court, contact (email + compteurs d'emails + badge d'origine
  issu de la cascade), statut (badge coloré de l'étape), abonnement (statut +
  plan — colonne présente seulement si le site expose le bloc), créé le,
  payé le, type ;
- pagination + compteur (« Page 2 sur 3 · 26–50 / 59 »).

**Fiche** — panneau au clic sur une ligne :

- onglets du socle : **Vue** (contact, transaction — montant, payé le, lien
  Stripe —, abonnement, origine détaillée, apporteur, libellé, badge
  « documents purgés » le cas échéant), **Emails** (historique
  `baikal_dossier_emails`), **Events** (si la vue existe) ;
- **extensions par site** : un registre de composants front par `app_id`
  (principe `VueSite`) ajoute des onglets spécifiques ; Pré-état-daté y
  branchera Documents, Résultat, Chat, Logs IA au lot 3, chacun consommant
  une Edge Function dédiée côté site.

## 7. Écritures — lot 2, Edge Function dans le projet cible

Une EF `pv-admin-dossiers` déployée **dans le projet Pré-état-daté**, appelée
par `admin-dossiers` (URL `env_url`, secret nommé par `env_secret_ref`).
Opérations :

- `renvoyer-email` ;
- `re-extraire` ;
- `purger-documents` — remplace « Supprimer » : suppression du storage et des
  données extraites, pose de `documents_purges_le`, conservation du dossier,
  des emails et de la transaction.

Deux chantiers liés, **hors de ce repo**, à traiter côté Pré-état-daté :

1. corriger le comportement de suppression actuel (qui efface aussi les
   emails) pour le remplacer par la purge documentaire — un prompt prêt à
   coller sera fourni, comme pour les policies `baikal_read` ;
2. aligner la politique de confidentialité : « documents supprimés, données
   de transaction conservées N années au titre de l'obligation comptable ».
   La durée N reste à écrire — même point ouvert que le §11.2 de la spec
   Financier. Lecture courante non juridique : données de facturation
   10 ans (obligation comptable), échanges liés au contrat 5 ans (preuve
   contractuelle) ; à faire valider avant publication.

## 8. Erreurs et états vides

| Situation | Comportement |
|---|---|
| Site sans vue `baikal_dossiers` | message « module non disponible », pas d'onglet actif — jamais une erreur |
| Base du site injoignable | erreur explicite, pas d'état vide trompeur |
| Recherche/filtres sans résultat | état vide explicite, distinct d'une erreur (règle `/seo`) |
| Bloc optionnel absent | la colonne ou la section n'est simplement pas rendue |

## 9. Lots de livraison

| Lot | Contenu | Dépend de |
|---|---|---|
| 1 | Vue `baikal_dossiers` + `baikal_dossier_emails` côté Pré-état-daté, colonne `funnel_etapes`, EF `admin-dossiers`, page `/clients` (liste + fiche socle ; l'abonnement est au contrat mais vide) | policies `baikal_reader` côté PED |
| 2 | Actions : EF `pv-admin-dossiers` (purge documentaire, renvoi d'email, re-extraction) + correction de la sémantique de suppression côté PED | lot 1 |
| 3 | Extensions de fiche PED (Documents, Résultat, Chat, Logs IA) ; autres sites au fil des vues livrées (voirie, puis ARPET / Majord'home / MonsieurDPE avec leur bloc abonnement) | lot 1 |

Le lot 1 est autonome : dès sa livraison, les clients Pré-état-daté se
consultent depuis Baikal.

## 10. Points ouverts — décision d'Eric

1. **Durée de conservation** des données de transaction et des emails après
   purge documentaire (le N du §7) — à écrire, puis à refléter dans les
   politiques de confidentialité des sites.
2. **Droit de purge** : super_admin seulement, ou aussi les admins délégués
   du site ? Recommandation : super_admin seul au lot 2, on élargira si le
   besoin apparaît.
3. **Vocabulaire de la route** : la page s'appelle « Clients » (`/clients`),
   générique ; « Dossiers » reste le mot de Pré-état-daté. À confirmer à
   l'usage.
