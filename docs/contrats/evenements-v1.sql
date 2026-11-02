-- ---------------------------------------------------------------------------
-- Module Événements v1 — DDL de référence. Le mouchard standard des sites.
--
-- Installer chez un site : copier ce fichier dans une migration du site et
-- substituer @SCHEMA@ par le schéma du produit (dpe, public…). Les objets
-- sont IDENTIQUES chez tous les sites ; ce qui est propre au site, c'est où
-- il pose ses appels de geste, où son serveur identifie le visiteur, et la
-- branche qu'il ajoute à baikal_dossier_events. Le guide : evenements-v1.md.
-- Spec : docs/superpowers/specs/2026-11-02-contrat-evenements-design.md.
--
-- Ce qu'il fait : une ligne par geste d'un visiteur (page vue, clic,
-- recherche, résultat ouvert…), rattachée à son adresse courriel dès que le
-- serveur du site la connaît, et rétroactivement à ses gestes d'avant. Baikal
-- la lit par la vue baikal_evenements ; la fiche client en dérive sa timeline.
--
-- Les règles qui tiennent ce fichier, chacune avec sa raison :
--  - l'identité ne vient QUE du serveur du site : evenement_enregistrer
--    refuse toute ligne qui porte un email, sinon n'importe quel navigateur
--    écrirait sur la fiche de n'importe qui ;
--  - un fait déjà en base ailleurs (achat, envoi) n'est pas un geste : la
--    timeline le lit déjà par sa propre branche, il compterait deux fois ;
--  - page est un chemin sans paramètres : c'est la fenêtre par où une adresse
--    cherchée entrerait en base sans que personne l'ait décidé ;
--  - le vocabulaire est fermé : Baikal lit tous les sites de la même façon ;
--  - les tests sont exclus à la source (est_test), comme dans tout contrat.
-- ---------------------------------------------------------------------------

-- ------ 1. Les gestes ------

create table if not exists @SCHEMA@.evenement (
  id          bigint generated always as identity primary key,
  -- Heure du serveur à la réception : celle du navigateur n'est pas fiable.
  survenu_le  timestamptz not null default now(),
  visiteur_id uuid        not null,
  -- L'identité, minuscules. Posée par evenement_identifier, jamais reçue du
  -- navigateur.
  email       text,
  dossier_id  text,
  geste       text        not null
              check (geste in ('page_vue', 'clic', 'recherche', 'resultat_ouvert', 'filtre',
                               'formulaire_envoye', 'fichier_telecharge', 'media_lu', 'partage',
                               'paiement_initie', 'erreur', 'identification', 'autre')),
  libelle     text        check (libelle is null or char_length(libelle) <= 200),
  page        text        not null
              check (page ~ '^/' and page !~ '[?#]' and char_length(page) <= 300),
  detail      jsonb       not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  referent    text        check (referent is null or char_length(referent) <= 200),
  est_test    boolean     not null default false
);

comment on table @SCHEMA@.evenement is
  'Un geste d''un visiteur du site. Écrit par evenement_enregistrer (relais) et '
  'evenement_identifier (serveur du site). Lu par Baikal à travers baikal_evenements.';

create index if not exists evenement_email_idx on @SCHEMA@.evenement (email, survenu_le desc)
  where email is not null;
create index if not exists evenement_visiteur_idx on @SCHEMA@.evenement (visiteur_id, survenu_le);
create index if not exists evenement_survenu_idx on @SCHEMA@.evenement (survenu_le);

-- ------ 2. Le rattachement visiteur → identité ------

create table if not exists @SCHEMA@.evenement_visiteur (
  visiteur_id  uuid        primary key,
  email        text        not null,
  dossier_id   text,
  identifie_le timestamptz not null default now(),
  -- Où le site a appris l'identité : connexion, formulaire, paiement…
  origine      text        not null check (char_length(origine) <= 40)
);

comment on table @SCHEMA@.evenement_visiteur is
  'Un visiteur, une adresse : la dernière identification gagne. Posé par evenement_identifier.';

-- ------ 3. Les fonctions ------

-- Reçoit un lot de gestes du relais. Valide chaque ligne, complète l'identité
-- quand le visiteur est déjà rattaché, écrit. Une ligne invalide est comptée
-- dans rejetes et n'empêche pas les autres.
create or replace function @SCHEMA@.evenement_enregistrer(p_lignes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ligne jsonb;
  v_visiteur uuid;
  v_geste text;
  v_page text;
  v_detail jsonb;
  v_propre jsonb;
  v_cle text;
  v_valeur jsonb;
  v_rattache record;
  v_ecrits int := 0;
  v_rejetes int := 0;
begin
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array' then
    return jsonb_build_object('ok', false, 'erreur', 'lot invalide');
  end if;

  for v_ligne in select * from jsonb_array_elements(p_lignes) loop
    begin
      if jsonb_typeof(v_ligne) <> 'object' then raise exception 'ligne'; end if;
      -- L'identité ne vient jamais du navigateur.
      if v_ligne ? 'email' then raise exception 'email'; end if;

      v_visiteur := (v_ligne ->> 'visiteur_id')::uuid;
      v_geste := v_ligne ->> 'geste';
      -- 'identification' est réservé à evenement_identifier ; la contrainte
      -- de la table refuse le reste du hors-vocabulaire.
      if v_geste is null or v_geste = 'identification' then raise exception 'geste'; end if;

      v_page := v_ligne ->> 'page';
      if v_page is null then raise exception 'page'; end if;

      -- detail : un objet plat de 20 clés au plus, valeurs scalaires tronquées.
      v_detail := coalesce(v_ligne -> 'detail', '{}'::jsonb);
      if jsonb_typeof(v_detail) <> 'object' then raise exception 'detail'; end if;
      if (select count(*) from jsonb_object_keys(v_detail)) > 20 then raise exception 'detail'; end if;
      v_propre := '{}'::jsonb;
      for v_cle, v_valeur in select * from jsonb_each(v_detail) loop
        if jsonb_typeof(v_valeur) in ('object', 'array') then raise exception 'detail'; end if;
        if jsonb_typeof(v_valeur) = 'string' then
          v_propre := v_propre || jsonb_build_object(v_cle, left(v_valeur #>> '{}', 200));
        else
          v_propre := v_propre || jsonb_build_object(v_cle, v_valeur);
        end if;
      end loop;

      select ev.email, ev.dossier_id into v_rattache
      from @SCHEMA@.evenement_visiteur ev where ev.visiteur_id = v_visiteur;

      insert into @SCHEMA@.evenement
        (visiteur_id, email, dossier_id, geste, libelle, page, detail, referent, est_test)
      values (
        v_visiteur,
        v_rattache.email,
        coalesce(v_ligne ->> 'dossier_id', v_rattache.dossier_id),
        v_geste,
        left(v_ligne ->> 'libelle', 200),
        v_page,
        v_propre,
        left(v_ligne ->> 'referent', 200),
        coalesce((v_ligne ->> 'est_test')::boolean, false)
      );
      v_ecrits := v_ecrits + 1;
    exception when others then
      -- uuid mal formé, geste hors vocabulaire, page avec ?, etc. : la ligne
      -- est rejetée, le lot continue.
      v_rejetes := v_rejetes + 1;
    end;
  end loop;

  return jsonb_build_object('ok', true, 'ecrits', v_ecrits, 'rejetes', v_rejetes);
end;
$$;

-- Appelée par le SERVEUR du site, là où il connaît l'adresse avec certitude.
-- Pose le rattachement, met l'identité sur les gestes passés du visiteur, et
-- écrit le geste 'identification' qui marque le moment sur la timeline.
create or replace function @SCHEMA@.evenement_identifier(
  p_visiteur_id uuid,
  p_email text,
  p_dossier_id text default null,
  p_origine text default 'formulaire'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
  v_rattaches int;
  v_dernier record;
begin
  if p_visiteur_id is null then
    return jsonb_build_object('ok', false, 'erreur', 'visiteur requis');
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'erreur', 'email invalide');
  end if;

  insert into @SCHEMA@.evenement_visiteur (visiteur_id, email, dossier_id, identifie_le, origine)
  values (p_visiteur_id, v_email, p_dossier_id, now(), left(coalesce(p_origine, 'formulaire'), 40))
  on conflict (visiteur_id) do update
    set email = excluded.email,
        dossier_id = coalesce(excluded.dossier_id, @SCHEMA@.evenement_visiteur.dossier_id),
        identifie_le = now(),
        origine = excluded.origine;

  update @SCHEMA@.evenement
    set email = v_email, dossier_id = coalesce(dossier_id, p_dossier_id)
  where visiteur_id = p_visiteur_id and email is null;
  get diagnostics v_rattaches = row_count;

  select e.page, e.est_test into v_dernier
  from @SCHEMA@.evenement e
  where e.visiteur_id = p_visiteur_id
  order by e.survenu_le desc, e.id desc
  limit 1;

  insert into @SCHEMA@.evenement (visiteur_id, email, dossier_id, geste, libelle, page, est_test)
  values (
    p_visiteur_id,
    v_email,
    p_dossier_id,
    'identification',
    left(coalesce(p_origine, 'formulaire'), 200),
    coalesce(v_dernier.page, '/'),
    coalesce(v_dernier.est_test, false)
  );

  return jsonb_build_object('ok', true, 'rattaches', v_rattaches);
end;
$$;

-- Les gestes d'un visiteur jamais identifié ne servent à rien après 90 jours.
create or replace function @SCHEMA@.evenement_purger()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_n int;
begin
  delete from @SCHEMA@.evenement
  where email is null and survenu_le < now() - interval '90 days';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ------ 4. La vue standard, lue par Baikal ------
--
-- Tout geste hors tests. La branche Events du site se DÉRIVE de cette vue,
-- elle ne relit jamais la table (README des contrats).

create or replace view @SCHEMA@.baikal_evenements
with (security_invoker = true) as
select survenu_le, visiteur_id, email, dossier_id, geste, libelle, page, detail, referent
from @SCHEMA@.evenement
where not est_test;

-- ------ 5. Droits ------

alter table @SCHEMA@.evenement enable row level security;
alter table @SCHEMA@.evenement force row level security;
alter table @SCHEMA@.evenement_visiteur enable row level security;
alter table @SCHEMA@.evenement_visiteur force row level security;

drop policy if exists service_role_tout on @SCHEMA@.evenement;
create policy service_role_tout on @SCHEMA@.evenement
  for all to service_role using (true) with check (true);
drop policy if exists service_role_tout on @SCHEMA@.evenement_visiteur;
create policy service_role_tout on @SCHEMA@.evenement_visiteur
  for all to service_role using (true) with check (true);

grant usage on schema @SCHEMA@ to service_role, baikal_reader;
grant all on @SCHEMA@.evenement, @SCHEMA@.evenement_visiteur to service_role;
revoke all on @SCHEMA@.evenement, @SCHEMA@.evenement_visiteur, @SCHEMA@.baikal_evenements
  from anon, authenticated;

-- Lecture Baikal : grant ET policy, sur chaque table source et sur la vue.
grant select on @SCHEMA@.evenement, @SCHEMA@.evenement_visiteur, @SCHEMA@.baikal_evenements
  to baikal_reader;
drop policy if exists baikal_read on @SCHEMA@.evenement;
create policy baikal_read on @SCHEMA@.evenement for select to baikal_reader using (true);
drop policy if exists baikal_read on @SCHEMA@.evenement_visiteur;
create policy baikal_read on @SCHEMA@.evenement_visiteur for select to baikal_reader using (true);

revoke all on function @SCHEMA@.evenement_enregistrer(jsonb) from public, anon, authenticated;
revoke all on function @SCHEMA@.evenement_identifier(uuid, text, text, text) from public, anon, authenticated;
revoke all on function @SCHEMA@.evenement_purger() from public, anon, authenticated;
grant execute on function @SCHEMA@.evenement_enregistrer(jsonb) to service_role;
grant execute on function @SCHEMA@.evenement_identifier(uuid, text, text, text) to service_role;
grant execute on function @SCHEMA@.evenement_purger() to service_role;

-- ------ 6. La purge, chaque nuit ------
--
-- cron.schedule remplace un job du même nom : rejouer le module ne crée pas
-- de doublon.

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('@SCHEMA@-evenements-purge', '17 3 * * *',
                          'select @SCHEMA@.evenement_purger()');
  end if;
end $$;
