# Module Événements v1 : le mouchard standard d'un site suivi par Baikal

Ce guide s'adresse au Claude Code du site qui installe le module. Tout ce
qu'il faut est dans `docs/contrats/` : ce fichier, `evenements-v1.sql`,
`evenements-v1.recette.sql`, `evenements-relais-v1.ts`, `evenements-v1.js`.

## 1. Ce que c'est

Un visiteur du site fait des gestes : il voit une page, lance une recherche,
ouvre un résultat, télécharge un fichier, clique sur une offre. Le module les
enregistre, une ligne par geste, et les rattache à l'adresse courriel du
visiteur dès que le serveur du site la connaît, y compris les gestes faits
avant. Baikal les lit par la vue `baikal_evenements`, et la fiche client les
montre dans sa timeline Events, dans l'ordre.

Ce n'est pas un rejeu de session (pas de curseur, pas de défilement), pas
l'attribution (le premier contact reste au contrat `attribution`), et pas un
écran Baikal de plus : la timeline existe déjà, elle s'enrichit.

## 2. Les six règles

1. **L'identification ne vient que du serveur du site.** Le navigateur ne peut
   pas envoyer d'adresse ; le relais et la fonction SQL rejettent une ligne
   qui en porte une. Sinon, n'importe quel visiteur écrirait des gestes sur la
   fiche de n'importe qui.
2. **Un fait déjà en base n'est pas un geste.** Un paiement réussi est dans la
   table des achats, un rapport envoyé dans celle des envois : la timeline les
   lit déjà. Le module journalise les gestes qui n'ont aucune autre table.
   `paiement_initie` (le clic sur « Payer ») en est un ; `paiement_reussi` n'en
   est pas.
3. **Le site répond de ce qu'il met dans un geste.** `page` est un chemin sans
   paramètres, imposé. `libelle` et `detail` sont libres, et le site sait ce
   qu'il a promis de ne pas conserver : un geste `recherche` dont le libellé
   est la question tapée est légitime sur un outil pro, interdit sur une page
   qui promet qu'une adresse recherchée n'est jamais gardée. Deux choses
   partent sans que le site les écrive : le **titre de la page** (libellé de
   `page_vue`) et les **segments du chemin**. Un site dont un titre ou un
   chemin peut porter une adresse ou un nom installe avec `titre: false` et
   vérifie ses chemins. Le site ajoute la ligne correspondante à sa page de
   confidentialité.
4. **Les tests sont exclus à la source.** `?staff=1` sur n'importe quelle page
   pose un drapeau persistant, `?staff=0` le retire ; les gestes partent en
   `est_test` et la vue standard les écarte. À poser une fois sur chaque
   appareil de l'équipe.
5. **Jamais bloquant, jamais visible.** Le navigateur envoie par lots, le
   relais répond 204 quoi qu'il arrive et journalise l'erreur. Un relais
   injoignable perd un lot, rien d'autre.
6. **Le vocabulaire est fermé.** Treize gestes, les mêmes chez tous les sites,
   pour que Baikal lise tous les sites de la même façon. Un geste de plus se
   propose au module et entre par une version, jamais par un site seul ;
   d'ici là, `autre` avec un libellé.

## 3. Installer, pas à pas

1. **La base.** Copier `evenements-v1.sql` dans une migration du site,
   remplacer `@SCHEMA@` par le schéma du produit (`dpe`, `public`…), appliquer.
   Le fichier est idempotent, il se rejoue sans risque.
2. **Le relais.** Copier `evenements-relais-v1.ts` dans le site (par exemple
   `lib/evenements-relais-v1.ts`). Poser l'enrobage « route Next » de la fin
   du fichier dans `app/api/evenements/route.ts` : c'est le choix à faire
   quand le site a un serveur, parce que le navigateur parle alors à sa
   propre origine, sans CORS, et que le serveur lit le cookie visiteur dans
   toutes ses routes. Un site sans serveur pose l'enrobage « Edge Function »
   et déploie avec `--no-verify-jwt` : `navigator.sendBeacon` ne pose aucun
   en-tête, et sans ce drapeau la fonction meurt en 401 sans un bruit. Dans
   les deux cas le client Supabase est celui de `service_role`, créé avec
   `db: { schema: "<schema>" }`.
3. **La bibliothèque.** Copier `evenements-v1.js` dans le site, avec un
   module d'accès qui l'installe une fois et la rend partout :
   ```js
   // lib/mouchard.js
   import { installer } from "./evenements-v1.js";
   export function mouchard() {
     return installer({ relais: "/api/evenements", nomCookie: "<schema>_visiteur" });
   }
   ```
   `installer` ne s'exécute qu'une fois par fenêtre (un second appel rend le
   même mouchard) et rend un mouchard inerte hors navigateur : l'appeler
   pendant un rendu serveur ne casse rien. Dans un layout Next, un composant
   client le monte :
   ```jsx
   "use client";
   import { useEffect } from "react";
   import { mouchard } from "@/lib/mouchard";
   export function Mouchard() { useEffect(() => { mouchard(); }, []); return null; }
   ```
   Dans un site Vite ou statique, `mouchard()` au point d'entrée suffit.
   La page vue est émise par la bibliothèque, au chargement et à chaque
   navigation interne. Partout ailleurs, `mouchard().geste(...)`.
4. **Les gestes.** Aux endroits de l'interface qui comptent :
   `mouchard.geste(geste, libelle, detail, dossierId)`. Le vocabulaire et les
   libellés attendus sont au §4. Commencer par ce qui manque à la timeline
   aujourd'hui, pas par tout ce qui bouge.
5. **L'identification.** Dans chaque route serveur qui apprend l'adresse du
   visiteur, appeler `evenement_identifier` (§5).
6. **La branche Events.** Ajouter la branche du §6 à la vue
   `baikal_dossier_events` du site, par `create or replace view`.
7. **La page de confidentialité.** Y ajouter ce que le module conserve : un
   identifiant de visiteur dans le navigateur, la liste des gestes et des
   pages vues, rattachés à l'adresse quand elle est donnée, gardés 90 jours
   sans adresse.
8. **La recette.** Passer les sept contrôles du §8 avant de dire que le site
   est installé.

## 4. Le vocabulaire

| geste | quand | `libelle` | `detail` courant |
|---|---|---|---|
| `page_vue` | chaque page, automatique | titre de la page | `referent` à part |
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

Tailles : `libelle` 200 caractères, `page` 300, `detail` 20 clés de valeurs
scalaires de 200 caractères au plus. Au-delà, la bibliothèque tronque ou
retire ; le relais et la fonction SQL rejettent ce qui arriverait quand même.

## 5. L'identification côté serveur

La fonction : `evenement_identifier(p_visiteur_id uuid, p_email text,
p_dossier_id text default null, p_origine text default 'formulaire')`. Elle
pose le rattachement, met l'adresse sur tous les gestes passés du visiteur,
et écrit le geste `identification` avec l'origine en libellé. Appel par le
client `service_role` : `supabase.rpc("evenement_identifier", { p_visiteur_id,
p_email, p_dossier_id, p_origine })`. Trois cas couvrent presque tout :

- **Formulaire de lead.** La route qui reçoit l'adresse lit le cookie
  `<schema>_visiteur` de la requête et appelle la fonction avec
  `p_origine = 'formulaire'`.
- **Connexion.** La route de retour du lien de connexion, ou le premier
  rendu serveur d'une page connectée, lit le cookie et appelle la fonction
  avec `p_origine = 'connexion'`.
- **Webhook de paiement.** Le webhook n'a pas de cookie. Au moment du
  `paiement_initie`, le site met `mouchard.visiteur()` dans les métadonnées
  de la session de paiement ; le webhook le relit et appelle la fonction
  avec `p_origine = 'paiement'` et le `dossier_id` de l'achat.

Un visiteur, une adresse : la dernière identification gagne. Un second
appel avec la même adresse complète le rattachement sans réécrire de geste
`identification` : la fonction peut s'appeler à chaque requête connectée
sans inonder la timeline. Une adresse invalide rend
`{ ok: false, erreur: "email invalide" }` et n'écrit rien.

**Le `dossier_id` envoyé par le navigateur n'est gardé que pour un visiteur
déjà rattaché.** Sinon n'importe qui écrirait sur la timeline du dossier de
son choix. Les gestes d'un anonyme sur la page d'un dossier reçoivent leur
`dossier_id` à l'identification, par l'argument `p_dossier_id`, qui doit
donc venir du serveur (la session, l'achat), jamais du corps de la requête.

## 6. La branche Events

La première colonne de `baikal_dossier_events` est le `dossier_id` du contrat
`dossiers-v1`, dont le contenu appartient au site.

Site dont la clé de fiche est l'adresse courriel (MonsieurDPE) :

```sql
union all
select e.email, e.survenu_le, e.geste, e.libelle, 'client',
       jsonb_strip_nulls(jsonb_build_object('page', e.page, 'dossier', e.dossier_id)) || e.detail
from @SCHEMA@.baikal_evenements e
where e.email is not null
```

Site dont la clé de fiche est un identifiant de dossier (Pack Vendeur) :

```sql
union all
select e.dossier_id, e.survenu_le, e.geste, e.libelle, 'client',
       jsonb_strip_nulls(jsonb_build_object('page', e.page)) || e.detail
from @SCHEMA@.baikal_evenements e
where e.dossier_id is not null
```

La branche lit la vue, jamais la table : une donnée dans deux vues se dérive
de celle qui fait autorité (README des contrats).

## 7. Reprendre un mouchard existant

Un site qui a déjà sa table d'événements la garde en lecture pour son
historique et branche le module à côté. Son ancien service de suivi devient
un adaptateur vers `mouchard.geste(...)`, avec une table de correspondance
ancien nom → geste v1, et l'ancien nom dans `detail.nom_ancien` pour ne rien
perdre des tableaux existants. L'ancien relais est retiré. La branche Events
lit les deux tables jusqu'à ce que l'historique ancien sorte de la fenêtre
utile, puis l'ancienne branche tombe.

## 8. La recette

Sept contrôles. Un site qui ne les passe pas tous n'est pas installé.

Les contrôles 1 et 2, et la moitié serveur du 5, sont automatiques : jouer
`evenements-v1.recette.sql`, `@SCHEMA@` substitué, dans n'importe quel client
SQL du projet (l'éditeur SQL de Supabase, `psql`, ou l'API de gestion). Elle
ne rend rien quand tout passe et nomme le contrôle manqué sinon. Elle couvre
aussi le comportement des fonctions, l'ordre des gestes d'un lot, le refus
du `dossier_id` d'un anonyme, l'identification idempotente et la purge
planifiée. Sur la base partagée, où Baikal lit en `postgres` avec BYPASSRLS,
le contrôle 2 vérifie les policies dans `pg_policies` et non par le résultat
d'une lecture : une policy manquante n'y cacherait rien aujourd'hui, mais
tout le jour où le site passe sur une base dédiée.

Les contrôles 3 à 7 se font dans un navigateur, d'abord **hors** mode staff :

3. Charger une page du site. Dans la minute :
   `select page, referent from <schema>.evenement where geste = 'page_vue' order by survenu_le desc limit 1`
   rend la page, sans `?`.
4. Faire un geste posé par le site (un clic nommé) :
   `select geste, libelle, detail from <schema>.evenement order by survenu_le desc limit 1`
   rend le geste avec son libellé.
5. Dans un navigateur neuf (ou après `localStorage.clear()` et suppression du
   cookie), faire deux gestes, puis laisser son adresse par le formulaire du
   site. `select geste, email from <schema>.evenement where email = '<adresse>' order by survenu_le`
   rend les deux gestes puis `identification`, tous les trois avec l'adresse.
6. Ouvrir la fiche de cette adresse dans Baikal : l'onglet Events montre les
   trois gestes dans l'ordre.
7. Refaire les mêmes gestes avec `?staff=1` sur la première page : ils sont
   dans `<schema>.evenement` avec `est_test = true`, absents de
   `<schema>.baikal_evenements` et de la fiche Baikal.
