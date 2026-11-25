-- La synchro nocturne des diagnostiqueurs passe par admin-partenariats.
--
-- Jusqu'ici la tache appelait admin.sync_diagnostiqueurs('monsieurdpe'), qui
-- lit dpe.diag_certifie EN SQL dans la base de Baikal. MonsieurDPE quitte la
-- base partagee pour son projet dedie : sa table ne se lira plus d'ici. La
-- lecture passe desormais par le lecteur du site (_shared/sites.ts), qui suit
-- config.apps.db_ro_secret_ref, base partagee comme base dediee.
--
-- admin-partenariats est en verify_jwt = true : la passerelle exige un JWT,
-- d'ou la cle anon du coffre en Authorization, en plus du secret commun des
-- crons admin. cron.schedule sur un nom existant remplace la commande.
--
-- admin.sync_diagnostiqueurs reste en base, sans appelant, jusqu'au retrait du
-- schema dpe de la base partagee.

select cron.schedule(
  'admin-sync-diag-prospects',
  '30 3 * * *',
  $cron$
  select net.http_post(
    url := 'https://odspcxgafcqxjzrarsqf.supabase.co/functions/v1/admin-partenariats',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets
                                     where name = 'supabase_anon_key'),
      'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets
                        where name = 'admin_seo_cron_secret')),
    body := '{"action":"sync-diagnostiqueurs-cron","appId":"monsieurdpe"}'::jsonb,
    timeout_milliseconds := 120000)
  $cron$
);
