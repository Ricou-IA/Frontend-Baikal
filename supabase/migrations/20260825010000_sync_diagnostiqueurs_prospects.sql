-- ---------------------------------------------------------------------------
-- Sync nocturne des diagnostiqueurs certifies vers admin.prospects.
--
-- dpe.diag_certifie / dpe.diag_site sont deja synchronisees chaque nuit a
-- 02h30 par le projet DPE (cron dpe-annuaire-diag-sync, CSV quotidien du
-- Ministere sur data.gouv.fr). Ici on ajoute seulement le pont interne vers
-- admin.prospects : INSERT ... SELECT, jamais de reecriture d'une fiche
-- existante (statuts du funnel et desinscrits intouchables).
--
-- La meme fonction sert au cron (03h30, apres la chaine amont 02h30/02h50)
-- et au bouton "Synchroniser" de la console (RPC via l'EF admin-partenariats).
-- Spec : docs/superpowers/specs/2026-08-24-sync-diagnostiqueurs-prospects-design.md
-- ---------------------------------------------------------------------------

create or replace function admin.sync_diagnostiqueurs(p_app_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_schema     text;
  v_lus        bigint;
  v_avec_email bigint;
  v_inseres    bigint;
begin
  select db_schema into v_schema from config.apps where id = p_app_id;
  if v_schema is null then
    raise exception 'Site % sans base configuree (db_schema)', p_app_id;
  end if;
  if to_regclass(format('%I.diag_certifie', v_schema)) is null
     or to_regclass(format('%I.diag_site', v_schema)) is null then
    raise exception 'Tables diag_certifie/diag_site absentes du schema %', v_schema;
  end if;

  -- Meme mapping que l'ancien import manuel : dedoublonnage par email
  -- normalise, entreprise = nom_affiche du site, commune dans donnees.
  execute format($sql$
    with lignes as (
      select lower(trim(c.email)) as email,
             c.nom, c.prenom, c.telephone,
             s.nom_affiche, s.code_postal, s.commune
      from %I.diag_certifie c
      join %I.diag_site s on s.slug = c.slug
      where c.email is not null
    ),
    valides as (
      select distinct on (email) *
      from lignes
      where position('@' in email) > 0
      order by email, nom_affiche, nom, prenom
    ),
    inserees as (
      insert into admin.prospects
        (app_id, type, email, nom, prenom, entreprise, telephone,
         code_postal, source, donnees)
      select $1, 'diagnostiqueur', email, nom, prenom, nom_affiche,
             telephone, code_postal, 'diag_certifie',
             jsonb_build_object('commune', commune)
      from valides
      on conflict (app_id, email) do nothing
      returning 1
    )
    select (select count(*) from lignes),
           (select count(*) from valides),
           (select count(*) from inserees)
  $sql$, v_schema, v_schema)
  into v_lus, v_avec_email, v_inseres
  using p_app_id;

  -- Trace des compteurs dans les logs Postgres (cron.job_run_details ne porte que le statut).
  raise log '[sync_diagnostiqueurs] app=% lus=% avec_email=% inseres=%',
    p_app_id, v_lus, v_avec_email, v_inseres;

  return jsonb_build_object(
    'lus', v_lus,
    'avecEmail', v_avec_email,
    'inseres', v_inseres,
    'doublons', v_avec_email - v_inseres);
end;
$$;

-- Execute par le cron (postgres, owner) et par l'EF (service_role via RPC).
revoke all on function admin.sync_diagnostiqueurs(text) from public, anon, authenticated;
grant execute on function admin.sync_diagnostiqueurs(text) to service_role;

-- Rejouable : on deprogramme puis on reprogramme (pattern DPE). Un rejeu reattribue un jobid,
-- l'historique cron.job_run_details repart a zero -- acceptable pour un rejeu exceptionnel.
select cron.unschedule('admin-sync-diag-prospects')
where exists (select 1 from cron.job where jobname = 'admin-sync-diag-prospects');

-- 03h30, apres la chaine amont du projet DPE (sync annuaire 02h30, geocodage
-- 02h50, meme horloge) : les prospects refletent le CSV du jour. Appel SQL
-- direct : pas de pg_net, pas de secret. MonsieurDPE est le seul site avec des
-- tables diag_* ; un autre site un jour = un appel de plus, pas une mecanique.
select cron.schedule(
  'admin-sync-diag-prospects',
  '30 3 * * *',
  $cron$ select admin.sync_diagnostiqueurs('monsieurdpe'); $cron$
);

-- La fonction doit etre visible en RPC immediatement.
notify pgrst, 'reload schema';
