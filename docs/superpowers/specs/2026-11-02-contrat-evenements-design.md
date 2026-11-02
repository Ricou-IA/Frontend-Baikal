# Module Événements v1 : le mouchard standard des sites suivis par Baikal

Conception du 01 et 02/11/2026, session DPE, arbitrée par Eric. Le module
s'installe chez chaque site comme `prospects-v1` et `mailing-v1` ; MonsieurDPE
sera la première installation, Pack Vendeur la seconde.

## 1. Le constat

Le 30/10/2026, un lead agence (`lead:131`) laisse son adresse sur le sourcing
de MonsieurDPE, consomme sa requête gratuite, et sa fiche Baikal s'arrête là :
deux lignes. Pour savoir ce qu'il avait cherché, il a fallu ouvrir le journal
du sourcing à la main et rapprocher deux horodatages. Pour savoir s'il avait
ouvert une fiche de bien, cliqué sur l'offre ou téléchargé le CSV : rien,
nulle part. L'ouverture d'une fiche depuis ses résultats est gratuite, donc
sans trace serveur ; les filtres, la carte et le CSV sont côté navigateur ;
Vercel ne voit que les pages vues.

Pack Vendeur, lui, a un mouchard complet depuis des mois : un identifiant de
visiteur dans le navigateur, un `trackEvent(nom, catégorie, propriétés,
dossier)` posé à une trentaine d'endroits, une Edge Function qui écrit dans
`pv_events` sans jamais bloquer, et sa timeline Baikal le lit. Le contrat
`dossiers-v1` a même pris cette table comme exemple de la vue Events. Mais ce
mouchard est maison : ses noms de gestes sont les siens, son rattachement se
fait par dossier, et aucun autre site ne peut l'installer.

Eric, 02/11/2026 : « je veux un système pour l'ensemble des sites suivis sur
Baikal. Un contrat standard à donner au Claude Code du client pour faire les
bonnes vues et le suivi. L'idée c'est de standardiser avec Baikal le
monitoring de site et d'ajouter des features, mailing etc. »

## 2. Intention

**Un site qui installe le module remplit sa fiche client Baikal des gestes de
ses visiteurs**, sans une ligne de code Baikal : ce qu'ils ont vu, cherché,
ouvert, téléchargé, tenté. Et comme tous les sites nomment leurs gestes avec
le même vocabulaire, Baikal peut les lire de la même manière, les comparer,
et plus tard s'en servir pour déclencher un envoi (« a ouvert un résultat sans
payer depuis trois jours »).

Le module est **le mouchard**. Il remplace celui de Pack Vendeur et en donne
un à MonsieurDPE et aux suivants.

### Objectifs

- Sur la fiche Baikal d'une personne identifiée, la timeline Events porte ses
  gestes dans l'ordre, **y compris ceux d'avant son identification** (le
  visiteur anonyme qui devient lead).
- Un site s'installe en suivant le README du module, par son propre Claude
  Code, sans échange avec Baikal.
- Un vocabulaire de gestes commun à tous les sites, lisible dans Baikal sans
  connaître le métier du site.
- Un mouchard qui ne coûte jamais rien au visiteur : jamais bloquant, jamais
  visible, jamais une erreur.

### Non-objectifs

- Pas d'écran Baikal nouveau. La timeline Events existe, elle s'enrichit. Un
  écran « visiteurs anonymes » ou « parcours par session » viendra, ou pas,
  dans un lot Baikal à part.
- Pas de rejeu de session (enregistrement du curseur, du défilement). On
  enregistre des gestes nommés, pas un film.
- Pas de remplacement de l'attribution (`attribution.ts`, premier contact
  gagne) ni de la Search Console. L'acquisition reste son contrat.
- Pas de déclencheur mailing dans ce lot : le module publie les faits, le
  module mailing viendra les lire (§9).

### Anti-objectifs, ce qui ferait de ce module un échec

- **Un geste attribué à la mauvaise personne.** Si le navigateur pouvait dire
  « je suis untel », n'importe qui pourrait écrire sur la fiche de n'importe
  qui. L'identification ne vient que du serveur du site (§5.3).
- **Deux nombres pour un même fait.** Un paiement est déjà dans la table des
  achats du site ; le re-journaliser comme geste le ferait apparaître deux
  fois dans la timeline et, pire, compter deux fois. Un geste n'est journalisé
  ici que s'il n'a aucune autre table (§5.4).
- **Une donnée personnelle qui entre par la fenêtre.** Une adresse cherchée
  dans l'URL, un nom dans un libellé. Le site est le seul à savoir ce qu'il a
  promis de ne pas conserver (MonsieurDPE : « adresse jamais conservée ») ; le
  module lui laisse le contenu des libellés et lui impose un `page` sans
  paramètres (§5.5).
- **Des testeurs comptés comme des clients.** Tests exclus à la source,
  comme partout dans Baikal (§5.6).

## 3. Les parties, et à qui elles appartiennent

| Pièce | Fichier dans `docs/contrats/` | Nature | Qui l'écrit |
|---|---|---|---|
| Table, fonctions, vue standard, grants, purge | `evenements-v1.sql` | module, identique partout | Baikal |
| Relais serveur (reçoit les balises du navigateur, écrit en base) | `evenements-relais-v1.ts` | module, identique partout : un gestionnaire neutre `(Request) => Promise<Response>` et deux enrobages de quelques lignes, `Deno.serve` pour une Edge Function et `export const POST` pour une route Next | Baikal |
| Bibliothèque navigateur | `evenements-v1.js` | module, identique partout | Baikal |
| Les appels dans les pages, l'identification côté serveur, la branche de `baikal_dossier_events`, la ligne de la page de confidentialité | dans le site | propre au site | le site, guidé par le README |

Le README du module est la pièce la plus importante : c'est lui que le
Claude Code du site lit. Il dit quoi poser où, et donne la recette de
contrôle (§8).

## 4. La donnée

### 4.1 `@SCHEMA@.evenement`, une ligne par geste

| colonne | type | contenu |
|---|---|---|
| `id` | bigint identity | |
| `survenu_le` | timestamptz, non nul | **heure du serveur** à la réception. L'heure du navigateur n'est pas digne de confiance et n'apporte rien |
| `visiteur_id` | uuid, non nul | posé par la bibliothèque au premier passage, gardé dans le navigateur sans date de fin (§5.1) |
| `email` | text, nul | l'identité, minuscules. Remplie à l'écriture si le visiteur est déjà identifié, remplie après coup par l'identification (§5.3) |
| `dossier_id` | text, nul | l'objet du site quand il en a un (dossier Pack Vendeur, numéro de DPE) |
| `geste` | text, non nul | un mot du vocabulaire (§6), contrainte `check` |
| `libelle` | text, nul, 200 caractères | ce qui s'affiche dans la timeline ; à défaut le geste |
| `page` | text, non nul, 300 caractères | le chemin de la page, **sans paramètres ni fragment** (§5.5) |
| `detail` | jsonb, non nul, défaut `{}` | paires clé/valeur plates, 20 clés au plus, valeurs scalaires de 200 caractères au plus. Rendu tel quel par Baikal |
| `referent` | text, nul | le nom d'hôte du référent, seulement sur `page_vue` |
| `est_test` | boolean, non nul, défaut faux | mode staff (§5.6) |

Index : `(email, survenu_le desc)` pour la fiche, `(visiteur_id, survenu_le)`
pour l'identification après coup, `(survenu_le)` pour la purge.

### 4.2 `@SCHEMA@.evenement_visiteur`, le rattachement

| colonne | type | contenu |
|---|---|---|
| `visiteur_id` | uuid, clé primaire | |
| `email` | text, non nul | |
| `dossier_id` | text, nul | |
| `identifie_le` | timestamptz, non nul | |
| `origine` | text, non nul | où le site a appris l'identité : `connexion`, `formulaire`, `paiement`, `lien_courriel`… libre, 40 caractères |

Un visiteur, une adresse : la dernière identification gagne. Un ordinateur
partagé par deux personnes met les gestes des deux sur la fiche de la
dernière ; c'est assumé, et l'alternative (une table d'historique et une
timeline qui montre les gestes sur deux fiches) ne vaut pas sa complexité
tant qu'aucun cas réel ne l'exige.

### 4.3 Les fonctions, `security definer`, `search_path = ''`

- `evenement_enregistrer(p_lignes jsonb) → jsonb { ok, ecrits, rejetes }`.
  Reçoit un lot de gestes du relais. Valide chaque ligne (geste du
  vocabulaire, tailles, `page` sans `?` ni `#`), complète `email` et
  `dossier_id` depuis `evenement_visiteur` quand le visiteur est connu, écrit.
  Une ligne invalide est comptée dans `rejetes` et n'empêche pas les autres.
- `evenement_identifier(p_visiteur_id uuid, p_email text, p_dossier_id text,
  p_origine text) → jsonb { ok, rattaches }`. Pose ou remplace le
  rattachement, puis met `email` (et `dossier_id` s'il était nul) sur tous
  les gestes passés de ce visiteur qui n'en avaient pas. Écrit elle-même un
  geste `identification` avec `libelle = p_origine`, pour que la timeline
  montre le moment où l'anonyme est devenu quelqu'un. **Appelée par le
  serveur du site, jamais par le navigateur** (§5.3).

### 4.4 La vue standard `@SCHEMA@.baikal_evenements`

Toutes les colonnes de la table sauf `id`, `est_test = false` exclu, lecture
`baikal_reader`. C'est elle que la branche Events du site lit, et elle que
Baikal lira pour tout ce qui vient après (§9). Le site **dérive** sa branche
de cette vue, il ne relit jamais la table (README des contrats : une donnée
dans deux vues se dérive de celle qui fait autorité).

La branche à ajouter dans `baikal_dossier_events` du site, fournie dans le
module :

```sql
union all
select e.email, e.survenu_le, e.geste, e.libelle, 'client',
       jsonb_strip_nulls(jsonb_build_object('page', e.page, 'dossier', e.dossier_id)) || e.detail
from @SCHEMA@.baikal_evenements e
where e.email is not null
```

La première colonne est le `dossier_id` du contrat `dossiers-v1`, dont le
contenu appartient au site : chez MonsieurDPE c'est l'adresse courriel en
minuscules, sur toutes les branches de `baikal_dossier_events` depuis le
24/10/2026 ; chez Pack Vendeur c'est l'identifiant du dossier, et la branche
filtre alors sur `e.dossier_id is not null` et le met en première colonne.
Le README donne les deux formes.

### 4.5 Droits, RLS, purge

RLS forcée, policy `service_role` seule sur les deux tables, `grant select`
et policy `baikal_read` sur la table et la vue pour `baikal_reader` (règle du
README : une table source sans sa policy sert la vue amputée, sans erreur).
Le rôle porte ce nom chez tous les sites, base partagée ou dédiée :
`mesures-v1` accorde déjà ses droits ainsi, et Pack Vendeur le nomme dans
cinq migrations. Pas d'annexe « site dédié » pour ce module.

Purge par `pg_cron`, dans le module : les gestes d'un visiteur **jamais
identifié** sont supprimés après 90 jours, les autres gardés. Un visiteur qui
s'identifie au jour 80 garde ses 80 jours. Mon choix, à discuter si un site
veut plus long.

## 5. Les règles du module

Chacune a une raison ; la raison fait partie du contrat.

### 5.1 Un visiteur, un identifiant, sans date de fin

La bibliothèque pose un uuid dans `localStorage` **et** dans un cookie de
première partie (`<schema>_visiteur`, un an, `SameSite=Lax`). Le cookie est
ce qui permet au serveur du site de lire l'identifiant dans n'importe quelle
route, pour l'identification, sans que le navigateur ait à le renvoyer à la
main. Les deux se réparent l'un l'autre quand l'un manque.

Pas de notion de « session » séparée : une visite se lit par les `page_vue`
d'un même visiteur dans la journée. Pack Vendeur a le même choix depuis le
début, sous le nom `session_id`.

### 5.2 Jamais bloquant, jamais visible

- La bibliothèque met les gestes dans une file et les envoie par lots :
  toutes les 5 secondes, à 20 gestes, et à `visibilitychange` (le visiteur
  quitte la page) par `navigator.sendBeacon`, qui survit à la fermeture.
- Le relais répond `204` dans tous les cas, erreur comprise, et écrit l'erreur
  dans ses propres logs. Le visiteur ne voit jamais rien.
- Un relais injoignable ne fait rien d'autre que perdre les gestes du lot.
  Pas de réessai au-delà d'un, pas de stockage local des échecs : une file qui
  grossit hors ligne finit par rejouer des gestes d'hier.
- Aucune dépendance : la bibliothèque est un module ES autonome d'une
  centaine de lignes, sans framework, pour s'installer dans un site Vite, Next
  ou statique sans adaptateur.

### 5.3 L'identification ne vient que du serveur

Le navigateur peut envoyer `visiteur_id`, `geste`, `libelle`, `page`,
`detail`, `dossier_id`. **Il ne peut pas envoyer `email`.** Le relais rejette
toute ligne qui en porte un.

L'identité est posée par le serveur du site, à l'endroit où il la connaît
avec certitude : la route qui reçoit le formulaire de lead, la connexion, le
webhook de paiement. Il lit le cookie visiteur et appelle
`evenement_identifier`. Sans cette règle, n'importe quel visiteur pourrait
écrire des gestes sur la fiche de n'importe quelle adresse, et une fiche
Baikal ne vaudrait plus rien.

Conséquence pour le site : l'identification est un appel serveur de plus dans
deux ou trois routes. Le README les nomme pour chaque cas courant (lead,
compte, paiement).

### 5.4 Un fait déjà en base n'est pas un geste

Un paiement réussi est dans la table des achats ; un rapport envoyé dans la
table des envois ; une requête consommée dans son compteur. La timeline
Events les lit déjà par leurs propres branches. Le module journalise **les
gestes qui n'ont aucune autre table** : l'ouverture d'un résultat, le clic sur
une offre, le téléchargement, le filtre, l'erreur affichée. `paiement_initie`
(le clic sur « Payer ») en fait partie ; `paiement_reussi` n'en fait pas.

Sans cette règle, un geste apparaît deux fois sur la fiche et compte deux
fois dans les mesures.

### 5.5 Le site est responsable de ce qu'il met dans un geste

Le module impose la forme : `page` est un chemin, la bibliothèque retire
elle-même la chaîne de requête et le fragment, et `evenement_enregistrer`
rejette une `page` qui en porte encore. Il **ne** contrôle **pas** le contenu
de `libelle` et de `detail` : c'est le site qui sait ce qu'il a promis.

Le README le dit en toutes lettres : un geste `recherche` dont le libellé
est la question tapée est légitime sur un outil pro ; il est interdit sur une
page dont le site a promis que l'adresse recherchée n'est jamais conservée.
Le site qui installe le module **ajoute la ligne correspondante à sa page de
confidentialité**, comme MonsieurDPE le fait pour chaque donnée qu'il garde.

### 5.6 Les tests sont exclus à la source

Mode staff, repris de Pack Vendeur : visiter n'importe quelle page avec
`?staff=1` pose un drapeau persistant dans le navigateur, `?staff=0` le
retire. Les gestes partent avec `est_test = true` et la vue standard les
écarte. À poser une fois sur chaque appareil de l'équipe.

Les robots sont écartés par le relais sur le user-agent, avec la liste courte
et générique de `trafic.ts` chez MonsieurDPE (`bot|crawl|spider|headless|…`),
sans la stocker. Un script qui n'exécute pas le JavaScript n'envoie de toute
façon aucune balise : c'est ce qui rend ce comptage plus sûr que le sceau
image de MonsieurDPE (§7).

### 5.7 Le vocabulaire est fermé

Un geste hors vocabulaire est rejeté, pas stocké sous un nom libre. Un site
qui a besoin d'un geste qui n'y est pas utilise `autre` avec un libellé, et
propose l'ajout au module. Le vocabulaire s'étend par une version du module,
jamais par un site seul : c'est ce qui garde Baikal capable de lire tous les
sites de la même façon.

## 6. Le vocabulaire v1

| geste | quand | `libelle` | `detail` courant |
|---|---|---|---|
| `page_vue` | chaque page, automatique (chargement et navigation interne) | titre de la page | `referent` à part |
| `clic` | un bouton ou lien nommé, dont le site veut savoir s'il est cliqué | le libellé du bouton | `cible` (où ça mène) |
| `recherche` | une recherche lancée | la question ou les critères, si le site a le droit de les garder | `resultats` (nombre) |
| `resultat_ouvert` | un élément ouvert depuis une liste : fiche, dossier, rapport, archive | le titre ou l'identifiant de l'élément | `rang` dans la liste |
| `filtre` | un filtre ou un tri appliqué à une liste | le nom du filtre | `valeur` |
| `formulaire_envoye` | un formulaire soumis | le nom du formulaire | `issue` (`ok`, `refuse`, `erreur`) |
| `fichier_telecharge` | PDF, CSV, image | le nom du fichier | `format` |
| `media_lu` | vidéo ou audio lancé | le titre | `source` |
| `partage` | lien copié, envoi à un tiers | ce qui est partagé | `canal` |
| `paiement_initie` | le clic qui ouvre le paiement | l'offre | `montant`, `devise` |
| `erreur` | un message d'erreur montré au visiteur | le message | `code` |
| `identification` | écrit par `evenement_identifier`, jamais par le navigateur | l'origine | |
| `autre` | ce qui n'entre dans rien | obligatoire | |

Treize gestes. Les noms sont en français, comme tout le schéma des sites et
les autres modules. Pack Vendeur garde ses noms actuels dans `detail.nom_pv`
pendant la migration, pour ne rien perdre de ses tableaux existants (§7).

## 7. Installation et migration

**Chez un site neuf** : copier les trois fichiers, substituer `@SCHEMA@`,
déployer le relais, poser la bibliothèque dans la coque de l'application,
ajouter les appels `geste(...)` aux endroits qui comptent, ajouter
l'identification dans les routes qui apprennent l'adresse, ajouter la branche
à `baikal_dossier_events`, compléter la page de confidentialité, passer la
recette du §8.

**Où tourne le relais.** Sur le domaine du site, de préférence : une route
serveur (`/api/evenements` chez un site Next) reçoit les balises en même
origine, sans CORS, et lit le cookie visiteur. Une Edge Function convient à
un site sans serveur, à deux conditions écrites dans le README :
`verify_jwt = false`, parce que `navigator.sendBeacon` ne pose aucun en-tête
(même piège que `dpe-paiement-webhook`), et le secret `service_role` côté
fonction seulement. Chez MonsieurDPE le choix est fait par le plafond : le
projet Supabase partagé est à 100 Edge Functions, ce sera une route Next.

**MonsieurDPE** (première installation) : le mouchard y remplace le sceau
image comme compteur de visiteurs, mais **pas avant une mesure** : les deux
tournent en parallèle un mois, on compare les visiteurs quotidiens, et le
sceau part si l'écart est stable et expliqué. Un compteur se mesure avant de
remplacer l'autre, jamais l'inverse (CLAUDE.md DPE, §2). Les gestes du
sourcing qui manquaient à `lead:131` sont le premier lot d'appels :
`resultat_ouvert` sur une ligne du tableau, `filtre`, `fichier_telecharge`
sur le CSV, `clic` sur l'offre à 49 euros, `recherche` avec la question
(déjà journalisée ailleurs : le libellé la reprend, le journal du sourcing
reste la source du SQL et des coûts).

**Pack Vendeur** (seconde) : `trackingService.trackEvent(nom, catégorie,
propriétés, dossier)` devient un adaptateur vers `geste(...)` avec une table
de correspondance nom PV → geste v1, l'ancien nom dans `detail.nom_pv`.
`pv_events` reste en lecture pour l'historique ; `baikal_dossier_events`
lit les deux tables jusqu'à ce que l'historique PV sorte de la fenêtre
utile, puis la branche `pv_events` tombe. Le relais `pv-track-event` est
remplacé par le relais du module.

## 8. La recette de contrôle, à passer à l'installation

Sept contrôles, comme `mesures-v1`. Le README les donne sous forme de
requêtes et de gestes à faire dans un navigateur en mode staff **puis** hors
mode staff.

1. Les deux tables, les deux fonctions et la vue existent, avec RLS forcée.
2. `baikal_reader` lit la vue : une requête sous ce rôle rend des lignes.
   Sur base partagée, où `postgres` a BYPASSRLS, le contrôle passe même si la
   policy manque : vérifier la policy par `pg_policies`, pas par le résultat.
3. Une page du site chargée en navigateur produit un `page_vue` en base dans
   la minute, avec un `page` sans `?`.
4. Un geste posé par le site (un `clic`) arrive avec son libellé.
5. L'identification : un visiteur anonyme fait deux gestes, laisse son
   adresse par le formulaire du site, et les deux gestes portent son adresse
   en base, plus un `identification`.
6. La fiche Baikal de cette adresse montre les trois gestes dans l'onglet
   Events, dans l'ordre.
7. Les mêmes gestes en mode staff n'apparaissent ni dans la vue ni dans la
   fiche.

Un site qui ne passe pas les sept n'est pas installé.

## 9. Ce que ça ouvre, sans le construire ici

- **Mailing déclenché par un geste** : « a ouvert un résultat et n'a pas
  payé », « a vu l'offre deux fois ». Le module mailing lira
  `baikal_evenements` ; c'est pour ça que la vue standard existe à part de la
  branche Events, et que le vocabulaire est fermé.
- **L'entonnoir d'audience** (`audience-v1`) : `engage` peut se dériver d'un
  geste au lieu d'un compte créé.
- **Un écran visiteurs** dans Baikal : les anonymes, par jour, avec leurs
  gestes, pour voir ce que font ceux qui ne laissent rien.
- **Les mesures** : `visiteurs`, `pages_vues`, `gestes` par jour dans
  `baikal_mesures`, dérivées de la vue standard. Chez MonsieurDPE, après la
  comparaison avec le sceau (§7).

## 10. Ce qui reste au constructeur

- Le SQL exact des deux fonctions, et les tailles (clés de `detail`,
  longueurs) telles que §4 les fixe.
- Le code de la bibliothèque et du relais : tout ce que §5 ne dit pas est
  son choix.
- La rédaction du README, en suivant la forme des contrats existants : ce
  que Claude Code du site doit faire, dans l'ordre, et la recette du §8.
- Le lot MonsieurDPE et le lot Pack Vendeur sont deux plans à part, chacun
  dans son dépôt, après que le module est écrit et relu.

## Choix faits par la session DPE, à relire par Eric

- Les anonymes ne vont sur aucune fiche et ne comptent que dans les mesures ;
  pas d'écran nouveau dans ce lot.
- Vocabulaire fermé, treize gestes, extension par version du module.
- Un visiteur, une adresse, la dernière gagne.
- Purge des anonymes à 90 jours, les identifiés gardés.
- L'heure est celle du serveur.
- Noms de gestes en français.
