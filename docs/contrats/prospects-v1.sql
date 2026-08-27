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

-- La contrainte est ce qui rend la cle fiable quand une ecriture passe par
-- le service_role en dehors de prospect_action : sans elle, deux graphies
-- d'une meme adresse deviendraient deux prospects.
--
-- Guardee par un bloc do $$ : ADD CONSTRAINT n'a pas de forme IF NOT EXISTS
-- en PostgreSQL stable, et ce module est repose site apres site puis rejoue
-- quand un site est repare ou reprovisionne ; une seconde execution ne doit
-- pas echouer sur une contrainte deja posee.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'prospect_email_normalise'
      and conrelid = '@SCHEMA@.prospect'::regclass
  ) then
    alter table @SCHEMA@.prospect
      add constraint prospect_email_normalise check (email = lower(trim(email)));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'prospect_etat_email_normalise'
      and conrelid = '@SCHEMA@.prospect_etat'::regclass
  ) then
    alter table @SCHEMA@.prospect_etat
      add constraint prospect_etat_email_normalise check (email = lower(trim(email)));
  end if;
end $$;

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

-- ------ 4. L'interface d'ecriture ------
--
-- Baikal n'ecrit JAMAIS dans les tables du site : il appelle ces fonctions,
-- et elles seules. C'est le site qui decide ce qui est ecrivable chez lui.
--
-- La table d'opt-out differe d'un site a l'autre (dpe.diag_optout,
-- pv_email_unsubscribes) : chaque installation adapte le corps du cas
-- 'desinscrire', et rien d'autre.

create or replace function @SCHEMA@.prospect_action(
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
  v_email text := lower(trim(p_email));
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Adresse invalide: %', p_email;
  end if;

  case p_action
    when 'statut' then
      if p_valeur not in ('nouveau','contacte','relance','repondu','refus','desinscrit') then
        raise exception 'Statut inconnu: %', p_valeur;
      end if;
      insert into @SCHEMA@.prospect_etat (email, statut, maj_par)
      values (v_email, p_valeur, p_acteur)
      on conflict (email) do update
        set statut = excluded.statut, maj_le = now(), maj_par = excluded.maj_par;

    when 'note' then
      insert into @SCHEMA@.prospect_etat (email, note, maj_par)
      values (v_email, p_valeur, p_acteur)
      on conflict (email) do update
        set note = excluded.note, maj_le = now(), maj_par = excluded.maj_par;

    when 'desinscrire' then
      -- ADAPTER PAR SITE : la table d'opt-out locale.
      insert into @SCHEMA@.diag_optout (email, motif)
      values (v_email, 'demande')
      on conflict (email) do nothing;
      insert into @SCHEMA@.prospect_etat (email, statut, maj_par)
      values (v_email, 'desinscrit', p_acteur)
      on conflict (email) do update
        set statut = 'desinscrit', maj_le = now(), maj_par = excluded.maj_par;

    when 'supprimer' then
      -- Uniquement une ligne du receptacle. Une ligne d'annuaire reviendrait
      -- au prochain cron : la supprimer donnerait une fausse impression
      -- d'effacement. Pour ne plus l'adresser, c'est 'desinscrire'.
      if not exists (select 1 from @SCHEMA@.prospect where email = v_email) then
        raise exception 'Seul un prospect saisi ou importe peut etre supprime';
      end if;
      delete from @SCHEMA@.prospect      where email = v_email;
      delete from @SCHEMA@.prospect_etat where email = v_email;

    else
      raise exception 'Action inconnue: %', p_action;
  end case;

  return jsonb_build_object('ok', true, 'email', v_email, 'action', p_action);
end;
$$;

-- `revoke ... from public` : Postgres accorde EXECUTE a PUBLIC sur toute
-- fonction creee ; revoquer aupres d'anon et authenticated seuls ne retire
-- pas ce droit herite d'office.
revoke all on function @SCHEMA@.prospect_action(text,text,text,text) from public;
revoke all on function @SCHEMA@.prospect_action(text,text,text,text) from anon, authenticated;
grant execute on function @SCHEMA@.prospect_action(text,text,text,text) to service_role;

-- ------ 5. L'import par lots ------
--
-- Un import n'ecrase JAMAIS un etat existant : la cle est l'adresse et le
-- conflit ne fait rien. Une ligne deja connue est comptee en doublon et
-- rapportee comme telle. Sans cette regle, un CSV importe par megarde efface
-- des statuts et des refus durement gagnes.

create or replace function @SCHEMA@.prospect_importer(
  p_lignes jsonb,
  p_acteur text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recus   int;
  v_inseres int;
begin
  create temporary table lignes_import on commit drop as
  select
    lower(trim(l->>'email'))                      as email,
    coalesce(l->>'metier', 'autre')               as metier,
    coalesce(l->>'provenance', 'import')          as provenance,
    coalesce(nullif(trim(l->>'nom_affiche'), ''),
             lower(trim(l->>'email')))            as nom_affiche,
    nullif(trim(l->>'commune'), '')               as commune,
    nullif(trim(l->>'code_postal'), '')           as code_postal,
    nullif(trim(l->>'telephone'), '')             as telephone,
    nullif(trim(l->>'site_web'), '')              as site_web,
    nullif(trim(l->>'siret'), '')                 as siret,
    nullif(trim(l->>'origine_site'), '')          as origine_site
  from jsonb_array_elements(p_lignes) l
  where lower(trim(l->>'email')) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$';

  select count(*) into v_recus from lignes_import;

  with insere as (
    insert into @SCHEMA@.prospect
      (email, metier, provenance, nom_affiche, commune, code_postal,
       telephone, site_web, siret, origine_site)
    select email, metier, provenance, nom_affiche, commune, code_postal,
           telephone, site_web, siret::char(14), origine_site
    from lignes_import
    on conflict (email) do nothing
    returning 1
  )
  select count(*) into v_inseres from insere;

  return jsonb_build_object(
    'ok', true, 'recus', v_recus, 'inseres', v_inseres,
    'doublons', v_recus - v_inseres, 'acteur', p_acteur);
end;
$$;

-- `revoke ... from public` : Postgres accorde EXECUTE a PUBLIC sur toute
-- fonction creee ; revoquer aupres d'anon et authenticated seuls ne retire
-- pas ce droit herite d'office.
revoke all on function @SCHEMA@.prospect_importer(jsonb,text) from public;
revoke all on function @SCHEMA@.prospect_importer(jsonb,text) from anon, authenticated;
grant execute on function @SCHEMA@.prospect_importer(jsonb,text) to service_role;
