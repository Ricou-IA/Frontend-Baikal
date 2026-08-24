-- Resolution du site d'un profil : profiles.app_id est NULL pour les comptes
-- crees hors console (ex. voirie pose raw_user_meta_data.source, pas app_id)
-- et pour les inscriptions ARPET historiques. Regle :
--   COALESCE(profiles.app_id, auth.users.raw_user_meta_data->>'source', 'arpet')
-- appliquee au filtre ET a la colonne app_id retournee.

CREATE OR REPLACE FUNCTION core.get_pending_users(p_app_id text DEFAULT NULL)
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
           COALESCE(p.app_id, u.raw_user_meta_data->>'source', 'arpet'),
           p.created_at
    FROM core.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE p.org_id IS NULL
      AND p.app_role != 'super_admin'
      AND (p_app_id IS NULL
           OR COALESCE(p.app_id, u.raw_user_meta_data->>'source', 'arpet') = p_app_id)
    ORDER BY p.created_at DESC;
END;
$$;

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
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE (v_is_super_admin OR p.org_id = v_current_user_org_id)
      AND (p_org_id IS NULL OR p.org_id = p_org_id)
      AND (p_app_id IS NULL
           OR COALESCE(p.app_id, u.raw_user_meta_data->>'source', 'arpet') = p_app_id)
      AND (p_search IS NULL OR p.email ILIKE '%' || p_search || '%'
           OR p.full_name ILIKE '%' || p_search || '%');
    RETURN QUERY
    SELECT p.id, p.email, p.full_name, p.app_role, p.business_role,
           p.org_id, o.name,
           COALESCE(p.app_id, u.raw_user_meta_data->>'source', 'arpet'),
           p.created_at, p.updated_at, v_total
    FROM core.profiles p
    LEFT JOIN core.organizations o ON p.org_id = o.id
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE (v_is_super_admin OR p.org_id = v_current_user_org_id)
      AND (p_org_id IS NULL OR p.org_id = p_org_id)
      AND (p_app_id IS NULL
           OR COALESCE(p.app_id, u.raw_user_meta_data->>'source', 'arpet') = p_app_id)
      AND (p_search IS NULL OR p.email ILIKE '%' || p_search || '%'
           OR p.full_name ILIKE '%' || p_search || '%')
    ORDER BY p.created_at DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$;
