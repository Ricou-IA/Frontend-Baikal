-- Canal d'administration des COMPTES de Pré-état-daté : pv-admin-pros, même
-- secret (ADMIN_ENV_PACKVENDEUR_KEY) et même anon key que le canal dossiers.
-- Spec PED : docs/superpowers/specs/2026-10-06-baikal-chapitre-comptes-design.md
update config.apps set env_admin_fn = 'pv-admin-pros' where id = 'pack-vendeur';
