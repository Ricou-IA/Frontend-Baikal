-- Les demandes de la landing (admin.demandes) deviennent les prospects du
-- site Baikal, lus par le module Prospects comme pour n'importe quel site :
-- Baikal publie sa propre vue contractuelle baikal_prospects (spec
-- 2026-08-27) dans son schéma (config.apps.db_schema = 'admin') et son
-- interface d'écriture prospect_action. Rien de spécifique côté console :
-- l'onglet Demandes de l'étage Baikal disparaît, /prospect sur le site Baikal
-- le remplace. Décision d'Eric du 08/09/2026 : « Demandes concerne l'étage
-- d'en dessous ».

-- Une note libre de prospection, distincte du message laissé par le
-- demandeur (message reste intact).
alter table admin.demandes add column if not exists note text;

-- Le métier du demandeur dans le vocabulaire commun.
insert into admin.metier (slug, libelle, couleur, ordre)
values ('fondateur', 'Fondateur SaaS', 'blue', 60)
on conflict (slug) do nothing;

create or replace view admin.baikal_prospects as
select d.id::text                                   as prospect_id,
       lower(trim(d.email))                         as email,
       'fondateur'::text                            as metier,
       'acquisition_propre'::text                   as provenance,
       coalesce(nullif(d.site, ''), lower(trim(d.email))) as nom_affiche,
       null::text                                   as commune,
       null::text                                   as code_postal,
       array[d.pile]::text[]                        as specialite,
       null::char(14)                               as siret,
       null::text                                   as telephone,
       nullif(d.site, '')                           as site_web,
       case d.statut
         when 'nouvelle'  then 'nouveau'
         when 'contactee' then 'contacte'
         when 'branchee'  then 'repondu'
         when 'ecartee'   then 'refus'
         else 'nouveau'
       end                                          as statut,
       null::timestamptz                            as dernier_contact_le,
       0                                            as nb_contacts,
       coalesce(d.note, d.message)                  as note,
       null::date                                   as client_depuis,
       d.cree_le,
       (d.email ~* 'pudebat|confer-sas|^(test|demo)[._-]|@(test|demo)\.|example\.com') as est_test
from admin.demandes d
where d.email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$';

comment on view admin.baikal_prospects is
  'Contrat prospects du site Baikal : les demandes déposées sur withbaikal.io (admin.demandes).';

-- Interface d''écriture appelée par public.baikal_prospect_action('baikal', ...).
create or replace function admin.prospect_action(
  p_action text, p_email text, p_valeur text default null, p_acteur text default null
) returns jsonb
language plpgsql security definer set search_path to ''
as $$
declare
  v_email  text := lower(trim(p_email));
  v_statut text;
begin
  if not exists (select 1 from admin.demandes where lower(trim(email)) = v_email) then
    raise exception 'Aucune demande pour %', v_email;
  end if;

  case p_action
    when 'statut' then
      v_statut := case p_valeur
        when 'nouveau'    then 'nouvelle'
        when 'contacte'   then 'contactee'
        when 'relance'    then 'contactee'
        when 'repondu'    then 'branchee'
        when 'refus'      then 'ecartee'
        when 'desinscrit' then 'ecartee'
      end;
      if v_statut is null then
        raise exception 'Statut inconnu: %', p_valeur;
      end if;
      update admin.demandes set statut = v_statut where lower(trim(email)) = v_email;

    when 'note' then
      update admin.demandes set note = nullif(p_valeur, '') where lower(trim(email)) = v_email;

    when 'desinscrire' then
      update admin.demandes set statut = 'ecartee' where lower(trim(email)) = v_email;

    when 'supprimer' then
      delete from admin.demandes where lower(trim(email)) = v_email;

    else
      raise exception 'Action inconnue: %', p_action;
  end case;

  return jsonb_build_object('ok', true, 'email', v_email, 'action', p_action);
end;
$$;

revoke all on function admin.prospect_action(text, text, text, text) from public, anon, authenticated;

-- Le canal de lecture de la console (rôle baikal_reader) ne voit que la vue :
-- les tables du schéma admin restent fermées (RLS forcée, service_role).
grant usage on schema admin to baikal_reader;
grant select on admin.baikal_prospects to baikal_reader;
