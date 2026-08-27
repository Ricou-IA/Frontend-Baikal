-- ---------------------------------------------------------------------------
-- Taxonomie des metiers et adaptateur d'ecriture du module Prospects.
--
-- La taxonomie est FERMEE (deux sites doivent etre comparables, et le lot 3
-- copiera de l'un a l'autre) mais elle vit EN BASE : ajouter "courtier" est
-- une ligne, pas un deploiement. C'est le meme arbitrage que
-- config.apps.funnel_etapes pour les Clients.
-- ---------------------------------------------------------------------------

create table if not exists admin.metier (
  slug    text primary key,
  libelle text not null,
  couleur text not null default 'slate'
          check (couleur in ('slate','blue','amber','emerald','red','violet')),
  ordre   int  not null default 100
);

insert into admin.metier (slug, libelle, couleur, ordre) values
  ('notaire',        'Notaires',                 'violet',  10),
  ('agent_immo',     'Agent immobilier',         'blue',    20),
  ('syndic',         'Syndic',                   'amber',   30),
  ('diagnostiqueur', 'Diagnostiqueur immobilier','emerald', 40),
  ('entreprise_rge', 'Entreprise RGE',           'slate',   50),
  ('autre',          'Autre',                    'slate',   90)
on conflict (slug) do update
  set libelle = excluded.libelle,
      couleur = excluded.couleur,
      ordre   = excluded.ordre;

alter table admin.metier enable row level security;
alter table admin.metier force  row level security;
revoke all on admin.metier from anon, authenticated;
grant select, insert, update, delete on admin.metier to service_role;

-- Canal d'ecriture des sites HEBERGES A PART. NULL par defaut : pas d'EF
-- declaree, pas de boutons. Les sites de la base partagee n'en ont pas
-- besoin, ils exposent la fonction SQL du module.
alter table config.apps add column if not exists env_prospects_fn text;

comment on column config.apps.env_prospects_fn is
  'Nom de l''Edge Function d''administration des prospects chez un site '
  'heberge sur son propre projet. NULL pour un site de la base partagee, '
  'qui expose <db_schema>.prospect_action a la place.';

-- ------ L'adaptateur d'ecriture ------
--
-- Baikal n'ecrit jamais dans une table de site : il appelle la fonction que
-- le site a definie, et elle seule. Ce wrapper ne fait que resoudre le
-- schema depuis le registre — si le site n'a pas installe le module, la
-- fonction n'existe pas et l'appel echoue proprement.
-- Meme pattern que admin.sync_diagnostiqueurs.

create or replace function public.baikal_prospect_action(
  p_app_id text,
  p_action text,
  p_email  text,
  p_valeur text default null,
  p_acteur text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_schema  text;
  v_reponse jsonb;
begin
  select db_schema into v_schema from config.apps where id = p_app_id;
  if v_schema is null then
    raise exception 'Site % sans base configuree (db_schema)', p_app_id;
  end if;
  if to_regprocedure(format('%I.prospect_action(text,text,text,text)', v_schema)) is null then
    raise exception 'Le site % n''a pas installe le module prospects', p_app_id;
  end if;

  execute format('select %I.prospect_action($1,$2,$3,$4)', v_schema)
    into v_reponse
    using p_action, p_email, p_valeur, p_acteur;

  return v_reponse;
end;
$$;

create or replace function public.baikal_prospect_importer(
  p_app_id text,
  p_lignes jsonb,
  p_acteur text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_schema  text;
  v_reponse jsonb;
begin
  select db_schema into v_schema from config.apps where id = p_app_id;
  if v_schema is null then
    raise exception 'Site % sans base configuree (db_schema)', p_app_id;
  end if;
  if to_regprocedure(format('%I.prospect_importer(jsonb,text)', v_schema)) is null then
    raise exception 'Le site % n''a pas installe le module prospects', p_app_id;
  end if;

  execute format('select %I.prospect_importer($1,$2)', v_schema)
    into v_reponse
    using p_lignes, p_acteur;

  return v_reponse;
end;
$$;

-- ---------------------------------------------------------------------------
-- Les droits. `revoke ... from public` D'ABORD : Postgres accorde EXECUTE a
-- PUBLIC sur toute fonction creee, et revoquer aupres d'anon et authenticated
-- seuls ne retire pas ce droit HERITE. Ici le risque n'est pas theorique : ces
-- deux fonctions vivent dans public, le schema que PostgREST expose en HTTP —
-- une security definer qui garderait le EXECUTE par defaut de PUBLIC serait
-- appelable depuis un navigateur, par quiconque tient simplement la cle anon.
-- ---------------------------------------------------------------------------
revoke all on function public.baikal_prospect_action(text,text,text,text,text) from public;
revoke all on function public.baikal_prospect_importer(text,jsonb,text) from public;
revoke all on function public.baikal_prospect_action(text,text,text,text,text) from anon, authenticated;
revoke all on function public.baikal_prospect_importer(text,jsonb,text) from anon, authenticated;
grant execute on function public.baikal_prospect_action(text,text,text,text,text) to service_role;
grant execute on function public.baikal_prospect_importer(text,jsonb,text) to service_role;
