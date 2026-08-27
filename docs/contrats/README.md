# Contrats de modules

Un module est un DDL de reference installe **tel quel** chez chaque site.
Baikal le versionne ici ; les sites l'appliquent dans leurs propres
migrations.

## Installer un module chez un site

1. Copier le `.sql` dans une migration du repo du site.
2. Remplacer `@SCHEMA@` par le schema du produit (`dpe`, `pack_vendeur`...).
3. Ecrire la partie propre au site : pour `prospects-v1`, la projection de
   l'annuaire local dans la vue `baikal_prospects`.

## Regle

Le **module** est duplicable. La **donnee d'annuaire** ne l'est jamais : elle
reste dans sa table d'origine et la vue la projette.

| Module | Version | Sites installes |
|---|---|---|
| `prospects-v1.sql` | 1 | monsieurdpe |
