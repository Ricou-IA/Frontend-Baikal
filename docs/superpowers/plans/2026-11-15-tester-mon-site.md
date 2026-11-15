# Plan — « Tester mon site » : le parcours d'onboarding public de Baikal

Rédigé le 15/11/2026. Statut : validé par Eric le 15/11/2026 (plan collé tel quel pour exécution).

## Objectif

Un fondateur qui a un SaaS sur Postgres arrive sur withbaikal.io, clique sur « Tester mon site » et découvre, sans compte ni email, ce que Baikal peut suivre chez lui, ce qui manque, et comment le corriger avec son agent de code. Il relance le test jusqu'à zéro échec.

Eric teste ce parcours comme un inconnu, en production, sur ses propres sites : Pack vendeur d'abord (déjà branché, il doit tout passer), puis Voirie, MonsieurDPE, DUERP, Conseil Solaire, HésiaSun et Majord'home. Chaque friction rencontrée corrige le kit d'onboarding, pas le site.

## Décisions prises (conversation du 15/11/2026)

- Postgres seulement. Un prospect sur une autre base l'apprend dès le premier écran.
- Pas d'email ni de compte dans cette version. Le résultat se retrouve par un lien privé gardé 30 jours. L'email viendra plus tard.
- Deux portes sur la même page : « Connecter Supabase » (connecteur OAuth, lecture de la structure sans mot de passe) et « Autre Postgres » (script du rôle en lecture seule, puis connexion à coller).
- Le test ne fait que lire. Le rôle baikal_reader est créé par le prospect ou par son agent, jamais par Baikal.
- La page est en production à l'adresse /tester, sans lien depuis la landing. Le bouton n'apparaît sur withbaikal.io que sur décision d'Eric.
- Le mode hors ligne (npx baikal-test) est retenu, mais pour plus tard. Il appellera le même moteur.

## Ce qu'Eric verra, lot par lot

| Lot | Ce qu'Eric voit à la fin |
|---|---|
| 0 | Les contrats dossiers et mesures décrits dans deux fichiers lisibles par le moteur. Rien à l'écran. |
| 1 | Un rapport de recette écrit dans le chat pour Pack vendeur, produit par le moteur sur des données d'essai. |
| 2 | Pour chaque site, la liste « Ce que Baikal voit dans votre base », produite à partir de la structure seule. |
| 3 | La fonction en ligne, appelable : je lui montre la réponse sur Pack vendeur. |
| 4 | La page /tester, porte « Autre Postgres », sur une adresse de prévisualisation Vercel, puis en production. |
| 5 | La porte « Connecter Supabase » : un clic, le choix du projet, le diagnostic. |
| 6 | Un compte rendu par site testé : temps passé, questions posées par l'agent, échecs au premier passage, corrections du kit. |

## Lot 0 — Les contrats lisibles par le moteur

Aujourd'hui, colonnes et requêtes de recette sont écrites en commentaire dans docs/contrats/*.sql. Le moteur a besoin de la même chose sous une forme qu'il sait lire.

- `docs/contrats/manifestes/dossiers-v1.json` et `mesures-v1.json` : vues, colonnes, types, obligatoire ou optionnelle, requêtes de recette avec @SCHEMA@, et pour chaque contrôle une phrase qui dit ce que le client verrait de faux (« Baikal lit 0 email, sans erreur »).
- Les autres contrats (comptes-pro, comptes-historique, prospects, mailing, audience, mail-stats) suivent dans un second temps. Le niveau 1 du kit n'en a pas besoin.
- Un test vérifie que chaque colonne citée dans un manifeste figure dans le .sql du même contrat : les deux fichiers ne peuvent pas diverger sans qu'un test le voie.

## Lot 1 — Le moteur de recette

Module pur dans `supabase/functions/_shared/recette/`, comme `admin-site-stats/mesures.ts` : aucune connexion dans le module, la lecture est passée en paramètre. C'est ce qui le rend testable et réutilisable par la fonction en ligne comme par le futur mode hors ligne.

- `controles.ts` : quatre familles de contrôles.
  - Présence et forme : vue présente ou absente, colonnes et types face au manifeste.
  - Recette : les requêtes du contrat, qui doivent rendre zéro ligne.
  - Accès : retrouver les tables sources de chaque vue dans le catalogue, vérifier leur grant et leur policy baikal_read.
  - Concordance : pour chaque colonne présente dans deux vues, accord ligne à ligne.
- `resultat.ts` : chaque contrôle sort conforme, en échec (avec le nombre de lignes et trois exemples au plus), absent, ou non mesuré (requête trop lente). Un contrôle non mesuré n'est jamais compté conforme.
- `masquage.ts` : les emails des exemples sortent masqués (j***@gmail.com).
- `recette.test.ts` : un lecteur factice rejoue les pannes déjà vues dans les contrats : table sans policy, stock publié sans ses zéros, attribution {}, catégorie qui change entre deux lignes d'une même personne, statut hors funnel, montant sans paye_le.

## Lot 2 — Le diagnostic de structure

`supabase/functions/_shared/recette/structure.ts`, pur lui aussi. Il prend la liste des tables et des colonnes, d'où qu'elle vienne (catalogue Postgres ou types fournis par Supabase), et rend :

- ce que Baikal repère : colonne d'email, identifiant Stripe, date de paiement, colonne de statut et ses valeurs, date de création, attribution ;
- ce qui manque pour le niveau 1, en phrases simples ;
- les vues Baikal déjà présentes ;
- ce que la console pourrait afficher chez ce prospect.

Les règles de repérage sont écrites en clair (noms de colonnes et types), sans modèle d'IA : même entrée, même diagnostic. Un test les rejoue sur la structure réelle de Pack vendeur et de Voirie, relevée une fois et versionnée.

`prompt.ts` fabrique le prompt à coller dans l'agent du prospect. Il contient la structure repérée, le texte des contrats utiles (les contrats sont dans un dépôt privé : le prompt doit se suffire à lui-même), le script du rôle en lecture seule, les échecs du dernier test, et la consigne de relancer le test.

## Lot 3 — La fonction en ligne baikal-test

Edge Function sans session, sur le modèle de baikal-demande. `verify_jwt = false` est ancré dans `supabase/config.toml`, comme pour admin-desinscription, pour qu'un redéploiement ne le remette pas à true.

Actions :

- `diagnostiquer` : connexion reçue, structure lue, diagnostic du lot 2 ;
- `tester` : connexion reçue, recette du lot 1 ;
- `resultat` : jeton reçu, dernier résultat rendu.

Garde-fous, tous testés :

- Postgres uniquement, SSL exigé ; refus de localhost, des adresses privées et des adresses de la plateforme ;
- transaction READ ONLY, 5 s par requête, 10 s pour se connecter, 60 s pour tout le test ;
- 10 tests par adresse IP et par heure, piège à robots comme sur le formulaire de demande ;
- la connexion n'est jamais écrite en base ni dans les journaux.

Migration `admin.tests_site` : jeton, date, résultat, empreinte de l'hôte (jamais l'hôte en clair), date d'expiration à 30 jours. Une tâche pg_cron purge les résultats expirés. La table a sa policy baikal_read, comme toute table de Baikal.

## Lot 4 — La page /tester, porte « Autre Postgres »

Page publique, `src/pages/marketing/TesterMonSite.jsx`, route `/tester` et `/tester/r/:jeton`. Elle reprend les écrans 2 à 4 de la maquette du 15/11 :

1. Le choix de la porte. « Autre Postgres » déroule le script du rôle baikal_reader, avec un mot de passe tiré au hasard dans le navigateur, et un bouton Copier.
2. Le champ de connexion, puis « Lancer le diagnostic ».
3. « Ce que Baikal voit dans votre base ».
4. Le prompt à copier, « Relancer le test », et le résultat contrôle par contrôle, niveau 1 puis niveau 2.

Le lien privé `/tester/r/:jeton` rouvre le dernier résultat. La page n'est liée d'aucune autre page du site.

## Lot 5 — La porte « Connecter Supabase »

- Action d'Eric : déclarer Baikal comme application OAuth dans l'organisation Supabase de Confer, avec l'accès en lecture à la base, et poser l'identifiant et le secret dans les secrets des Edge Functions.
- Edge Function `baikal-supabase` : départ de l'autorisation, retour, liste des projets du prospect, lecture de la structure du projet choisi par l'API de gestion. Les jetons ne vivent que le temps du test (une heure au plus) et ne sont jamais renvoyés au navigateur.
- Sur la page : « Connecter Supabase », choix du projet, diagnostic immédiat. Après le passage de l'agent, un seul champ : le mot de passe du rôle baikal_reader. Adresse, port et utilisateur sont déjà connus.

À vérifier au début du lot : l'appel exact de l'API de gestion qui rend la structure avec le seul accès en lecture. Si cet accès ne suffit pas, le diagnostic de la porte Supabase attendra le mot de passe, comme l'autre porte, et ce sera dit à Eric avant d'aller plus loin.

## Lot 6 — Les essais d'onboarding

Une session neuve par site, qui ne reçoit que la page /tester et le prompt qu'elle produit. Elle ne lit ni le dépôt Pack vendeur ni la base Baikal.

Ordre : Pack vendeur (témoin), Voirie, MonsieurDPE, DUERP, Conseil Solaire, HésiaSun, Majord'home. MonsieurDPE écrit ses vues sur une branche sans les appliquer ; on les compare à ses vues actuelles.

Compte rendu par essai dans `docs/onboarding/essais/AAAA-MM-JJ-<site>.md` : temps passé, questions posées par l'agent, échecs au premier passage, corrections apportées au kit avant le site suivant.

## Hors de ce plan

- Le bouton « Tester mon site » sur la landing : sur décision d'Eric, après le lot 6.
- L'email et la création de compte à la fin du parcours.
- Le mode hors ligne `npx baikal-test`.
- L'activation payante du site dans la console.

## Ce qui demande l'accord explicite d'Eric

- chaque migration appliquée en production (admin.tests_site, tâche de purge), une à la fois par `npx supabase db query --linked -f <fichier>` puis `npx supabase migration repair --linked --status applied <version>`, jamais `db push` ;
- chaque déploiement d'Edge Function (baikal-test, baikal-supabase) ;
- chaque push vers main du dépôt Baikal (déploiement Vercel) ;
- la création de l'application OAuth chez Supabase ;
- la création du rôle baikal_reader sur chacun des sites de test.

## Contrôles avant chaque commit

- `deno test` sur les fichiers `*.test.ts` touchés ;
- `deno check` sur les fonctions touchées (critère : aucune erreur nouvelle) ;
- `npm run lint` et `npm run build` pour la page ;
- pour la page : vérification du rendu dans le navigateur, sur ordinateur et sur téléphone.

## Questions ouvertes

- Les fonctions de Baikal peuvent-elles se connecter à n'importe quel hôte Postgres sur Internet ? `_shared/sites.ts` le fait déjà pour les bases dédiées, à confirmer pour un hôte inconnu au lot 3.
- Durée de conservation du résultat : 30 jours proposés.
- Faut-il garder une trace anonyme des tests (nombre, taux de réussite) pour mesurer le parcours ? Proposé : oui, sans hôte ni connexion, dans baikal_mesures de Baikal lui-même.
