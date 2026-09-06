-- Nouvelle dimension croisee « query_page » dans l'archive SEO : requete x
-- page, limitee aux pages cles et aux requetes suivies du site, cle
-- « requete|page ». Sans elle, la position d'une page sur son cluster est
-- illisible (piege 4 de la grille du flash audit). La contrainte de dimension
-- ne la connaissait pas : le backfill du 06/09 a echoue dessus.
ALTER TABLE admin.seo_snapshots DROP CONSTRAINT IF EXISTS seo_snapshots_dimension_chk;
ALTER TABLE admin.seo_snapshots ADD CONSTRAINT seo_snapshots_dimension_chk
  CHECK (dimension IN ('query', 'page', 'site', 'device', 'country', 'appearance', 'query_page'));
