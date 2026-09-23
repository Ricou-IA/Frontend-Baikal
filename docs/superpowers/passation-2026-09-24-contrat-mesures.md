# Passation du 24/09/2026 : contrat de mesures et chapitre Comptes pro

Chantier mené du 22 au 24/09 par la session « Stats site Baikal et contrat »,
avec la session MonsieurDPE (« Générations de dossier ce mois », dépôt
`C:\Dev\DPE`) et sous l'arbitrage d'Eric. Cette note dit où on en est. Les
décisions et leurs raisons sont dans les fichiers de référence, pas ici.

## Fichiers de référence

| Fichier | Rôle |
|---|---|
| `docs/superpowers/specs/2026-09-23-contrat-mesures-design.md` | Spec : pourquoi et comment |
| `docs/contrats/mesures-v1.sql` | Contrat des tuiles, avec sa recette |
| `docs/contrats/comptes-pro-v1.sql` | Contrat de la liste Comptes pro, avec sa recette |
| `docs/contrats/README.md` | Règles valables pour tous les contrats |

## Ce qui est en ligne

- **Registre** : `config.apps.fuseau` (défaut Europe/Paris, treize sites),
  module `comptes_pro` dans `core.modules_console()`, catégorie
  `inscrit_sans_fiche` pour monsieurdpe avec la couleur `sky`.
- **Edge Functions déployées** : `admin-site-stats` (action `mesures` par
  chapitre, à côté de l'action `overview` historique) et `admin-comptes-pro`.
- **Console** (Vercel, `main` à `d7daaca`) : bandeau de tuiles en tête de
  Clients, Finances et Comptes pro ; entonnoir pour les groupes déclarés
  `rendu = 'entonnoir'` ; nouvel onglet Comptes pro entre Clients et
  Prospects.
- **MonsieurDPE** publie ses trois chapitres et sa liste Comptes pro, et passe
  toutes les recettes. Eric a vu les tuiles le 24/09.

Il n'y a pas d'écran des statistiques. Décision d'Eric : une mesure s'affiche
en tête du chapitre auquel elle appartient.

## Qui fait quoi

- **Ici, Frontend-Baikal** : les contrats, le registre, les Edge Functions, la
  console.
- **Session MonsieurDPE** : tout ce qui est dans le dépôt DPE, dont les vues
  `dpe.baikal_*` et la journalisation.

Les demandes de changement d'une vue passent par Eric, qui les valide, puis
sont transmises à la session du site. Le contrat fait foi entre les deux : en
cas d'écart, c'est la vue qui se réaligne.

## Ordre fixé par Eric

1. **Terminer MonsieurDPE**, en cours. Prochaine étape : ses besoins
   d'affichage, dans une nouvelle conversation.
2. **Bascule de Pré-état-daté** (lot 6 de la spec).
3. **Onboarding de Conseil Solaire** (lot 7), traité comme un client extérieur.

## Ce qui reste

**Bascule de Pré-état-daté.** C'est le seul lot qui retire quelque chose d'un
écran en production.

- Publier ses vues dans `C:\Dev\Pack Vendeur`.
- Vérifier au centime que ses quatre nombres actuels (dossiers créés, dossiers
  payés, CA de la période, CA total) sont identiques via le contrat.
- Avant cela, vérifier les colonnes de date nullables. Chez MonsieurDPE,
  `debut_le` était nul sur deux abonnements sur trois.
- Retirer ensuite `statsParSite['pack-vendeur']`. `VueSite` sert encore Voirie
  et Majord'home : elle ne sortira d'`Admin.jsx` qu'une fois ces deux sites
  passés au contrat.

**Onboarding de Conseil Solaire.** C'est un test du parcours client, pas du
contrat : s'il faut modifier une Edge Function ou le front pour le brancher,
c'est que le contrat a échoué.

- Le particulier ira dans Clients, l'installateur dans Comptes pro.
- La base est aujourd'hui partagée avec HésiaSun. Les vues iront donc dans le
  schéma `leads`, avec un rôle `baikal_reader` à créer.
- Il n'est pas encore au registre.
- Le passage à un projet dédié ne changera que `db_schema` et
  `db_ro_secret_ref`.

**Documentation.** Le `CLAUDE.md` de Baikal décrit encore la vue d'ensemble
comme des KPI codés en dur. Une proposition de mise à jour est en attente dans
`.claude/proposed-updates.md`.

**Ouverts, non urgents.**

- La barre à neuf chapitres sur téléphone.
- Les périodes calendaires (« mois en cours »), qui demanderont une v2 du
  contrat.

## Pièges rencontrés

Chacun a coûté un écran faux ou vide, et chacun est désormais écrit dans le
contrat ou dans le code.

- **postgres.js envoie ses paramètres sans type.** `$1::date - $2` était
  interprété comme la soustraction de deux dates et renvoyait un nombre : 500
  à chaque appel. Les bornes se calculent maintenant en TypeScript.
- **Un composant qui tait ses erreurs.** Eric a vu une page vide, impossible à
  distinguer d'un site qui ne publie rien.
- **Un stock publié en jointure interne** reste bloqué à sa dernière valeur
  non nulle. Un stock doit publier ses zéros.
- **Un entonnoir dont les étapes n'ont pas le même historique** donne des
  taux absurdes (173 %). Il se calcule sur la période que toutes ses étapes
  mesurent.
- **Des tuiles posées à côté d'un total** sont additionnées par le lecteur.
  Elles doivent couvrir tout le total, dans la même unité.
- **Sur la base partagée**, Baikal lit les données avec le rôle `postgres`,
  qui a `BYPASSRLS`. Un grant manquant n'y est pas visible et n'apparaîtra
  qu'au déménagement vers un projet dédié. La recette le vérifie dans le
  catalogue.
