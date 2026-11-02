-- ---------------------------------------------------------------------------
-- Module Événements v1 — la recette.
--
-- À jouer APRÈS evenements-v1.sql, avec le même @SCHEMA@. Ne rend rien quand
-- tout passe ; sinon lève une exception qui nomme le contrôle manqué. Tout ce
-- qu'elle écrit porte un visiteur_id de la plage 00000000-0000-4000-8000-
-- 00000000000x et une adresse @recette.evenements, qu'elle efface à la fin.
--
-- Elle couvre les contrôles 1, 2 et 5 du guide (evenements-v1.md, §8) et le
-- comportement des trois fonctions. Les autres contrôles se font dans un
-- navigateur.
-- ---------------------------------------------------------------------------

-- 1. Les objets.
do $$
declare v_tables int; v_forcees int; v_fonctions int; v_vues int;
begin
  select count(*), count(*) filter (where c.relforcerowsecurity)
    into v_tables, v_forcees
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = '@SCHEMA@' and c.relkind = 'r'
    and c.relname in ('evenement', 'evenement_visiteur');
  if v_tables <> 2 then raise exception 'contrôle 1 : % table(s) sur 2', v_tables; end if;
  if v_forcees <> 2 then raise exception 'contrôle 1 : RLS forcée sur % table(s) sur 2', v_forcees; end if;

  select count(*) into v_fonctions
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = '@SCHEMA@'
    and p.proname in ('evenement_enregistrer', 'evenement_identifier', 'evenement_purger');
  if v_fonctions <> 3 then raise exception 'contrôle 1 : % fonction(s) sur 3', v_fonctions; end if;

  select count(*) into v_vues
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = '@SCHEMA@' and c.relkind = 'v' and c.relname = 'baikal_evenements';
  if v_vues <> 1 then raise exception 'contrôle 1 : vue baikal_evenements absente'; end if;
end $$;

-- 2. Les droits de lecture de Baikal.
do $$
declare v_policies int;
begin
  if not has_table_privilege('baikal_reader', '@SCHEMA@.evenement', 'select') then
    raise exception 'contrôle 2 : baikal_reader sans select sur evenement';
  end if;
  if not has_table_privilege('baikal_reader', '@SCHEMA@.evenement_visiteur', 'select') then
    raise exception 'contrôle 2 : baikal_reader sans select sur evenement_visiteur';
  end if;
  if not has_table_privilege('baikal_reader', '@SCHEMA@.baikal_evenements', 'select') then
    raise exception 'contrôle 2 : baikal_reader sans select sur baikal_evenements';
  end if;
  select count(*) into v_policies from pg_policies
  where schemaname = '@SCHEMA@' and policyname = 'baikal_read'
    and tablename in ('evenement', 'evenement_visiteur') and 'baikal_reader' = any (roles);
  if v_policies <> 2 then raise exception 'contrôle 2 : % policy baikal_read sur 2', v_policies; end if;
end $$;

-- 3. Enregistrer : un lot de trois lignes dont une au geste inconnu.
do $$
declare v jsonb;
begin
  v := @SCHEMA@.evenement_enregistrer('[
    {"visiteur_id":"00000000-0000-4000-8000-000000000001","geste":"page_vue","libelle":"Accueil","page":"/","detail":{},"referent":"www.google.fr"},
    {"visiteur_id":"00000000-0000-4000-8000-000000000001","geste":"inconnu","page":"/"},
    {"visiteur_id":"00000000-0000-4000-8000-000000000001","geste":"clic","libelle":"Payer","page":"/tarifs","detail":{"cible":"/paiement"}}
  ]'::jsonb);
  if v <> '{"ok":true,"ecrits":2,"rejetes":1}'::jsonb then
    raise exception 'contrôle 3 : attendu ecrits 2 rejetes 1, obtenu %', v;
  end if;
end $$;

-- 4. Enregistrer : les refus ligne à ligne, et la troncature du libellé.
do $$
declare v jsonb; v_long text := repeat('x', 300); v_21 jsonb := '{}'::jsonb; i int; v_libelle text;
begin
  for i in 1..21 loop v_21 := v_21 || jsonb_build_object('k' || i, i); end loop;

  v := @SCHEMA@.evenement_enregistrer(jsonb_build_array(
    jsonb_build_object('visiteur_id','00000000-0000-4000-8000-000000000002','geste','clic','page','/x?y=1'),
    jsonb_build_object('visiteur_id','00000000-0000-4000-8000-000000000002','geste','clic','page','x'),
    jsonb_build_object('visiteur_id','00000000-0000-4000-8000-000000000002','geste','clic','page','/x','email','a@b.fr'),
    jsonb_build_object('visiteur_id','00000000-0000-4000-8000-000000000002','geste','clic','page','/x','detail',v_21),
    jsonb_build_object('visiteur_id','00000000-0000-4000-8000-000000000002','geste','clic','page','/x','detail','{"a":{"b":1}}'::jsonb),
    jsonb_build_object('visiteur_id','00000000-0000-4000-8000-000000000002','geste','identification','page','/x'),
    jsonb_build_object('visiteur_id','pas-un-uuid','geste','clic','page','/x'),
    jsonb_build_object('visiteur_id','00000000-0000-4000-8000-000000000002','geste','clic','page','/x','libelle',v_long)
  ));
  if v <> '{"ok":true,"ecrits":1,"rejetes":7}'::jsonb then
    raise exception 'contrôle 4 : attendu ecrits 1 rejetes 7, obtenu %', v;
  end if;
  select libelle into v_libelle from @SCHEMA@.evenement
  where visiteur_id = '00000000-0000-4000-8000-000000000002';
  if char_length(v_libelle) <> 200 then
    raise exception 'contrôle 4 : libellé de 300 attendu tronqué à 200, obtenu %', char_length(v_libelle);
  end if;
  v := @SCHEMA@.evenement_enregistrer('"pas un tableau"'::jsonb);
  if v <> '{"ok":false,"erreur":"lot invalide"}'::jsonb then
    raise exception 'contrôle 4 : lot non tableau, obtenu %', v;
  end if;
end $$;

-- 5. Identifier un visiteur sans aucun geste.
do $$
declare v jsonb; v_n int; v_page text; v_libelle text;
begin
  v := @SCHEMA@.evenement_identifier('00000000-0000-4000-8000-000000000003', 'seul@recette.evenements');
  if v <> '{"ok":true,"rattaches":0}'::jsonb then
    raise exception 'contrôle 5 : attendu rattaches 0, obtenu %', v;
  end if;
  select count(*) into v_n from @SCHEMA@.evenement_visiteur
  where visiteur_id = '00000000-0000-4000-8000-000000000003' and email = 'seul@recette.evenements';
  if v_n <> 1 then raise exception 'contrôle 5 : rattachement absent'; end if;
  select page, libelle into v_page, v_libelle from @SCHEMA@.evenement
  where visiteur_id = '00000000-0000-4000-8000-000000000003' and geste = 'identification';
  if v_page is distinct from '/' or v_libelle is distinct from 'formulaire' then
    raise exception 'contrôle 5 : geste identification attendu page / libellé formulaire, obtenu % %', v_page, v_libelle;
  end if;
end $$;

-- 6. Identifier un visiteur à deux gestes anonymes, puis un troisième geste.
do $$
declare v jsonb; v_n int; v_page text;
begin
  perform @SCHEMA@.evenement_enregistrer('[
    {"visiteur_id":"00000000-0000-4000-8000-000000000004","geste":"page_vue","page":"/accueil"},
    {"visiteur_id":"00000000-0000-4000-8000-000000000004","geste":"resultat_ouvert","libelle":"Fiche 1","page":"/liste"}
  ]'::jsonb);
  v := @SCHEMA@.evenement_identifier('00000000-0000-4000-8000-000000000004', '  Deux@Recette.Evenements ', 'D1', 'connexion');
  if v <> '{"ok":true,"rattaches":2}'::jsonb then
    raise exception 'contrôle 6 : attendu rattaches 2, obtenu %', v;
  end if;
  select count(*) into v_n from @SCHEMA@.evenement
  where visiteur_id = '00000000-0000-4000-8000-000000000004'
    and email = 'deux@recette.evenements' and dossier_id = 'D1';
  if v_n <> 3 then raise exception 'contrôle 6 : % geste(s) rattaché(s) sur 3', v_n; end if;
  select page into v_page from @SCHEMA@.evenement
  where visiteur_id = '00000000-0000-4000-8000-000000000004' and geste = 'identification';
  if v_page <> '/liste' then raise exception 'contrôle 6 : page de l''identification %, attendu /liste', v_page; end if;

  perform @SCHEMA@.evenement_enregistrer('[
    {"visiteur_id":"00000000-0000-4000-8000-000000000004","geste":"fichier_telecharge","libelle":"export.csv","page":"/liste"}
  ]'::jsonb);
  select count(*) into v_n from @SCHEMA@.evenement
  where visiteur_id = '00000000-0000-4000-8000-000000000004' and geste = 'fichier_telecharge'
    and email = 'deux@recette.evenements' and dossier_id = 'D1';
  if v_n <> 1 then raise exception 'contrôle 6 : le geste suivant ne porte pas l''identité'; end if;
end $$;

-- 7. Identifier avec une adresse invalide.
do $$
declare v jsonb; v_n int;
begin
  v := @SCHEMA@.evenement_identifier('00000000-0000-4000-8000-000000000005', 'pas-un-email');
  if v <> '{"ok":false,"erreur":"email invalide"}'::jsonb then
    raise exception 'contrôle 7 : attendu email invalide, obtenu %', v;
  end if;
  select count(*) into v_n from @SCHEMA@.evenement_visiteur where visiteur_id = '00000000-0000-4000-8000-000000000005';
  if v_n <> 0 then raise exception 'contrôle 7 : un rattachement a été écrit'; end if;
end $$;

-- 8. La vue écarte les tests.
do $$
declare v_n int;
begin
  perform @SCHEMA@.evenement_enregistrer('[
    {"visiteur_id":"00000000-0000-4000-8000-000000000006","geste":"clic","libelle":"staff","page":"/","est_test":true}
  ]'::jsonb);
  select count(*) into v_n from @SCHEMA@.baikal_evenements where visiteur_id = '00000000-0000-4000-8000-000000000006';
  if v_n <> 0 then raise exception 'contrôle 8 : un geste de test est dans baikal_evenements'; end if;
  select count(*) into v_n from @SCHEMA@.evenement where visiteur_id = '00000000-0000-4000-8000-000000000006';
  if v_n <> 1 then raise exception 'contrôle 8 : le geste de test n''a pas été écrit'; end if;
end $$;

-- 9. La purge.
do $$
declare v_n int; v_reste int;
begin
  perform @SCHEMA@.evenement_enregistrer('[
    {"visiteur_id":"00000000-0000-4000-8000-000000000007","geste":"page_vue","page":"/vieux"}
  ]'::jsonb);
  update @SCHEMA@.evenement set survenu_le = now() - interval '91 days'
  where visiteur_id in ('00000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-000000000004');
  v_n := @SCHEMA@.evenement_purger();
  if v_n < 1 then raise exception 'contrôle 9 : purge sans suppression'; end if;
  select count(*) into v_reste from @SCHEMA@.evenement where visiteur_id = '00000000-0000-4000-8000-000000000007';
  if v_reste <> 0 then raise exception 'contrôle 9 : le geste anonyme de 91 jours survit'; end if;
  select count(*) into v_reste from @SCHEMA@.evenement where visiteur_id = '00000000-0000-4000-8000-000000000004';
  if v_reste <> 4 then raise exception 'contrôle 9 : les gestes identifiés de 91 jours ont été purgés (% restent)', v_reste; end if;
end $$;

-- 10. Deux gestes d'un même lot gardent leur ordre : survenu_le strictement croissant.
do $$
declare v_n int;
begin
  perform @SCHEMA@.evenement_enregistrer('[
    {"visiteur_id":"00000000-0000-4000-8000-000000000008","geste":"page_vue","page":"/a"},
    {"visiteur_id":"00000000-0000-4000-8000-000000000008","geste":"clic","page":"/a"},
    {"visiteur_id":"00000000-0000-4000-8000-000000000008","geste":"filtre","page":"/a"}
  ]'::jsonb);
  select count(*) into v_n from (
    select survenu_le, lag(survenu_le) over (order by id) as precedent
    from @SCHEMA@.evenement where visiteur_id = '00000000-0000-4000-8000-000000000008'
  ) s where precedent is not null and survenu_le <= precedent;
  if v_n <> 0 then raise exception 'contrôle 10 : % geste(s) d''un même lot sans ordre', v_n; end if;
end $$;

-- 11. Le dossier_id du navigateur n'est gardé que pour un visiteur déjà rattaché.
do $$
declare v_dossier text;
begin
  perform @SCHEMA@.evenement_enregistrer('[
    {"visiteur_id":"00000000-0000-4000-8000-000000000009","geste":"clic","page":"/d","dossier_id":"AUTRUI"}
  ]'::jsonb);
  select dossier_id into v_dossier from @SCHEMA@.evenement where visiteur_id = '00000000-0000-4000-8000-000000000009';
  if v_dossier is not null then raise exception 'contrôle 11 : un anonyme a posé dossier_id %', v_dossier; end if;
  perform @SCHEMA@.evenement_identifier('00000000-0000-4000-8000-000000000009', 'neuf@recette.evenements', 'D9', 'connexion');
  perform @SCHEMA@.evenement_enregistrer('[
    {"visiteur_id":"00000000-0000-4000-8000-000000000009","geste":"clic","page":"/d","dossier_id":"D9b"}
  ]'::jsonb);
  select dossier_id into v_dossier from @SCHEMA@.evenement
  where visiteur_id = '00000000-0000-4000-8000-000000000009' order by id desc limit 1;
  if v_dossier is distinct from 'D9b' then raise exception 'contrôle 11 : un rattaché perd son dossier_id (%)', v_dossier; end if;
end $$;

-- 12. Identifier deux fois à l'identique n'écrit qu'un seul geste identification.
do $$
declare v jsonb; v_n int;
begin
  v := @SCHEMA@.evenement_identifier('00000000-0000-4000-8000-000000000009', 'neuf@recette.evenements', null, 'connexion');
  if v <> '{"ok":true,"rattaches":0}'::jsonb then raise exception 'contrôle 12 : second appel, obtenu %', v; end if;
  select count(*) into v_n from @SCHEMA@.evenement
  where visiteur_id = '00000000-0000-4000-8000-000000000009' and geste = 'identification';
  if v_n <> 1 then raise exception 'contrôle 12 : % geste(s) identification au lieu de 1', v_n; end if;
  v := @SCHEMA@.evenement_identifier('00000000-0000-4000-8000-000000000009', 'autre@recette.evenements', null, 'connexion');
  select count(*) into v_n from @SCHEMA@.evenement
  where visiteur_id = '00000000-0000-4000-8000-000000000009' and geste = 'identification';
  if v_n <> 2 then raise exception 'contrôle 12 : une autre adresse doit écrire un second geste (%)', v_n; end if;
end $$;

-- 13. La purge est planifiée dès que pg_cron existe.
do $$
declare v_n int;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    select count(*) into v_n from cron.job where jobname = '@SCHEMA@-evenements-purge';
    if v_n <> 1 then raise exception 'contrôle 13 : job de purge absent'; end if;
  end if;
end $$;

-- Nettoyage de ce que la recette a écrit.
delete from @SCHEMA@.evenement where visiteur_id::text like '00000000-0000-4000-8000-00000000000%';
delete from @SCHEMA@.evenement_visiteur where visiteur_id::text like '00000000-0000-4000-8000-00000000000%';
