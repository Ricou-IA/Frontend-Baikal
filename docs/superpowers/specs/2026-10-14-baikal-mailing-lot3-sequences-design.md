# Mailing — lot 3 : séquences (2026-10-14)

Suite de `2026-10-14-baikal-mailing-lot2-design.md`. Objectif concret : réécrire
dans Baikal, sans code chez pré-état-daté, la prospection de `pv-email-cron`
(3 touches `presentation` → `prospection-t2` → `prospection-t3`, 20/jour,
mandataires immo, 3 jours mini entre touches, coupe-circuit 5 % de rebonds sur
50 envois ; arrêtée aujourd'hui, `send_enabled: false`, 5 225 présentations
déjà parties).

## Ce qu'est une séquence

Une campagne **continue** dont le message a des **relances** : mail 1, puis
mail 2 J+n jours après le mail 1, mail 3 J+m jours après le mail 2… Une
personne entre dans la séquence quand elle entre dans la cible (étape ×
profil) et en sort **automatiquement** :

- quand elle **change d'étape** : elle ne correspond plus au WHERE de la cible
  (un prospect qui répond passe « Lead » chez PV, `responded_at`) ;
- quand elle se **désinscrit**, **rebondit définitivement** ou se **plaint**
  (`baikal_mail_optout`) ;
- quand elle a reçu le **dernier mail**.

Pas de nouveau moteur : le worker, le journal, le WHERE, le plafond et le
coupe-circuit du lot 2 servent tels quels.

## Données

- `admin.mail_campagnes.relances jsonb` (défaut `[]`) :
  `[{delai_jours, objet, corps_html}]`. Le mail 1 reste `objet` / `corps_html`.
  Une campagne avec au moins une relance est une séquence (toujours continue).
- Module `mailing-v1`, version 1.1 : `mail_envoi.touche int not null default 1`,
  clé `(campagne_id, email, touche)`. `mail_reserver` / `mail_marquer` lisent
  `touche` dans leurs lignes (absent = 1 : rétrocompatible). Migration chez
  MonsieurDPE et pré-état-daté.
- `admin.mail_campagnes.jours_ouvres boolean` : n'envoyer que du lundi au
  vendredi (fuseau du site), comme `pv-email-cron`.

## Moteur

Pour chaque mail k de la séquence, les candidats sont ceux de la cible
(`segment.ts`, source unique du WHERE) qui :

- k = 1 : n'ont encore rien reçu de la campagne ;
- k > 1 : ont reçu le mail k-1 il y a au moins `delai_jours` (envoyé, non en
  erreur) et pas encore le mail k.

Lot du passage : le plafond du jour (site et campagne) est servi **d'abord aux
relances**, de la dernière à la première, puis aux nouveaux entrants : finir
les séquences en cours avant d'en ouvrir de nouvelles. Coupe-circuit sur
l'ensemble de la campagne. Une séquence sans candidat attend une heure, comme
une campagne continue.

## Console

- Carte « Message » : onglets **Mail 1 · Relance 1 (J+3) · Relance 2 (J+3) ·
  + Ajouter une relance**. Chaque onglet : délai (sauf mail 1), objet avec les
  trois accroches IA, éditeur. L'IA reçoit le rang et le mail précédent :
  « relance plus courte, qui se réfère au premier mail sans le répéter ».
- Carte « Envoi » : « Une fois / En continu » ; dès qu'une relance existe, la
  campagne est une séquence, continue d'office.
- Suivi et Statistiques : une ligne par mail de la séquence (envois, délivrés,
  ouverts, cliqués, rebonds, désinscrits).

## Parité avec la prospection de PV

| PV (`app_settings.prospecting`) | Baikal |
|---|---|
| `categories: [mandataire_immo]` | étape « À conquérir » × profil « Agent immo » (agences comprises, décision 1) |
| `campaign_keys` 3 touches | Mail 1 + 2 relances |
| `min_days_between_touches: 3` | délai 3 jours sur chaque relance |
| `daily_cap: 20`, jours ouvrés seulement | « Au plus 20 envois par jour » + case « Jours ouvrés seulement » (`admin.mail_campagnes.jours_ouvres`, fuseau du site) |
| `bounce_breaker 5 % / 50` | coupe-circuit (déjà identique) |

## Décisions d'Eric (14/10/2026)

1. Mandataire ou agent immo, « c'est pareil » : profil `agent_immo` tel quel,
   pas de nouveau profil.
2. Les adresses déjà contactées par `pv-email-cron` peuvent recevoir la
   séquence Baikal (« on va avoir un mail un peu différent ») : pas de filtre
   `dernier_contact_le`, pas de colonne ajoutée à l'audience.
3. Le bloc prospection de `pv-email-cron` (robot quotidien de PV) reste coupé
   (`send_enabled: false`) ; le reste du robot (magic links, relances panier,
   nurture) n'est pas concerné.

## Hors lot 3

Arrêt sur clic ou réponse (Resend ne voit pas les réponses ; une réponse fait
déjà passer « Lead » chez PV), test A/B d'objet.
