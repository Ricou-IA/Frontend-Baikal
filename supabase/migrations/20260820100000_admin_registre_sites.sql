-- ---------------------------------------------------------------------------
-- Registre des sites : config.apps devient le registre multi-sites de l'admin.
-- Spec : docs/superpowers/specs/2026-08-20-admin-multi-sites-seo-partenariats-design.md
-- ---------------------------------------------------------------------------

alter table config.apps add column if not exists domaine        text;
alter table config.apps add column if not exists gsc_propriete  text;
alter table config.apps add column if not exists env_url        text;
alter table config.apps add column if not exists env_secret_ref text;

comment on column config.apps.gsc_propriete is
  'Identifiant de propriete Search Console (sc-domain:example.fr ou URL). '
  'NULL = module SEO inactif pour ce site.';
comment on column config.apps.env_secret_ref is
  'NOM du secret Edge Functions portant la cle service de l''environnement du '
  'site. La cle elle-meme n''est jamais en table.';

-- Les deux nouveaux sites. ARPET existe deja et n'est pas touche ici.
-- is_active=false a l'insertion : le trigger RAG tr_create_documents_cles_on_app_insert
-- (WHEN new.is_active) echoue sur un slug de concept constant deja pris. On active
-- ensuite par UPDATE, que ce trigger AFTER INSERT ne voit pas.
insert into config.apps (id, name, domaine, gsc_propriete, env_url, env_secret_ref, sort_order, is_active)
values
  ('monsieurdpe', 'MonsieurDPE', 'monsieurdpe.fr', 'sc-domain:monsieurdpe.fr',
   'https://odspcxgafcqxjzrarsqf.supabase.co', 'ADMIN_ENV_MONSIEURDPE_KEY', 40, false),
  ('pack-vendeur', 'Pack Vendeur', 'pre-etat-date.ai', 'sc-domain:pre-etat-date.ai',
   null, null, 50, false)
on conflict (id) do update set
  domaine        = excluded.domaine,
  gsc_propriete  = excluded.gsc_propriete,
  env_url        = excluded.env_url,
  env_secret_ref = excluded.env_secret_ref;

update config.apps set is_active = true where id in ('monsieurdpe', 'pack-vendeur');
