-- Facturation, lot 2 : la designation portee par les factures d'un site.
--
--   facture_libelle : le nom du produit tel que le client doit le lire sur sa
--   facture. La fenetre « Facturer » le propose, suivi du libelle du dossier
--   quand le site en publie un (« <produit> : <adresse du bien> »). NULL = la
--   fenetre propose le nom interne de l'offre, a corriger a la main.
--
-- La vue public.apps liste ses colonnes une a une : elle n'expose pas celle-ci
-- et n'est pas recreee. Aucune donnee n'est ecrite. Rejouable sans effet.

ALTER TABLE config.apps
  ADD COLUMN IF NOT EXISTS facture_libelle text;

ALTER TABLE config.apps DROP CONSTRAINT IF EXISTS apps_facture_libelle_check;
ALTER TABLE config.apps
  ADD CONSTRAINT apps_facture_libelle_check
  CHECK (facture_libelle IS NULL OR char_length(facture_libelle) BETWEEN 1 AND 120);

COMMENT ON COLUMN config.apps.facture_libelle IS
  'Nom du produit porte par les factures du site (designation de la ligne) ; NULL = nom interne de l''offre.';

-- Verification apres application (lecture seule) :
--   SELECT count(*) FROM information_schema.columns
--    WHERE table_schema = 'config' AND table_name = 'apps'
--      AND column_name = 'facture_libelle';                                -- 1
--   SELECT count(*) FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'apps'
--      AND column_name = 'facture_libelle';                                -- 0
