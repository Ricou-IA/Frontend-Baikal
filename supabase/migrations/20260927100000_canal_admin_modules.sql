-- ---------------------------------------------------------------------------
-- Canal d'administration des sites et module console « modules »
--
-- Contrat côté site : spec Majord'home
-- docs/superpowers/specs/2026-09-26-baikal-admin-modules-majordhome-design.md
-- (§ 4 = edge baikal-admin, § 6 = travail côté Baikal).
-- ---------------------------------------------------------------------------

-- 1. Le canal d'administration au registre
--
-- Un champ par canal, comme env_dossiers_fn et env_prospects_fn : le canal
-- « dossiers » (fiche client) et le canal « admin » (organisations, modules)
-- sont deux fonctions distinctes du site et doivent pouvoir coexister.
-- Tous partagent env_url, env_anon_key et env_secret_ref : un site = un
-- secret partagé.

ALTER TABLE config.apps ADD COLUMN IF NOT EXISTS env_admin_fn text;

COMMENT ON COLUMN config.apps.env_admin_fn IS
  'Nom de l''Edge Function d''administration du site (ex. baikal-admin chez '
  'Majord''home : catalogue, organisations, modules), appelée par l''EF '
  'admin-modules avec env_anon_key + X-Baikal-Key (secret nommé par '
  'env_secret_ref). NULL = canal absent, écran Modules « non disponible ».';

-- 2. Majord'home déclare son canal
--
-- env_anon_key : clé anon PUBLIQUE du projet ejqqqwudmizqisdkxohw (elle ne
-- sert qu'à passer le gateway ; l'autorisation réelle est le secret).
-- env_secret_ref : NOM du secret dans les Edge Function Secrets de Baikal ;
-- sa valeur est identique à MDH_BAIKAL_KEY côté Majord'home. Jamais la valeur
-- ici.

UPDATE config.apps SET
  env_url        = 'https://ejqqqwudmizqisdkxohw.supabase.co',
  env_anon_key   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqcXFxd3VkbWl6cWlzZGt4b2h3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMTI3MDcsImV4cCI6MjEwMTg4ODcwN30.LxOfw-gwJov6Z8-1qRqK-STZe5Aci5BEaxEp4xSnmVE',
  env_secret_ref = 'ADMIN_ENV_MAJORDHOME_KEY',
  env_admin_fn   = 'baikal-admin'
WHERE id = 'majordhome';

-- 3. Le module console « modules »
--
-- Ouvrir ou fermer un module chez un client du site est une décision
-- commerciale : un droit à part, jamais déduit de « users ».
-- Même conséquence assumée que pour comptes_pro (20260923120000) : les accès
-- CRÉÉS à partir de maintenant reçoivent le module en écriture (DEFAULT de
-- admin.droits_sites.modules), les accès EXISTANTS ne l'ont pas — module
-- absent = fermé. Les super admins ont tout.

CREATE OR REPLACE FUNCTION core.modules_console()
RETURNS text[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT ARRAY['clients', 'comptes_pro', 'prospects', 'finances',
               'rapports', 'seo', 'partenariats', 'users', 'modules'];
$$;

COMMENT ON FUNCTION core.modules_console() IS
  'Modules transverses de la console soumis aux droits par module (admin.droits_sites.modules).';
