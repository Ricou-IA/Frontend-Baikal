# Prospects ↔ entonnoir — rapprochement (à valider par Eric)

Date : 2026-10-17. Origine : recette Mailing, Pré-état-daté. « La base prospects est
confusante et il n'y a pas de lien UI entre les deux (juste du code). »

## Constat

Deux écrans regardent les mêmes adresses avec deux grilles :

| | Prospects (`/prospect`) | Mailing (`/mailing`, Entonnoir) |
|---|---|---|
| Source | `baikal_prospects` (leads + presse + `prospect`, une ligne par adresse) | `baikal_audience` (= `audience_mat` chez PV, toutes populations) |
| Découpage | statut de suivi (nouveau → refus/désinscrit) | étape (à conquérir → perdu) |
| En-tête | 5 tuiles : Adressables, Nouveaux, Contactés, Convertis, Désinscrits | 6 étapes en barres |
| Métier / profil | les 8 métiers d'`admin.metier`, 5 à 0 chez PV | les profils publiés par le site |
| Passage | aucun | « Voir des exemples » (5 lignes) |

## Parité mesurée (PV, 17/10/2026, tests exclus)

Les deux sources sont **cohérentes, à l'unité près** : tout prospect est dans
l'audience, et chaque écart s'explique par une règle.

| Étape (audience) | Audience | dont dans Prospects | Désinscrits | Entonnoir Mailing |
|---|---:|---:|---:|---:|
| À conquérir | 37 780 | 37 780 | 26 | 37 754 |
| Lead | 196 | 196 | 18 | 178 |
| Engagé | 54 | 11 | 7 | 47 |
| Client | 72 | 10 | 2 | 70 |
| Récurrent | 5 | 0 | 0 | 5 |
| **Total** | 38 107 | **37 997** = Adressables | **53** | |

- Entonnoir = audience − désinscrits (`baikal_mail_optout`) : exact sur les 5 étapes.
- Adressables (37 997) = à conquérir + lead + 21 prospects passés engagé/client.
- « Convertis 14 » = prospects avec `client_depuis` (10 clients + 4 comptes pro
  sans achat, qui sont « Engagé » pour l'entonnoir). « Client 70 » compte en plus
  les 62 particuliers payants qui n'ont jamais été prospects. **Deux définitions
  de « converti » : c'est la vraie source de confusion.**
- Les 196 leads sont `autre` dans Prospects et `particulier` dans l'audience
  (catégorie `diy`) : même personne, deux libellés.
- Presse 695 / 696 : une adresse est à la fois lead agent immo et contact presse ;
  Prospects garde le lead, l'audience la presse. Accepté.

Conclusion : pas de chantier de données. Le rapprochement est un chantier d'écran
et de vocabulaire.

## Décision proposée

**Prospects = la vue liste de l'entonnoir, limitée aux étapes où l'on prospecte.**
L'entonnoir dit *où en est* une adresse ; le statut de suivi dit *ce qu'on lui a
fait*. Le premier devient la grille principale, le second un filtre.

1. **En-tête de Prospects** : l'entonnoir (composant `Entonnoir` de Mailing, mêmes
   comptes facettés servis par `segment.ts`) remplace les 5 tuiles. Par défaut
   « À conquérir » + « Lead » cochés. Les tuiles Convertis/Désinscrits
   disparaissent : la conversion se lit au glissement d'étape, les désinscrits
   restent un filtre de statut.
2. **Liste** : filtrée par étape (jointure `baikal_prospects` ⋈ `baikal_audience`
   sur `email`, faite par l'EF `admin-prospects`). Colonne Statut conservée ; une
   pastille d'étape s'ajoute pour les 21 prospects passés engagé/client.
3. **Métiers** : chips limitées aux métiers présents (n > 0). Le libellé suit le
   profil de l'audience quand il existe (`particulier` plutôt que `autre`).
4. **Lien Prospects → Mailing** : bouton « Écrire à cette sélection » → ouvre
   l'éditeur de campagne, population `audience`, avec étapes, profils et
   département repris. Les filtres propres à Prospects (statut, provenance,
   recherche, téléphone) ne passent pas : l'éditeur l'annonce (« ciblage repris
   sans le statut et la provenance »), plutôt que de les inventer dans
   `segment.ts`.
5. **Lien Mailing → Prospects** : à côté de « Voir des exemples », « Voir la
   liste » quand la cible ne touche que des étapes prospectables (à conquérir,
   lead) → `/prospect?etapes=…&profils=…&dept=…`.
6. **Site sans `baikal_audience`** (MonsieurDPE aujourd'hui) : Prospects garde ses
   tuiles actuelles et aucun lien n'apparaît. Capacité lue à la présence.

## Hors périmètre

- Unifier les deux vues côté site (`baikal_prospects` reste le contrat de la
  fiche et des actions de suivi).
- Ajouter statut/provenance au ciblage Mailing.
- Changer la règle « une adresse = l'étape la plus avancée ».

## Questions à Eric

1. Par défaut, Prospects montre « À conquérir + Lead » ou seulement « À conquérir » ?
2. On garde une tuile « Désinscrits » (47 prospects, 53 sur toute l'audience) en tête, ou le filtre suffit ?
