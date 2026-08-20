-- ---------------------------------------------------------------------------
-- Module Partenariats : prospects, campagnes, envois.
-- Le client n'accede JAMAIS a ces tables en direct : tout passe par l'Edge
-- Function admin-partenariats (service_role). RLS forcee, aucune policy,
-- verrouillage par revoke (pattern eprouve, cf. schema dpe de MonsieurDPE).
-- ---------------------------------------------------------------------------

create schema if not exists admin;

create table if not exists admin.prospects (
  id          uuid primary key default gen_random_uuid(),
  app_id      text        not null,
  type        text        not null check (type in ('agence', 'diagnostiqueur', 'autre')),
  statut      text        not null default 'nouveau'
              check (statut in ('nouveau', 'contacte', 'relance', 'repondu',
                                'partenaire', 'refus', 'desinscrit')),
  email       text        not null,
  nom         text,
  prenom      text,
  entreprise  text,
  telephone   text,
  site_web    text,
  code_postal text,
  source      text        not null check (source in ('csv', 'diag_certifie', 'manuel')),
  donnees     jsonb       not null default '{}'::jsonb,
  cree_le     timestamptz not null default now(),
  maj_le      timestamptz not null default now(),
  unique (app_id, email)
);

create index if not exists prospects_app_statut on admin.prospects (app_id, statut);
create index if not exists prospects_app_type   on admin.prospects (app_id, type);

create table if not exists admin.campagnes (
  id         uuid primary key default gen_random_uuid(),
  app_id     text        not null,
  nom        text        not null,
  objet      text        not null default '',
  corps_html text        not null default '',
  segment    jsonb       not null default '{}'::jsonb,
  statut     text        not null default 'brouillon'
             check (statut in ('brouillon', 'envoyee')),
  cree_le    timestamptz not null default now(),
  envoyee_le timestamptz
);

create index if not exists campagnes_app on admin.campagnes (app_id);

create table if not exists admin.campagne_envois (
  id          uuid primary key default gen_random_uuid(),
  campagne_id uuid        not null references admin.campagnes(id) on delete cascade,
  prospect_id uuid        not null references admin.prospects(id) on delete cascade,
  statut      text        not null default 'envoye'
              check (statut in ('envoye', 'ouvert', 'clique', 'repondu',
                                'desinscrit', 'erreur')),
  resend_id   text,
  erreur      text,
  cree_le     timestamptz not null default now(),
  maj_le      timestamptz not null default now(),
  unique (campagne_id, prospect_id)
);

create index if not exists campagne_envois_campagne on admin.campagne_envois (campagne_id);
create index if not exists campagne_envois_resend   on admin.campagne_envois (resend_id);

alter table admin.prospects       enable row level security;
alter table admin.campagnes       enable row level security;
alter table admin.campagne_envois enable row level security;
alter table admin.prospects       force row level security;
alter table admin.campagnes       force row level security;
alter table admin.campagne_envois force row level security;

revoke all on admin.prospects       from anon, authenticated;
revoke all on admin.campagnes       from anon, authenticated;
revoke all on admin.campagne_envois from anon, authenticated;

grant usage on schema admin to service_role;
grant all on admin.prospects       to service_role;
grant all on admin.campagnes       to service_role;
grant all on admin.campagne_envois to service_role;
