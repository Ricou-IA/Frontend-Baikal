-- Module « users » de la grille d'accès : la consultation des utilisateurs
-- d'un site par un admin délégué exige que le module soit ouvert (lecture ou
-- écriture) dans admin.droits_sites.modules. Super admin et org_admin (sa
-- propre organisation) inchangés.

CREATE OR REPLACE FUNCTION core.module_ouvert(p_user_id uuid, p_app_id text, p_module text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'core', 'admin', 'config', 'public'
AS $$
  SELECT (core.droits_modules(p_user_id) -> p_app_id -> p_module) IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION core.get_pending_users(p_app_id text DEFAULT NULL)
RETURNS TABLE(id uuid, email text, full_name text, app_role text,
              business_role text, app_id text, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'core', 'public'
AS $$
DECLARE
    v_super boolean;
BEGIN
    v_super := core.is_super_admin();
    IF NOT v_super THEN
        IF p_app_id IS NULL
           OR NOT core.module_ouvert(auth.uid(), p_app_id, 'users') THEN
            RAISE EXCEPTION 'Accès réservé aux super administrateurs ou aux admins du site';
        END IF;
    END IF;
    RETURN QUERY
    SELECT p.id, p.email, p.full_name, p.app_role, p.business_role,
           core.app_du_profil(p.app_id, u.raw_user_meta_data),
           p.created_at
    FROM core.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE p.org_id IS NULL
      AND p.app_role != 'super_admin'
      AND NOT core.app_modele_clients(core.app_du_profil(p.app_id, u.raw_user_meta_data))
      AND (p_app_id IS NULL
           OR core.app_du_profil(p.app_id, u.raw_user_meta_data) = p_app_id)
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
           AND core.module_ouvert(auth.uid(), p_app_id, 'users') THEN
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
