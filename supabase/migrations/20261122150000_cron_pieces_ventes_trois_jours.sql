-- Facturation : le passage mensuel des pieces de ventes se rejoue le 2 et le 3.
--
-- Le passage ne previent personne quand il echoue (Pennylane indisponible, par
-- exemple). Plutot qu'une alerte, il repasse deux jours de suite : une piece qui
-- existe deja est sautee sans erreur, celle qui manquait est creee. Les brouillons
-- restent dates du dernier jour du mois ecoule.
-- Rejouable : cron.schedule remplace la tache du meme nom.

SELECT cron.schedule(
  'admin-finance-pieces-ventes',
  '15 5 1-3 * *',
  $cron$
  SELECT net.http_post(
    url := 'https://odspcxgafcqxjzrarsqf.supabase.co/functions/v1/admin-finance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets
                        WHERE name = 'admin_seo_cron_secret')),
    body := '{"action":"pieces-planifiees"}'::jsonb,
    timeout_milliseconds := 180000)
  $cron$
);

-- Verification apres application (lecture seule) :
--   SELECT jobname, schedule, active FROM cron.job
--    WHERE jobname = 'admin-finance-pieces-ventes';        -- '15 5 1-3 * *', t
