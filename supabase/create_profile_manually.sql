-- ============================================================================
-- Script pour créer manuellement un profil pour un utilisateur existant
-- ============================================================================
-- 
-- INSTRUCTIONS:
-- 1. Remplacez 'VOTRE_EMAIL' par votre email
-- 2. Remplacez 'VOTRE_NOM' par votre nom complet (optionnel)
-- 3. Remplacez 'super_admin' par le rôle souhaité (super_admin, org_admin, user)
-- 4. Exécutez ce script dans Supabase Dashboard > SQL Editor
--
-- ============================================================================

DO $$
DECLARE
    v_user_id UUID;
    v_user_email TEXT := 'VOTRE_EMAIL'; -- ⚠️ REMPLACEZ ICI
    v_full_name TEXT := 'VOTRE_NOM'; -- ⚠️ REMPLACEZ ICI (optionnel)
    v_app_role TEXT := 'super_admin'; -- ⚠️ REMPLACEZ ICI si nécessaire
BEGIN
    -- Récupérer l'ID de l'utilisateur depuis auth.users
    SELECT id INTO v_user_id
    FROM auth.users
    WHERE email = v_user_email
    LIMIT 1;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Utilisateur avec l''email % non trouvé dans auth.users', v_user_email;
    END IF;

    -- Créer ou mettre à jour le profil
    INSERT INTO public.profiles (
        id,
        email,
        full_name,
        app_role,
        business_role,
        created_at,
        updated_at
    ) VALUES (
        v_user_id,
        v_user_email,
        COALESCE(v_full_name, v_user_email),
        v_app_role,
        'provider', -- Par défaut
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
        app_role = EXCLUDED.app_role,
        updated_at = NOW();

    RAISE NOTICE '✅ Profil créé/mis à jour pour l''utilisateur % (ID: %)', v_user_email, v_user_id;
    RAISE NOTICE '   - Email: %', v_user_email;
    RAISE NOTICE '   - Nom: %', COALESCE(v_full_name, v_user_email);
    RAISE NOTICE '   - Rôle: %', v_app_role;
END $$;

-- ============================================================================
-- Alternative : Créer le profil directement avec votre ID utilisateur
-- ============================================================================
-- Si vous connaissez votre ID utilisateur (trouvable dans auth.users),
-- vous pouvez utiliser cette version simplifiée :

/*
INSERT INTO public.profiles (
    id,
    email,
    full_name,
    app_role,
    business_role,
    created_at,
    updated_at
)
SELECT 
    id,
    email,
    COALESCE(raw_user_meta_data->>'full_name', email),
    'super_admin',
    'provider',
    NOW(),
    NOW()
FROM auth.users
WHERE email = 'VOTRE_EMAIL' -- ⚠️ REMPLACEZ ICI
ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    app_role = EXCLUDED.app_role,
    updated_at = NOW();
*/



