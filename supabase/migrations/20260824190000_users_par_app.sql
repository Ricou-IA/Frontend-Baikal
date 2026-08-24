-- UI console hub (spec 2026-08-24-hub-baikal-ui-console) :
-- 1. La vue public.apps expose les colonnes registre utiles a la console
--    (domaine, db_schema) et un boolean heberge_dedie — jamais le nom du
--    secret (db_ro_secret_ref reste interne).
-- 2. Les RPC d'administration des utilisateurs gagnent un filtre p_app_id.
--    Drop + recreate (pas d'overload : PostgREST serait ambigu).

CREATE OR REPLACE VIEW public.apps AS
 SELECT id,
    name,
    description,
    icon,
    color,
    is_active,
    sort_order,
    domaine,
    db_schema,
    (db_ro_secret_ref IS NOT NULL) AS heberge_dedie
   FROM config.apps
  WHERE (is_active = true)
  ORDER BY sort_order, name;

DROP FUNCTION IF EXISTS public.get_pending_users();
DROP FUNCTION IF EXISTS core.get_pending_users();
DROP FUNCTION IF EXISTS public.get_users_for_admin(uuid, text, integer, integer);
DROP FUNCTION IF EXISTS core.get_users_for_admin(uuid, text, integer, integer);

CREATE FUNCTION core.get_pending_users(p_app_id text DEFAULT NULL)
RETURNS TABLE(id uuid, email text, full_name text, app_role text,
              business_role text, app_id text, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'core', 'public'
AS $$
BEGIN
    IF NOT core.is_super_admin() THEN
        RAISE EXCEPTION 'Accès réservé aux super administrateurs';
    END IF;
    RETURN QUERY
    SELECT p.id, p.email, p.full_name, p.app_role, p.business_role,
           p.app_id, p.created_at
    FROM core.profiles p
    WHERE p.org_id IS NULL
      AND p.app_role != 'super_admin'
      AND (p_app_id IS NULL OR p.app_id = p_app_id)
    ORDER BY p.created_at DESC;
END;
$$;

CREATE FUNCTION public.get_pending_users(p_app_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'core', 'pg_temp'
AS $$
BEGIN
    RETURN (SELECT jsonb_agg(row_to_json(r))
            FROM core.get_pending_users(p_app_id) AS r);
END;
$$;

CREATE FUNCTION core.get_users_for_admin(
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
    v_total bigint;
BEGIN
    v_is_super_admin := core.is_super_admin();
    SELECT p.org_id INTO v_current_user_org_id
    FROM core.profiles p WHERE p.id = auth.uid();
    IF NOT v_is_super_admin AND NOT core.is_org_admin(v_current_user_org_id) THEN
        RAISE EXCEPTION 'Droits insuffisants';
    END IF;
    SELECT count(*) INTO v_total
    FROM core.profiles p
    WHERE (v_is_super_admin OR p.org_id = v_current_user_org_id)
      AND (p_org_id IS NULL OR p.org_id = p_org_id)
      AND (p_app_id IS NULL OR p.app_id = p_app_id)
      AND (p_search IS NULL OR p.email ILIKE '%' || p_search || '%'
           OR p.full_name ILIKE '%' || p_search || '%');
    RETURN QUERY
    SELECT p.id, p.email, p.full_name, p.app_role, p.business_role,
           p.org_id, o.name, p.app_id, p.created_at, p.updated_at, v_total
    FROM core.profiles p
    LEFT JOIN core.organizations o ON p.org_id = o.id
    WHERE (v_is_super_admin OR p.org_id = v_current_user_org_id)
      AND (p_org_id IS NULL OR p.org_id = p_org_id)
      AND (p_app_id IS NULL OR p.app_id = p_app_id)
      AND (p_search IS NULL OR p.email ILIKE '%' || p_search || '%'
           OR p.full_name ILIKE '%' || p_search || '%')
    ORDER BY p.created_at DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$;

CREATE FUNCTION public.get_users_for_admin(
    p_org_id uuid DEFAULT NULL, p_search text DEFAULT NULL,
    p_limit integer DEFAULT 100, p_offset integer DEFAULT 0,
    p_app_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'core', 'pg_temp'
AS $$
BEGIN
    RETURN (SELECT jsonb_agg(row_to_json(r))
            FROM core.get_users_for_admin(p_org_id, p_search, p_limit,
                                          p_offset, p_app_id) AS r);
END;
$$;
