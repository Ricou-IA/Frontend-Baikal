-- Chapitre Prospects chez Pack Vendeur (spec PV 2026-10-06-baikal-chapitre-prospects-design.md).
-- 1. Métier « presse » : les contacts presse et créateurs de pre-etat-date.ai
--    entrent dans les prospects (décision Eric 2026-10-06). Un métier à part,
--    pas « autre » : c'est ce qui permettra au lot mailing de les exclure
--    d'un envoi commercial. couleur ∈ check de admin.metier : 'red'.
-- 2. Canal d'écriture : pack-vendeur relaie vers pv-admin-prospects
--    (passe-plat du kit, X-Baikal-Key = ADMIN_ENV_PACKVENDEUR_KEY déjà posée).
insert into admin.metier (slug, libelle, couleur, ordre)
values ('presse', 'Presse et créateurs', 'red', 70)
on conflict (slug) do update
  set libelle = excluded.libelle, couleur = excluded.couleur, ordre = excluded.ordre;

update config.apps set env_prospects_fn = 'pv-admin-prospects' where id = 'pack-vendeur';
