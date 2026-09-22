-- ---------------------------------------------------------------------------
-- Contrat de mesures : le fuseau du site au registre, et le module Comptes pro
--
-- Spec : docs/superpowers/specs/2026-09-23-contrat-mesures-design.md
-- Contrats : docs/contrats/mesures-v1.sql, docs/contrats/comptes-pro-v1.sql
-- ---------------------------------------------------------------------------

-- 1. Le fuseau du site
--
-- La base stocke minuit heure de Paris exprimé en UTC : un `::date` nu rend la
-- VEILLE en fin de soirée. Les vues contractuelles publient donc un jour LOCAL,
-- et Baikal doit poser ses bornes de fenêtre dans le MÊME calendrier, sans quoi
-- la journée en cours est fausse des deux côtés à la fois. Le fuseau ne peut
-- donc pas rester une phrase du contrat : il doit être lisible par Baikal, et
-- sa place est le registre, comme tout ce qui est propre à un site.
--
-- Le défaut couvre les treize sites actuels sans rien changer.

ALTER TABLE config.apps
  ADD COLUMN IF NOT EXISTS fuseau text NOT NULL DEFAULT 'Europe/Paris';

COMMENT ON COLUMN config.apps.fuseau IS
  'Fuseau du site, au sens du calendrier de ses mesures. La vue baikal_mesures '
  'publie (horodatage at time zone <fuseau>)::date, et Baikal pose ses bornes '
  'de fenêtre dans le même fuseau. Changer l''un sans l''autre décale les '
  'séries d''un jour, silencieusement.';

-- 2. Le module Comptes pro
--
-- Les entreprises qui achètent au site, quand Clients liste l'acte commercial.
-- Un module de plus dans le catalogue soumis aux droits par site.
--
-- Conséquence assumée : le DEFAULT de admin.droits_sites.modules dérive de
-- cette liste, donc les accès CRÉÉS à partir de maintenant reçoivent le module
-- en écriture. Les accès EXISTANTS ne l'ont pas, et module absent = fermé :
-- un admin délégué ne verra Comptes pro que si on le lui accorde. C'est le
-- comportement voulu, pas un oubli de migration.

CREATE OR REPLACE FUNCTION core.modules_console()
RETURNS text[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT ARRAY['clients', 'comptes_pro', 'prospects', 'finances',
               'rapports', 'seo', 'partenariats', 'users'];
$$;

COMMENT ON FUNCTION core.modules_console() IS
  'Modules transverses de la console soumis aux droits par module (admin.droits_sites.modules).';
