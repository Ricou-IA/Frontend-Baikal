# Baikal /prospect — la base adressable fédérée (lot 1)

- **Date** : 2026-08-27
- **Statut** : validé en brainstorming, prêt pour le plan d'implémentation
- **Auteur** : Eric Pudebat + Claude (session brainstorming superpowers)
- **Suite** : lot 2 `/mailing`, lot 3 copie inter-sites — chacun sa spec

---

## 1. Contexte et problème

### Le déclencheur

Une campagne d'emailing vers les diagnostiqueurs certifiés tourne depuis le
27/08 sur MonsieurDPE (`dpe-campagne-revendication`, 07h00, bras A/B, paliers
20 puis 100 puis 200). Elle est pilotée en SQL, sans aucun écran. On prospecte
à l'aveugle.

### Trois systèmes de prospection coexistent déjà

| Où | Ce qui existe | Tables |
|---|---|---|
| **Pack Vendeur** | `/admin/prospect` (onglets ICP, scrape Apify, SIRENE, couverture par département) et `/admin/mailing` (Envoi / Stats / Campagnes / Segments) | `pv_leads`, `pv_mail_campaigns`, `pv_mail_segments`, `pv_mail_events`, `pv_email_unsubscribes` |
| **Baikal** | `/partenariats` (prospects + campagnes Resend par lots de 50) | `admin.prospects`, `admin.campagnes`, `admin.campagne_envois` |
| **MonsieurDPE** | la campagne diagnostiqueurs | `dpe.diag_optout`, `dpe.envoi_campagne`, `dpe.campagne_a_envoyer()` |

### Le trou

`admin.sync_diagnostiqueurs` recopie `dpe.diag_certifie` vers `admin.prospects`
**chaque nuit à 03h30**. Les mêmes diagnostiqueurs vivent donc des deux côtés,
avec deux listes d'exclusion qui s'ignorent (`dpe.diag_optout` d'un côté, le
statut `desinscrit` de `admin.prospects` de l'autre). Un diagnostiqueur qui
répond STOP à la campagne DPE reste adressable depuis Baikal.

C'est le symptôme « deux écrans, deux nombres » déjà corrigé sur les KPI de
voirie, appliqué cette fois à des personnes réelles. Et il est mesuré, pas
supposé (relevé du 27/08/2026) :

| Ce que compte | Nombre |
|---|---|
| `admin.prospects` — ce que la console annonce | **11 077** |
| Adresses réellement adressables par la campagne | **8 594** |

**Écart : +29 %.** La cause est une divergence de règle, pas un bug : la sync
dédoublonne par adresse de *certifié* (12 824 certifiés, 11 077 adresses
distinctes), alors que la campagne sert une seule adresse par *fiche*
(`min(email)` par slug, 8 595 adresses, dont 8 594 non revendiquées). Deux
règles de choix, deux vérités.

### Ce que l'état des données autorise

Relevé le 27/08/2026 sur les deux projets :

| Table | Constat |
|---|---|
| `admin.prospects` | 11 077 lignes, **toutes au statut `nouveau`**, toutes de source `diag_certifie` |
| `admin.campagnes` / `campagne_envois` | **0 et 0** — aucune campagne n'est jamais partie depuis Baikal |
| `dpe.diag_optout` | 0 |

**Il n'y a donc aucun état de prospection à préserver côté Baikal.** La reprise
de données que je redoutais n'existe pas : `admin.prospects` est une pure
recopie sans valeur ajoutée, et les deux tables de campagne sont vides. Ce lot
supprime, il ne migre pas.

### Ce que ce lot construit

Une base adressable unique **par site**, visible et administrable depuis la
console. Pas de recopie, pas de seconde vérité.

---

## 2. Le modèle : fédéré, pas centralisé

**Baikal ne possède aucun prospect.** Chaque site reste maître de sa base ;
Baikal la lit dans une vue contractuelle et lui donne des ordres par son Edge
Function d'administration. C'est le décalque exact du module Clients
(`baikal_dossiers` + `env_dossiers_fn`), déjà en production et testé.

Conséquence, et c'est la règle d'or du hub : **ajouter un site à `/prospect` =
publier une vue + déclarer une EF. Aucun code Baikal.**

### Ce que Baikal possède quand même

Une seule chose : la **taxonomie** (`admin.metier`). Ce n'est pas de la donnée
de prospection, c'est le vocabulaire commun sans lequel deux sites ne sont pas
comparables. Aucune adresse, aucun nom.

### Opt-out : par marque, et c'est un choix vérifié

Un STOP chez MonsieurDPE n'engage pas Pack Vendeur. Ce choix ne tient que
parce que les domaines expéditeurs sont distincts — `eric@monsieurdpe.fr` et
`noreply@pre-etat-date.ai`, paramétrés dans `config.apps.expediteur_email` —
donc les réputations DKIM/DMARC le sont aussi.

**Corollaire pour le lot 3** : toute copie inter-sites devra être filtrée sur
les opt-out de la source. Recopier une adresse grillée dans un outil propre
annulerait le bénéfice de la séparation.

---

## 3. Annuaire n'est pas état de prospection

C'est la décision structurante de ce lot.

Les populations de MonsieurDPE sont des **annuaires publics réimportés chaque
nuit** :

| Cron | Quand | Alimente |
|---|---|---|
| `dpe-annuaire-diag-sync` | 02h30 | `dpe.diag_certifie` / `dpe.diag_site` (CSV du ministère) |
| `dpe-annuaire-diag-geocode` | 02h50 | géocodage des fiches |
| `dpe-annuaire-rge-sync` | 03h10/25/40/55 | `dpe.entreprise_rge` (~57 000 lignes) |
| `dpe-annuaire-rge-recap` | 08h10 le 3 du mois | récapitulatif mensuel |

Ces crons **restent tous actifs** : ce sont eux la source de vérité, et c'est
justement parce que Baikal lira en direct qu'on peut couper la recopie de
03h30.

Y stocker un statut de prospection le ferait écraser au prochain passage.
Chaque site tient donc une **table d'état séparée**, jointe à son annuaire dans
la vue :

```sql
dpe.prospect_etat (cle, statut, note, maj_le, maj_par)
```

`maj_par` porte l'identifiant de l'utilisateur Baikal qui a agi, transmis par
le canal : sans lui, on ne peut pas dire qui a passé un prospect en `refus`.

L'annuaire dit **qui est joignable**, l'état dit **où on en est**. Le cron ne
touche que le premier. C'est déjà exactement le pattern de `dpe.diag_optout` et
`dpe.envoi_campagne`.

### La règle ne vaut que pour les annuaires réimportés

Elle s'applique à MonsieurDPE, dont les populations viennent de fichiers
externes. **Elle ne s'applique pas à Pack Vendeur** : `pack_vendeur.leads` est
une table propriétaire, que rien ne réécrit dans le dos. Elle porte déjà
`status`, `notes`, `contacted_at`, `email_step` et `last_email_sent_at`, et
`pack_vendeur.lead_interactions` (`lead_id, type, content, metadata,
created_by`) tient l'historique des échanges.

**Pack Vendeur n'a donc pas de table d'état à créer** — sa vue se construit sur
l'existant. Créer une table parallèle y dupliquerait un état déjà tenu, ce qui
est précisément le défaut qu'on corrige.

**La clé est l'email normalisé** (`lower(trim(...))`) : c'est ce qui a un sens
de bout en bout — une personne, une boîte — et c'est déjà la clé de
`dpe.diag_optout`. Un cabinet multi-sites ne doit pas pouvoir se faire
réécrire par une porte de derrière.

---

## 4. Le contrat de la vue

Chaque site publie `<db_schema>.baikal_prospects` (ou `public.baikal_prospects`
pour un projet dédié — même repli que `baikal_dossiers`).

### Colonnes obligatoires

| Colonne | Type | Rôle |
|---|---|---|
| `prospect_id` | text | identifiant stable chez le site (slug, siret, uuid) |
| `email` | text | l'adresse, normalisée en minuscules — **jamais nulle** |
| `metier` | text | slug de la taxonomie partagée (section 5) |
| `provenance` | text | `annuaire_public` / `acquisition_propre` / `import` / `scrape` |
| `nom_affiche` | text | raison sociale, ou nom de la personne |
| `commune` | text | |
| `code_postal` | text | le département s'en dérive |
| `statut` | text | funnel partagé (section 5) |
| `dernier_contact_le` | timestamptz | null si jamais contacté |
| `cree_le` | timestamptz | entrée dans la base |
| `est_test` | boolean | adresse interne, exclue par défaut |

`est_test` reprend la colonne que `public.baikal_dossiers` porte déjà chez Pack
Vendeur (`is_test`, ou adresse matchant `pudebat|confer-sas|test|demo|
example\.com`). Sans elle, tes propres adresses gonflent les compteurs de
prospects — c'est la règle déjà posée pour les KPI par site, appliquée ici.
Baikal les exclut par défaut et offre une case pour les revoir.

### Colonnes optionnelles

`specialite` (text[]) · `siret` (char(14)) · `telephone` · `site_web` ·
`nb_contacts` (int) · `note` · `client_depuis` (date)

### La vue n'expose que l'adressable

`email` est obligatoire et non nulle : **la vue filtre sur les lignes qui ont
une adresse valide**. Une entreprise RGE sans email existe dans l'annuaire mais
n'entre pas dans `/prospect` — elle n'est pas adressable, et la faire figurer
dans une base dont le seul usage est d'écrire fausserait tous les compteurs.

Le coût de cette règle est mesuré et négligeable : sur 57 258 entreprises RGE,
**57 244 ont une adresse valide — 14 sont écartées**. Côté diagnostiqueurs,
les 8 744 fiches sont toutes joignables. L'enrichissement des lignes sans
adresse n'est donc pas un sujet ; s'il le devenait, ce serait un écran
distinct, chez le site qui tient l'annuaire.

### `client_depuis` — le pont vers `/clients`

Un prospect converti n'a pas de statut à lui : **il devient un client**, et
c'est `/clients` qui le suit à partir de là. `client_depuis` est donc le seul
marqueur de conversion, et il est renseigné par le site :

| Site | D'où vient `client_depuis` | Aujourd'hui |
|---|---|---|
| MonsieurDPE, diagnostiqueurs | fiche revendiquée — `dpe.diag_fiche_edito.profil_id` non nul (exactement le critère d'exclusion de `dpe.campagne_a_envoyer`) | 1 |
| MonsieurDPE, RGE | `dpe.abonnement` par `siret`, et `dpe.entreprise_rge.abonne_jusqu_a` | 1 abonnement, 0 `abonne_jusqu_a` |
| Pack Vendeur | adresse présente dans `pack_vendeur.pro_accounts`, ou portant un dossier payé (`dossiers.paid_at`) | 5 comptes pro, 665 dossiers |

Deux conséquences, et elles ne sont pas cosmétiques :

- **On ne prospecte pas un client.** Le ciblage exclut par défaut les lignes
  qui portent un `client_depuis`. Écrire « reprenez votre fiche » à quelqu'un
  qui l'a déjà reprise est la façon la plus rapide de perdre sa crédibilité —
  et c'est déjà pour cette raison que `dpe.campagne_a_envoyer` écarte les
  fiches revendiquées.
- **Le client reste visible, avec un badge.** Il ne disparaît pas de la liste :
  c'est la même règle que le badge `Payé` devant l'état d'après-vente sur
  `/clients`. Un converti qu'on efface, c'est un taux de conversion qu'on ne
  peut plus lire.

Un site qui n'expose pas la colonne n'a simplement pas de marqueur de
conversion : rien n'est exclu, rien n'est badgé.

### Règle de capacité

Identique au module Clients, et non négociable : **la capacité d'un site se lit
à la présence de la vue et des colonnes.**

- Pas de vue → pas de module pour ce site (`disponible: false`, **jamais** une
  erreur).
- Pas de colonne `telephone` → pas de colonne téléphone affichée.
- Pas de colonne `siret` → pas de SIRET, et le lot 3 dédoublonnera à l'email.

### Ce que les vues exposent concrètement

**MonsieurDPE** — une seule vue qui unifie deux annuaires :

- `dpe.diag_certifie` + `dpe.diag_site` → métier `diagnostiqueur`, provenance
  `annuaire_public`. Email = `min(email)` des certifiés de la fiche, **la même
  règle que `dpe.revendication_ouvrir` et `dpe.campagne_a_envoyer`** : les
  trois doivent rester d'accord, sinon la console montre une adresse et la
  campagne en sert une autre.
- `dpe.entreprise_rge` → métier `entreprise_rge`, provenance `annuaire_public`,
  `specialite` = la colonne `domaines`, `siret` = la clé primaire.
- Dédoublonnage par email entre les deux : un diagnostiqueur peut aussi être
  RGE. En cas de collision, la ligne diagnostiqueur l'emporte (c'est la
  population travaillée aujourd'hui).
- `dpe.lead` (4 lignes : `email, funnel, source, consenti_le`) → métier
  `autre`, provenance `acquisition_propre`. Population marginale aujourd'hui,
  mais c'est le seul endroit où un consentement explicite est horodaté : elle
  a plus de valeur juridique que les 57 000 autres, qui reposent sur
  l'intérêt légitime B2B.
- `statut` : joint sur `dpe.prospect_etat`, `desinscrit` forcé si l'adresse est
  dans `dpe.diag_optout`.
- `dernier_contact_le` : `max(envoye_le)` dans `dpe.envoi_campagne` pour les
  diagnostiqueurs, dans `dpe.envoi_recap` pour les RGE, et `nb_contacts` le
  compte correspondant.

**Les 57 244 entreprises RGE n'ont jamais été contactées** : `dpe.envoi_recap`
est vide. C'est le plus gros gisement adressable du parc, entièrement intact —
et donc celui où une erreur de cadence coûterait le plus cher.

**Pack Vendeur** — vue sur `pv_leads` (26 068 lignes, 25 531 adressables) :

- `metier` dérivé de `category` : `notaire` (300), `agence_immo` (454) et
  `mandataire_immo` (25 187) vers `agent_immo`, `diy` (127) vers `autre`.
  **La base ne contient aucun syndic** — l'onglet ICP existe côté Pack Vendeur
  mais le segment n'a jamais été scrapé.
- `specialite` : `agence` ou `mandataire` selon `category`.
- `provenance` : `scrape` pour `apify-%` (837) **et `franchise-%`** (25 104 :
  iad, safti, capifrance, optimhome, efficity), `acquisition_propre` pour
  `chatbot`, `modele-pdf-guide` et `pre-etat-date-gratuit` (127), `import`
  pour tout le reste. La règle naïve « tout ce qui n'est pas `apify-%` est de
  l'inbound » classerait 25 104 leads scrapés en acquisition propre : elle est
  fausse.
- `statut` : `new` (13 846) vers `nouveau`, `contacted` (12 222) vers
  `contacte`, et `relance` quand `email_step > 1` (122 lignes). Ce sont les
  deux seules valeurs présentes en base ; `responded_at` n'est alimenté sur
  aucune ligne, donc `repondu` et `refus` restent inutilisés côté PV.
  `desinscrit` forcé si l'adresse est dans `pv_email_unsubscribes` (39).
- `dernier_contact_le` = `last_email_sent_at` et `nb_contacts` = `email_step`,
  deux colonnes qui existent déjà sur `pv_leads` : inutile de joindre
  `pv_email_logs`, qui mêle par ailleurs prospection (`lead_id`) et
  transactionnel client (`dossier_id`).
- `note` : `pv_leads.notes`, et l'historique dans
  `pack_vendeur.lead_interactions`.
- `siret` : `siret_siege`, présent sur 334 lignes seulement.
- `est_test` : même expression que `public.baikal_dossiers`.

La vue va dans `public`, à côté de `baikal_dossiers` qui y est déjà : chez Pack
Vendeur les tables vivent dans le schéma `pack_vendeur` et `public` ne porte
que des vues d'exposition.

**Les autres sites** (voirie, duerp, cosette) ne publient rien : ils
apparaissent indisponibles, pas en erreur.

### Ce que ça donne dès le lot 1

Comme `dernier_contact_le` se lit dans `dpe.envoi_campagne`, la console montre
**dès ce lot** qui a reçu la campagne diagnostiqueurs et quand — sans attendre
le lot 2. C'est le besoin qui a déclenché le chantier.

---

## 5. Taxonomie : métier, spécialité, provenance, statut

### `admin.metier` — fermée, partagée, mais en base

```sql
admin.metier (slug text primary key, libelle text, couleur text, ordre int)
```

Fermée et partagée pour que deux sites soient comparables (et copiables au lot
3). **En base et non en dur** pour qu'ajouter « courtier » soit une ligne, pas
un déploiement — administrable depuis `/sites`, comme le reste du paramétrage
par site.

| slug | libellé |
|---|---|
| `notaire` | Notaires |
| `agent_immo` | Agent immobilier |
| `syndic` | Syndic |
| `diagnostiqueur` | Diagnostiqueur immobilier |
| `entreprise_rge` | Entreprise RGE |
| `autre` | Autre |

`syndic` est un métier à part et non une spécialité d'agent immobilier : un
syndic de copropriété n'exerce pas le métier d'agent immobilier, et le segment
est prévu côté Pack Vendeur (l'onglet ICP existe) même si aucun syndic n'a
encore été scrapé. Le slug existe donc sans population — c'est voulu.

Un slug remonté par une vue et absent de la table s'affiche **en gris avec sa
valeur brute** plutôt que de casser la page, et `/sites` signale l'écart.

### `specialite` — libre, propre au métier, multiple

Un tableau, parce qu'une entreprise RGE cumule réellement plusieurs domaines
(isolation **et** pompe à chaleur). Affichage « Isolation +2 », filtre
« contient ».

| métier | spécialités |
|---|---|
| `agent_immo` | `independant`, `mandataire`, `agence` |
| `entreprise_rge` | les `domaines` de `dpe.entreprise_rge` |

### `provenance` — d'où vient la ligne

`annuaire_public` · `acquisition_propre` · `import` · `scrape`

**« Acquisition propre » est une provenance, pas un métier.** Quelqu'un qui
laisse son adresse sur un de nos outils *est* peut-être notaire ; le classer en
« acquisition propre » le ferait disparaître d'un ciblage « tous les notaires ».
Le chip « Acquisition propre » existe quand même dans la barre de filtres, à
côté des chips métier — visuellement identique, sémantiquement juste. Un lead
inbound qualifié notaire apparaît alors dans les deux filtres, ce qui est la
vérité.

### `statut` — le funnel partagé

Vocabulaire repris tel quel d'`admin.prospects`, déjà éprouvé à l'usage et qui
rend la migration triviale :

`nouveau` · `contacte` · `relance` · `repondu` · `refus` · `desinscrit`

**Le funnel s'arrête avant la conversion : un prospect converti devient un
client.** Il n'y a donc pas d'état « partenaire » ou « converti » — cet état-là
vit dans `/clients`, qui a déjà son propre funnel par site
(`config.apps.funnel_etapes`). Deux funnels qui se recouvrent, ce sont deux
écrans qui annoncent deux nombres.

`desinscrit` est un état **terminal** : la vue le force dès que l'adresse
figure dans la table d'opt-out du site, quel que soit l'état stocké.

---

## 6. La page `/prospect`

### Structure

**Une seule liste, pas d'onglets.** Le fouillis de `/admin/prospect` sur Pack
Vendeur vient d'avoir empilé des découpages (ICP, inbound/outbound, scrape,
couverture) là où un filtre suffisait. Ici :

1. **KPI** : adressables (le total) · `nouveau` · contactés (tout ce qui a un
   `dernier_contact_le`) · convertis (`client_depuis` renseigné) ·
   `desinscrit`
2. **Chips métier** avec compteurs — c'est l'axe de classement de premier ordre
3. **Filtres** : statut, provenance, spécialité, département, « a un
   téléphone », recherche plein texte
4. **Table** : Nom · Métier · Spécialité · Commune · Statut · Dernier contact
5. **Fiche latérale** au clic : coordonnées, historique de contact, note,
   actions

La page hérite du `ConsoleLayout` et du sélecteur de site global (`useApp`),
comme Clients et Partenariats.

### Volume

Volumes adressables réels au 27/08/2026 :

| Site | Population | Lignes |
|---|---|---|
| MonsieurDPE | entreprises RGE | 57 244 |
| MonsieurDPE | diagnostiqueurs (adresses distinctes) | 8 594 |
| Pack Vendeur | leads | 25 531 |
| | **total** | **~91 000** |

**Pagination et compteurs côté serveur, sans exception** : pas de chargement
complet, pas de compteur calculé côté client, pas de tri en mémoire. Les chips
métier lisent des agrégats renvoyés par l'EF, pas la page courante.

La contrainte est plus dure pour Pack Vendeur que pour MonsieurDPE : DPE
partage le projet Supabase de Baikal (`odspcxgafcqxjzrarsqf`), donc sa vue se
lit en SQL local, tandis que Pack Vendeur est un projet dédié
(`ycmavnmtyvodqawvwrrd`) lu à distance par le canal `_shared/sites.ts`.

### Ce qui n'est PAS sur cette page

Les outils d'acquisition — scrape Apify, recherche SIRENE, historique des runs,
matrice de couverture. Ils restent chez le site qui les opère. C'est la moitié
de ce qui rendait la page de Pack Vendeur illisible : elle était à la fois le
référentiel et l'usine.

---

## 7. Les actions — écriture complète par le canal du site

Toutes les écritures passent par l'EF d'administration du site
(`env_url` + `env_prospects_fn` + `env_anon_key` publique pour franchir
`verify_jwt` + en-tête `X-Baikal-Key` porté par `env_secret_ref`). **Jamais
d'écriture directe de Baikal dans le schéma d'un site.**

| Action | Effet chez le site |
|---|---|
| `statut` | met à jour `prospect_etat.statut` |
| `note` | met à jour `prospect_etat.note` |
| `desinscrire` | insère dans la table d'opt-out du site |
| `creer` | insère un prospect saisi à la main |
| `importer` | import CSV par lots |
| `supprimer` | retire un prospect créé à la main |

`env_prospects_fn` vaut NULL par défaut : **pas d'EF déclarée, pas de boutons,
pas d'actions**, interrupteur ouvert, comme `env_dossiers_fn` pour les Clients.

### Deux règles qui ne sont pas négociables

**Un import n'écrase jamais un état existant.** Clé = email normalisé,
`insert ... on conflict do nothing` sur l'état — c'est déjà ce que fait
`admin.sync_diagnostiqueurs`. Une ligne déjà connue est comptée en doublon et
rapportée comme telle, pas réécrite. Sans cette règle, un CSV importé par
mégarde efface des statuts et des refus durement gagnés.

**`supprimer` ne vaut que pour un prospect créé à la main.** On ne supprime pas
une ligne d'annuaire public : elle reviendrait au prochain cron, et le geste
donnerait une fausse impression d'effacement. Pour ne plus adresser quelqu'un,
c'est `desinscrire` — qui, lui, est définitif et respecté par la campagne.

---

## 8. Ce qui bouge, repo par repo

### Frontend-Baikal

| Objet | Travail |
|---|---|
| `admin.metier` | table + amorce des six métiers + édition depuis `/sites` |
| `config.apps.env_prospects_fn` | nouvelle colonne (NULL = pas d'actions) |
| EF `admin-prospects` | liste paginée, agrégats, fiche, relais des actions — décalque de `admin-dossiers` (`_shared/sites.ts` en lecture, `relais.ts` en écriture) |
| `src/pages/Prospects.jsx` | la page |
| `src/pages/Partenariats.jsx` | **supprimée** |
| `admin.sync_diagnostiqueurs` | **supprimée**, avec le cron `admin-sync-diag-prospects` (03h30) |
| `admin.prospects` | **supprimée sans reprise** |
| `admin.campagnes`, `admin.campagne_envois` | **supprimées** (vides) |

### Pas de migration de données : il n'y a rien à reprendre

Le relevé du 27/08 le tranche : les 11 077 lignes d'`admin.prospects` sont
toutes au statut `nouveau` et toutes de source `diag_certifie`. Aucun statut
travaillé, aucun désinscrit, aucune note. La table est une recopie intégrale
de `dpe.diag_certifie`, que `dpe.baikal_prospects` relira en direct et mieux
(8 594 adresses réellement adressables au lieu de 11 077 gonflées).

`admin.campagnes` et `admin.campagne_envois` sont vides : aucune campagne
n'est jamais partie depuis Baikal. Rien à préserver pour le lot 2, qui
repartira d'un schéma dessiné pour l'usage réel plutôt que d'hériter de tables
mortes.

**La suppression est donc un `drop`, pas un transfert.** C'est une opération
destructive : elle est isolée en fin de plan, après que `/prospect` ait été
vérifiée en conditions réelles, et jamais avant.

### DPE

| Objet | Travail |
|---|---|
| `dpe.prospect_etat` | la table d'état |
| `dpe.baikal_prospects` | la vue (diagnostiqueurs + RGE, jointe à l'état et à `diag_optout`) |
| EF d'administration | les six actions, protégées par `X-Baikal-Key` |

### Pack Vendeur

| Objet | Travail |
|---|---|
| vue `public.baikal_prospects` | sur `pack_vendeur.leads`, jointe à `email_unsubscribes`, `pro_accounts` et `dossiers` |
| `pv-admin-dossiers` | les six actions ajoutées au canal existant — elles écrivent dans `leads` et `lead_interactions`, **aucune table nouvelle** |

Rien ne change pour `/admin/prospect` et `/admin/mailing` de Pack Vendeur dans
ce lot : ils continuent de tourner. Leur sort se décidera au lot 2.

---

## 9. Vérification

Pas de suite de tests frontend sur Baikal ; les EF ont des tests Deno
(`canal.test.ts`, `filtres.test.ts`, `relais.test.ts` pour `admin-dossiers`) —
`admin-prospects` suit le même standard pour ses filtres et son relais.

Vérifications manuelles à faire passer :

1. **Capacité** : sélectionner voirie, le module est indisponible, message
   clair, aucune erreur en console.
2. **Volume** : MonsieurDPE, la liste s'ouvre en moins de 2 s, les compteurs
   des chips sont cohérents avec le total, la pagination ne recharge pas tout.
3. **Parité avec la campagne** : un diagnostiqueur déjà servi par
   `dpe-campagne-revendication` affiche `dernier_contact_le` égal à son
   `envoye_le` dans `dpe.envoi_campagne`. Chiffre à chiffre.
4. **Opt-out** : une adresse dans `dpe.diag_optout` ressort `desinscrit` dans
   la console, même si `prospect_etat` dit autre chose.
5. **Import non destructif** : importer un CSV contenant une adresse déjà en
   `refus`, elle est rapportée en doublon, statut inchangé.
6. **Avant suppression** : re-vérifier que `admin.prospects` ne contient
   toujours aucun statut autre que `nouveau` et que les deux tables de
   campagne sont toujours vides. Le relevé date du 27/08 ; un `drop` ne se
   fait pas sur une mesure périmée.
7. **Colonne absente** : retirer `telephone` de la vue Pack Vendeur, la colonne
   disparaît de la table sans casser la page.

---

## 10. Hors périmètre

- **Le mailing** (lot 2) : envoi, segments, modèles, statistiques d'ouverture
  et de clic, suivi des paliers et des bras A/B de la campagne DPE.
- **La copie inter-sites** (lot 3) : c'est la valeur stratégique du chantier,
  mais elle suppose un réceptacle chez chaque site cible et une règle de
  dédoublonnage inter-bases (SIRET prioritaire, email en repli).
- **Les campagnes clients** de Pre-etat-date (transactionnel) : hors sujet, ce
  module ne traite que la prospection.
- **La refonte de `/admin/prospect` et `/admin/mailing` de Pack Vendeur** : ils
  restent en place.
- **Les outils d'acquisition** (scrape, SIRENE, couverture) : ils restent chez
  les sites.
- **La qualification en masse** des leads inbound (leur attribuer un métier).

---

## 11. Récapitulatif des décisions

| # | Question | Décision |
|---|---|---|
| 1 | Rôle de Baikal | Fédéré : chaque site maître de sa base, Baikal lit et administre à distance |
| 2 | Opt-out | Par marque — domaines expéditeurs distincts, vérifié |
| 3 | `admin.prospects` | Supprimée sans reprise (11 077 lignes, toutes `nouveau`) ; cron 03h30 et `/partenariats` supprimés |
| 4 | Découpage | Lot 1 socle `/prospect`, lot 2 `/mailing`, lot 3 copie inter-sites |
| 5 | Périmètre de la page | Tout le vivier adressable, une seule liste, état de contact en colonne et filtre |
| 6 | Métiers | Taxonomie fermée partagée, stockée en base (`admin.metier`) |
| 7 | Spécialité | Colonne supplémentaire, tableau, libre par métier |
| 8 | « Acquisition propre » | Provenance et non métier, avec un chip dédié |
| 9 | Syndic | Métier à part entière |
| 10 | Écriture | Complète (statut, note, désinscription, création, import, suppression) par le canal du site |
| 11 | SIRET | Non imposé, pris s'il existe ; clé prioritaire de dédoublonnage au lot 3 |
| 12 | `admin.campagnes` | Supprimée : vide, aucune campagne n'est jamais partie de Baikal |
| 13 | Conversion | Pas d'état « partenaire » : un prospect converti devient un client. `client_depuis` est le seul marqueur, il exclut du ciblage et badge la ligne |
