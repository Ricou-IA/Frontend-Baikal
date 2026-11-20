-- Garde-fou « base dédiée » (spec 2026-11-20-contrat-membres-design.md, lot 0).
--
-- Un site qui a sa propre base s'authentifie chez lui. La page Utilisateurs
-- écrivait pourtant dans l'authentification de Baikal pour ces sites : le
-- compte était « créé » et ne se connectait nulle part. En attendant le
-- contrat Membres, toute écriture de compte pour un tel site est refusée.
--
-- Un site est sur base dédiée quand le registre lui connaît une connexion de
-- lecture (db_ro_secret_ref), la même définition que public.apps.heberge_dedie.

create or replace function core.app_sur_base_dediee(p_app_id text)
returns boolean
language sql
stable
security definer
set search_path = core, config, pg_temp
as $$
  select coalesce(
    (select a.db_ro_secret_ref is not null from config.apps a where a.id = p_app_id),
    false
  );
$$;

comment on function core.app_sur_base_dediee(text) is
  'Vrai si le site a sa propre base : ses comptes ne s''écrivent pas dans l''authentification de Baikal.';

-- Le site d'un compte : celui de son profil, sinon celui de son organisation.
create or replace function core.compte_sur_base_dediee(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = core, config, pg_temp
as $$
  select coalesce(
    (select core.app_sur_base_dediee(coalesce(p.app_id, o.app_id))
       from core.profiles p
       left join core.organizations o on o.id = p.org_id
      where p.id = p_user_id),
    false
  );
$$;

comment on function core.compte_sur_base_dediee(uuid) is
  'Vrai si le compte appartient à un site sur base dédiée (profil, sinon organisation).';

create or replace function core.refus_base_dediee()
returns jsonb
language sql
immutable
set search_path = pg_temp
as $$
  select jsonb_build_object(
    'success', false,
    'code', 'site_base_dediee',
    'error', 'Ce site gère ses comptes sur sa propre base : un compte créé ou modifié ici '
          || 'ne s''y connecterait pas. Passer par l''écran Équipe du site en attendant le contrat Membres.'
  );
$$;

revoke all on function core.app_sur_base_dediee(text) from public;
revoke all on function core.compte_sur_base_dediee(uuid) from public;
revoke all on function core.refus_base_dediee() from public;
grant execute on function core.app_sur_base_dediee(text) to service_role;
grant execute on function core.compte_sur_base_dediee(uuid) to service_role;

-- Les trois RPC d'écriture de la page Utilisateurs : la garde est posée dans
-- l'enveloppe publique, seule porte d'entrée de la console ; le corps métier
-- (core.*) n'est pas touché.

create or replace function public.assign_user_to_org(
  p_target_user_id uuid,
  p_org_id uuid,
  p_reason text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'majordhome', 'core', 'pg_temp'
as $$
begin
  if core.compte_sur_base_dediee(p_target_user_id)
     or core.app_sur_base_dediee((select o.app_id from core.organizations o where o.id = p_org_id)) then
    return core.refus_base_dediee();
  end if;
  return core.assign_user_to_org(p_target_user_id, p_org_id, p_reason);
end;
$$;

create or replace function public.update_user_role(
  p_target_user_id uuid,
  p_new_app_role text,
  p_new_business_role text default null::text,
  p_reason text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'majordhome', 'core', 'pg_temp'
as $$
begin
  if core.compte_sur_base_dediee(p_target_user_id) then
    return core.refus_base_dediee();
  end if;
  return core.update_user_role(p_target_user_id, p_new_app_role, p_new_business_role, p_reason);
end;
$$;

create or replace function public.remove_user_from_org(
  p_target_user_id uuid,
  p_reason text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'majordhome', 'core', 'pg_temp'
as $$
begin
  if core.compte_sur_base_dediee(p_target_user_id) then
    return core.refus_base_dediee();
  end if;
  return core.remove_user_from_org(p_target_user_id, p_reason);
end;
$$;
