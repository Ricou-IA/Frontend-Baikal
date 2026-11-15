-- « Tester mon site », lot 3 : purge quotidienne des résultats expirés de
-- admin.tests_site (lien privé gardé 30 jours après le dernier passage).
-- Tâche pg_cron locale à la base : aucun appel HTTP, aucun secret.

SELECT cron.unschedule('admin-tests-site-purge')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'admin-tests-site-purge');

SELECT cron.schedule(
  'admin-tests-site-purge',
  '20 3 * * *',
  $cron$DELETE FROM admin.tests_site WHERE expire_le < now()$cron$
);
