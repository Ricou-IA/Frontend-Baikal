# Contrats

Baikal versionne ici ce que les sites doivent publier pour être administrés
depuis la console. Les sites l'appliquent dans leurs propres migrations.

Deux natures, à ne pas confondre.

**Un module** est un DDL de référence installé **tel quel** chez chaque site :
les objets sont identiques partout, seule la projection des données locales
est propre au site. `prospects-v1.sql` est un module.

**Un contrat de forme** ne fige que la forme : le nom de la vue, ses colonnes,
leurs types, la sémantique et la recette d'installation. Le corps de la vue
appartient au site, parce que personne d'autre que lui ne sait ce qu'est un
dossier ou un abonné chez lui. `mesures-v1.sql` est un contrat de forme.

## Installer un module chez un site

1. Copier le `.sql` dans une migration du dépôt du site.
2. Remplacer `@SCHEMA@` par le schéma du produit (`dpe`, `pack_vendeur`...).
3. Écrire la partie propre au site : pour `prospects-v1`, la projection de
   l'annuaire local dans la vue `baikal_prospects` ; pour `mesures-v1`, les
   branches de la vue `baikal_mesures`.
4. Adapter la table d'opt-out du cas `desinscrire` dans `prospect_action` :
   le fichier code en dur `@SCHEMA@.diag_optout`, qui est le nom de la table
   de DPE, pas un nom générique. Sans cette adaptation, « Désinscrire » échoue
   à chaque clic chez tout site dont la table d'opt-out porte un autre nom.
5. Passer la recette du contrat quand il en porte une (`mesures-v1`, §3).

## Règles

Le **module** est duplicable. La **donnée d'annuaire** ne l'est jamais : elle
reste dans sa table d'origine et la vue la projette.

**Toute table source d'une vue contractuelle a son `grant` ET sa policy
`baikal_read`.** Une table oubliée ne fait pas échouer la vue : elle la sert
amputée, sans une erreur. Trouvé le 23/09/2026 chez MonsieurDPE sur trois
tables, avec pour symptôme une timeline incomplète et la moitié des courriels
manquants.

**Une colonne qu'un site ne sait pas remplir est absente, jamais présente et
nulle.** La capacité se lit à la présence ; une colonne toujours vide se lit
comme un fait, pas comme une absence de mesure.

**Toute donnée présente dans deux vues contractuelles d'un même site se dérive
de celle qui fait autorité, jamais recalculée.** Deux définitions du même fait
s'écartent toujours, et aucune n'est fausse de son point de vue : c'est ce qui
rend l'écart introuvable. Deux cas vus le 23/09/2026 chez MonsieurDPE. Une
mesure qui coiffe une liste doit la lire (`comptes_pro_actifs` lit
`baikal_comptes_pro`), sans quoi la tuile et la liste annoncent deux nombres.
Et une colonne partagée par deux vues doit venir de celle qui porte le grain le
plus complet : `baikal_comptes_pro` avait sa propre cascade de catégorie, plus
courte que celle de `baikal_dossiers`, et la même personne sortait « inscrit
sans fiche » d'un côté, « agent immo » de l'autre.

Le contrôle correspondant, à l'onboarding : pour chaque colonne présente dans
deux vues, vérifier qu'elles s'accordent ligne à ligne.

| Contrat | Nature | Version | Sites installés |
|---|---|---|---|
| `prospects-v1.sql` | module | 1 | monsieurdpe |
| `mesures-v1.sql` | forme | 1 | monsieurdpe (sans `chapitre`, à compléter) |
| `comptes-pro-v1.sql` | forme | 1 | aucun |

Les vues de liste et les mesures se répondent : `baikal_dossiers` porte le
chapitre Clients, `baikal_comptes_pro` le chapitre Comptes pro, et
`baikal_mesures` coiffe chaque chapitre de ses tuiles. Une liste ne porte
jamais d'agrégat, une mesure ne porte jamais de personne.
