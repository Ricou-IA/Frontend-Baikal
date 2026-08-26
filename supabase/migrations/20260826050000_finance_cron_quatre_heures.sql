-- Une capture par jour laissait les ventes du soir invisibles jusqu'au
-- lendemain matin (constate le 26/08 : vente encaissee a 22h39 UTC, cron a
-- 04h30). Passage a toutes les 4 heures, en gardant le decalage de 30 min qui
-- evite de croiser le cron SEO de 04h15.
SELECT cron.unschedule('admin-finance-capture-quotidien')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'admin-finance-capture-quotidien');

SELECT cron.schedule(
  'admin-finance-capture',
  '30 */4 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://odspcxgafcqxjzrarsqf.supabase.co/functions/v1/admin-finance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets
                        WHERE name = 'admin_seo_cron_secret')),
    body := '{"action":"capture","rattrapage":2}'::jsonb,
    timeout_milliseconds := 180000)
  $cron$
);
