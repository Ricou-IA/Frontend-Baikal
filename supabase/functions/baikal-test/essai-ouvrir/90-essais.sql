-- Essais de la migration « ouvrir mon site », exécutés pour de vrai.
-- Chaque ligne rendue dit ce qui était attendu et ce qui s'est passé.
\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

create temp table bilan (n serial, essai text, ok boolean, detail text);
create or replace function pg_temp.refuse(p_sql text, p_motif text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'PAS DE REFUS';
exception when others then
  return case when sqlerrm like p_motif then 'refusé' else 'AUTRE ERREUR : ' || sqlerrm end;
end $$;

insert into auth.users values ('00000000-0000-4000-8000-0000000000a1'), ('00000000-0000-4000-8000-0000000000a2');

-- Trois tests : un prêt (monsaas.fr), un prêt sans site déclaré, un non passé.
insert into admin.tests_site (jeton, hote_empreinte, diagnostic, niveau1_pret, tests, site, teste_le) values
  ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'e', '{"schema_contrat": "leads"}', true, 1, 'monsaas.fr', now()),
  ('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'e', '{"schema_contrat": "public"}', true, 1, null, now()),
  ('cccccccccccccccccccccccccccccccc', 'e', '{"schema_contrat": "public"}', false, 1, 'echec.fr', now()),
  ('dddddddddddddddddddddddddddddddd', 'e', '{"schema_contrat": "public"}', true, 1, 'pre-etat-date.ai', now()),
  ('eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', 'e', '{"schema_contrat": "Mauvais Schema"}', true, 1, 'schema.fr', now());

-- 1. Garder : refus des entrées mal formées.
insert into bilan (essai, ok, detail) select 'garder refuse un jeton mal formé', r = 'refusé', r from (select pg_temp.refuse($$select admin.garder_connexion_test('abc', 'postgresql://u:p@h/b')$$, '%jeton invalide%') r) x;
insert into bilan (essai, ok, detail) select 'garder refuse ce qui n''est pas une adresse Postgres', r = 'refusé', r from (select pg_temp.refuse($$select admin.garder_connexion_test('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'mysql://u:p@h/b')$$, '%connexion invalide%') r) x;

-- 2. Garder : range, puis remplace sans doublon.
select admin.garder_connexion_test('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'postgresql://baikal_reader:un@db.exemple.com:5432/app');
select admin.garder_connexion_test('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'postgresql://baikal_reader:deux@db.exemple.com:5432/app');
update admin.tests_site set connexion_gardee = true where jeton = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
insert into bilan (essai, ok, detail) select 'garder range une seule connexion par jeton, la dernière',
  count(*) = 1 and max(decrypted_secret) like '%:deux@%', count(*) || ' secret(s)' from vault.decrypted_secrets where name = 'test_ro_dsn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

-- 3. Ouvrir : les refus.
insert into bilan (essai, ok, detail) select 'ouvrir refuse un lien inconnu', r = 'refusé', r from (select pg_temp.refuse($$select admin.ouvrir_site('ffffffffffffffffffffffffffffffff', '00000000-0000-4000-8000-0000000000a1')$$, 'OUVERTURE: Ce lien a expiré%') r) x;
insert into bilan (essai, ok, detail) select 'ouvrir refuse un test non passé', r = 'refusé', r from (select pg_temp.refuse($$select admin.ouvrir_site('cccccccccccccccccccccccccccccccc', '00000000-0000-4000-8000-0000000000a1')$$, 'OUVERTURE: Le test de ce site n''est pas encore passé%') r) x;
insert into bilan (essai, ok, detail) select 'ouvrir refuse un test passé dont la connexion n''est pas gardée', r = 'refusé', r from (select pg_temp.refuse($$select admin.ouvrir_site('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', '00000000-0000-4000-8000-0000000000a1')$$, 'OUVERTURE: Le test de ce site n''est pas encore passé%') r) x;
insert into bilan (essai, ok, detail) select 'ouvrir refuse un compte inconnu', r = 'refusé', r from (select pg_temp.refuse($$select admin.ouvrir_site('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000ff')$$, '%compte inconnu%') r) x;
-- Le drapeau dit « gardée » mais le coffre est vide : refus lisible.
update admin.tests_site set connexion_gardee = true where jeton in ('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'dddddddddddddddddddddddddddddddd', 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
insert into bilan (essai, ok, detail) select 'ouvrir refuse quand le coffre n''a plus la connexion', r = 'refusé', r from (select pg_temp.refuse($$select admin.ouvrir_site('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', '00000000-0000-4000-8000-0000000000a1')$$, 'OUVERTURE: Baikal n''a plus la connexion%') r) x;
select admin.garder_connexion_test('dddddddddddddddddddddddddddddddd', 'postgresql://baikal_reader:x@db.pirate.com:5432/app');
insert into bilan (essai, ok, detail) select 'ouvrir refuse un domaine déjà au registre (pre-etat-date.ai)', r = 'refusé', r from (select pg_temp.refuse($$select admin.ouvrir_site('dddddddddddddddddddddddddddddddd', '00000000-0000-4000-8000-0000000000a2')$$, 'OUVERTURE: Ce site est déjà dans Baikal%') r) x;
select admin.garder_connexion_test('eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', 'postgresql://baikal_reader:x@db.exemple.com:5432/app');
insert into bilan (essai, ok, detail) select 'ouvrir refuse un schéma au nom douteux', r = 'refusé', r from (select pg_temp.refuse($$select admin.ouvrir_site('eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', '00000000-0000-4000-8000-0000000000a2')$$, 'OUVERTURE: Le test n''a pas trouvé le schéma%') r) x;
insert into bilan (essai, ok, detail) select 'aucun refus n''a rien inscrit au registre ni ouvert d''accès',
  (select count(*) from config.apps) = 2 and (select count(*) from admin.droits_sites) = 0, (select count(*) from config.apps) || ' sites, ' || (select count(*) from admin.droits_sites) || ' droits';

-- 4. Ouvrir : le bon chemin. « monsaas » est déjà pris : l'identifiant est suffixé.
create temp table ouvert as select admin.ouvrir_site('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a1') as app_id;
insert into bilan (essai, ok, detail) select 'ouvrir rend un identifiant libre, tiré du domaine', app_id = 'monsaas-2', app_id from ouvert;
insert into bilan (essai, ok, detail) select 'le site est au registre : actif, modèle clients, schéma des vues, connexion au coffre',
  a.is_active and a.modele_comptes = 'clients' and a.db_schema = 'leads' and a.domaine = 'monsaas.fr' and a.db_ro_secret_ref = 'coffre:monsaas-2' and a.name = 'monsaas.fr',
  a.name || ' · ' || a.db_schema || ' · ' || a.db_ro_secret_ref from config.apps a where a.id = 'monsaas-2';
insert into bilan (essai, ok, detail) select 'la connexion gardée est devenue celle du site, et elle seule',
  admin.connexion_site('monsaas-2') like '%:deux@db.exemple.com%'
  and not exists (select 1 from vault.secrets where name = 'test_ro_dsn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
  and admin.connexion_site('pack-vendeur') is null, 'relue par admin.connexion_site';
insert into bilan (essai, ok, detail) select 'le compte a ce site, les chapitres Clients et Comptes, en lecture — rien d''autre',
  count(*) = 1 and max(modules::text) = '{"clients": "lecture", "comptes_pro": "lecture"}' and max(app_id) = 'monsaas-2', count(*) || ' droit(s) : ' || max(modules::text)
  from admin.droits_sites where user_id = '00000000-0000-4000-8000-0000000000a1';
insert into bilan (essai, ok, detail) select 'le lien est marqué ouvert', ouvert_le is not null and app_id = 'monsaas-2', app_id from admin.tests_site where jeton = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

-- 5. Un lien ne s'ouvre qu'une fois, et sa connexion ne se remplace plus.
insert into bilan (essai, ok, detail) select 'ouvrir une seconde fois est refusé', r = 'refusé', r from (select pg_temp.refuse($$select admin.ouvrir_site('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a2')$$, 'OUVERTURE: Ce site est déjà ouvert%') r) x;
insert into bilan (essai, ok, detail) select 'garder sur un site ouvert est refusé', r = 'refusé', r from (select pg_temp.refuse($$select admin.garder_connexion_test('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'postgresql://baikal_reader:pirate@db.pirate.com:5432/app')$$, '%site déjà ouvert%') r) x;
insert into bilan (essai, ok, detail) select 'la connexion du site n''a pas bougé', admin.connexion_site('monsaas-2') like '%:deux@db.exemple.com%', 'inchangée';

-- 6. Les droits : seul le service_role exécute ces fonctions.
insert into bilan (essai, ok, detail) select 'fonctions réservées au service_role',
  bool_and(has_function_privilege('service_role', p.oid, 'EXECUTE'))
  and not bool_or(has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('baikal_reader', p.oid, 'EXECUTE')),
  count(*) || ' fonctions' from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'admin' and p.proname in ('garder_connexion_test', 'connexion_site', 'ouvrir_site');

-- 7. La purge : exécutée telle qu'elle est planifiée.
select admin.garder_connexion_test('cccccccccccccccccccccccccccccccc', 'postgresql://baikal_reader:x@db.exemple.com:5432/app');
insert into vault.secrets (name, secret, created_at) values ('test_ro_dsn_99999999999999999999999999999999', 'orphelin', now() - interval '2 days');
update vault.secrets set created_at = now() - interval '2 days' where name in ('test_ro_dsn_cccccccccccccccccccccccccccccccc', 'test_ro_dsn_dddddddddddddddddddddddddddddddd');
update admin.tests_site set expire_le = now() - interval '1 minute' where jeton = 'cccccccccccccccccccccccccccccccc';
do $$ begin execute (select command from cron.job where jobname = 'admin-tests-site-purge'); end $$;
insert into bilan (essai, ok, detail) select 'purge : le test expiré part avec sa connexion, l''orphelin aussi ; le test vivant et le site ouvert restent',
  not exists (select 1 from admin.tests_site where jeton = 'cccccccccccccccccccccccccccccccc')
  and not exists (select 1 from vault.secrets where name in ('test_ro_dsn_cccccccccccccccccccccccccccccccc', 'test_ro_dsn_99999999999999999999999999999999'))
  and exists (select 1 from vault.secrets where name = 'test_ro_dsn_dddddddddddddddddddddddddddddddd')
  and exists (select 1 from vault.secrets where name = 'site_ro_dsn_monsaas-2')
  and exists (select 1 from admin.tests_site where jeton = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
  (select string_agg(name, ', ' order by name) from vault.secrets);

select case when ok then 'OK   ' else 'ÉCHEC' end || ' ' || lpad(n::text, 2) || '. ' || essai || case when ok then '' else '  →  ' || coalesce(detail, '') end from bilan order by n;
select 'BILAN : ' || count(*) filter (where ok) || ' sur ' || count(*) || ' essais passent' from bilan;
