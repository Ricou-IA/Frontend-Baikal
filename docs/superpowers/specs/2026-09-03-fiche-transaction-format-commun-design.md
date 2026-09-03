# Baikal — fiche transaction : un format commun à tous les produits

**Date :** 2026-09-03
**Statut :** design validé en séance avec Eric.
**Références :** spec `2026-08-26-baikal-clients-design.md` (module Clients,
contrat `baikal_dossiers`, règle « pas de vue, pas de module »), spec
`2026-08-24-hub-baikal-acces-sites-design.md` (canal `baikal_reader`,
écritures via les Edge Functions du projet cible), onglet Dossiers du
`/admin` de Pré-état-daté (modèle fonctionnel de référence).

## 1. Objectif

Une transaction, quel que soit le produit, se lit toujours de la même façon :
ce qu'est le dossier, ce que le client a fourni, ce que l'outil a produit, ce
qu'on lui a envoyé, ce qu'il nous a dit, ce que l'IA a coûté, la donnée brute,
et le parcours. Huit onglets suffisent à décrire n'importe quel parcours
client.

| # | Onglet | Sens |
|---|---|---|
| 1 | Vue | fiche produit |
| 2 | Documents | entrée (ce que le client fournit) |
| 3 | Résultat | sortie (ce que l'outil produit) |
| 4 | Emails | ce que l'outil a envoyé |
| 5 | Chat | ce que le client a dit dans l'outil |
| 6 | Logs IA | coulisses IA de la fiche |
| 7 | Données | mouchard brut du produit |
| 8 | Events | parcours client |

Aujourd'hui Baikal affiche déjà ces huit onglets pour pack-vendeur, mais par
**deux mécaniques incompatibles** :

- Vue, Emails, Events viennent de vues SQL contractuelles lues en direct par
  `baikal_reader` — c'est agnostique : un site les publie et il est servi ;
- Documents, Résultat, Chat, Logs IA, Données viennent d'un payload JSON sans
  contrat renvoyé par l'EF du site (`admin-dossiers`, action `site-detail`) et
  rendu par du React écrit pour Pré-état-daté
  (`src/components/console/extensions/ped.jsx`, 261 lignes). Les clés lues
  (`documents`, `chat_logs`, `ai_logs`, `charges_discrepancy_pct`,
  `notary_accessed_at`) sont les noms de la base PED. Brancher un deuxième
  produit imposerait de réécrire ce fichier.

Ce chantier supprime la seconde mécanique : les huit onglets deviennent un
contrat unique, lu comme Vue/Emails/Events le sont déjà.

## 2. Décisions actées

| Décision | Raison |
|---|---|
| **Remplacement total** : les 8 onglets sont contractuels, `EXTENSIONS_FICHE` et `extensions/ped.jsx` disparaissent | Une échappatoire par site redevient la norme au premier cas tordu. Un seul rendu = un seul endroit à améliorer, et brancher un produit ne coûte plus de React. |
| **Noyau figé + sections déclarées** | Ce qui sert aux filtres, aux KPI et au Financier doit être normalisé ; le reste (« lot », « surface », « syndic ») appartient au produit et n'a pas à entrer dans le vocabulaire de Baikal. |
| **Tout en vues SQL** ; le relais HTTP ne sert plus qu'à signer un fichier et à exécuter une action | Le chemin SQL sait déjà être agnostique (`to_regclass` + `information_schema`), le relais ne le sera jamais. Un site sans Edge Function garde ses 8 onglets en consultation : il lui manque l'ouverture des fichiers et les boutons. La règle « ajouter un site = publier des vues » est préservée. |
| **Les actions sont déclarées par le site**, via un manifeste servi par son EF **pour un dossier donné** | Le produit est seul à savoir ce qu'il sait faire. Demander le manifeste par dossier évite d'inventer un langage de conditions : PED n'expose « Crédits pro » que si ce dossier est B2B. |
| **Chargement à la demande** : `fiche` renvoie les compteurs, chaque onglet charge son contenu à l'ouverture | À 8 onglets, tout charger d'un coup est inutilement lourd, et ni le chat ni les logs IA n'ont de borne naturelle. |
| **Libellés « Documents » et « Résultat » conservés** à l'écran | Ils parlent, alors que « Entrées / Sorties » serait du jargon. Le contrat, lui, couvre plus large qu'un fichier. |
| **Lecture en direct, aucun archivage** | Règle inchangée du module Clients, d'autant plus importante qu'on lira désormais du chat et des données extraites : rien de nominatif n'entre dans le schéma `admin`. |

## 3. Contrat de données

### 3.1 Principe

Un onglet = une vue optionnelle publiée par le produit, dans son schéma
(`db_schema`) ou dans `public` (projets dédiés), avec
`GRANT SELECT TO baikal_reader`. La règle de capacité déjà en place pour
l'abonnement s'étend aux huit :

> **Pas de vue → pas d'onglet. Pas de colonne → pas de section.**

Détection par `to_regclass` (existence) et `information_schema.columns`
(colonnes présentes). Aucun registre de capacités à tenir à jour ; l'absence
n'est jamais une erreur.

| Onglet | Vue | État |
|---|---|---|
| Vue | `baikal_dossiers` + `baikal_dossier_champs` | existante + à créer |
| Documents | `baikal_dossier_documents` | à créer |
| Résultat | `baikal_dossier_resultats` | à créer |
| Emails | `baikal_dossier_emails` | existante, enrichie |
| Chat | `baikal_dossier_messages` | à créer |
| Logs IA | `baikal_dossier_ia` | à créer |
| Données | `baikal_dossier_donnees` | à créer |
| Events | `baikal_dossier_events` | existante, enrichie |

### 3.2 Motif commun aux vues de liste

Toute vue de liste porte : `dossier_id` (jointure), un horodatage, un
libellé, quelques colonnes propres à sa nature, et une colonne `details`
jsonb optionnelle, dont chaque clé devient sa propre colonne du tableau
(triées par ordre alphabétique, après les colonnes déclarées). C'est ce
motif qui permet à un seul composant de rendre plusieurs onglets.

Seul `dossier_id` est obligatoire dans chaque vue. Toute autre colonne absente
est simplement non rendue.

### 3.3 `baikal_dossier_champs` — les sections déclarées de l'onglet Vue

| Colonne | Type | Note |
|---|---|---|
| `dossier_id` | text | |
| `section` | text | titre du bloc, ex. `BIEN` |
| `ordre_section` | int, null | ordre des blocs |
| `libelle` | text | ex. `Surface` |
| `ordre` | int, null | ordre dans le bloc |
| `valeur` | text, null | valeur brute, non formatée |
| `format` | text, null | `texte` (défaut) `euro` `dollar` `date` `datetime` `pourcent` `nombre` `octets` `booleen` `lien` `mono` |
| `niveau` | text, null | `attention` / `danger` — surligne le champ |

Le site fournit la valeur brute, **Baikal applique son propre formatage** :
c'est ce qui évite que chaque produit invente sa façon d'écrire un montant ou
une date. `niveau` remplace les encarts d'alerte codés en dur : l'avertissement
PED « écart de 20 % entre charges calculées et budget N-1 » devient un champ
de niveau `attention`, sans une ligne de code dédiée.

L'onglet Vue affiche donc le noyau `baikal_dossiers` (contact, transaction,
origine, abonnement — inchangé) puis les sections déclarées, dans l'ordre.

### 3.4 `baikal_dossier_documents` — l'entrée

| Colonne | Type | Note |
|---|---|---|
| `dossier_id` | text | |
| `document_id` | text | identité, utilisée par l'action d'ouverture |
| `libelle` | text | nom affiché |
| `nature` | text, null | `fichier` `formulaire` `audio` `photo` `lien` `texte` |
| `type` | text, null | type métier du produit, affiché tel quel |
| `mime` | text, null | |
| `taille_octets` | bigint, null | |
| `pages` | int, null | |
| `depose_le` | timestamptz, null | |
| `source` | text, null | `client` `admin` `systeme` |
| `statut` | text, null | ex. `recu` `analyse` `rejete` `illisible` |
| `ouvrable` | boolean, null | le site sait signer une URL pour ce document ; absent → déduit de `nature = 'fichier'` et de la présence du relais |
| `details` | jsonb, null | ex. `{"Confiance IA": "87 %"}` |

L'onglet n'est délibérément pas « une liste de fichiers » : un produit dont
l'entrée est un formulaire, un vocal ou un lien entre dans le même onglet.

### 3.5 `baikal_dossier_resultats` — la sortie

| Colonne | Type | Note |
|---|---|---|
| `dossier_id` | text | |
| `resultat_id` | text | identité, utilisée par l'action d'ouverture |
| `libelle` | text | ex. `Pré-état-daté (PDF)` |
| `nature` | text, null | `document` `lien_partage` `rapport` `export` `reponse` |
| `produit_le` | timestamptz, null | |
| `version` | int, null | régénérations successives |
| `statut` | text, null | `genere` `en_cours` `echec` `perime` |
| `url_publique` | text, null | pour une nature `lien_partage`, publique par construction |
| `consulte_le` | timestamptz, null | |
| `telechargements` | int, null | |
| `ouvrable` | boolean, null | |
| `details` | jsonb, null | |

Le « lien de partage notaire » de PED devient un résultat de nature
`lien_partage` : plus de champ spécial dans le socle.

### 3.6 `baikal_dossier_emails` — les envois

Vue existante (`envoye_le`, `sujet`, `statut`, `ouvert_le`), enrichie de
colonnes optionnelles : `destinataire`, `type` (slug du modèle), `erreur`,
`details`.

### 3.7 `baikal_dossier_messages` — le chat

| Colonne | Type | Note |
|---|---|---|
| `dossier_id` | text | |
| `message_id` | text, null | |
| `survenu_le` | timestamptz | |
| `role` | text | `client` `assistant` `agent` (humain) |
| `contenu` | text | |
| `canal` | text, null | `chat_site` `widget` `whatsapp`… |
| `contexte` | text, null | ex. la page où l'échange a eu lieu |
| `details` | jsonb, null | |

PED stocke question et réponse sur une même ligne (`question`, `answer`) :
c'est **sa vue** qui les dégroupe en deux lignes (`UNION ALL`). Le travail
d'adaptation appartient au produit, jamais à Baikal.

### 3.8 `baikal_dossier_ia` — les logs IA

| Colonne | Type | Note |
|---|---|---|
| `dossier_id` | text | |
| `survenu_le` | timestamptz | |
| `operation` | text, null | `prompt_type` chez PED |
| `modele` | text, null | |
| `tokens_entree`, `tokens_sortie`, `tokens_total` | int, null | |
| `cout_usd` | numeric, null | |
| `latence_ms` | int, null | |
| `statut` | text, null | `ok` / `erreur` |
| `erreur` | text, null | ligne affichée en rouge |
| `details` | jsonb, null | |

Le coût total affiché en tête d'onglet est **sommé par Baikal** ; le site n'a
pas à le fournir.

### 3.9 `baikal_dossier_donnees` — le mouchard brut

| Colonne | Type | Note |
|---|---|---|
| `dossier_id` | text | |
| `bloc` | text | identifiant, ex. `extracted_data` |
| `libelle` | text | ex. `Données extraites` |
| `ordre` | int, null | |
| `contenu` | jsonb | rendu en accordéon |
| `maj_le` | timestamptz, null | |

Une ligne par bloc : la vue accepte n'importe quelle structure sans que Baikal
en connaisse la forme.

### 3.10 `baikal_dossier_events` — le parcours

Vue existante (`survenu_le`, `type`, `detail`), enrichie de colonnes
optionnelles : `libelle` (à défaut le `type` brut est affiché) et `acteur`
(`client` / `admin` / `systeme`).

## 4. Edge Function `admin-dossiers`

L'action `site-detail` est supprimée. Trois actions la remplacent, toutes
génériques.

| Action | Entrée | Sortie |
|---|---|---|
| `fiche` | `appId`, `dossierId` | noyau `baikal_dossiers`, champs déclarés groupés en sections, **compteurs par onglet**, capacités (vues présentes), funnel, manifeste d'actions |
| `onglet` | `appId`, `dossierId`, `onglet`, `page`, `parPage` | contenu paginé de l'onglet |
| `fichier` | `appId`, `dossierId`, `cible` (`document`/`resultat`), `id` | `{url, expire_le}` obtenue du site par relais |

Les actions `liste` (page `/clients`) et `site-action` (exécution) sont
conservées telles quelles.

**Table de correspondance, en dur dans l'EF** — le nom de vue ne vient jamais
de la requête, il n'y a donc aucune surface d'injection :

| Onglet | Vue | Tri par défaut |
|---|---|---|
| `documents` | `baikal_dossier_documents` | `depose_le` DESC |
| `resultats` | `baikal_dossier_resultats` | `produit_le` DESC |
| `emails` | `baikal_dossier_emails` | `envoye_le` DESC |
| `chat` | `baikal_dossier_messages` | `survenu_le` ASC (ordre de conversation) |
| `ia` | `baikal_dossier_ia` | `survenu_le` DESC |
| `donnees` | `baikal_dossier_donnees` | `ordre` ASC |
| `events` | `baikal_dossier_events` | `survenu_le` DESC |

Tolérance : si la colonne de tri n'existe pas chez un site, la lecture se fait
sans `ORDER BY` plutôt que d'échouer. Le `SELECT *` reste la règle — l'EF
porte l'adaptation, le front affiche ce qu'il reçoit.

Compteurs : un `count(*)` par vue existante (requête indexée sur `dossier_id`), pour
alimenter les libellés d'onglets (« Documents (3) ») et griser les onglets
vides.

## 5. Manifeste d'actions

Le relais expose une action `manifeste`, appelée **avec le `dossier_id`**.

```json
{ "actions": [
  { "id": "resend-email", "libelle": "Renvoyer un email", "icone": "send",
    "super_admin": false, "confirmation": null,
    "parametres": [ { "id": "emailAction", "type": "choix", "libelle": "Type",
      "options": [ { "valeur": "magic-link-initial", "libelle": "Lien magique initial" } ] } ] },
  { "id": "purge-documents", "libelle": "Purger les documents", "icone": "trash",
    "variante": "danger", "super_admin": true,
    "confirmation": { "titre": "PURGER_DOCUMENTS", "message": "…", "bouton": "PURGER" },
    "parametres": [] }
] }
```

- `icone` : liste fermée mappée sur lucide (`send` `refresh` `coins` `trash`
  `mail` `download` `check` `alert`) — un nom libre donnerait une icône
  manquante.
- `parametres[].type` : quatre types seulement — `choix`, `nombre`
  (`min`/`max`), `texte`, `booleen`. Au-delà, on retombe dans le sur-mesure.
- Manifeste **par dossier** : le site n'expose « Crédits pro » que si ce
  dossier-là est B2B. Aucune règle métier ne remonte dans Baikal.

**Sécurité.** Le flag `super_admin` est une déclaration du site : Baikal
l'applique pour construire l'UI et refuse l'appel sans le rôle, **et** l'EF du
site revérifie l'autorisation — comme aujourd'hui. Le manifeste oriente
l'interface, il ne constitue pas l'autorisation. Le secret partagé
(`X-Baikal-Key`) reste le contrôle d'accès du canal.

Un site sans relais configuré (`env_url`, `env_dossiers_fn`, `env_secret_ref`,
`env_anon_key`) n'a ni manifeste, ni boutons, ni ouverture de fichier — mais
conserve ses huit onglets en consultation.

## 6. Front — 8 onglets, 5 rendus

Les onglets ne diffèrent que par leur forme, pas par leur produit :

| Rendu | Onglets |
|---|---|
| `fiche` | Vue (noyau + sections déclarées) |
| `liste` | Documents, Résultat, Emails, Logs IA |
| `timeline` | Events |
| `conversation` | Chat |
| `blocs` | Données (accordéon JSON) |

Nouveau module `src/components/console/fiche/` :

- `Fiche.jsx` — coquille, onglets, barre d'actions issue du manifeste ;
- `OngletFiche.jsx` — noyau + sections déclarées ;
- `OngletListe.jsx` — tableau générique piloté par une description de
  colonnes, `details` éclaté en colonnes triées alphabétiquement, pagination ;
- `OngletTimeline.jsx`, `OngletConversation.jsx`, `OngletBlocs.jsx` ;
- `colonnes.js` — description des colonnes par onglet (clé, libellé, format,
  largeur) ;
- `formats.jsx` — application de `format` (euro, date, pourcent, lien, mono…),
  réutilisant les formateurs de `badges-clients.jsx`.

Supprimés : `src/components/console/extensions/` et la constante
`EXTENSIONS_FICHE` de `FicheDossier.jsx`.

Ordre canonique des onglets à l'écran : Vue, Documents, Résultat, Emails,
Chat, Logs IA, Données, Events — produit, entrée, sortie, ce qu'on a envoyé,
ce qu'il a dit, les coulisses, le brut, le parcours.

## 7. États vides et erreurs

| Situation | Comportement |
|---|---|
| Vue absente chez le site | onglet non affiché — jamais une erreur |
| Vue présente, zéro ligne | onglet affiché, compteur `0`, état vide explicite |
| Colonne absente | colonne non rendue |
| Relais non configuré | pas de boutons, pas d'ouverture de fichier ; onglets consultables |
| Relais en erreur | message explicite dans la barre d'actions, les onglets restent lisibles |
| Base du site injoignable | erreur explicite, jamais un état vide trompeur |

## 8. Chantier côté Pré-état-daté (hors de ce repo)

Comme pour les policies `baikal_read`, un prompt prêt à coller sera fourni.

1. Publier six vues (`champs`, `documents`, `resultats`, `messages`, `ia`,
   `donnees`) à partir des tables existantes — `chat_logs` dégroupé en deux
   lignes par échange, `extracted_data` / `validated_data` / charges /
   tantièmes en blocs de `donnees`, champs du bien en sections de `champs` —
   plus `GRANT SELECT TO baikal_reader`.
2. Ajouter à `pv-admin-dossiers` les actions `manifeste` (par dossier) et
   `fichier` (signature d'un `document_id` ou `resultat_id`, TTL inchangé).
3. Conserver les actions existantes (`resend-email`, `re-extract`,
   `reset-extractions`, `add-pro-credits`, `purge-documents`) et les déclarer
   dans le manifeste.
4. L'action `detail` peut être retirée une fois la bascule vérifiée.

## 9. Lots

| Lot | Contenu | Dépend de |
|---|---|---|
| 1 | Vues + `manifeste` + `fichier` côté Pré-état-daté | — |
| 2 | Socle Baikal : EF (`fiche` enrichie, `onglet`, `fichier`), refonte du front en 5 rendus, barre d'actions issue du manifeste ; suppression de `ped.jsx`, `EXTENSIONS_FICHE` et `site-detail` en fin de lot, après vérification de parité | lot 1 |
| 3 | Deuxième produit (voirie ou MonsieurDPE) : publication de ce qu'il a — vraisemblablement Documents, Données, Events, sans EF donc sans boutons | lot 2 |

Le lot 3 est le test réel de l'agnosticisme : il doit se faire **sans une
ligne de code dans Baikal**.

## 10. Recette — parité

Critère d'acceptation du lot 2 : pour un même dossier, la fiche Baikal et
l'onglet Dossiers du `/admin` de Pré-état-daté affichent les mêmes valeurs —
nombre et noms de documents, coût IA total et nombre d'appels, nombre
d'échanges de chat, champs financiers (charges, tantièmes), dates de la
timeline. Écart toléré : aucun.

## 11. Points ouverts

1. **Taille de page** des onglets (proposition : 50 lignes, « charger plus »)
   et cas du chat, où l'on veut souvent tout voir d'un coup.
2. **Recherche dans un onglet** (chat ou logs longs) — proposé hors lot.
3. **Colonnes de la liste `/clients`** : faut-il y remonter des compteurs des
   nouveaux onglets ? Proposé hors lot.
