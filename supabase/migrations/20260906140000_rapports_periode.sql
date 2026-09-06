-- Le rapport au partenaire se borne par deux dates, plus seulement par mois
-- (demande d'Eric du 06/09/2026). Un mois civil reste le cas courant, mais un
-- trimestre ou une periode libre sont possibles. La table est vide a ce stade :
-- pas de reprise de donnees.

ALTER TABLE admin.rapports DROP CONSTRAINT IF EXISTS rapports_mois_chk;
ALTER TABLE admin.rapports DROP CONSTRAINT IF EXISTS rapports_version_uniq;
ALTER TABLE admin.rapports DROP COLUMN IF EXISTS mois;
ALTER TABLE admin.rapports
  ADD COLUMN IF NOT EXISTS debut date NOT NULL,
  ADD COLUMN IF NOT EXISTS fin   date NOT NULL,
  ADD CONSTRAINT rapports_periode_chk CHECK (fin >= debut),
  ADD CONSTRAINT rapports_version_uniq UNIQUE (app_id, debut, fin, version);
DROP INDEX IF EXISTS admin.rapports_app_mois_idx;
CREATE INDEX IF NOT EXISTS rapports_app_periode_idx ON admin.rapports (app_id, fin DESC, version DESC);
