-- Archive SEO multi-sites (spec 2026-08-25-hub-baikal-seo-v2).
-- Schema calque sur pack_vendeur.seo_snapshots (PV), plus app_id et source.
-- Search Console ne conserve que 16 mois et pv-admin interroge en direct :
-- cette table fige l'historique cote nous, par site.
-- dimension 'site' : cote Bing, la seule methode DATEE (GetRankAndTrafficStats)
-- renvoie une serie quotidienne sans requete ni page — lignes site entier.
-- granularity 'observation' : les tops query/page Bing sont des releves
-- ponctuels, l'API ne sait pas les borner dans le temps.

CREATE TABLE IF NOT EXISTS admin.seo_snapshots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id        text NOT NULL REFERENCES config.apps(id) ON DELETE CASCADE,
  source        text NOT NULL DEFAULT 'google',
  period_start  date NOT NULL,
  period_end    date NOT NULL,
  granularity   text NOT NULL DEFAULT 'month',
  dimension     text NOT NULL,
  key           text NOT NULL,
  clicks        integer NOT NULL DEFAULT 0,
  impressions   integer NOT NULL DEFAULT 0,
  ctr           numeric(8, 5),
  position      numeric(6, 2),
  is_noise      boolean NOT NULL DEFAULT false,
  captured_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seo_snapshots_source_chk CHECK (source IN ('google', 'bing')),
  CONSTRAINT seo_snapshots_dimension_chk CHECK (dimension IN ('query', 'page', 'site')),
  CONSTRAINT seo_snapshots_granularity_chk CHECK (granularity IN ('month', 'day', 'observation')),
  CONSTRAINT seo_snapshots_period_chk CHECK (period_end >= period_start),
  CONSTRAINT seo_snapshots_unique UNIQUE (app_id, source, period_start, period_end, dimension, key)
);

CREATE INDEX IF NOT EXISTS seo_snapshots_app_period_idx
  ON admin.seo_snapshots (app_id, source, period_start DESC, dimension);
CREATE INDEX IF NOT EXISTS seo_snapshots_key_idx
  ON admin.seo_snapshots (app_id, dimension, key, period_start DESC);

ALTER TABLE admin.seo_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.seo_snapshots FORCE ROW LEVEL SECURITY;
-- Lecon droits_sites : sans grant, meme service_role est refuse.
GRANT ALL ON admin.seo_snapshots TO service_role;

-- Crons d'archivage : POST vers l'EF admin-seo-snapshot, secret lu dans Vault
-- (jamais en clair ici). Mensuel le 4 a 05h00 UTC (mois civil precedent +
-- tops Bing) ; quotidien 04h15 UTC (serie Bing + refresh mois courant Google).
SELECT cron.schedule(
  'admin-seo-snapshot-mensuel',
  '0 5 4 * *',
  $cron$
  SELECT net.http_post(
    url := 'https://odspcxgafcqxjzrarsqf.supabase.co/functions/v1/admin-seo-snapshot',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets
                        WHERE name = 'admin_seo_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000)
  $cron$
);

SELECT cron.schedule(
  'admin-seo-snapshot-quotidien',
  '15 4 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://odspcxgafcqxjzrarsqf.supabase.co/functions/v1/admin-seo-snapshot',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets
                        WHERE name = 'admin_seo_cron_secret')),
    body := '{"scope":"daily"}'::jsonb,
    timeout_milliseconds := 120000)
  $cron$
);
