# Pré-état-daté — contrôles de cohérence et suppression manuelle

Baikal (le back-office unique) affiche la fiche d'un dossier avec huit
onglets identiques pour tous les produits, lus dans des vues SQL que chaque
produit publie. Pré-état-daté a déjà publié `baikal_dossier_champs` et les
vues qui l'accompagnent (prompt `2026-09-03-ped-vues-fiche-commune.md`). Ce
prompt porte trois changements indépendants : retirer la section COPROPRIETE
de `baikal_dossier_champs`, la remplacer par des contrôles de cohérence, et
ajouter une action de suppression manuelle au manifeste.

## 1. Retirer la section COPROPRIETE

`public.baikal_dossier_champs` émet aujourd'hui une section `COPROPRIETE` :
budget prévisionnel, charges courantes du lot, charges calculées, tantièmes
du lot, tantièmes totaux. Ces cinq lignes ne doivent plus s'afficher :
retirez-les de la vue, en une fois. La section `BIEN` reste inchangée.

**L'alerte d'écart de charges ne disparaît pas.** Elle est aujourd'hui
rattachée à cette section, mais elle n'est pas de la même nature que les
cinq lignes ci-dessus : c'est un contrôle de cohérence, simplement
**automatique** (calculé par vous), là où les contrôles du point 2 sont des
éléments **non extraits** qu'un vendeur doit aller chercher lui-même — les
deux appartiennent au même bloc à l'écran. Déplacez-la : elle devient une
ligne de plus dans les contrôles de cohérence du point 2, avec
`niveau: attention` et sa condition de déclenchement actuelle (écart de
20 % entre charges calculées et budget N-1) inchangée — seule la section
change.

Conséquence à ne pas manquer : une fois les cinq lignes ci-dessus retirées,
charges calculées et budget prévisionnel — les deux montants que l'alerte
compare — ne seront plus affichés nulle part à l'écran. Son libellé et son
message doivent donc se suffire à eux-mêmes : rappelez-y les deux montants
(ou l'écart en pourcentage) en toutes lettres. Sans ça, un lecteur qui voit
l'alerte n'a plus aucun moyen de savoir ce qu'elle compare.

## 2. Déclarer les contrôles de cohérence à la place

Votre ancien back-office affichait un bloc « CONTRÔLES DE COHÉRENCE / Non
extrait (3) — à compléter par le vendeur », qui listait les éléments que
l'analyse n'a pas pu extraire, avec pour chacun l'endroit où le vendeur doit
aller les chercher. Ce bloc doit revenir, et il regroupe désormais deux
natures de contrôle dans la même liste :

- les éléments **non extraits, à compléter par le vendeur** — les trois de
  l'ancien back-office (ex. quote-part du fonds de travaux) ;
- le contrôle **automatique** — l'alerte d'écart de charges déplacée du
  point 1, calculée par vous plutôt que laissée à compléter par un humain.

Les deux natures partagent la même mécanique d'affichage (un encart, un
`niveau`) et vivent dans le même bloc à l'écran : elles se déclarent donc de
la même façon, sous forme de nouvelles lignes dans la même vue
`baikal_dossier_champs` (ce n'est pas une nouvelle vue) :

| Colonne | Valeur |
|---|---|
| `section` | Le titre du bloc — texte libre. Vous pouvez y mettre le compteur des seuls éléments à compléter, par exemple `CONTROLES DE COHERENCE — 3 A COMPLETER` (l'alerte automatique n'est pas « à compléter » : ne la comptez pas dedans). |
| `ordre_section` | `2`, pour venir juste après `BIEN`. |
| `libelle` | L'intitulé du contrôle — ex. « Quote-part du fonds de travaux rattachée au lot cédé » pour un élément non extrait, ou votre libellé actuel d'alerte pour le contrôle automatique. |
| `valeur` | Pour un élément non extrait, l'instruction, ex. « à récupérer sur le détail du fonds de travaux par lot — ajoutez ce document à votre dossier et relancez l'analyse ». Pour le contrôle automatique, le message actuel de l'alerte, complété comme demandé au point 1 (les deux montants comparés en toutes lettres). |
| `niveau` | `attention`. |
| `format` | `texte` ou absent (`texte` est le défaut). |

Une ligne par élément non extrait, plus une ligne pour l'alerte de charges
quand elle se déclenche.

Baikal rend désormais tout champ à `niveau` non nul comme un encart pleine
largeur, teinté selon le niveau (ambre pour `attention`) — c'est le
changement qui accompagne ce prompt côté Baikal, et c'est ce qui rendra ce
bloc lisible : l'ancien rendu, une ligne de grille dans une demi-colonne
avec juste le texte coloré, ne s'applique plus à ces champs-là — illisible
pour une phrase de deux ou trois lignes.

Un contrôle résolu — élément extrait entre-temps, ou écart repassé sous le
seuil — doit simplement ne plus émettre sa ligne la fois suivante : la
règle du contrat est que les lignes absentes ne s'affichent pas. Il n'y a
rien d'autre à faire côté affichage — pas d'état « résolu » à transmettre,
juste l'absence de la ligne. Cette règle vaut pour les deux natures de
contrôle.

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

**L'action existe déjà de votre côté** : `hard-delete`, déployée en
production le 2026-09-03 (commit `17400ab`). Il ne manque donc que sa
déclaration au manifeste — le code, lui, est écrit.

```json
{
  "id": "hard-delete",
  "libelle": "Supprimer definitivement",
  "icone": "trash",
  "variante": "danger",
  "super_admin": true,
  "confirmation": { "titre": "SUPPRIMER", "message": "…", "bouton": "SUPPRIMER" },
  "parametres": []
}
```

`icone: "trash"` est déjà dans la liste fermée (comme pour
`purge-documents`) ; `message` est à votre rédaction.

**L'`id` du manifeste EST le nom d'action que Baikal vous renverra.** Le
relais poste littéralement `{ "action": <cet id>, "dossier_id": … }` : c'est
pourquoi il doit valoir `hard-delete` et pas autre chose. Déclarer
`supprimer` ferait échouer le premier clic, votre handler ne connaissant pas
ce nom — le même piège que `emailAction` / `email_action`, que vous aviez
vu.

Trois points à traiter :

- **Exposez-la sur tous les dossiers, payés compris.** Eric a tranché ce
  point explicitement : l'action est réservée au super_admin, et un dossier
  payé peut légitimement devoir disparaître — un paiement de test, un
  doublon facturé, une erreur de saisie. Ne la conditionnez donc pas à
  l'absence de transaction. « Purger les documents » reste disponible à
  côté : les deux actions coexistent, à l'administrateur de choisir.
  (Pour mémoire, sans que cela change la consigne : la spec du module
  Clients avait remplacé la suppression par la purge au motif que les
  données de facturation doivent être conservées. La décision de rouvrir
  cette porte pour le seul super_admin appartient à Eric, elle est prise.)
- **L'action n'a jamais été appelée pour de vrai.** Vous l'avez signalé
  vous-mêmes : faute de jeton d'administration, elle n'a pu être testée que
  sur son mur d'authentification. Le premier appel réel viendra de Baikal, et
  il se fera sur un dossier sans valeur avant tout dossier chargé de pièces.
  Votre garde-fou — relire le dossier après le DELETE et répondre en erreur
  plutôt que par un faux succès — est exactement ce qu'il faut : Baikal
  remonte votre corps d'erreur jusqu'à l'écran, avec son statut.
- **Vous revérifiez le rôle vous-mêmes.** Le `super_admin` du manifeste
  construit l'interface, mais l'autorisation qui fait foi reste la vôtre,
  comme pour la purge et les crédits pro. Et n'exposez plus l'action sur un
  dossier déjà supprimé — comme vous l'avez déjà fait pour le dossier à la
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
