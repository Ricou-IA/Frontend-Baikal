# Mailing — lot 2 : entonnoir commun, éditeur assisté, statistiques, campagnes continues (2026-10-14)

Suite de `2026-10-13-baikal-mailing-design.md` (lot 1 : campagnes ponctuelles,
worker, webhook Resend, désinscription — en production, testé par Eric le 13/10).

## Retour d'Eric sur le lot 1 (13/10)

Le circuit marche, le visuel du mail est « top ». À reprendre : site pilote
(pré-état-daté, le plus complet, plutôt que MonsieurDPE), lenteur des filtres
(les vues), ciblage par catégories propres à chaque site (illisible : il faut
un entonnoir commun qui dit l'intention), présentation, zone de saisie (pas de
HTML visible : l'outil est pour des utilisateurs, pas des codeurs). À ajouter :
le tableau de bord des statistiques de TOUS les mails du site, comme le /admin
de pré-état-daté. Et « lancer des campagnes automatiques sur les prospects ».

## Décisions (Eric, 14/10/2026)

| # | Décision |
|---|---|
| 1 | **Entonnoir commun à 6 étapes**, une seule par adresse (la plus avancée) : `a_conquerir` (jamais interagi : annuaire, import, scrape) → `lead` (a laissé son email / consommé le gratuit) → `engage` (a commencé sans payer : compte, dossier, panier) → `client` (a payé au moins une fois) → `recurrent` (abonnement actif ou achats répétés) → `perdu` (abonnement résilié ou client inactif). Chaque étape = une intention de mail : prospecter, activer, convertir, fidéliser, retenir, réactiver. |
| 2 | Le **profil** (particulier, pro, métier…) reste un second axe : ciblage = étape × profil. |
| 3 | **Éditeur sans HTML visible** : un champ façon traitement de texte (gras, italique, lien, bouton d'action, liste, variables insérées comme étiquettes), et une ligne d'intention assistée par IA (« Rédiger », « Plus court », « Plus chaleureux », « Reformuler »). Pas de blocs, pas d'assistant multi-étapes : « pas d'usine à gaz ». |
| 4 | **Statistiques de tous les mails du site** (automatiques compris), une ligne par type, colonnes du /admin de PV : envois, délivrés, ouverts, cliqués, bounce, désabos, spam, dernier envoi, sur une période. Les campagnes Baikal sont un groupe du même tableau. |
| 5 | **Campagnes continues** au lot 2 (une campagne qui ne finit pas : chaque nouvel entrant de la cible la reçoit, avec un plafond par jour propre à la campagne). **Séquences** multi-touches avec arrêt à la conversion : lot 3. |
| 6 | Site pilote : **pré-état-daté** (base dédiée, relais HTTP). |

## Contrats côté site

### `docs/contrats/audience-v1.sql` (forme) — vue `baikal_audience`

Une ligne par adresse joignable du site, toutes origines confondues.

| Colonne | Type | Obligatoire | Sens |
|---|---|---|---|
| `email` | text | oui | normalisé (minuscules, sans espaces), unique dans la vue |
| `etape` | text | oui | une des 6 étapes communes |
| `etape_depuis` | timestamptz | oui | entrée dans l'étape (sert aux séquences du lot 3 et au tri) |
| `profil` | text | oui | slug du profil ; libellé lu dans `config.apps.categories_client`, à défaut `admin.metier`, à défaut le slug |
| `nom` | text | non | valeur de `{{nom}}` |
| `commune` | text | non | valeur de `{{commune}}` |
| `code_postal` | text | non | filtre département |
| `est_test` | boolean | non | exclu de tout envoi |

Règles : l'opt-out n'est PAS filtré dans la vue (il est dans
`baikal_mail_optout`, le module mailing-v1 l'applique). Une adresse = une
étape, la plus avancée. La vue peut être matérialisée par le site (rafraîchie
au moins chaque heure) : c'est la réponse à la lenteur, la console ne relit
plus des vues de liste lourdes à chaque clic. Elle se dérive des vues de liste
existantes quand elles existent (règle « donnée partagée = dérivée »).

### `docs/contrats/mail-stats-v1.sql` (forme) — vue `baikal_mail_stats`

Agrégée, sans donnée nominative : une ligne par jour et par type de mail.

| Colonne | Type | Sens |
|---|---|---|
| `jour` | date | jour d'envoi (fuseau du site) |
| `type` | text | identifiant stable du type (`magic_link`, `relance_panier_j1`…) |
| `groupe` | text | regroupement affiché (« Activation funnel B2C »…) |
| `libelle` | text | libellé humain |
| `envois`, `delivres`, `ouverts`, `cliques`, `rebonds`, `desinscrits`, `plaintes` | int | compteurs des mails ENVOYÉS ce jour-là |

Les envois des campagnes Baikal (`mail_envoi`) n'y figurent pas : Baikal les
ajoute lui-même au tableau (groupe « Campagnes Baikal »), pour ne jamais les
compter deux fois.

### Module `mailing-v1` chez pré-état-daté

Installé tel quel (annexe base dédiée comprise) ; adaptations : opt-out =
`email_unsubscribes` ∪ `prospect_etat` refus/désinscrit ∪ ce que le journal a
appris ; `mail_desinscrire` écrit dans `email_unsubscribes` (+ `prospect_etat`).
Relais : EF `pv-admin-mailing-relais` (passe-plat `mailing-relais-v1.ts`),
`config.apps.env_mailing_fn`.

## Côté Baikal

- **Ciblage** : population `audience` (vue `baikal_audience`) ; critères
  `etapes[]`, `profils[]`, `departement`, `exclureDejaEcrits`. Les populations
  prospects/clients/comptes du lot 1 restent en repli pour un site sans
  `baikal_audience` (MonsieurDPE tant qu'il ne l'a pas publiée).
  `segment.ts` reste la seule source du WHERE.
- **Entonnoir** : action `entonnoir` = compte par étape et par profil, une
  seule requête ; affiché comme 6 barres cliquables (cliquer = cibler).
- **Campagne continue** : `admin.mail_campagnes.continue boolean`,
  `plafond_jour int` (par campagne, en plus du plafond du site),
  `attente_jusqu_au` (une campagne continue sans nouvel entrant ne
  re-interroge le site qu'une heure plus tard). Une campagne continue n'est
  jamais `terminee` : elle se suspend.
- **Rédaction assistée** : action `rediger` {intention, brief, ton, consigne,
  objet, corps} → {objet, corps_html}. Modèle : secret `ADMIN_MAILING_MODELE`,
  sinon `gemini-3.8-flash` (comme le rapport). Sortie HTML restreinte (p,
  strong, em, a, ul/li, br, bouton = `a[data-bouton]`), nettoyée côté serveur
  par liste blanche ; le corps enregistré est toujours nettoyé.
- **Statistiques** : action `stats` {jours} = `baikal_mail_stats` du site sur
  la période + campagnes Baikal tirées de `mail_envoi`, par groupe et type.

## Console

Deux onglets : **Campagnes** et **Statistiques**.

- Liste des campagnes : tuiles du site en tête, tableau.
- Éditeur en trois cartes verticales, aperçu à droite :
  1. **Qui** : l'entonnoir (6 étapes, nombre par étape, clic = cibler), puis
     les profils (puces avec effectif), département, case « déjà écrits ».
  2. **Quoi** : objet ; ligne d'intention IA (brief préremplie par l'étape
     ciblée) ; éditeur texte riche.
  3. **Quand** : ponctuelle ou continue (plafond par jour), test, lancer.
- Statistiques : sélecteur de période (7 / 30 / 90 jours), un tableau par
  groupe, les colonnes de PV avec le pourcentage sous le nombre.

## Hors lot 2

Séquences (lot 3), audience de MonsieurDPE et des autres sites (publication de
leur `baikal_audience`), retrait de Partenariats (sur accord d'Eric).
