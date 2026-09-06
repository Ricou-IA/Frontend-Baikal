-- Comptes console vs clients de site (décision Eric, 06/09/2026).
--
-- Constat : la base d'authentification est partagée par tous les sites. Le
-- trigger public.handle_new_user fabriquait une ligne core.profiles pour CHAQUE
-- inscription, quel que soit le produit, et les RPC d'administration des
-- utilisateurs ne reconnaissaient qu'un marqueur (raw_user_meta_data.source,
-- convention Voirie) avant de replier sur 'arpet'. MonsieurDPE marque ses
-- comptes avec raw_user_meta_data.application = 'dpe' : ses 16 clients
-- apparaissaient dans l'onglet « En attente » d'ARPET.
--
-- Règle posée ici :
--   * config.apps.modele_comptes ∈ organisations | clients.
--     - organisations : les comptes du site sont des membres d'organisations
--       (ARPET, Majord'home, LinkTrackPro) — ils vivent dans core.profiles et
--       se gèrent dans la page Utilisateurs de la console.
--     - clients : les comptes du site sont ses CLIENTS (MonsieurDPE, Voirie,
--       Pack Vendeur) — ils vivent dans le schéma du site et se lisent dans la
--       page Clients (vue baikal_dossiers). Aucune ligne core.profiles.
--   * core.resoudre_app(meta) : traduit le marqueur d'inscription (source ou
--     application) en id du registre, par l'id OU par db_schema
--     ('dpe' -> monsieurdpe, 'voirie' -> voirie). NULL si inconnu.
--   * core.app_du_profil(app_id, meta) : app_id explicite, sinon marqueur
--     résolu, sinon 'arpet' (app par défaut de Baikal pour un compte sans
--     marqueur — les inscriptions ARPET n'en posent pas).
--   * handle_new_user : résout le site, l'écrit dans app_id, et NE CRÉE PAS de
--     profil console pour un site en modèle clients.
--   * RPC users : même résolution, et exclusion des sites en modèle clients.
--   * Données : suppression des profils console parasites (clients DPE et
--     Voirie sans organisation, aucune ligne liée par FK — vérifié le 06/09),
--     et app_id = 'arpet' posé explicitement sur les comptes historiques sans
--     marqueur, pour que NULL signifie désormais « inscription inconnue ».

-- ---------------------------------------------------------------------------
-- 1. Registre
-- ---------------------------------------------------------------------------
ALTER TABLE config.apps
  ADD COLUMN IF NOT EXISTS modele_comptes text NOT NULL DEFAULT 'organisations';

ALTER TABLE config.apps DROP CONSTRAINT IF EXISTS apps_modele_comptes_check;
ALTER TABLE config.apps
  ADD CONSTRAINT apps_modele_comptes_check
  CHECK (modele_comptes IN ('organisations', 'clients'));

COMMENT ON COLUMN config.apps.modele_comptes IS
  'organisations : les comptes du site sont des membres d''organisations (core.profiles, page Utilisateurs). '
  'clients : les comptes du site sont ses clients (schéma du site, page Clients) — aucun profil console n''est créé.';

UPDATE config.apps SET modele_comptes = 'clients'
 WHERE id IN ('monsieurdpe', 'voirie', 'pack-vendeur');

-- La vue console expose le modèle (colonne ajoutée en fin, CREATE OR REPLACE
-- l'accepte sans DROP).
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
    (db_ro_secret_ref IS NOT NULL) AS heberge_dedie,
    modele_comptes
   FROM config.apps
  WHERE (is_active = true)
  ORDER BY sort_order, name;

-- ---------------------------------------------------------------------------
-- 2. Résolution du site d'un compte
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION core.resoudre_app(p_meta jsonb)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'config', 'core'
AS $$
  WITH marqueur AS (
    SELECT NULLIF(TRIM(COALESCE(p_meta->>'source', p_meta->>'application')), '') AS m
  )
  SELECT a.id
    FROM config.apps a, marqueur
   WHERE marqueur.m IS NOT NULL
     AND (a.id = marqueur.m OR a.db_schema = marqueur.m)
   ORDER BY (a.id = marqueur.m) DESC
   LIMIT 1;
$$;

COMMENT ON FUNCTION core.resoudre_app(jsonb) IS
  'Traduit le marqueur d''inscription (raw_user_meta_data.source ou .application) en id de config.apps, par l''id ou par db_schema. NULL si inconnu.';

CREATE OR REPLACE FUNCTION core.app_du_profil(p_app_id text, p_meta jsonb)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'config', 'core'
AS $$
  SELECT COALESCE(p_app_id, core.resoudre_app(p_meta), 'arpet');
$$;

COMMENT ON FUNCTION core.app_du_profil(text, jsonb) IS
  'Site d''un profil console : app_id explicite, sinon marqueur d''inscription résolu, sinon arpet (app par défaut de Baikal).';

CREATE OR REPLACE FUNCTION core.app_modele_clients(p_app_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'config'
AS $$
  SELECT EXISTS (SELECT 1 FROM config.apps WHERE id = p_app_id AND modele_comptes = 'clients');
$$;

-- ---------------------------------------------------------------------------
-- 3. Trigger de création de profil (auth.users -> core.profiles)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'core'
AS $$
DECLARE
    v_invitation_code TEXT;
    v_invitation RECORD;
    v_org_id UUID := NULL;
    v_app_id TEXT := NULL;
    v_app_role TEXT := 'user';
    v_business_role TEXT := NULL;
BEGIN
    -- Code d'invitation (organisation) : prime sur tout le reste.
    v_invitation_code := NEW.raw_user_meta_data->>'invitation_code';

    IF v_invitation_code IS NOT NULL AND LENGTH(TRIM(v_invitation_code)) > 0 THEN
        SELECT
            i.id,
            i.org_id,
            i.default_app_role,
            i.default_business_role,
            i.max_uses,
            i.current_uses,
            o.app_id
        INTO v_invitation
        FROM core.org_invitations i
        INNER JOIN core.organizations o ON i.org_id = o.id
        WHERE i.code = UPPER(TRIM(v_invitation_code))
        AND i.is_active = true
        AND o.is_active = true
        AND (i.expires_at IS NULL OR i.expires_at > NOW())
        AND (i.max_uses IS NULL OR i.current_uses < i.max_uses);

        IF v_invitation.id IS NOT NULL THEN
            v_org_id := v_invitation.org_id;
            v_app_id := v_invitation.app_id;
            v_app_role := COALESCE(v_invitation.default_app_role, 'user');
            v_business_role := v_invitation.default_business_role;

            UPDATE core.org_invitations
            SET current_uses = current_uses + 1,
                updated_at = NOW()
            WHERE id = v_invitation.id;

            IF v_invitation.max_uses IS NOT NULL
               AND (v_invitation.current_uses + 1) >= v_invitation.max_uses THEN
                UPDATE core.org_invitations
                SET is_active = false
                WHERE id = v_invitation.id;
            END IF;
        END IF;
    END IF;

    -- Sans invitation : le site se lit dans le marqueur d'inscription.
    IF v_app_id IS NULL THEN
        v_app_id := core.resoudre_app(NEW.raw_user_meta_data);
    END IF;

    -- Site en modèle clients : le compte est un client du site, pas un
    -- utilisateur de la console. Le site tient son propre profil (ex.
    -- dpe.profil via le trigger dpe_creer_profil). Rien à créer ici.
    IF v_app_id IS NOT NULL AND core.app_modele_clients(v_app_id) THEN
        RETURN NEW;
    END IF;

    INSERT INTO core.profiles (
        id, email, full_name, app_role, business_role, org_id, app_id,
        created_at, updated_at
    )
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        v_app_role,
        v_business_role,
        v_org_id,
        v_app_id,
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, core.profiles.full_name),
        app_role = COALESCE(NULLIF(EXCLUDED.app_role, 'user'), core.profiles.app_role),
        business_role = COALESCE(EXCLUDED.business_role, core.profiles.business_role),
        org_id = COALESCE(EXCLUDED.org_id, core.profiles.org_id),
        app_id = COALESCE(EXCLUDED.app_id, core.profiles.app_id),
        updated_at = NOW();

    IF v_org_id IS NOT NULL THEN
        INSERT INTO core.organization_members (
            org_id, user_id, role, status, created_at, updated_at
        )
        VALUES (v_org_id, NEW.id, 'member', 'active', NOW(), NOW())
        ON CONFLICT DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. RPC d'administration des utilisateurs (v4 : résolution commune,
--    sites en modèle clients exclus). Droits inchangés depuis droits_sites.
-- ---------------------------------------------------------------------------
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
      AND NOT core.app_modele_clients(core.app_du_profil(p.app_id, u.raw_user_meta_data))
      AND (p_app_id IS NULL
           OR core.app_du_profil(p.app_id, u.raw_user_meta_data) = p_app_id)
      AND (p_search IS NULL OR p.email ILIKE '%' || p_search || '%'
           OR p.full_name ILIKE '%' || p_search || '%')
    ORDER BY p.created_at DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Données
-- ---------------------------------------------------------------------------
-- 5a. Profils console parasites : clients de sites en modèle clients, sans
--     organisation, rôle user. Leur compte auth et leurs dossiers ne bougent
--     pas ; seule la ligne core.profiles en trop disparaît.
DELETE FROM core.profiles p
 USING auth.users u
 WHERE u.id = p.id
   AND p.org_id IS NULL
   AND p.app_role = 'user'
   AND core.app_modele_clients(core.app_du_profil(p.app_id, u.raw_user_meta_data));

-- 5b. Comptes historiques sans marqueur : app par défaut posée explicitement.
UPDATE core.profiles p
   SET app_id = 'arpet', updated_at = NOW()
  FROM auth.users u
 WHERE u.id = p.id
   AND p.app_id IS NULL
   AND p.app_role <> 'super_admin'
   AND core.resoudre_app(u.raw_user_meta_data) IS NULL;
