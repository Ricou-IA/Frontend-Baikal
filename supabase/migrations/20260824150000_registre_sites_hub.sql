-- Registre des sites du hub Baikal (spec 2026-08-24-hub-baikal-acces-sites).
-- 1. Trigger RAG retire : il rattachait toute app active au concept
--    'documents_cles' (sans objet hors ARPET, deja retire sur Majord'home).
DROP TRIGGER IF EXISTS tr_create_documents_cles_on_app_insert ON config.apps;
DROP FUNCTION IF EXISTS config.create_documents_cles_concept();

-- 2. Colonnes du registre.
ALTER TABLE config.apps ADD COLUMN IF NOT EXISTS db_schema text;
ALTER TABLE config.apps ADD COLUMN IF NOT EXISTS db_ro_secret_ref text;
COMMENT ON COLUMN config.apps.db_schema IS
  'Schema Postgres portant les donnees du produit (base partagee ou dediee).';
COMMENT ON COLUMN config.apps.db_ro_secret_ref IS
  'Nom du secret Edge Functions contenant le DSN lecture seule (baikal_reader) du projet dedie. NULL = donnees dans la base partagee.';

-- 3. Lignes existantes.
UPDATE config.apps SET db_schema = 'arpet'      WHERE id = 'arpet';
UPDATE config.apps SET db_schema = 'dpe'        WHERE id = 'monsieurdpe';
UPDATE config.apps SET db_schema = 'linktrack'  WHERE id = 'linktrack';
UPDATE config.apps SET db_schema = 'majordhome',
       env_url = 'https://ejqqqwudmizqisdkxohw.supabase.co',
       db_ro_secret_ref = 'ADMIN_RO_MAJORDHOME_DSN'
  WHERE id = 'majordhome';
UPDATE config.apps SET db_schema = 'pack_vendeur',
       env_url = 'https://ycmavnmtyvodqawvwrrd.supabase.co',
       db_ro_secret_ref = 'ADMIN_RO_PACKVENDEUR_DSN'
  WHERE id = 'pack-vendeur';

-- 4. Nouvelles lignes (domaine/gsc renseignes plus tard par Eric via /sites).
INSERT INTO config.apps (id, name, description, is_active, sort_order, db_schema)
VALUES
  ('voirie',     'Autorisation Voirie',
   'Demandes d''autorisation d''occupation de voirie (paiement Stripe one-shot)',
   true,  60,  'voirie'),
  ('duerp',      'DUERP',
   'Generation du Document Unique d''Evaluation des Risques Professionnels',
   true,  70,  'duerp'),
  ('cosette',    'Cosette',     NULL, true,  80,  'cosette'),
  ('legifrance', 'Legifrance',  NULL, true,  90,  'legifrance'),
  ('snapstudio', 'SnapStudio',  NULL, true, 100,  'snapstudio'),
  ('karedas',    'Karedas',     NULL, true, 110,  'karedas'),
  ('zelty',      'Zelty',       NULL, false, 120, 'zelty')
ON CONFLICT (id) DO NOTHING;

-- 5. Produit fantome (0 table, 0 org, 0 profil, 0 prompt, 0 file).
DELETE FROM config.apps WHERE id = 'perfec';
