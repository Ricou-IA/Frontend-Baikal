-- ---------------------------------------------------------------------------
-- Module Mailing v1.1 — sequences (lot 3, spec 2026-10-14-baikal-mailing-lot3).
--
-- A jouer chez chaque site qui a installe mailing-v1.sql, @SCHEMA@ substitue
-- (dpe chez MonsieurDPE, public chez pre-etat-date). Retrocompatible : une
-- ligne sans `touche` vaut le mail 1, les campagnes du lot 1/2 ne changent pas.
--
-- Une sequence ecrit une ligne PAR MAIL (touche 1, 2, 3...) et par adresse :
-- la cle devient (campagne_id, email, touche). Les parties propres au site
-- (baikal_mail_optout, mail_desinscrire) ne changent pas.
-- ---------------------------------------------------------------------------

alter table @SCHEMA@.mail_envoi add column if not exists touche int not null default 1
  check (touche between 1 and 20);

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = '@SCHEMA@.mail_envoi'::regclass and contype = 'p'
      and array_length(conkey, 1) = 2
  ) then
    alter table @SCHEMA@.mail_envoi drop constraint mail_envoi_pkey;
    alter table @SCHEMA@.mail_envoi add primary key (campagne_id, email, touche);
  end if;
end $$;

-- p_lignes : [{email, population, destinataire_id, touche}] (touche absente = 1).
create or replace function @SCHEMA@.mail_reserver(p_campagne_id uuid, p_lignes jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_reserves jsonb;
begin
  with candidats as (
    select distinct on (lower(trim(l->>'email')), coalesce((l->>'touche')::int, 1))
           lower(trim(l->>'email'))          as email,
           coalesce((l->>'touche')::int, 1)  as touche,
           l->>'population'                  as population,
           l->>'destinataire_id'             as destinataire_id
    from jsonb_array_elements(p_lignes) l
    where lower(trim(l->>'email')) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  ), inseres as (
    insert into @SCHEMA@.mail_envoi (campagne_id, email, touche, population, destinataire_id)
    select p_campagne_id, c.email, c.touche, c.population, c.destinataire_id
    from candidats c
    where not exists (select 1 from @SCHEMA@.baikal_mail_optout o where o.email = c.email)
    on conflict (campagne_id, email, touche) do nothing
    returning email
  )
  select coalesce(jsonb_agg(email), '[]'::jsonb) into v_reserves from inseres;
  return jsonb_build_object('ok', true, 'reserves', v_reserves);
end; $$;

-- p_lignes : [{email, touche, resend_id} | {email, touche, erreur}].
create or replace function @SCHEMA@.mail_marquer(p_campagne_id uuid, p_lignes jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  update @SCHEMA@.mail_envoi e set
    statut    = case when l->>'resend_id' is not null then 'envoye' else 'erreur' end,
    resend_id = coalesce(l->>'resend_id', e.resend_id),
    erreur    = case when l->>'resend_id' is not null then null else left(l->>'erreur', 500) end,
    envoye_le = case when l->>'resend_id' is not null then now() else e.envoye_le end
  from jsonb_array_elements(p_lignes) l
  where e.campagne_id = p_campagne_id
    and e.email = lower(trim(l->>'email'))
    and e.touche = coalesce((l->>'touche')::int, 1)
    and e.statut in ('reserve','erreur');
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'marques', v_n);
end; $$;

revoke all on function @SCHEMA@.mail_reserver(uuid, jsonb) from public, anon, authenticated;
revoke all on function @SCHEMA@.mail_marquer(uuid, jsonb)  from public, anon, authenticated;
grant execute on function @SCHEMA@.mail_reserver(uuid, jsonb) to service_role;
grant execute on function @SCHEMA@.mail_marquer(uuid, jsonb)  to service_role;

-- Population « audience » (lot 2) : les installations du lot 1 ne la connaissaient pas.
alter table @SCHEMA@.mail_envoi drop constraint if exists mail_envoi_population_check;
alter table @SCHEMA@.mail_envoi add constraint mail_envoi_population_check
  check (population in ('audience','prospects','clients','comptes'));
