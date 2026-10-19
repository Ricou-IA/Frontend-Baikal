# Mailing lot 4 — écrire à des personnes choisies (à valider par Eric)

Date : 2026-10-19. Origine : recette Mailing, Pré-état-daté.
« Il faudrait pouvoir faire une sélection plus fine (cocher des cases pour envoyer
des mails à 2-3 personnes). Il faudrait aussi pouvoir accéder à l'envoi de mail
depuis la fiche d'un client, au moins la possibilité de lui envoyer en restant sur
Baikal. »

## Principe : une campagne « liste »

Les deux besoins sont un seul mécanisme : **une campagne dont le ciblage est une
liste d'adresses explicites**. Pas de second canal d'envoi :

- même WHERE (`segment.ts`, critère `emails`), donc mêmes exclusions dures :
  désinscrits (`baikal_mail_optout`), statuts refus/désinscrit, tests ;
- même worker, même journal `mail_envoi`, même lien de désinscription, même
  suivi webhook (délivré, ouvert, cliqué) et mêmes statistiques ;
- même éditeur et même rédaction assistée.

## 1. Le critère `emails` (segment.ts)

- `Criteres.emails: string[]` — adresses normalisées (`lower(trim)`), forme
  vérifiée, **50 au plus** (au-delà, c'est une campagne de ciblage).
- Valable pour toutes les populations : `AND lower(trim(v.email)) = ANY(emails)`.
  La population reste celle d'origine (prospects, clients, comptes, audience) pour
  que `{{nom}}` et `{{commune}}` se résolvent comme ailleurs.
- **Une liste explicite lève les exclusions par défaut** (presse, clients pour la
  population prospects) : la personne a été cochée, c'est un choix. Les exclusions
  dures restent.
- Une adresse cochée mais écartée (désinscrite…) est annoncée : « 3 cochés,
  2 destinataires — 1 désinscrit ». Le compteur vient de `compterCandidats`, comme
  aujourd'hui.

## 2. Cocher des lignes (Prospects, puis Clients et Comptes)

- Une case par ligne et « tout cocher » sur la page affichée. La sélection survit
  au changement de page et de filtres (mémorisée par adresse), et un bandeau la
  montre : « 3 sélectionnés · Écrire à ces 3 personnes · Vider ».
- « Écrire à ces N personnes » ouvre l'éditeur de campagne avec
  `population` = celle de la page, `criteres.emails` = la sélection. La carte
  Destinataires affiche alors la liste nominative (nom, email, retirer) à la place
  de l'entonnoir.
- « Écrire à cette sélection » (filtres, lot du 17/10) reste pour les envois
  larges : les deux boutons coexistent, le premier ne paraît que si au moins une
  ligne est cochée.

## 3. Envoyer depuis une fiche

Bouton « Envoyer un mail » dans FicheProspect, la fiche client (`fiche/Fiche`) et
FicheCompte, si le site a le module mailing et l'utilisateur le droit `mailing`
en écriture. Il ouvre, **sans quitter la fiche**, un rédacteur compact :

- objet ; texte (EditeurTexte, variables) ; « Rédiger » (IA, brief en une ligne) ;
- Tester (vers soi) ; Envoyer.
- Envoyer = action `envoyer_direct` de `admin-mailing` : crée la campagne liste
  d'une personne (nom « Mail à <nom ou email> », `continue = false`, marque
  `direct = true`), la lance, et réveille le worker sans attendre le cron de la
  minute. La fiche affiche « Envoyé » puis l'état (délivré, ouvert) au retour.
- Sous le bouton, l'historique des mails Baikal reçus par cette adresse
  (`mail_envoi` par email : date, objet, état). Les mails automatiques du site
  n'y figurent pas (pas de journal nominatif côté contrat aujourd'hui).

## 4. Liste des campagnes

Les envois directs y figurent avec un badge « Direct », repliés par défaut sous un
filtre « Masquer les envois directs » pour ne pas noyer les campagnes. Ils comptent
dans le plafond du jour du site.

## Hors périmètre

- Répondre à un mail reçu (pas de boîte de réception dans Baikal).
- Pièces jointes.
- Envoi direct sans module mailing installé chez le site.

## Vérifications

- Tests Deno : critère `emails` (normalisation, plafond 50, exclusions dures
  gardées, exclusions par défaut levées).
- Recette PV : cocher 2 prospects dont un désinscrit → 1 destinataire annoncé ;
  envoi direct à `eric.pudebat@confer-sas.fr` depuis une fiche (avec ton accord) →
  reçu, état « ouvert » remonté dans la fiche.
