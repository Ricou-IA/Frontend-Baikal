-- Facturation : la piece de ventes du mois, preparee toute seule.
--
-- Le 1er de chaque mois a 05h15 UTC (apres la capture de 04h30, qui archive les
-- dernieres ventes du mois ecoule), admin-finance cree dans Pennylane le
-- BROUILLON de la piece de ventes du mois precedent, pour chaque site qui a un
-- compte de produits. Le brouillon est date du dernier jour du mois. Rien n'est
-- finalise : le comptable le relit et le valide dans Pennylane.
--
-- Premier passage : le 1er decembre 2026, pour novembre. Les mois anterieurs
-- sont rattrapes a part, par la meme action.
-- Un site sans vente, ou dont la piece existe deja, est passe sans erreur.
-- Rejouable : cron.schedule remplace la tache du meme nom.

SELECT cron.schedule(
  'admin-finance-pieces-ventes',
  '15 5 1 * *',
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
--    WHERE jobname = 'admin-finance-pieces-ventes';        -- 1 ligne, '15 5 1 * *', t
