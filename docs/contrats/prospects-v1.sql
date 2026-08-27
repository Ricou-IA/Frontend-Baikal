-- ---------------------------------------------------------------------------
-- Module Prospects v1 — DDL de reference.
--
-- Installer chez un site : copier ce fichier dans une migration du site et
-- substituer @SCHEMA@ par le schema du produit. Les quatre objets sont
-- IDENTIQUES chez tous les sites ; seule la projection de l'annuaire local,
-- dans la vue baikal_prospects, est propre au site.
--
-- Ce qui est duplicable, c'est le module. La donnee d'annuaire ne l'est
-- JAMAIS : un annuaire reimporte chaque nuit reste ou il est, et la vue le
-- projette. Le materialiser ici recreerait la recopie de 03h30 et son ecart
-- de +29 % entre ce que la console annonce et ce que la campagne adresse.
-- ---------------------------------------------------------------------------

-- ------ 1. Le receptacle standard ------
--
-- N'accueille QUE les prospects sans annuaire source : import CSV, saisie
-- manuelle, et copie recue d'un autre site (lot 3). La cle est l'adresse,
-- normalisee par l'appelant : c'est ce qui a un sens de bout en bout, et ce
-- qui rend le transfert inter-sites un simple insert ... select.

create table if not exists @SCHEMA@.prospect (
  email        text        primary key,
  metier       text        not null
               check (metier in ('notaire','agent_immo','syndic',
                                 'diagnostiqueur','entreprise_rge','autre')),
  provenance   text        not null default 'import'
               check (provenance in ('annuaire_public','acquisition_propre',
                                     'import','scrape')),
  nom_affiche  text        not null,
  commune      text,
  code_postal  text,
  specialite   text[]      not null default '{}',
  siret        char(14),
  telephone    text,
  site_web     text,
  -- Lot 3 : l'app_id du site d'ou la ligne a ete copiee. Sans lui on ne peut
  -- pas dire d'ou vient un prospect qu'on n'a pas soi-meme collecte.
  origine_site text,
  cree_le      timestamptz not null default now()
);

comment on table @SCHEMA@.prospect is
  'Prospects sans annuaire source. Un prospect issu d''un annuaire du site '
  'n''a RIEN a faire ici : la vue baikal_prospects le projette depuis sa '
  'table d''origine.';

-- ------ 2. L'etat de prospection ------
--
-- Separe de l'annuaire ET du receptacle, parce qu'un annuaire reimporte
-- chaque nuit ecraserait tout statut qu'on y stockerait. Vaut pour TOUS les
-- prospects du site quelle que soit leur origine, d'ou la cle par adresse.

create table if not exists @SCHEMA@.prospect_etat (
  email    text        primary key,
  statut   text        not null default 'nouveau'
           check (statut in ('nouveau','contacte','relance','repondu',
                             'refus','desinscrit')),
  note     text,
  maj_le   timestamptz not null default now(),
  -- Qui a agi depuis la console. Sans cette colonne on ne peut pas dire qui
  -- a passe un prospect en refus.
  maj_par  text
);

comment on table @SCHEMA@.prospect_etat is
  'Ou en est la prospection pour une adresse. Le funnel s''arrete avant la '
  'conversion : un prospect converti devient un client, et c''est /clients '
  'qui le suit.';

-- ------ 3. Droits : service_role seul ------

alter table @SCHEMA@.prospect       enable row level security;
alter table @SCHEMA@.prospect       force  row level security;
alter table @SCHEMA@.prospect_etat  enable row level security;
alter table @SCHEMA@.prospect_etat  force  row level security;

revoke all on @SCHEMA@.prospect      from anon, authenticated;
revoke all on @SCHEMA@.prospect_etat from anon, authenticated;

grant select, insert, update, delete on @SCHEMA@.prospect      to service_role;
grant select, insert, update, delete on @SCHEMA@.prospect_etat to service_role;

create index if not exists prospect_metier on @SCHEMA@.prospect (metier);
