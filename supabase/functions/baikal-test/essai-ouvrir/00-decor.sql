-- Décor local pour exécuter la migration « ouvrir mon site » pour de vrai :
-- les schémas et tables que la base de Baikal a déjà, réduits à ce que la
-- migration touche, et un coffre factice aux MÊMES signatures que Vault.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'baikal_reader') then create role baikal_reader; end if;
end $$;

create schema admin; create schema config; create schema auth; create schema vault; create schema cron;

create table auth.users (id uuid primary key);
create table config.apps (
  id text primary key, name text not null, description text, is_active boolean default true,
  sort_order integer default 0, domaine text, db_schema text, db_ro_secret_ref text,
  modele_comptes text not null default 'organisations' check (modele_comptes in ('organisations', 'clients')),
  updated_at timestamptz default now()
);
insert into config.apps (id, name, sort_order, domaine, db_schema, modele_comptes) values
  ('pack-vendeur', 'Pack Vendeur', 50, 'pre-etat-date.ai', 'pack_vendeur', 'clients'),
  ('monsaas', 'Un homonyme déjà là', 60, 'autre-domaine.io', 'x', 'clients');
create table admin.droits_sites (
  user_id uuid not null references auth.users on delete cascade,
  app_id text not null references config.apps on delete cascade,
  cree_par uuid, cree_le timestamptz default now(), modules jsonb not null,
  primary key (user_id, app_id)
);

-- Le coffre factice : mêmes noms, mêmes signatures, sans chiffrement.
create table vault.secrets (
  id uuid primary key default gen_random_uuid(), name text unique, description text, secret text not null,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create view vault.decrypted_secrets as select id, name, description, secret as decrypted_secret, created_at, updated_at from vault.secrets;
create function vault.create_secret(new_secret text, new_name text default null, new_description text default '', new_key_id uuid default null)
returns uuid language sql as $$ insert into vault.secrets (secret, name, description) values (new_secret, new_name, new_description) returning id $$;
create function vault.update_secret(secret_id uuid, new_secret text default null, new_name text default null, new_description text default null, new_key_id uuid default null)
returns void language sql as $$
  update vault.secrets set secret = coalesce(new_secret, secret), name = coalesce(new_name, name),
         description = coalesce(new_description, description), updated_at = now() where id = secret_id $$;

-- pg_cron factice.
create table cron.job (jobname text primary key, schedule text, command text);
create function cron.schedule(p_nom text, p_quand text, p_commande text) returns bigint language sql as $$
  insert into cron.job values (p_nom, p_quand, p_commande)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command; select 1::bigint $$;
create function cron.unschedule(p_nom text) returns boolean language sql as $$ delete from cron.job where jobname = p_nom; select true $$;
