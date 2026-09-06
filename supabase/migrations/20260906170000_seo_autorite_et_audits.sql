-- Autorite SEO (Moz) de nos domaines et des concurrents, un releve par mois,
-- et archive des audits SEO lances depuis Baikal. Demandes d'Eric du 06/09/2026
-- (relayees par la session « recherche concurrents » de Pack Vendeur).
--
-- Moz, palier gratuit : 50 lignes par mois, une ligne par domaine mesure.
-- Neuf domaines par releve -> un seul releve mensuel, jamais de retry
-- automatique (un echec se rejoue le mois suivant ou a la main).

ALTER TABLE config.apps ADD COLUMN IF NOT EXISTS seo_concurrents jsonb;
COMMENT ON COLUMN config.apps.seo_concurrents IS
  'Domaines suivis chez Moz (le notre en premier), tableau JSON. Chaque domaine coute une ligne de quota par mois.';

UPDATE config.apps SET seo_concurrents = '["pre-etat-date.ai","maison-du-pre-etat-date.fr","mon-pre-etat-date.fr","copro-assistance.fr","pre-etat-date-en-ligne.com","pre-etat-en-ligne.com","pre-etat-date-officiel.fr","preetatdateexpress.fr","hypotheques-en-ligne.fr"]'::jsonb
WHERE id = 'pack-vendeur';

CREATE TABLE IF NOT EXISTS admin.seo_autorite (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id               text NOT NULL REFERENCES config.apps(id) ON DELETE CASCADE,
  domaine              text NOT NULL,
  mesure_le            date NOT NULL,
  da                   integer,
  pa                   integer,
  spam                 integer,
  ref_domains          integer,
  external_links       integer,
  nofollow_ref_domains integer,
  deleted_ref_domains  integer,
  last_crawled         date,
  brut                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  cree_le              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seo_autorite_uniq UNIQUE (app_id, domaine, mesure_le)
);
CREATE INDEX IF NOT EXISTS seo_autorite_app_idx ON admin.seo_autorite (app_id, mesure_le DESC);
ALTER TABLE admin.seo_autorite ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.seo_autorite FORCE ROW LEVEL SECURITY;
GRANT ALL ON admin.seo_autorite TO service_role;
COMMENT ON TABLE admin.seo_autorite IS
  'Releve mensuel Moz (URL Metrics) par domaine suivi. Un releve rejoue le meme jour ecrase la ligne.';

-- Ligne de depart mesuree le 06/09/2026 par la session Pack Vendeur, pour
-- que la serie ne commence pas vide. Le premier passage automatique est
-- celui d'octobre.
INSERT INTO admin.seo_autorite (app_id, domaine, mesure_le, da, pa, spam, ref_domains, external_links, nofollow_ref_domains, deleted_ref_domains, last_crawled)
VALUES
  ('pack-vendeur', 'pre-etat-date.ai',           '2026-09-06',  7, 17,    3,  13,   90,   2,   1, '2026-08-19'),
  ('pack-vendeur', 'maison-du-pre-etat-date.fr', '2026-09-06',  9, 19,   22,  36, 3410,  21,  27, '2026-07-07'),
  ('pack-vendeur', 'mon-pre-etat-date.fr',       '2026-09-06',  3, 16,    8,   9,    9,   0,   4, '2026-08-06'),
  ('pack-vendeur', 'copro-assistance.fr',        '2026-09-06', 11, 28,    1,  76,  159,  12,   0, '2026-08-03'),
  ('pack-vendeur', 'pre-etat-date-en-ligne.com', '2026-09-06', 11, 28,   11,  81,  119,  19,  31, '2025-12-21'),
  ('pack-vendeur', 'pre-etat-en-ligne.com',      '2026-09-06',  5, 20,    6,  18,   26,  10,   5, '2026-07-06'),
  ('pack-vendeur', 'pre-etat-date-officiel.fr',  '2026-09-06',  1,  1,    2,   0,    0,   0,   1, '2026-08-10'),
  ('pack-vendeur', 'preetatdateexpress.fr',      '2026-09-06',  1,  1, NULL,   0,    0,   0,   0, NULL),
  ('pack-vendeur', 'hypotheques-en-ligne.fr',    '2026-09-06', 24, 39,    1, 533, 1282, 278, 133, '2026-07-05')
ON CONFLICT (app_id, domaine, mesure_le) DO NOTHING;

-- Audits SEO lances depuis Baikal : les blocs calcules (JSON) et le texte
-- relu. Le rapport au partenaire reprend le dernier audit de sa periode.
CREATE TABLE IF NOT EXISTS admin.seo_audits (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id   text NOT NULL REFERENCES config.apps(id) ON DELETE CASCADE,
  debut    date NOT NULL,
  fin      date NOT NULL,
  contenu  jsonb NOT NULL,
  texte    text,
  cree_le  timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  CONSTRAINT seo_audits_periode_chk CHECK (fin >= debut)
);
CREATE INDEX IF NOT EXISTS seo_audits_app_idx ON admin.seo_audits (app_id, fin DESC, cree_le DESC);
ALTER TABLE admin.seo_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.seo_audits FORCE ROW LEVEL SECURITY;
GRANT ALL ON admin.seo_audits TO service_role;

-- Cron mensuel le 5 a 05h30 UTC, apres la capture Search Console du 4.
-- Meme secret de cron que le SEO (Vault admin_seo_cron_secret).
SELECT cron.unschedule('admin-seo-autorite-mensuel') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'admin-seo-autorite-mensuel');
SELECT cron.schedule(
  'admin-seo-autorite-mensuel',
  '30 5 5 * *',
  $cron$
  SELECT net.http_post(
    url := 'https://odspcxgafcqxjzrarsqf.supabase.co/functions/v1/admin-seo-autorite',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets
                        WHERE name = 'admin_seo_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 180000)
  $cron$
);
