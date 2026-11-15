-- ---------------------------------------------------------------------------
-- Site d'essai du moteur de recette : un petit SaaS façon Pack vendeur, qui
-- publie le contrat dossiers-v1 (liste, emails, events) et mesures-v1, et qui
-- PASSE toute la recette. `pannes.sql` y injecte ensuite les pannes déjà vues.
--
-- Données inventées, base jetable. Joué par recette.pg.test.ts, qui substitue
-- @SCHEMA@. Ne s'installe chez aucun site.
-- ---------------------------------------------------------------------------

drop schema if exists @SCHEMA@ cascade;
create schema @SCHEMA@;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'baikal_reader') then
    create role baikal_reader login password 'essai';
  end if;
end $$;
grant usage on schema @SCHEMA@ to baikal_reader;

create table @SCHEMA@.pro_accounts (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  email text
);

create table @SCHEMA@.dossiers (
  id uuid primary key default gen_random_uuid(),
  email text,
  contact_name text,
  funnel_slug text not null default 'lead',
  pro_account_id uuid references @SCHEMA@.pro_accounts (id),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  is_test boolean,
  deleted_at timestamptz,
  amount_paid numeric(10, 2),
  stripe_payment_intent_id text,
  attribution jsonb,
  property_address text,
  updated_at timestamptz
);

create table @SCHEMA@.email_logs (
  id bigint generated always as identity primary key,
  dossier_id uuid references @SCHEMA@.dossiers (id),
  subject text not null,
  recipient text,
  status text not null default 'sent',
  sent_at timestamptz not null default now(),
  opened_at timestamptz
);

create table @SCHEMA@.events (
  id bigint generated always as identity primary key,
  dossier_id uuid references @SCHEMA@.dossiers (id),
  created_at timestamptz not null default now(),
  event_name text not null,
  label text,
  page_url text
);

-- Données : un compte pro et quatorze dossiers étalés sur vingt jours.
insert into @SCHEMA@.pro_accounts (id, company_name, email)
values ('00000000-0000-0000-0000-0000000000a1', 'Antique Immo', 'agence@antique-immo.fr');

insert into @SCHEMA@.dossiers
  (email, contact_name, funnel_slug, pro_account_id, created_at, paid_at, is_test, amount_paid,
   stripe_payment_intent_id, attribution, property_address, updated_at)
select
  'client' || n || '@exemple.fr',
  'Client ' || n,
  case when n % 3 = 0 then 'paye' when n % 3 = 1 then 'inscrit' else 'lead' end,
  case when n in (6, 12) then '00000000-0000-0000-0000-0000000000a1'::uuid end,
  now() - make_interval(days => 20 - n),
  case when n % 3 = 0 then now() - make_interval(days => 20 - n) + interval '1 hour' end,
  n = 14,
  case when n % 3 = 0 then 49.00 end,
  case when n % 3 = 0 then 'pi_essai_' || n end,
  case when n % 2 = 0
       then jsonb_build_object('referrer_domaine', 'google.com', 'channel', 'organic_search', 'capture', 'live') end,
  n || ' rue des Essais, 31000 Toulouse',
  now() - make_interval(days => 20 - n)
from generate_series(1, 14) as n;

insert into @SCHEMA@.email_logs (dossier_id, subject, recipient, status, sent_at, opened_at)
select d.id, 'Votre dossier est prêt', d.email, 'sent', d.created_at + interval '5 minutes',
       case when d.paid_at is not null then d.created_at + interval '2 hours' end
from @SCHEMA@.dossiers d;

insert into @SCHEMA@.events (dossier_id, created_at, event_name, label, page_url)
select d.id, d.created_at, 'dossier_cree', 'Dossier créé', '/commander' from @SCHEMA@.dossiers d
union all
select d.id, d.paid_at, 'achat', 'Achat', '/paiement' from @SCHEMA@.dossiers d where d.paid_at is not null;

-- RLS partout, et la boucle baikal_read : grant ET policy sur chaque table.
do $$
declare t text;
begin
  foreach t in array array['pro_accounts', 'dossiers', 'email_logs', 'events'] loop
    execute format('alter table @SCHEMA@.%I enable row level security', t);
    execute format('grant select on @SCHEMA@.%I to baikal_reader', t);
    execute format('create policy baikal_read on @SCHEMA@.%I for select to baikal_reader using (true)', t);
  end loop;
end $$;

-- ------ Contrat dossiers-v1 ------

create view @SCHEMA@.baikal_dossiers
with (security_invoker = true) as
select
  d.id::text              as dossier_id,
  d.email                 as email,
  d.contact_name          as contact_nom,
  d.funnel_slug           as statut,
  case when d.pro_account_id is null then 'b2c' else 'b2b' end as perimetre,
  d.created_at            as cree_le,
  d.paid_at               as paye_le,
  coalesce(d.is_test, false) as est_test,
  d.deleted_at            as supprime_le,
  coalesce(e.envoyes, 0)  as emails_envoyes,
  coalesce(e.ouverts, 0)  as emails_ouverts,
  d.amount_paid           as montant_ttc,
  'EUR'::text             as devise,
  d.stripe_payment_intent_id,
  d.attribution,
  p.company_name          as apporteur,
  d.property_address      as libelle,
  case when d.pro_account_id is null then 'particulier' else 'pro' end as categorie,
  d.pro_account_id::text  as compte_id,
  d.updated_at            as maj_le
from @SCHEMA@.dossiers d
left join @SCHEMA@.pro_accounts p on p.id = d.pro_account_id
left join lateral (
  select count(*) as envoyes, count(l.opened_at) as ouverts
  from @SCHEMA@.email_logs l
  where l.dossier_id = d.id and l.status = 'sent'
) e on true;

create view @SCHEMA@.baikal_dossier_emails
with (security_invoker = true) as
select l.dossier_id::text as dossier_id,
       l.sent_at          as envoye_le,
       l.subject          as sujet,
       l.recipient        as destinataire,
       case when l.opened_at is not null then 'ouvert' else 'envoye' end as statut,
       l.opened_at        as ouvert_le
from @SCHEMA@.email_logs l
where l.dossier_id is not null;

create view @SCHEMA@.baikal_dossier_events
with (security_invoker = true) as
select ev.dossier_id::text as dossier_id,
       ev.created_at       as survenu_le,
       ev.event_name       as type,
       ev.label            as libelle,
       'client'::text      as acteur,
       jsonb_strip_nulls(jsonb_build_object('page', ev.page_url)) as detail
from @SCHEMA@.events ev
where ev.dossier_id is not null;

-- ------ Contrat mesures-v1 ------
-- Un flux (achats) et un stock à fenêtre (dossiers payés distincts), ce
-- dernier en jointure EXTERNE au calendrier : une ligne par jour, zéros compris.

create view @SCHEMA@.baikal_mesures
with (security_invoker = true) as
select
  (v.paye_le at time zone 'Europe/Paris')::date as jour,
  'achats'::text          as cle,
  'Achats'::text          as libelle,
  count(*)::numeric       as valeur,
  'somme'::text           as agregation,
  'nombre'::text          as format,
  'clients'::text         as chapitre,
  null::int               as fenetre_jours,
  'Ventes'::text          as groupe,
  null::text              as rendu,
  10                      as ordre
from @SCHEMA@.baikal_dossiers v
where v.paye_le is not null and v.est_test is not true and v.supprime_le is null
group by 1

union all

select
  j.jour::date,
  'dossiers_payes_distincts',
  'Dossiers payés',
  count(distinct v.dossier_id)::numeric,
  'dernier',
  'nombre',
  'clients',
  f.fenetre,
  'Ventes',
  null,
  20
from generate_series(
       (select min((paye_le at time zone 'Europe/Paris')::date) from @SCHEMA@.baikal_dossiers where paye_le is not null),
       current_date, interval '1 day'
     ) as j(jour)
cross join (values (7), (30)) as f(fenetre)
left join @SCHEMA@.baikal_dossiers v
  on (v.paye_le at time zone 'Europe/Paris')::date between j.jour::date - (f.fenetre - 1) and j.jour::date
 and v.est_test is not true and v.supprime_le is null
group by j.jour, f.fenetre;

grant select on @SCHEMA@.baikal_dossiers, @SCHEMA@.baikal_dossier_emails,
                @SCHEMA@.baikal_dossier_events, @SCHEMA@.baikal_mesures to baikal_reader;
