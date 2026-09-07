-- Étage Baikal et droits par module (spec 2026-09-07-etage-baikal-droits-modules).
--
-- 1. admin.droits_sites.modules : {module: lecture|ecriture}, absent = fermé.
--    Existant et défaut : tout en écriture (décision Eric du 07/09).
-- 2. core.droits_modules(user) / public.mes_droits_modules() : source de
--    vérité consommée par le front et les Edge Functions (_shared/droits.ts).
-- 3. get_users_for_admin : les super admins n'appartiennent à aucun site —
--    exclus dès qu'un site est demandé (ils vivent dans l'étage Baikal).

-- ---------------------------------------------------------------------------
-- 1. Catalogue des modules et niveaux
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION core.modules_console()
RETURNS text[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT ARRAY['clients', 'prospects', 'finances', 'rapports', 'seo', 'partenariats', 'users'];
$$;

COMMENT ON FUNCTION core.modules_console() IS
  'Modules transverses de la console soumis aux droits par module (admin.droits_sites.modules).';

CREATE OR REPLACE FUNCTION core.modules_tout_ecriture()
RETURNS jsonb
LANGUAGE sql IMMUTABLE
AS $$
  SELECT jsonb_object_agg(m, 'ecriture') FROM unnest(core.modules_console()) AS m;
$$;

CREATE OR REPLACE FUNCTION core.modules_valides(p jsonb)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT jsonb_typeof(p) = 'object'
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_each_text(p) AS e
        WHERE e.value NOT IN ('lecture', 'ecriture')
           OR NOT (e.key = ANY (core.modules_console()))
     );
$$;

ALTER TABLE admin.droits_sites
  ADD COLUMN IF NOT EXISTS modules jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE admin.droits_sites SET modules = core.modules_tout_ecriture()
 WHERE modules = '{}'::jsonb;

ALTER TABLE admin.droits_sites
  ALTER COLUMN modules SET DEFAULT core.modules_tout_ecriture();

ALTER TABLE admin.droits_sites DROP CONSTRAINT IF EXISTS droits_sites_modules_check;
ALTER TABLE admin.droits_sites
  ADD CONSTRAINT droits_sites_modules_check CHECK (core.modules_valides(modules));

COMMENT ON COLUMN admin.droits_sites.modules IS
  'Droits par module de cet accès console : {module: lecture|ecriture}. Module absent = fermé. Modules : core.modules_console().';

-- ---------------------------------------------------------------------------
-- 2. Source de vérité des droits par module
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION core.droits_modules(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'core', 'admin', 'config', 'public'
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM core.profiles
                 WHERE id = p_user_id AND app_role = 'super_admin')
    THEN COALESCE((SELECT jsonb_object_agg(a.id, core.modules_tout_ecriture())
                   FROM config.apps a WHERE a.is_active), '{}'::jsonb)
    ELSE COALESCE((SELECT jsonb_object_agg(d.app_id, d.modules)
                   FROM admin.droits_sites d
                   JOIN config.apps a ON a.id = d.app_id AND a.is_active
                   WHERE d.user_id = p_user_id), '{}'::jsonb)
  END;
$$;

COMMENT ON FUNCTION core.droits_modules(uuid) IS
  'Droits par module d''une personne : {app_id: {module: lecture|ecriture}}. super_admin : toutes les apps actives, tout en écriture.';

CREATE OR REPLACE FUNCTION public.mes_droits_modules()
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'core', 'pg_temp'
AS $$
  SELECT core.droits_modules(auth.uid());
$$;

REVOKE ALL ON FUNCTION public.mes_droits_modules() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mes_droits_modules() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Les super admins n'appartiennent à aucun site
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION core.get_users_for_admin(
    p_org_id uuid DEFAULT NULL, p_search text DEFAULT NULL,
    p_limit integer DEFAULT 50, p_offset integer DEFAULT 0,
    p_app_id text DEFAULT NULL)
RETURNS TABLE(id uuid, email text, full_name text, app_role text,
              business_role text, org_id uuid, org_name text, app_id text,
              created_at timestamptz, updated_at timestamptz, total_count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'core', 'public'
AS $$
DECLARE
    v_current_user_org_id uuid;
    v_is_super_admin boolean;
    v_est_org_admin boolean;
    v_delegue boolean := false;
    v_total bigint;
BEGIN
    v_is_super_admin := core.is_super_admin();
    SELECT p.org_id INTO v_current_user_org_id
    FROM core.profiles p WHERE p.id = auth.uid();
    v_est_org_admin := core.is_org_admin(v_current_user_org_id);
    IF NOT v_is_super_admin AND NOT v_est_org_admin THEN
        IF p_app_id IS NOT NULL
           AND p_app_id = ANY(core.sites_autorises(auth.uid())) THEN
            v_delegue := true;
        ELSE
            RAISE EXCEPTION 'Droits insuffisants';
        END IF;
    END IF;
    SELECT count(*) INTO v_total
    FROM core.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE (v_is_super_admin OR v_delegue OR p.org_id = v_current_user_org_id)
      AND (p_org_id IS NULL OR p.org_id = p_org_id)
      AND (p_app_id IS NULL OR p.app_role <> 'super_admin')
      AND NOT core.app_modele_clients(core.app_du_profil(p.app_id, u.raw_user_meta_data))
      AND (p_app_id IS NULL
           OR core.app_du_profil(p.app_id, u.raw_user_meta_data) = p_app_id)
      AND (p_search IS NULL OR p.email ILIKE '%' || p_search || '%'
           OR p.full_name ILIKE '%' || p_search || '%');
    RETURN QUERY
    SELECT p.id, p.email, p.full_name, p.app_role, p.business_role,
           p.org_id, o.name,
           core.app_du_profil(p.app_id, u.raw_user_meta_data),
           p.created_at, p.updated_at, v_total
    FROM core.profiles p
    LEFT JOIN core.organizations o ON p.org_id = o.id
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE (v_is_super_admin OR v_delegue OR p.org_id = v_current_user_org_id)
      AND (p_org_id IS NULL OR p.org_id = p_org_id)
      AND (p_app_id IS NULL OR p.app_role <> 'super_admin')
      AND NOT core.app_modele_clients(core.app_du_profil(p.app_id, u.raw_user_meta_data))
      AND (p_app_id IS NULL
           OR core.app_du_profil(p.app_id, u.raw_user_meta_data) = p_app_id)
      AND (p_search IS NULL OR p.email ILIKE '%' || p_search || '%'
           OR p.full_name ILIKE '%' || p_search || '%')
    ORDER BY p.created_at DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$;
