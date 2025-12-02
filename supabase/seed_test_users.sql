-- ============================================================================
-- Script de seed pour créer des utilisateurs de test avec différents rôles
-- ============================================================================
-- 
-- INSTRUCTIONS:
-- 1. Remplacez 'VOTRE_ORG_ID' par l'ID de votre organisation
--    (trouvable dans Supabase Dashboard > Table Editor > organizations)
-- 2. Exécutez ce script dans Supabase Dashboard > SQL Editor
-- 3. Tous les comptes utilisent le mot de passe: Test123!
--
-- ============================================================================

-- ============================================================================
-- 1. SUPER ADMIN (déjà existant, pas besoin de le créer)
-- ============================================================================

-- ============================================================================
-- 2. ORG ADMIN - Administrateur d'organisation
-- ============================================================================
DO $$
DECLARE
    v_user_id UUID;
    v_org_id UUID := 'VOTRE_ORG_ID'; -- ⚠️ REMPLACEZ ICI par votre org_id
BEGIN
    -- Créer l'utilisateur dans auth.users
    INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        recovery_sent_at,
        last_sign_in_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        confirmation_token,
        email_change,
        email_change_token_new,
        recovery_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        gen_random_uuid(),
        'authenticated',
        'authenticated',
        'orgadmin@test.com',
        crypt('Test123!', gen_salt('bf')),
        NOW(),
        NOW(),
        NOW(),
        '{"provider":"email","providers":["email"]}',
        '{"full_name":"Org Admin Test"}',
        NOW(),
        NOW(),
        '',
        '',
        '',
        ''
    ) RETURNING id INTO v_user_id;

    -- Créer le profil
    INSERT INTO public.profiles (
        id,
        email,
        full_name,
        app_role,
        business_role,
        org_id,
        created_at,
        updated_at
    ) VALUES (
        v_user_id,
        'orgadmin@test.com',
        'Org Admin Test',
        'org_admin',
        'provider',
        v_org_id,
        NOW(),
        NOW()
    ) ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        app_role = EXCLUDED.app_role,
        business_role = EXCLUDED.business_role,
        org_id = EXCLUDED.org_id;

    -- Ajouter comme membre de l'organisation avec rôle admin
    INSERT INTO public.organization_members (
        org_id,
        user_id,
        role,
        status,
        invited_by,
        created_at
    ) VALUES (
        v_org_id,
        v_user_id,
        'admin',
        'active',
        v_user_id,
        NOW()
    ) ON CONFLICT DO NOTHING;

    RAISE NOTICE '✅ Org Admin créé: % (email: orgadmin@test.com, password: Test123!)', v_user_id;
END $$;

-- ============================================================================
-- 3. MEMBER 1 - Membre simple
-- ============================================================================
DO $$
DECLARE
    v_user_id UUID;
    v_org_id UUID := 'VOTRE_ORG_ID'; -- ⚠️ REMPLACEZ ICI
BEGIN
    INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        recovery_sent_at,
        last_sign_in_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        confirmation_token,
        email_change,
        email_change_token_new,
        recovery_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        gen_random_uuid(),
        'authenticated',
        'authenticated',
        'member1@test.com',
        crypt('Test123!', gen_salt('bf')),
        NOW(),
        NOW(),
        NOW(),
        '{"provider":"email","providers":["email"]}',
        '{"full_name":"Member 1 Test"}',
        NOW(),
        NOW(),
        '',
        '',
        '',
        ''
    ) RETURNING id INTO v_user_id;

    INSERT INTO public.profiles (
        id,
        email,
        full_name,
        app_role,
        business_role,
        org_id,
        created_at,
        updated_at
    ) VALUES (
        v_user_id,
        'member1@test.com',
        'Member 1 Test',
        'user',
        'client',
        v_org_id,
        NOW(),
        NOW()
    ) ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        app_role = EXCLUDED.app_role,
        business_role = EXCLUDED.business_role,
        org_id = EXCLUDED.org_id;

    INSERT INTO public.organization_members (
        org_id,
        user_id,
        role,
        status,
        invited_by,
        created_at
    ) VALUES (
        v_org_id,
        v_user_id,
        'member',
        'active',
        v_user_id,
        NOW()
    ) ON CONFLICT DO NOTHING;

    RAISE NOTICE '✅ Member 1 créé: % (email: member1@test.com, password: Test123!)', v_user_id;
END $$;

-- ============================================================================
-- 4. MEMBER 2 - Membre simple
-- ============================================================================
DO $$
DECLARE
    v_user_id UUID;
    v_org_id UUID := 'VOTRE_ORG_ID'; -- ⚠️ REMPLACEZ ICI
BEGIN
    INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        recovery_sent_at,
        last_sign_in_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        confirmation_token,
        email_change,
        email_change_token_new,
        recovery_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        gen_random_uuid(),
        'authenticated',
        'authenticated',
        'member2@test.com',
        crypt('Test123!', gen_salt('bf')),
        NOW(),
        NOW(),
        NOW(),
        '{"provider":"email","providers":["email"]}',
        '{"full_name":"Member 2 Test"}',
        NOW(),
        NOW(),
        '',
        '',
        '',
        ''
    ) RETURNING id INTO v_user_id;

    INSERT INTO public.profiles (
        id,
        email,
        full_name,
        app_role,
        business_role,
        org_id,
        created_at,
        updated_at
    ) VALUES (
        v_user_id,
        'member2@test.com',
        'Member 2 Test',
        'user',
        'provider',
        v_org_id,
        NOW(),
        NOW()
    ) ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        app_role = EXCLUDED.app_role,
        business_role = EXCLUDED.business_role,
        org_id = EXCLUDED.org_id;

    INSERT INTO public.organization_members (
        org_id,
        user_id,
        role,
        status,
        invited_by,
        created_at
    ) VALUES (
        v_org_id,
        v_user_id,
        'member',
        'active',
        v_user_id,
        NOW()
    ) ON CONFLICT DO NOTHING;

    RAISE NOTICE '✅ Member 2 créé: % (email: member2@test.com, password: Test123!)', v_user_id;
END $$;

-- ============================================================================
-- 5. MEMBER 3 - Membre simple (sans organisation pour tester)
-- ============================================================================
DO $$
DECLARE
    v_user_id UUID;
BEGIN
    INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        recovery_sent_at,
        last_sign_in_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        confirmation_token,
        email_change,
        email_change_token_new,
        recovery_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        gen_random_uuid(),
        'authenticated',
        'authenticated',
        'member3@test.com',
        crypt('Test123!', gen_salt('bf')),
        NOW(),
        NOW(),
        NOW(),
        '{"provider":"email","providers":["email"]}',
        '{"full_name":"Member 3 Test"}',
        NOW(),
        NOW(),
        '',
        '',
        '',
        ''
    ) RETURNING id INTO v_user_id;

    INSERT INTO public.profiles (
        id,
        email,
        full_name,
        app_role,
        business_role,
        org_id,
        created_at,
        updated_at
    ) VALUES (
        v_user_id,
        'member3@test.com',
        'Member 3 Test',
        'user',
        'client',
        NULL, -- Pas d'organisation
        NOW(),
        NOW()
    ) ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        app_role = EXCLUDED.app_role,
        business_role = EXCLUDED.business_role,
        org_id = EXCLUDED.org_id;

    RAISE NOTICE '✅ Member 3 créé (sans org): % (email: member3@test.com, password: Test123!)', v_user_id;
END $$;

-- ============================================================================
-- 6. ORG ADMIN 2 - Deuxième admin pour tester
-- ============================================================================
DO $$
DECLARE
    v_user_id UUID;
    v_org_id UUID := 'VOTRE_ORG_ID'; -- ⚠️ REMPLACEZ ICI
BEGIN
    INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        recovery_sent_at,
        last_sign_in_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        confirmation_token,
        email_change,
        email_change_token_new,
        recovery_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        gen_random_uuid(),
        'authenticated',
        'authenticated',
        'orgadmin2@test.com',
        crypt('Test123!', gen_salt('bf')),
        NOW(),
        NOW(),
        NOW(),
        '{"provider":"email","providers":["email"]}',
        '{"full_name":"Org Admin 2 Test"}',
        NOW(),
        NOW(),
        '',
        '',
        '',
        ''
    ) RETURNING id INTO v_user_id;

    INSERT INTO public.profiles (
        id,
        email,
        full_name,
        app_role,
        business_role,
        org_id,
        created_at,
        updated_at
    ) VALUES (
        v_user_id,
        'orgadmin2@test.com',
        'Org Admin 2 Test',
        'org_admin',
        'provider',
        v_org_id,
        NOW(),
        NOW()
    ) ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        app_role = EXCLUDED.app_role,
        business_role = EXCLUDED.business_role,
        org_id = EXCLUDED.org_id;

    INSERT INTO public.organization_members (
        org_id,
        user_id,
        role,
        status,
        invited_by,
        created_at
    ) VALUES (
        v_org_id,
        v_user_id,
        'admin',
        'active',
        v_user_id,
        NOW()
    ) ON CONFLICT DO NOTHING;

    RAISE NOTICE '✅ Org Admin 2 créé: % (email: orgadmin2@test.com, password: Test123!)', v_user_id;
END $$;

-- ============================================================================
-- RÉSUMÉ
-- ============================================================================
-- Comptes créés (mot de passe pour tous: Test123!):
-- - orgadmin@test.com (Org Admin)
-- - orgadmin2@test.com (Org Admin 2)
-- - member1@test.com (Member)
-- - member2@test.com (Member)
-- - member3@test.com (Member sans organisation)
-- ============================================================================



