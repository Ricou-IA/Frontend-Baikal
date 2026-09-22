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
| `fenetre_jours` | int, nullable | Fenêtre propre à la mesure (voir §4) |
| `groupe` | text, nullable | Bloc de tuiles |
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
publie pas garde le comportement actuel (§8).

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

Le contrat n'exige donc **pas** une ligne par jour et par clé : exiger un
`generate_series` de chaque site déplace le coût chez lui et garantit qu'un
site l'oubliera. C'est Baikal qui est tolérant aux trous.

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

L'EF garde son action `overview` et gagne un mode. Ordre de priorité, choisi
pour que la bascule soit explicite et réversible :

1. `statsParSite[site.id]` existe : mode `kpis`, comportement actuel inchangé.
2. sinon, `baikal_mesures` est présente : mode `mesures`.
3. sinon : repli générique actuel (tables et volumes).

Un site déjà câblé en dur ne bascule donc que le jour où sa fonction est
retirée de `stats-sites.ts`, en une ligne, après recette. Un site sans
fonction (monsieurdpe, et plus tard conseil-solaire) prend le contrat dès qu'il
publie sa vue.

**La résolution du schéma est propre aux mesures.** `admin-dossiers` résout le
schéma une fois sur la présence de `baikal_dossiers`, puis cherche toutes ses
autres vues dedans. Les mesures ne doivent pas hériter de cette résolution :
un site peut publier des mesures sans publier de clients, et Baikal lui-même
est dans ce cas. On reprend la liste de candidats (`[db_schema, "public"]`,
premier trouvé gagne, `to_regclass`) mais testée sur `baikal_mesures`.

### 6.2 Ce que l'EF renvoie

Les fenêtres offertes sont celles de la maison : 7, 30 et 90 jours, comme
`/clients`. L'EF reçoit `jours`, calcule ses bornes dans le fuseau du site, et
rend par clé : la valeur, la valeur de la période précédente, la série
quotidienne pour la courbe, le libellé, le format, le groupe, l'ordre, et pour
un `dernier` la date de mesure.

### 6.3 Doublons

Une requête au chargement, `group by (jour, cle, fenetre_jours) having
count(*) > 1`. S'il y a des lignes, un bandeau **nommant la clé et le jour**
(sans quoi le site devra rejouer la requête pour savoir où chercher). C'est le
motif de `Finances.jsx` et de ses « journées incomplètes dans la période » :
la faute reste du bon côté, c'est le site fautif qui est nommé, et Baikal ne
se tait pas et ne rejette pas.

### 6.4 Le tableau des dernières lignes

Point à trancher, parce qu'il change ce qui est à l'écran aujourd'hui. Le mode
`kpis` rend aussi un tableau (« Derniers dossiers payés » pour Pack Vendeur,
dix lignes). Le contrat de mesures ne le couvre pas : des séries ne portent
pas de lignes nominatives, et elles ne doivent pas en porter.

Trois sorties. La recommandation est la troisième.

1. Le perdre. La page Clients liste déjà les dossiers, avec ses filtres.
2. Une seconde vue contractuelle. Un contrat de plus pour dix lignes, non.
3. **Le dériver de `baikal_dossiers`**, que Baikal sait déjà lire : les dix
   dernières lignes payées, tests et supprimés exclus. Aucun contrat nouveau,
   générique pour tout site publiant ses dossiers, et cohérent par
   construction avec la page Clients. Un site sans `baikal_dossiers` n'a
   simplement pas ce tableau.

### 6.5 Rendu

Sur `/admin`, à la place de la grille actuelle : sélecteur de fenêtre
(7 / 30 / 90), tuiles groupées par `groupe` et ordonnées par `ordre`, valeur
formatée selon `format`, variation contre la période précédente, date de
mesure sous les stocks, courbe par clé, bandeau de doublons le cas échéant.

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
| 1 | `docs/contrats/mesures-v1.sql` versionné, sur le modèle de `prospects-v1.sql` |
| 2 | Colonne `fuseau` au registre (migration, validation séparée) |
| 3 | EF : mode `mesures`, résolution propre, bornes dans le fuseau, doublons |
| 4 | Rendu `/admin` : sélecteur, tuiles, variation, date de mesure, courbe, bandeau |
| 5 | Vue de Pré-état-daté, recette de parité, puis retrait de `statsParSite['pack-vendeur']` |
| 6 | Onboarding de Conseil Solaire, plus tard, comme recette du parcours |

Les lots 1 à 4 ne changent rien à l'écran des sites déjà câblés en dur. Le
lot 5 est le seul qui touche une page en production.

## 10. Points ouverts

1. **§6.4, le tableau des dernières lignes.** Recommandation : le dériver de
   `baikal_dossiers`. Décision d'Eric.
2. **Périodes calendaires.** `fenetre_jours` compte des jours, comme le
   paramètre `jours` que prend déjà l'EF. Il n'exprime pas « mois en cours »
   ni « année en cours », que `/finances` propose pourtant. Le jour où la vue
   d'ensemble les voudra, ce sera une v2 du contrat, pas un rattrapage.
3. **Voirie et Majord'home.** Leurs fonctions en dur restent en place tant
   qu'elles ne publient pas leur vue. Rien ne les presse, mais tant qu'elles
   existent la vue d'ensemble a deux régimes.
