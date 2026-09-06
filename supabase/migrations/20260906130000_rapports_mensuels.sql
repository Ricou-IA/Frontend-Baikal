-- Rapport mensuel au partenaire SEO (spec 2026-09-06-rapport-mensuel-ia-media).
--
-- Chaque generation est archivee : la ligne porte les faits figes (JSON), les
-- textes valides par Eric et le chemin du PDF dans le bucket prive `rapports`.
-- Regenerer un mois cree une nouvelle version, l'ancienne reste lisible :
-- c'est l'historique de ce qui a ete communique au partenaire.

ALTER TABLE config.apps ADD COLUMN IF NOT EXISTS repo_github text;
COMMENT ON COLUMN config.apps.repo_github IS
  'Depot GitHub du site, forme owner/repo. Source des « evolutions du logiciel » du rapport mensuel. NULL = section absente.';

CREATE TABLE IF NOT EXISTS admin.rapports (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id         text NOT NULL REFERENCES config.apps(id) ON DELETE CASCADE,
  mois           date NOT NULL,
  version        integer NOT NULL DEFAULT 1,
  partenariat_id uuid REFERENCES admin.partenariats(id) ON DELETE SET NULL,
  contenu        jsonb NOT NULL,
  ebauche        text,
  evolutions     text,
  commentaire    text,
  pdf_path       text NOT NULL,
  genere_le      timestamptz NOT NULL DEFAULT now(),
  genere_par     uuid,
  CONSTRAINT rapports_mois_chk CHECK (mois = date_trunc('month', mois)::date),
  CONSTRAINT rapports_version_uniq UNIQUE (app_id, mois, version)
);
CREATE INDEX IF NOT EXISTS rapports_app_mois_idx ON admin.rapports (app_id, mois DESC, version DESC);

ALTER TABLE admin.rapports ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.rapports FORCE ROW LEVEL SECURITY;
GRANT ALL ON admin.rapports TO service_role;

COMMENT ON TABLE admin.rapports IS
  'Rapports mensuels generes pour le partenaire du site : faits figes, textes valides, PDF archive.';

-- Bucket prive : lecture par URL signee depuis l'EF admin-rapport uniquement.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('rapports', 'rapports', false, 20971520, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;
