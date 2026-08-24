-- Completude de l'archive (consigne Eric) : les exports GSC contiennent aussi
-- appareils, pays et apparence dans les resultats — on les archive.
ALTER TABLE admin.seo_snapshots
  DROP CONSTRAINT IF EXISTS seo_snapshots_dimension_chk;
ALTER TABLE admin.seo_snapshots
  ADD CONSTRAINT seo_snapshots_dimension_chk
  CHECK (dimension IN ('query', 'page', 'site', 'device', 'country', 'appearance'));
