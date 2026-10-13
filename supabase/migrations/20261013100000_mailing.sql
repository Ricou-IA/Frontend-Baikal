-- ---------------------------------------------------------------------------
-- Module Mailing (spec docs/superpowers/specs/2026-10-13-baikal-mailing-design.md)
--
-- Baikal garde la campagne (objet, corps, ciblage, statut) ; le journal
-- nominatif vit chez le site (module docs/contrats/mailing-v1.sql).
-- ---------------------------------------------------------------------------

-- 1. Le registre : compte Resend du site, plafond, relais

ALTER TABLE config.apps
  ADD COLUMN IF NOT EXISTS resend_key_ref            text,
  ADD COLUMN IF NOT EXISTS resend_webhook_secret_ref text,
  ADD COLUMN IF NOT EXISTS mailing_plafond_jour      int CHECK (mailing_plafond_jour > 0),
  ADD COLUMN IF NOT EXISTS env_mailing_fn            text;

COMMENT ON COLUMN config.apps.resend_key_ref IS
  'NOM du secret Edge Function portant la cle API Resend du site (son compte, '
  'son domaine). NULL = cle de Baikal (RESEND_API_KEY). Jamais la valeur.';
COMMENT ON COLUMN config.apps.resend_webhook_secret_ref IS
  'NOM du secret de signature du webhook Resend du site pointant vers '
  'admin-mailing-webhook?site=<id>. NULL = MAILING_RESEND_WEBHOOK_SECRET.';
COMMENT ON COLUMN config.apps.mailing_plafond_jour IS
  'Envois de campagne maximum par jour (fuseau du site), toutes campagnes '
  'confondues. NULL = 200.';
COMMENT ON COLUMN config.apps.env_mailing_fn IS
  'Site sur base dediee : Edge Function du site qui execute les fonctions du '
  'module mailing-v1 (passe-plat docs/contrats/mailing-relais-v1.ts).';

-- 2. Les campagnes (rien de nominatif)

CREATE TABLE IF NOT EXISTS admin.mail_campagnes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id      text        NOT NULL REFERENCES config.apps(id),
  nom         text        NOT NULL,
  population  text        NOT NULL CHECK (population IN ('prospects','clients','comptes')),
  criteres    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  objet       text        NOT NULL DEFAULT '',
  corps_html  text        NOT NULL DEFAULT '',
  statut      text        NOT NULL DEFAULT 'brouillon'
              CHECK (statut IN ('brouillon','en_cours','suspendue','terminee')),
  -- Pourquoi la campagne s'est arretee seule (coupe-circuit, erreur d'envoi).
  motif       text,
  cree_par    text,
  cree_le     timestamptz NOT NULL DEFAULT now(),
  maj_le      timestamptz NOT NULL DEFAULT now(),
  lancee_le   timestamptz,
  terminee_le timestamptz,
  -- Dernier passage du worker : sert au tableau de bord (« prochain lot »).
  dernier_lot_le timestamptz
);

CREATE INDEX IF NOT EXISTS mail_campagnes_app ON admin.mail_campagnes (app_id, cree_le DESC);
CREATE INDEX IF NOT EXISTS mail_campagnes_en_cours ON admin.mail_campagnes (statut)
  WHERE statut = 'en_cours';

ALTER TABLE admin.mail_campagnes ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.mail_campagnes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON admin.mail_campagnes FROM anon, authenticated;
GRANT ALL ON admin.mail_campagnes TO service_role;

-- 3. Le module console « mailing »
--
-- Meme consequence assumee que pour comptes_pro et modules : les acces crees
-- a partir de maintenant le recoivent en ecriture, les acces existants ne
-- l'ont pas (absent = ferme). Les super admins ont tout.

CREATE OR REPLACE FUNCTION core.modules_console()
RETURNS text[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT ARRAY['clients', 'comptes_pro', 'prospects', 'finances',
               'rapports', 'seo', 'partenariats', 'users', 'modules', 'mailing'];
$$;

-- 4. Dispatchers de la base partagee
--
-- Meme mecanique que public.baikal_prospect_action : le site est designe par
-- son app_id, son schema lu dans le registre, et la fonction du module
-- appelee dans ce schema. Un site qui n'a pas installe le module leve une
-- erreur explicite.

CREATE OR REPLACE FUNCTION public.baikal_mail_schema(p_app_id text, p_fonction text)
RETURNS text
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_schema text;
BEGIN
  SELECT db_schema INTO v_schema FROM config.apps WHERE id = p_app_id;
  IF v_schema IS NULL THEN
    RAISE EXCEPTION 'Site % sans base configuree (db_schema)', p_app_id;
  END IF;
  IF to_regproc(format('%I.%I', v_schema, p_fonction)) IS NULL THEN
    RAISE EXCEPTION 'Le site % n''a pas installe le module mailing', p_app_id;
  END IF;
  RETURN v_schema;
END;
$$;

CREATE OR REPLACE FUNCTION public.baikal_mail_reserver(p_app_id text, p_campagne_id uuid, p_lignes jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v jsonb;
BEGIN
  EXECUTE format('SELECT %I.mail_reserver($1, $2)', public.baikal_mail_schema(p_app_id, 'mail_reserver'))
    INTO v USING p_campagne_id, p_lignes;
  RETURN v;
END; $$;

CREATE OR REPLACE FUNCTION public.baikal_mail_marquer(p_app_id text, p_campagne_id uuid, p_lignes jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v jsonb;
BEGIN
  EXECUTE format('SELECT %I.mail_marquer($1, $2)', public.baikal_mail_schema(p_app_id, 'mail_marquer'))
    INTO v USING p_campagne_id, p_lignes;
  RETURN v;
END; $$;

CREATE OR REPLACE FUNCTION public.baikal_mail_evenement(
  p_app_id text, p_resend_id text, p_type text, p_le timestamptz, p_detail jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v jsonb;
BEGIN
  EXECUTE format('SELECT %I.mail_evenement($1, $2, $3, $4)', public.baikal_mail_schema(p_app_id, 'mail_evenement'))
    INTO v USING p_resend_id, p_type, p_le, p_detail;
  RETURN v;
END; $$;

CREATE OR REPLACE FUNCTION public.baikal_mail_desinscrire(
  p_app_id text, p_email text, p_motif text, p_campagne_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v jsonb;
BEGIN
  EXECUTE format('SELECT %I.mail_desinscrire($1, $2, $3)', public.baikal_mail_schema(p_app_id, 'mail_desinscrire'))
    INTO v USING p_email, p_motif, p_campagne_id;
  RETURN v;
END; $$;

REVOKE ALL ON FUNCTION public.baikal_mail_schema(text, text)                                 FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.baikal_mail_reserver(text, uuid, jsonb)                        FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.baikal_mail_marquer(text, uuid, jsonb)                         FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.baikal_mail_evenement(text, text, text, timestamptz, jsonb)    FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.baikal_mail_desinscrire(text, text, text, uuid)                FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.baikal_mail_schema(text, text)                              TO service_role;
GRANT EXECUTE ON FUNCTION public.baikal_mail_reserver(text, uuid, jsonb)                     TO service_role;
GRANT EXECUTE ON FUNCTION public.baikal_mail_marquer(text, uuid, jsonb)                      TO service_role;
GRANT EXECUTE ON FUNCTION public.baikal_mail_evenement(text, text, text, timestamptz, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.baikal_mail_desinscrire(text, text, text, uuid)             TO service_role;

-- 5. Le worker : chaque minute, mais seulement si une campagne est en cours
--
-- Secret commun des crons admin, lu dans Vault (admin_seo_cron_secret), jamais en clair ici.

SELECT cron.unschedule('admin-mailing-worker')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'admin-mailing-worker');

SELECT cron.schedule(
  'admin-mailing-worker',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://odspcxgafcqxjzrarsqf.supabase.co/functions/v1/admin-mailing-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets
                        WHERE name = 'admin_seo_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000)
  WHERE EXISTS (SELECT 1 FROM admin.mail_campagnes WHERE statut = 'en_cours')
  $cron$
);
