# Contrat de mesures v1 : la vue d'ensemble par site devient contractuelle

Conception du 22 et 23/09/2026, entre la session Baikal et la session DPE,
arbitrée par Eric. Spec jumelle côté MonsieurDPE :
`docs/superpowers/specs/2026-09-22-suivi-baikal-journalisation-design.md`
(dépôt DPE, commit 7bf3322).

## 1. Le constat

Deux modules de la console traitent la même question de façon opposée.

**Clients est contractuel.** Le site publie `baikal_dossiers`, Baikal lit la
capacité à la présence des vues et des colonnes, et brancher un site ne
demande aucune ligne de code Baikal.

**La vue d'ensemble ne l'est pas.** Les KPI sont écrits en dur, site par site,
dans `admin-site-stats/stats-sites.ts` : `statsPackVendeur`, `statsVoirie`,
`statsMajordhome`. Les autres sites tombent sur un repli générique qui liste
les tables et leurs volumes estimés. Ajouter un site veut dire écrire une
fonction et redéployer.

Eric demande de fermer cet écart : un contrat de mesures générique, pas une
quatrième fonction en dur.

## 2. Ce que le contrat doit empêcher

La règle qui gouverne tout le reste est déjà écrite en tête de
`stats-sites.ts` : **deux écrans ne doivent jamais annoncer deux nombres.**
C'est ce qui faisait afficher 5 demandes payées à Voirie pour 2 réelles, les
sessions `TEST_SKIP_` passant le filtre local alors que la vue contractuelle
les écarte.

Le passage au contrat déplace cette garantie, et c'est le risque principal de
ce chantier. Aujourd'hui c'est Baikal qui exclut tests et supprimés, en
joignant `baikal_dossiers`. Avec une vue de mesures, l'exclusion passe côté
site et Baikal ne peut plus la garantir. Le contrat doit donc l'exiger en
toutes lettres, et la recette doit la vérifier.

## 3. La vue `baikal_mesures`

Une ligne par jour, par clé et par fenêtre. Le site publie des séries, Baikal
ne connaît aucun métier.

| Colonne | Type | Rôle |
|---|---|---|
| `jour` | date, non nul | Jour **local** du site (voir §5) |
| `cle` | text, non nul | Identifiant stable de l'indicateur |
| `libelle` | text, non nul | Le site nomme, Baikal n'a aucun libellé en dur |
| `valeur` | numeric, non nul | |
| `agregation` | text, non nul | `somme` ou `dernier`, rien d'autre |
| `format` | text, non nul | `nombre`, `eur` ou `pourcent` |
| `chapitre` | text, non nul | Où la tuile s'affiche (voir §3.2) |
| `fenetre_jours` | int, nullable | Fenêtre propre à la mesure (voir §4) |
| `groupe` | text, nullable | Bloc de tuiles dans le chapitre |
| `ordre` | int, nullable | Rang dans le groupe, NULL en dernier |

**Deux agrégations, pas trois.** `moyenne` a été écartée : elle se dérive
d'une somme et d'un nombre de jours, et une moyenne de moyennes est un piège
de plus à documenter pour rien.

**Les mesures sont publiées tests et supprimés déjà exclus**, dérivées de
`baikal_dossiers` partout où la notion existe. C'est la phrase du §2, et elle
appartient au contrat, pas à un commentaire de vue.

**L'unicité sur (`jour`, `cle`, `fenetre_jours`) est une promesse du site, pas
une contrainte** : l'objet du contrat est une vue, elle ne peut rien
contraindre. La conséquence n'est pas symétrique. Un doublon sur un `dernier`
est inoffensif, Baikal prend la dernière ligne. Un doublon sur une `somme`
double le nombre affiché, sans un bruit. Baikal le détecte donc au chargement
et l'affiche (§6.3) au lieu de le supposer absent.

Un site qui matérialiserait une série et voudrait poser la contrainte en
amont doit écrire `unique nulls not distinct`, disponible depuis Postgres 15 :
un `unique` ordinaire laisse passer deux lignes portant un NULL, donc la
garantie sauterait précisément sur les mesures sans fenêtre, qui sont la
majorité.

### 3.1 Vues optionnelles

Aucune. Le contrat de mesures tient dans une seule vue. Un site qui ne la
publie pas n'affiche simplement aucune tuile.

### 3.2 Le chapitre : il n'y a pas d'écran des statistiques

Décision d'Eric du 23/09. La vue d'ensemble par site ne devient pas un
neuvième chapitre : **les mesures remontent dans les chapitres existants**. Le
chiffre d'affaires coiffe Finances, le nombre de comptes coiffe Comptes pro,
les dossiers coiffent Clients. Un chiffre se lit à côté de ce qu'il compte, et
les droits par module s'appliquent sans une ligne de plus.

Le site déclare donc où va sa mesure, dans un vocabulaire **fermé, tenu par
Baikal** : `clients`, `finances`, `comptes_pro`. Ce sont les chapitres qui
montrent des données du site ; les autres modules (prospects, rapports, seo,
partenariats, users) portent des données de Baikal ou de Google. La liste
grandira le jour où un chapitre nouveau montrera du site.

Une valeur hors vocabulaire est écartée, comme une ligne incomplète. Baikal ne
devine pas un rangement.

`groupe` reste le sous-bloc à l'intérieur du chapitre, libre et nommé par le
site.

## 4. Fenêtres, flux et stocks

C'est le cœur de la sémantique, et la source de toutes les erreurs de
comptage.

**Un flux se somme** (`agregation = somme`) : consultations, achats, chiffre
d'affaires de la période. Baikal additionne les lignes de la fenêtre demandée.
La période précédente est le total de la fenêtre d'avant.

**Un stock se lit au dernier jour** (`agregation = dernier`) : abonnés actifs,
fiches revendiquées, chiffre d'affaires cumulé. Sommer trente lignes de
« 28 fiches revendiquées » donnerait 840.

**Un compte de valeurs distinctes sur une fenêtre est un stock**, pas un cas
particulier : « dossiers distincts sur 30 jours glissants » se mesure chaque
jour et ne s'agrège pas dans le temps, aucune fonction des distincts
quotidiens ne donne les distincts de la période.

### 4.1 Pourquoi `fenetre_jours` et pas un suffixe de clé

Un indicateur dont la fenêtre est figée dans son nom ne suit pas la fenêtre
choisie à l'écran. Eric veut les consultations et les dossiers distincts côte
à côte : en basculant la vue sur 7 jours, la première tuile suivrait et la
seconde resterait à 30 jours. Deux tuiles voisines sur deux périodes, c'est un
rapport que le lecteur calcule de tête et qui est faux, sur la paire exacte
qu'il veut comparer.

La fenêtre est donc une donnée, dans une colonne, et jamais un morceau de
libellé. Faire lire un suffixe de clé à Baikal contredirait frontalement
`champs.ts`, qui pose que Baikal ne connaît aucun libellé et ne fait que les
ranger.

### 4.2 Les règles

- `fenetre_jours` NULL : la mesure ne dépend d'aucune fenêtre.
- **`fenetre_jours` non nul implique `agregation = dernier`.** Un flux est
  sommé par Baikal sur la fenêtre demandée ; lui donner une fenêtre propre
  reviendrait à la compter deux fois.
- Pour une fenêtre demandée W, Baikal retient les lignes dont `fenetre_jours`
  est NULL ou vaut W.
- **Aucun repli sur la fenêtre publiée la plus proche.** Afficher un nombre de
  30 jours sous un intitulé 7 jours réintroduirait le bug qu'on supprime. Une
  clé qui ne couvre pas W n'est pas rendue pour cette fenêtre, comme une vue
  absente ferme un module.
- Le site publie donc une série par fenêtre qu'il veut servir.

### 4.3 Trous dans la série

Un jour sans ligne n'a pas le même sens selon l'agrégation. Pour un flux, pas
de ligne vaut zéro, sans danger. Pour un stock, pas de ligne veut dire « pas
mesuré ce jour-là », et afficher 0 fiche revendiquée un lundi de calme serait
faux.

Pour un FLUX, le contrat n'exige donc pas une ligne par jour : exiger un
`generate_series` de chaque site déplace le coût chez lui et garantit qu'un
site l'oubliera. C'est Baikal qui est tolérant aux trous.

Pour un STOCK, c'est l'inverse, et la session MonsieurDPE l'a trouvé en
production le 23/09 : un stock doit publier une ligne par jour depuis sa
première mesure, **zéros compris**. Une ligne absente veut dire « pas
mesuré », jamais « zéro », et la tolérance de Baikal fige alors le compteur à
sa dernière valeur non nulle. Une fenêtre glissante ne redescend plus, un
abonné résilié reste compté, une fiche supprimée survit. Concrètement, la
tuile « dossiers distincts, 7 j » aurait annoncé 1 au huitième jour sans
ouverture, là où la réponse est 0 : un nombre faux, plausible, et daté d'une
date qui ne dit pas qu'il est faux. Les branches de stock se publient donc en
jointure externe.

La tolérance de Baikal reste, mais elle est une tolérance aux pannes de
publication, pas une licence de publier par intermittence. Deux bornes : on ne
publie rien avant la première mesure, sans quoi la courbe montrerait une année
plate qui n'a jamais existé ; et un cumul monotone n'a pas besoin de ses
zéros, son absence de ligne ne pouvant pas mentir.

- Un `dernier` vaut la dernière ligne dont `jour` est inférieur ou égal à la
  borne haute de la fenêtre, **sans borne de recul**.
- **La tuile d'un `dernier` porte toujours sa date de mesure** (« 28 fiches
  revendiquées, au 22/09 »). Pas de seuil de péremption, qui serait arbitraire,
  et pas de trou blanc, qui se lirait comme une régression. C'est la règle
  d'Eric sur les sites : aucun chiffre sans sa source, dans le même composant.
- La période précédente d'un `dernier` est la dernière ligne dont `jour` est
  inférieur ou égal à la borne haute moins la fenêtre. S'il n'y en a aucune, la
  valeur s'affiche sans variation, jamais une variation depuis zéro.
- La courbe d'un `dernier` est en marches d'escalier, jamais interpolée.
- Une clé sans aucune ligne ne s'affiche pas.

## 5. Le fuseau, et pourquoi il va au registre

Le piège est réel et a déjà coûté cher côté DPE : la base stocke minuit heure
de Paris exprimé en UTC, donc un `::date` naïf rend la veille en fin de
soirée. Deux sites dont l'un publie `cree_le::date` et l'autre
`(cree_le at time zone 'Europe/Paris')::date` produisent des séries décalées
d'un jour sans que rien ne le signale.

Il ne suffit pas de l'écrire dans le contrat, parce que **Baikal pose lui aussi
ses bornes de fenêtre** : s'il les calcule en UTC pendant que le site publie
des jours Europe/Paris, la journée en cours est fausse des deux côtés.

Donc une colonne au registre, à côté de `db_schema` et `funnel_etapes`, comme
le veut la règle du dépôt (ce qui est propre au site vit dans le registre) :

```sql
alter table config.apps
  add column fuseau text not null default 'Europe/Paris';
```

Le défaut couvre les treize sites actuels sans rien casser. Le contrat écrit
alors une seule chose, vérifiable : `jour` est le jour local du site,
`(<horodatage> at time zone <fuseau>)::date`, jamais un `::date` nu. Baikal
calcule ses bornes dans le même fuseau.

`config.apps` est le registre commun à tous les sites : cette migration est à
valider séparément.

## 6. Côté Baikal

### 6.1 `admin-site-stats`

L'EF garde son action `overview`, qui sert `VueSite` jusqu'à sa disparition au
lot 6, et gagne une action `mesures` prenant un `chapitre` et une fenêtre.
Les deux cohabitent le temps de la recette : c'est ce qui rend la bascule
explicite et réversible, un site câblé en dur ne perdant ses KPI que le jour où
sa fonction est retirée de `stats-sites.ts`, en une ligne.

`mesures` rend une réponse vide, jamais une erreur, quand le site ne publie pas
la vue ou n'a aucune mesure pour ce chapitre : le bandeau de tuiles ne se monte
simplement pas.

**La résolution du schéma est propre aux mesures.** `admin-dossiers` résout le
schéma une fois sur la présence de `baikal_dossiers`, puis cherche toutes ses
autres vues dedans. Les mesures ne doivent pas hériter de cette résolution :
un site peut publier des mesures sans publier de clients, et Baikal lui-même
est dans ce cas. On reprend la liste de candidats (`[db_schema, "public"]`,
premier trouvé gagne, `to_regclass`) mais testée sur `baikal_mesures`.

### 6.2 Ce que l'EF renvoie

Les fenêtres offertes sont celles de la maison : 7, 30 et 90 jours, comme
`/clients`. L'EF reçoit `chapitre` et `jours`, calcule ses bornes dans le
fuseau du site, et rend par clé : la valeur, la valeur de la période
précédente, la série quotidienne pour la courbe, le libellé, le format, le
groupe, l'ordre, et pour un `dernier` la date de mesure.

### 6.3 Doublons

Une requête au chargement, `group by (jour, cle, fenetre_jours) having
count(*) > 1`. S'il y a des lignes, un bandeau **nommant la clé et le jour**
(sans quoi le site devra rejouer la requête pour savoir où chercher). C'est le
motif de `Finances.jsx` et de ses « journées incomplètes dans la période » :
la faute reste du bon côté, c'est le site fautif qui est nommé, et Baikal ne
se tait pas et ne rejette pas.

### 6.4 Le tableau des dernières lignes disparaît

Le mode `kpis` rend aussi un tableau (« Derniers dossiers payés » pour Pack
Vendeur, dix lignes, `LIMIT 10` dans `stats-sites.ts`). Il tombe avec l'écran
qui le portait : les mesures remontant dans les chapitres, la liste du
chapitre Clients EST cette liste, en mieux, avec ses filtres, sa recherche et
sa pagination par 25. Un contrat de mesures ne porte pas de lignes
nominatives, et n'a pas à en porter.

### 6.5 Rendu

Chaque chapitre concerné (Clients, Finances, Comptes pro) porte en tête un
bandeau de tuiles : sélecteur de fenêtre (7 / 30 / 90), tuiles groupées par
`groupe` et ordonnées par `ordre`, valeur formatée selon `format`, variation
contre la période précédente, date de mesure sous les stocks, courbe par clé,
bandeau de doublons le cas échéant. Un composant unique, monté dans chaque
page avec son chapitre en paramètre.

`VueSite` sort d'`Admin.jsx`, qui redevient la page d'ARPET et rien d'autre.
Le repli générique (tables du site et volumes estimés) disparaît avec elle :
ce n'était pas une mesure d'activité mais un pansement d'attente, et un site
sans mesures n'affiche désormais aucune tuile plutôt qu'un écran qui ressemble
à une information sans en être une.

## 6bis. Le chapitre Comptes pro

Décision d'Eric du 23/09 : ajouter un chapitre Comptes pro, sur le modèle de
la page « Comptes Pro » de l'admin de Pré-état-daté
(`src/pages/admin/AdminProsPage.jsx` : six tuiles, recherche par société ou
courriel, tableau triable, tiroir par compte).

**Deux populations, jamais mélangées.** Clients liste l'acte commercial, le
dossier. Comptes pro liste les entreprises qui achètent au site : l'agence
immobilière de Pré-état-daté, le diagnostiqueur abonné de MonsieurDPE,
l'installateur de Conseil Solaire. Un compte pro vit dans le temps, un dossier
est un événement. C'est aussi ce qui répond à la question restée ouverte sur
Conseil Solaire : le particulier ira dans Clients, l'installateur dans
Comptes pro.

**Un contrat de plus**, `comptes-pro-v1.sql`, même mécanique que
`baikal_dossiers` : vue `baikal_comptes_pro`, noyau obligatoire (identifiant,
raison sociale, courriel, date de création, actif, `est_test`, `supprime_le`),
blocs optionnels dont la présence déclare la capacité (crédits, argent,
abonnement au vocabulaire `abo_*` des dossiers, catégorie). Pas de vue, pas de
chapitre.

**Les tuiles ne sont pas dans cette vue** : elles viennent de `baikal_mesures`
avec `chapitre = comptes_pro`. Une vue de liste ne porte pas d'agrégat, sinon
deux écrans finiront par annoncer deux nombres.

**Une liste, pas une fiche** (périmètre fixé par Eric). Recherche, tri,
bascules tests et supprimés, pagination. Baikal n'écrit jamais dans la vue ni
dans les tables du site : créditer, suspendre ou fermer un compte passerait
par l'EF d'administration du site, comme les actions de la fiche client, et
n'est pas de ce lot.

Le module `comptes_pro` entre dans `core.modules_console()`, donc dans les
droits par site, comme les autres.

## 7. Recette

**Le contrat se valide sur plusieurs sites, jamais un seul** (décision
d'Eric).

| Site | Ce qu'il valide | Critère |
|---|---|---|
| pack-vendeur | Le contrat | Les quatre nombres actuels (dossiers créés, dossiers payés, CA période, CA total) au centime près. Un écart veut dire que le contrat a tort, et rien n'est retiré de `stats-sites.ts`. |
| monsieurdpe | Le contrat, sur un site que rien ne câblait | Les indicateurs de la spec DPE s'affichent sans une ligne de Baikal. |
| conseil-solaire | Le **parcours** d'onboarding | Si le brancher demande de toucher l'EF ou le front, le contrat a échoué. |

Conseil Solaire est hors du chemin critique : Eric veut l'onboarder à la fin,
en le traitant comme un client extérieur. Sa base vit aujourd'hui dans le
projet d'HésiaSun et ira sur un projet dédié plus tard ; le contrat ne doit
donc dépendre d'aucune hypothèse de co-location, et ce déménagement doit se
réduire à deux colonnes du registre (`db_schema`, `db_ro_secret_ref`).

## 8. Cas limites

| Cas | Comportement |
|---|---|
| Pas de vue `baikal_mesures` | Repli inchangé (fonction en dur, puis générique). Jamais une erreur. |
| Clé sans ligne pour la fenêtre demandée | Tuile absente pour cette fenêtre. |
| Stock jamais mesuré | Rien, pas un zéro. |
| Stock mesuré il y a longtemps | La valeur, avec sa date. |
| Doublon (jour, clé, fenêtre) | Bandeau nommant la clé et le jour. |
| Base du site injoignable | Erreur explicite, pas un état vide trompeur. |

## 9. Lots

| Lot | Contenu |
|---|---|
| 1 | Contrats versionnés : `mesures-v1.sql`, `comptes-pro-v1.sql` |
| 2 | Migration : colonne `fuseau` au registre, module `comptes_pro` dans `core.modules_console()` |
| 3 | EF : lecture des mesures par chapitre, résolution propre, bornes dans le fuseau, doublons |
| 4 | Composant de tuiles, monté en tête de Clients et de Finances |
| 5 | Chapitre Comptes pro : EF de liste, page, entrée de navigation |
| 6 | Vues de Pré-état-daté, recette de parité, puis retrait de `statsParSite` et de `VueSite` |
| 7 | Onboarding de Conseil Solaire, plus tard, comme recette du parcours |

Les lots 1 à 5 ne retirent rien de l'écran : les KPI en dur restent servis par
`VueSite` pendant que les tuiles contractuelles apparaissent dans les
chapitres. Le lot 6 est le seul qui enlève quelque chose, et il ne se fait
qu'une fois la parité vérifiée.

## 10. Points ouverts

1. **Périodes calendaires.** `fenetre_jours` compte des jours, comme le
   paramètre `jours` que prend déjà l'EF. Il n'exprime pas « mois en cours »
   ni « année en cours », que `/finances` propose pourtant. Le jour où la vue
   d'ensemble les voudra, ce sera une v2 du contrat, pas un rattrapage.
2. **Voirie et Majord'home.** Leurs fonctions en dur restent en place tant
   qu'elles ne publient pas leur vue, donc `VueSite` leur survit jusque-là.
   Rien ne les presse, mais tant qu'elles existent la console a deux régimes.
3. **La barre à neuf chapitres.** Elle tient en écran large, moins bien sur
   téléphone, où la console doit rester utilisable en compagnon (décision du
   08/09). C'est un problème de barre, pas de chapitre, et il se traite à
   part.
