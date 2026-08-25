-- Capture financiere quotidienne a 04h30 UTC. Le SEO tourne a 04h15 : on ne
-- les croise pas. La veille plus une fenetre de rattrapage de 7 jours, pour
-- les paid_at tardifs et les remboursements posterieurs a la vente.
--
-- PREREQUIS : le secret 'admin_finance_cron_secret' doit exister dans Vault et
-- la meme valeur etre posee en secret Edge Function ADMIN_FINANCE_CRON_SECRET.
-- Sans cela le cron recoit un 401 chaque nuit, en silence.
SELECT cron.schedule(
  'admin-finance-capture-quotidien',
  '30 4 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://odspcxgafcqxjzrarsqf.supabase.co/functions/v1/admin-finance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets
                        WHERE name = 'admin_finance_cron_secret')),
    body := '{"action":"capture","rattrapage":7}'::jsonb,
    timeout_milliseconds := 180000)
  $cron$
);
