# Contrats de modules

Un module est un DDL de reference installe **tel quel** chez chaque site.
Baikal le versionne ici ; les sites l'appliquent dans leurs propres
migrations.

## Installer un module chez un site

1. Copier le `.sql` dans une migration du repo du site.
2. Remplacer `@SCHEMA@` par le schema du produit (`dpe`, `pack_vendeur`...).
3. Ecrire la partie propre au site : pour `prospects-v1`, la projection de
   l'annuaire local dans la vue `baikal_prospects`.
4. Adapter la table d'opt-out du cas `desinscrire` dans `prospect_action` :
   le fichier code en dur `@SCHEMA@.diag_optout`, qui est le nom de la table
   de DPE, pas un nom generique — sans cette adaptation, "Desinscrire" echoue
   a chaque clic chez tout site dont la table d'opt-out porte un autre nom.

## Regle

Le **module** est duplicable. La **donnee d'annuaire** ne l'est jamais : elle
reste dans sa table d'origine et la vue la projette.

| Module | Version | Sites installes |
|---|---|---|
| `prospects-v1.sql` | 1 | monsieurdpe |
