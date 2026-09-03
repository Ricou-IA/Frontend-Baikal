# Pré-état-daté — contrôles de cohérence et suppression manuelle

Baikal (le back-office unique) affiche la fiche d'un dossier avec huit
onglets identiques pour tous les produits, lus dans des vues SQL que chaque
produit publie. Pré-état-daté a déjà publié `baikal_dossier_champs` et les
vues qui l'accompagnent (prompt `2026-09-03-ped-vues-fiche-commune.md`). Ce
prompt porte trois changements indépendants : retirer la section COPROPRIETE
de `baikal_dossier_champs`, la remplacer par des contrôles de cohérence, et
ajouter une action de suppression manuelle au manifeste.

## 1. Retirer la section COPROPRIETE

`public.baikal_dossier_champs` émet aujourd'hui une section `COPROPRIETE`
(budget prévisionnel, charges courantes du lot, charges calculées, tantièmes
du lot, tantièmes totaux — y compris l'alerte d'écart de charges qui y est
rattachée). Elle ne doit plus s'afficher : retirez toutes les lignes de
cette section de la vue, en une fois. La section `BIEN` reste inchangée.

## 2. Déclarer les contrôles de cohérence à la place

Votre ancien back-office affichait un bloc « CONTRÔLES DE COHÉRENCE / Non
extrait (3) — à compléter par le vendeur », qui listait les éléments que
l'analyse n'a pas pu extraire, avec pour chacun l'endroit où le vendeur doit
aller les chercher. Ce bloc doit revenir, sous forme de nouvelles lignes
dans la même vue `baikal_dossier_champs` (ce n'est pas une nouvelle vue) :

| Colonne | Valeur |
|---|---|
| `section` | Le titre du bloc — texte libre. Vous pouvez y mettre le compteur, par exemple `CONTROLES DE COHERENCE — 3 A COMPLETER`, calculé dans la vue. |
| `ordre_section` | `2`, pour venir juste après `BIEN`. |
| `libelle` | L'intitulé du contrôle, ex. « Quote-part du fonds de travaux rattachée au lot cédé ». |
| `valeur` | L'instruction, ex. « à récupérer sur le détail du fonds de travaux par lot — ajoutez ce document à votre dossier et relancez l'analyse ». |
| `niveau` | `attention`. |
| `format` | `texte` ou absent (`texte` est le défaut). |

Une ligne par élément non extrait.

Baikal rend désormais tout champ à `niveau` non nul comme un encart pleine
largeur, teinté selon le niveau (ambre pour `attention`) — c'est le
changement qui accompagne ce prompt côté Baikal, et c'est ce qui rendra ce
bloc lisible : l'ancien rendu, une ligne de grille dans une demi-colonne
avec juste le texte coloré, ne s'applique plus à ces champs-là — illisible
pour une phrase de deux ou trois lignes.

Un contrôle résolu doit simplement ne plus émettre sa ligne la fois
suivante : la règle du contrat est que les lignes absentes ne s'affichent
pas. Il n'y a rien d'autre à faire côté affichage — pas d'état « résolu » à
transmettre, juste l'absence de la ligne.

## 3. Ajouter l'action « Supprimer » au manifeste

Votre ancien back-office avait trois boutons : Re-extraire, Renvoyer email,
Supprimer. La fiche Baikal affiche « Purger les documents » à la place du
troisième — un choix délibéré du chantier précédent, parce que l'ancienne
suppression effaçait aussi les emails et la transaction. Eric souhaite le
retour d'une vraie suppression manuelle, réservée au super_admin, pour
retirer une entrée qui n'a rien à faire là : un test, un doublon, une saisie
erronée.

Elle se déclare dans votre manifeste (action `manifeste`), sans qu'une
ligne de Baikal change :

```json
{
  "id": "supprimer",
  "libelle": "Supprimer",
  "icone": "trash",
  "variante": "danger",
  "super_admin": true,
  "confirmation": { "titre": "SUPPRIMER", "message": "…", "bouton": "SUPPRIMER" },
  "parametres": []
}
```

`icone: "trash"` est déjà dans la liste fermée (comme pour
`purge-documents`) ; `message` est à votre rédaction.

Trois points à traiter :

- **La règle comptable se pose chez vous.** Votre manifeste est calculé pour
  un dossier donné : n'exposez « Supprimer » que sur un dossier sans
  transaction — jamais payé — et tenez-vous-en à la purge dès qu'un paiement
  existe. La contrainte reste là où elle est connue ; Baikal ne porte
  aucune règle métier.
- **Il faut aussi implémenter l'action** dans `pv-admin-dossiers`. Baikal
  relaiera `{"action":"supprimer","dossier_id":"…"}`. Ce que « supprimer »
  détruit exactement est votre décision.
- **Vous revérifiez le rôle vous-mêmes.** Le `super_admin` du manifeste
  construit l'interface, mais l'autorisation qui fait foi reste la vôtre,
  comme pour la purge et les crédits pro. Et n'exposez plus l'action sur un
  dossier déjà supprimé — comme c'était arrivé pour le dossier à la
  corbeille qui proposait encore un envoi d'email.

## 4. Recette

Au dernier passage sur le dossier de test partagé, les huit compteurs de la
fiche correspondaient exactement à la base : documents 15, résultat 2,
emails 3, chat 6, logs IA 44, données 2, events 59, champs 11. Aucun écart.

Une remarque cosmétique relevée au passage : le titre de section s'affichait
« COPROPRIETE » sans accent, juste en dessous d'un « COPROPRIÉTÉ » qui en
porte un. Sans objet une fois cette section retirée (point 1), mais la
remarque vaut pour vos futurs titres de section : Baikal les affiche tels
quels, en majuscules par CSS, sans jamais toucher aux accents — une
incohérence d'accent entre deux libellés voisins se voit à l'écran.
