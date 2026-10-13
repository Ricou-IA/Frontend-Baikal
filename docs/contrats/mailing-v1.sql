-- ---------------------------------------------------------------------------
-- Module Mailing v1 — DDL de reference.
--
-- Installer chez un site : copier ce fichier dans une migration du site,
-- substituer @SCHEMA@ par le schema du produit, puis ADAPTER les deux blocs
-- marques « ADAPTER PAR SITE » : la vue baikal_mail_optout et le corps de
-- mail_desinscrire. Tout le reste est identique chez tous les sites.
--
-- Pourquoi chez le site : le journal d'envoi est nominatif (une adresse par
-- ligne). Baikal ne garde que la campagne (objet, corps, ciblage) ; qui a
-- recu, ouvert, clique ou s'est desinscrit appartient au site, comme ses
-- clients et sa liste d'opt-out.
--
-- Baikal n'ecrit JAMAIS dans ces tables : il appelle les quatre fonctions.
-- Il les LIT par sa connexion lecture seule (mail_envoi, baikal_mail_optout)
-- pour le ciblage, le quota du jour, le coupe-circuit et le tableau de bord.
-- ---------------------------------------------------------------------------

-- ------ 1. Le journal d'envoi ------

create table if not exists @SCHEMA@.mail_envoi (
  campagne_id     uuid        not null,   -- admin.mail_campagnes.id chez Baikal
  email           text        not null check (email = lower(trim(email))),
  population      text        not null check (population in ('prospects','clients','comptes')),
  destinataire_id text,                   -- prospect_id / dossier_id / compte_id
  statut          text        not null default 'reserve'
                  check (statut in ('reserve','envoye','erreur','delivre',
                                    'ouvert','clique','rebond','plainte')),
  resend_id       text        unique,
  erreur          text,
  reserve_le      timestamptz not null default now(),
  envoye_le       timestamptz,
  delivre_le      timestamptz,
  ouvert_le       timestamptz,
  clique_le       timestamptz,
  rebond_le       timestamptz,
  rebond_type     text,                   -- Permanent | Transient | Undetermined
  plainte_le      timestamptz,
  desinscrit_le   timestamptz,
  nb_ouvertures   int         not null default 0,
  nb_clics        int         not null default 0,
  primary key (campagne_id, email)
);

comment on table @SCHEMA@.mail_envoi is
  'Journal des campagnes Baikal (module mailing-v1) : une ligne par campagne '
  'et par adresse. Ecrit uniquement par les fonctions mail_*.';

create index if not exists mail_envoi_envoye_le on @SCHEMA@.mail_envoi (envoye_le);
create index if not exists mail_envoi_email     on @SCHEMA@.mail_envoi (email);

alter table @SCHEMA@.mail_envoi enable row level security;
alter table @SCHEMA@.mail_envoi force  row level security;
revoke all on @SCHEMA@.mail_envoi from anon, authenticated;
grant select, insert, update, delete on @SCHEMA@.mail_envoi to service_role;

-- ------ 2. Les adresses a ne jamais ecrire — ADAPTER PAR SITE ------
--
-- Une colonne : email, normalise. Union de TOUTES les listes d'exclusion du
-- site : table d'opt-out locale, prospect_etat refus/desinscrit (module
-- prospects-v1), et ce que ce journal a appris (plainte, rebond definitif).
-- Exemple ci-dessous : MonsieurDPE (dpe.diag_optout).

create or replace view @SCHEMA@.baikal_mail_optout as
  select lower(trim(email)) as email from @SCHEMA@.diag_optout
  union
  select email from @SCHEMA@.prospect_etat where statut in ('refus','desinscrit')
  union
  select email from @SCHEMA@.mail_envoi
  where plainte_le is not null or desinscrit_le is not null
     or (rebond_le is not null and rebond_type = 'Permanent');

revoke all on @SCHEMA@.baikal_mail_optout from anon, authenticated;
grant select on @SCHEMA@.baikal_mail_optout to service_role;

-- ------ 3. Reserver un lot ------
--
-- p_lignes : [{email, population, destinataire_id}]. Insere ce qui n'est ni
-- deja dans la campagne ni dans l'opt-out, et renvoie les adresses
-- effectivement reservees : seules elles partent. L'unicite (campagne, email)
-- est le verrou : deux workers concurrents ne peuvent pas reserver la meme
-- adresse.

create or replace function @SCHEMA@.mail_reserver(p_campagne_id uuid, p_lignes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reserves jsonb;
begin
  with candidats as (
    select distinct on (lower(trim(l->>'email')))
           lower(trim(l->>'email'))   as email,
           l->>'population'           as population,
           l->>'destinataire_id'      as destinataire_id
    from jsonb_array_elements(p_lignes) l
    where lower(trim(l->>'email')) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  ), inseres as (
    insert into @SCHEMA@.mail_envoi (campagne_id, email, population, destinataire_id)
    select p_campagne_id, c.email, c.population, c.destinataire_id
    from candidats c
    where not exists (select 1 from @SCHEMA@.baikal_mail_optout o where o.email = c.email)
    on conflict (campagne_id, email) do nothing
    returning email
  )
  select coalesce(jsonb_agg(email), '[]'::jsonb) into v_reserves from inseres;
  return jsonb_build_object('ok', true, 'reserves', v_reserves);
end;
$$;

-- ------ 4. Marquer le resultat de l'envoi ------
--
-- p_lignes : [{email, resend_id}] ou [{email, erreur}].

create or replace function @SCHEMA@.mail_marquer(p_campagne_id uuid, p_lignes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int;
begin
  update @SCHEMA@.mail_envoi e set
    statut    = case when l->>'resend_id' is not null then 'envoye' else 'erreur' end,
    resend_id = coalesce(l->>'resend_id', e.resend_id),
    erreur    = case when l->>'resend_id' is not null then null else left(l->>'erreur', 500) end,
    envoye_le = case when l->>'resend_id' is not null then now() else e.envoye_le end
  from jsonb_array_elements(p_lignes) l
  where e.campagne_id = p_campagne_id
    and e.email = lower(trim(l->>'email'))
    and e.statut in ('reserve','erreur');
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'marques', v_n);
end;
$$;

-- ------ 5. Appliquer un evenement Resend ------
--
-- p_type : delivered | opened | clicked | bounced | complained.
-- Un resend_id inconnu (mail transactionnel du site sur le meme compte
-- Resend) renvoie connu=false, sans erreur. Un horodatage deja pose n'est
-- jamais ecrase ; le statut ne recule jamais (envoye < delivre < ouvert <
-- clique ; rebond et plainte l'emportent). Rebond definitif ou plainte :
-- l'adresse est desinscrite chez le site.

create or replace function @SCHEMA@.mail_evenement(
  p_resend_id text,
  p_type      text,
  p_le        timestamptz default now(),
  p_detail    jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ligne @SCHEMA@.mail_envoi%rowtype;
  v_rang  int;
  v_rangs constant jsonb := '{"reserve":0,"erreur":0,"envoye":1,"delivre":2,"ouvert":3,"clique":4,"rebond":9,"plainte":9}';
  v_cible text;
begin
  select * into v_ligne from @SCHEMA@.mail_envoi where resend_id = p_resend_id;
  if not found then
    return jsonb_build_object('ok', true, 'connu', false);
  end if;

  v_cible := case p_type
    when 'delivered'  then 'delivre'
    when 'opened'     then 'ouvert'
    when 'clicked'    then 'clique'
    when 'bounced'    then 'rebond'
    when 'complained' then 'plainte'
  end;
  if v_cible is null then
    return jsonb_build_object('ok', true, 'connu', true, 'ignore', p_type);
  end if;

  v_rang := (v_rangs->>v_ligne.statut)::int;

  update @SCHEMA@.mail_envoi set
    delivre_le    = case when p_type = 'delivered'  then coalesce(delivre_le, p_le) else delivre_le end,
    ouvert_le     = case when p_type = 'opened'     then coalesce(ouvert_le, p_le)  else ouvert_le end,
    clique_le     = case when p_type = 'clicked'    then coalesce(clique_le, p_le)  else clique_le end,
    rebond_le     = case when p_type = 'bounced'    then coalesce(rebond_le, p_le)  else rebond_le end,
    rebond_type   = case when p_type = 'bounced'    then coalesce(p_detail->>'bounce_type', rebond_type) else rebond_type end,
    plainte_le    = case when p_type = 'complained' then coalesce(plainte_le, p_le) else plainte_le end,
    nb_ouvertures = nb_ouvertures + (p_type = 'opened')::int,
    nb_clics      = nb_clics + (p_type = 'clicked')::int,
    statut        = case when (v_rangs->>v_cible)::int > v_rang then v_cible else statut end
  where resend_id = p_resend_id;

  if p_type = 'complained'
     or (p_type = 'bounced' and coalesce(p_detail->>'bounce_type', '') = 'Permanent') then
    perform @SCHEMA@.mail_desinscrire(v_ligne.email,
      case when p_type = 'complained' then 'plainte' else 'rebond' end, null);
  end if;

  return jsonb_build_object('ok', true, 'connu', true, 'campagne_id', v_ligne.campagne_id);
end;
$$;

-- ------ 6. Desinscrire — ADAPTER PAR SITE ------
--
-- Appelee par le lien « Se desinscrire », l'en-tete List-Unsubscribe, une
-- plainte ou un rebond definitif. Doit ecrire dans la liste d'opt-out que
-- TOUS les envois du site lisent, pas seulement ceux de Baikal. Exemple :
-- MonsieurDPE (dpe.diag_optout + prospect_etat).

create or replace function @SCHEMA@.mail_desinscrire(
  p_email  text,
  p_motif  text default 'demande',
  p_campagne_id uuid default null
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

  -- ADAPTER PAR SITE : la table d'opt-out locale et son vocabulaire de
  -- motifs (Baikal envoie demande | rebond | plainte ; DPE dit 'bounce').
  insert into @SCHEMA@.diag_optout (email, motif)
  values (v_email, case p_motif when 'rebond' then 'bounce' else p_motif end)
  on conflict (email) do nothing;

  insert into @SCHEMA@.prospect_etat (email, statut, maj_par)
  values (v_email, 'desinscrit', 'mailing')
  on conflict (email) do update
    set statut = 'desinscrit', maj_le = now(), maj_par = 'mailing';

  update @SCHEMA@.mail_envoi set desinscrit_le = coalesce(desinscrit_le, now())
  where email = v_email and (p_campagne_id is null or campagne_id = p_campagne_id);

  return jsonb_build_object('ok', true, 'email', v_email, 'motif', p_motif);
end;
$$;

-- ------ 7. Droits : service_role seul ------
--
-- `revoke ... from public` : Postgres accorde EXECUTE a PUBLIC sur toute
-- fonction creee.

revoke all on function @SCHEMA@.mail_reserver(uuid, jsonb)                      from public, anon, authenticated;
revoke all on function @SCHEMA@.mail_marquer(uuid, jsonb)                       from public, anon, authenticated;
revoke all on function @SCHEMA@.mail_evenement(text, text, timestamptz, jsonb)  from public, anon, authenticated;
revoke all on function @SCHEMA@.mail_desinscrire(text, text, uuid)              from public, anon, authenticated;
grant execute on function @SCHEMA@.mail_reserver(uuid, jsonb)                     to service_role;
grant execute on function @SCHEMA@.mail_marquer(uuid, jsonb)                      to service_role;
grant execute on function @SCHEMA@.mail_evenement(text, text, timestamptz, jsonb) to service_role;
grant execute on function @SCHEMA@.mail_desinscrire(text, text, uuid)             to service_role;

-- ------ 8. Lecture par Baikal (site sur BASE DEDIEE seulement) ------
--
-- Sur une base dediee, Baikal lit avec le role baikal_reader : grant ET
-- policy sur la table (la vue d'opt-out s'execute avec les droits de son
-- proprietaire, ses tables sources n'ont rien a ouvrir de plus).
--
-- grant select on @SCHEMA@.mail_envoi         to baikal_reader;
-- grant select on @SCHEMA@.baikal_mail_optout to baikal_reader;
-- create policy baikal_read on @SCHEMA@.mail_envoi for select to baikal_reader using (true);

-- ------ Annexe — site sur BASE DEDIEE ------
--
-- Memes noms que les dispatchers de la base partagee, sans p_app_id (une base
-- dediee n'a qu'un site). Appeles par le passe-plat mailing-relais-v1.ts.
--
-- create or replace function public.baikal_mail_reserver(p_campagne_id uuid, p_lignes jsonb)
-- returns jsonb language sql security definer set search_path = ''
-- as $$ select @SCHEMA@.mail_reserver(p_campagne_id, p_lignes); $$;
-- create or replace function public.baikal_mail_marquer(p_campagne_id uuid, p_lignes jsonb)
-- returns jsonb language sql security definer set search_path = ''
-- as $$ select @SCHEMA@.mail_marquer(p_campagne_id, p_lignes); $$;
-- create or replace function public.baikal_mail_evenement(p_resend_id text, p_type text, p_le timestamptz, p_detail jsonb)
-- returns jsonb language sql security definer set search_path = ''
-- as $$ select @SCHEMA@.mail_evenement(p_resend_id, p_type, p_le, p_detail); $$;
-- create or replace function public.baikal_mail_desinscrire(p_email text, p_motif text, p_campagne_id uuid)
-- returns jsonb language sql security definer set search_path = ''
-- as $$ select @SCHEMA@.mail_desinscrire(p_email, p_motif, p_campagne_id); $$;
-- (revoke from public, anon, authenticated ; grant execute to service_role)
