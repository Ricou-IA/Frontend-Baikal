-- Droits par site pour les admins delegues (spec 2026-08-24-hub-baikal-droits-sites).
-- Table dans le schema admin : RLS forcee sans policy, acces service_role
-- uniquement, comme prospects/campagnes.

CREATE TABLE IF NOT EXISTS admin.droits_sites (
  user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  app_id   text NOT NULL REFERENCES config.apps(id) ON DELETE CASCADE,
  cree_par uuid,
  cree_le  timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, app_id)
);
ALTER TABLE admin.droits_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.droits_sites FORCE ROW LEVEL SECURITY;

-- Source de verite unique : la liste des sites qu'un utilisateur administre.
-- super_admin -> toutes les apps actives ; sinon droits_sites ∩ apps actives.
CREATE OR REPLACE FUNCTION core.sites_autorises(p_user_id uuid)
RETURNS text[]
LANGUAGE sql SECURITY DEFINER SET search_path TO 'core', 'public'
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM core.profiles
                 WHERE id = p_user_id AND app_role = 'super_admin')
    THEN coalesce((SELECT array_agg(id) FROM config.apps WHERE is_active), '{}')
    ELSE coalesce((SELECT array_agg(d.app_id)
                   FROM admin.droits_sites d
                   JOIN config.apps a ON a.id = d.app_id AND a.is_active
                   WHERE d.user_id = p_user_id), '{}')
  END;
$$;

CREATE OR REPLACE FUNCTION public.mes_droits_sites()
RETURNS text[]
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'core', 'pg_temp'
AS $$
  SELECT core.sites_autorises(auth.uid());
$$;

-- v3 des RPC users : chemin "admin delegue" (p_app_id obligatoire et dans ses
-- droits ; lignes de cette app uniquement). Chemins super_admin et org_admin
-- inchanges.
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
           OR NOT (p_app_id = ANY(core.sites_autorises(auth.uid()))) THEN
            RAISE EXCEPTION 'Accès réservé aux super administrateurs ou aux admins du site';
        END IF;
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
    WHERE (v_is_super_admin OR v_delegue OR p.org_id = v_current_user_org_id)
      AND (p_org_id IS NULL OR p.org_id = p_org_id)
      AND (p_app_id IS NULL
           OR COALESCE(p.app_id, u.raw_user_meta_data->>'source', 'arpet') = p_app_id)
      AND (p_search IS NULL OR p.email ILIKE '%' || p_search || '%'
           OR p.full_name ILIKE '%' || p_search || '%')
    ORDER BY p.created_at DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$;
