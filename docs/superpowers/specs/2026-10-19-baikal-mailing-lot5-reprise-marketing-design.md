# Mailing lot 5 — Baikal reprend le marketing des sites (à valider par Eric)

Date : 2026-10-19. Origine : recette Mailing, Pré-état-daté.
« Ce sont des mails du site car nous les avons codés, mais Baikal devrait prendre
le relais : c'est l'esprit de l'outil. »

Site pilote : Pré-état-daté (PV). Le résultat est un contrat : tout site branché
de la même façon délègue son marketing à Baikal sans code Baikal.

## Ce qui change de main, ce qui reste

Inventaire du site (21 types de mail, `C:\Dev\Pack Vendeur`, cartographie du
19/10) :

| Mail PV | Nature | Après le lot 5 |
|---|---|---|
| Relance panier J+1, J+3, Dernière chance J+5-7 | marketing | **Baikal** : séquence sur l'étape Engagé |
| Nurture E1 → E4 | marketing | **Baikal** : séquence sur Lead |
| Demande d'avis J+1-2, Drip éducation J+3 | marketing | **Baikal** : séquence sur Client |
| Prospection B2B (touches) | marketing | **Baikal** : déjà sur À conquérir (send_enabled PV reste false) |
| Rapport DPE offert | marketing sur événement | reste au site (PDF joint, déclenché par l'analyse) |
| Magic link initial et reprise, post-paiement, notaire a consulté, rappel d'expiration, mise à jour qualité, récap chatbot | transactionnel | **reste au site**, mesuré par Baikal |

Règle : **le produit envoie ce que l'utilisateur déclenche ; Baikal envoie ce
que le marketing décide.** Baikal n'imite jamais un transactionnel.

## 1. Variables par destinataire (contrat audience v1.1)

Les relances panier ont besoin de données du dossier. Le site les publie comme
**colonnes facultatives de `baikal_audience`** ; l'éditeur les propose comme
variables quand elles existent (capacité lue à la présence) :

| Colonne | Variable | Exemple |
|---|---|---|
| `lien_reprise` | `{{lien_reprise}}` | lien qui rouvre le dossier en cours |
| `adresse_bien` | `{{adresse}}` | adresse du bien |
| `expire_le` | `{{expiration}}` | date de fin d'accès |
| `montant` | `{{montant}}` | prix affiché au panier |

**Sécurité de `lien_reprise`** : jamais l'`access_token` du dossier. Le site
publie un lien `https://pre-etat-date.ai/reprendre?m=<jeton>` dont le jeton est
**dédié au mail** (table `pv_mail_jetons` : dossier, jeton aléatoire, expiration
14 j, révocable), échangé par le site contre une session de reprise. Une fuite du
lien par Baikal ou par une boîte mail n'ouvre qu'une reprise, expirée sous 14 j,
révocable. Le rendu Baikal (`message.ts`) refuse un lien qui n'est pas sur le
domaine du site.

Un mail qui utilise une variable absente pour un destinataire n'est pas envoyé
à ce destinataire (pas de « Reprenez votre dossier : » suivi de rien) ; le
compteur de l'éditeur l'annonce.

## 2. Gabarits repris des textes actuels

Les textes PV sont en dur dans `_shared/email-templates.ts`. Ils sont recopiés une
fois, à la main, comme **campagnes séquences Baikal en brouillon** (une par
famille), avec leurs délais d'origine :

- « Relance panier » : Engagé, mail 1 à J+1 de `etape_depuis`, relances +2 j et
  +3 j ; sortie dès le paiement (changement d'étape, déjà en place).
- « Nurture » : Lead, E1 J+0, E2 +2, E3 +3, E4 +5.
- « Après achat » : Client, avis J+1, éducation J+3.

L'exclusion « payé il y a moins de 30 jours » et « un seul dossier, le plus
avancé » du cron PV est déjà portée par l'entonnoir (une adresse = son étape la
plus avancée). Les pros (profil `pro`) sont exclus par le ciblage de profil.

## 3. Bascule type par type, sans trou ni doublon

1. PV : interrupteur `send_enabled` **par `email_type`** dans `pv_app_settings`
   (n'existe aujourd'hui que pour la prospection), lu par chaque bloc de
   `pv-email-cron`.
2. Pour chaque famille : lancer la séquence Baikal en continu, **le même jour**
   couper le type PV correspondant. Les adresses déjà au milieu d'une séquence
   PV la finissent côté PV : le cron PV garde les relances (J+3, J+5) des
   dossiers créés avant la date de bascule, et ne démarre plus de mail 1.
3. Comparer dans Statistiques (les deux lignes y figurent, groupes distincts)
   pendant deux semaines : délivrés, ouverts, cliqués, conversions (passage
   d'étape).
4. Après validation, retirer le code du bloc PV.

## 4. Statistiques et parité

Les envois Baikal de la famille apparaissent sous « Campagnes Baikal » et les
envois PV sous « Mails automatiques du site ». La conversion d'une séquence
(part des destinataires passés à l'étape suivante dans les 14 jours) s'ajoute au
suivi de campagne : c'est le chiffre qui dit si la reprise vaut le code PV.

## Découpage

- **Lot 5a, chez PV** : colonnes de `audience_mat` (`lien_reprise`,
  `adresse_bien`, `expire_le`, `montant`), table `pv_mail_jetons` et route
  `/reprendre`, interrupteurs par type dans le cron.
- **Lot 5b, Baikal** : variables facultatives (contrat audience v1.1, éditeur,
  rendu, garde « variable absente », garde de domaine du lien), indicateur de
  conversion d'une séquence.
- **Lot 5c, bascule** : gabarits recopiés, bascule famille par famille
  (panier, puis nurture, puis après achat).

## Hors périmètre

- Transactionnels (restent au site). Leur texte éditable depuis Baikal serait un
  lot ultérieur (le site lirait ses gabarits dans une table que Baikal écrit).
- Rapport DPE offert (pièce jointe, déclenché par l'analyse).
- A/B testing des objets.

## Questions à Eric

1. Ordre de bascule : relance panier d'abord (la plus rentable, la plus
   risquée), ou nurture d'abord (sans lien de reprise, donc sans le lot 5a) ?
2. Expéditeur : les mails PV partent de `noreply@` avec réponse vers
   `contact@` ; les campagnes Baikal partent de `contact@`. On garde `contact@`
   pour tout le marketing ?
