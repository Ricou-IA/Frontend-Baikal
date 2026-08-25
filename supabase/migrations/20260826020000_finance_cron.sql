-- Capture financiere quotidienne a 04h30 UTC. Le SEO tourne a 04h15 : on ne
-- les croise pas. La veille plus une fenetre de rattrapage de 7 jours, pour
-- les paid_at tardifs et les remboursements posterieurs a la vente.
--
-- Le secret de cron est mutualise avec le SEO (admin_seo_cron_secret), deja
-- pose dans Vault et dans les secrets Edge Function : rien de neuf a creer.
-- PREREQUIS RESTANT : le secret ADMIN_STRIPE_KEY (cle restreinte en lecture),
-- sans lequel la capture leve et le cron loggue une erreur chaque nuit.
SELECT cron.schedule(
  'admin-finance-capture-quotidien',
  '30 4 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://odspcxgafcqxjzrarsqf.supabase.co/functions/v1/admin-finance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets
                        WHERE name = 'admin_seo_cron_secret')),
    body := '{"action":"capture","rattrapage":7}'::jsonb,
    timeout_milliseconds := 180000)
  $cron$
);
