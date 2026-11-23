# Onboarding : le prompt branche aussi les modules optionnels

Date : 23/11/2026. Approuvé par Eric le 23/11/2026 (« ok »).

## Pourquoi

Premier onboarding complet le 22/11 (conseil-solaire.fr) : le site s'ouvre dans la
console, Clients s'affiche, mais Comptes dit « module non disponible » alors que l'app
a des comptes utilisateur. Le prompt d'onboarding ne demandait que le niveau 1
(dossiers + mesures). Eric : « il aurait fallu que le prompt initial règle ça », et
« je ne veux pas quelque chose de compliqué ». Cible : un futur prospect voit ses
comptes dès l'ouverture, sans étape de plus.

## Ce qui change

- Le prompt d'entrée (`fabriquerPromptAgent`) demande, en plus du niveau 1, les
  contrats **optionnels** en lecture seule, chacun « si l'app a de quoi le remplir ;
  sinon ne crée pas la vue » : Comptes (`comptes-pro-v1`, `baikal_comptes_pro`) et
  sa fiche (`comptes-historique-v1`, `baikal_compte_historique`).
- Deux manifestes nouveaux, marqués `optionnel: true`, embarqués par `generer.ts`.
  Leurs vues et contrôles sont de niveau 2.
- La recette : un contrat optionnel dont aucune vue n'est publiée ne produit aucun
  contrôle (ni échec ni bruit). Publié, il est contrôlé comme les autres ; ses
  échecs remontent à l'agent dans `a_corriger` mais ne bloquent ni `niveau1_pret` ni
  l'ouverture du site.
- Le prompt précise qu'un « compte » est tout compte ouvert sur l'app (pro ou
  particulier) : `raison_sociale` = la société, à défaut le nom, à défaut l'email.

## Non-objectifs

- Prospects et Mailing : ils créent des tables et une fonction relais chez le site,
  hors de la lecture seule. Plus tard.
- L'écran vide du SEO et des Finances (invitation Search Console / Stripe).
- Aucun écran nouveau, aucune Edge Function nouvelle, aucune migration Baikal.

## Pour conseil-solaire

Rien à construire : Eric recolle le prompt depuis /tester. L'agent garde le rôle et
les vues en place, ajoute Comptes ; la console lit les vues en direct, le module
s'allume. Le site étant déjà au registre, le lien de résultat ne propose pas de le
rouvrir.

## Approches écartées

- Bouton « Activer ce module » par écran vide, avec prompt et vérification par la
  connexion du coffre : juste, mais un parcours de plus ; Eric veut que l'onboarding
  règle ça d'emblée.
- Prompt par module sans vérification : rien ne contrôle la vue écrite.

## Laissé au constructeur

La forme exacte du drapeau `optionnel` dans `Manifeste` et le traitement de la
jointure historique → comptes (contrôle SQL explicite, la liste vivant dans un autre
manifeste).
