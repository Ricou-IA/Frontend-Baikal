-- Décor local (Postgres JETABLE uniquement) : ce que la migration des lignes de
-- pièces touche, réduit au strict nécessaire. Données fictives.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;

create schema admin; create schema config;
create table config.apps (id text primary key, name text not null);
insert into config.apps values ('site-a', 'Site A');
create table admin.factures (
  id uuid primary key default gen_random_uuid(),
  app_id text not null references config.apps(id),
  stripe_payment_intent_id text not null unique,
  statut text not null default 'en_cours' check (statut in ('en_cours', 'brouillon', 'emise', 'erreur')),
  numero text,
  cree_le timestamptz not null default now()
);
create table admin.pieces_ventes (
  id uuid primary key default gen_random_uuid(),
  app_id text not null references config.apps(id),
  du date not null, au date not null,
  pennylane_invoice_id bigint not null,
  montant_ttc numeric(12, 2) not null,
  nb_ventes integer not null,
  cree_par uuid, cree_le timestamptz not null default now(),
  constraint pieces_ventes_unique unique (app_id, au)
);
