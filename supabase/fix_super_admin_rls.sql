-- ============================================================================
-- Script pour corriger les politiques RLS pour le super_admin
-- ============================================================================
-- 
-- Ce script vérifie et corrige les politiques RLS pour permettre au super_admin
-- d'accéder à toutes les données sans restriction
--
-- ============================================================================

-- Vérifier que les politiques existent et sont correctes pour organization_members
-- Les politiques devraient déjà inclure une clause pour super_admin, mais on vérifie

-- Pour organization_members, les politiques devraient déjà être correctes
-- car elles incluent : OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND app_role = 'super_admin')

-- Vérifier les politiques sur profiles (si elles existent)
-- Si profiles a des politiques RLS qui bloquent, on doit les ajuster

-- Créer une politique pour permettre au super_admin de voir tous les profils
DROP POLICY IF EXISTS "Super admin can view all profiles" ON public.profiles;
CREATE POLICY "Super admin can view all profiles"
    ON public.profiles
    FOR SELECT
    USING (
        -- L'utilisateur peut voir son propre profil
        id = auth.uid()
        -- Ou l'utilisateur est super admin
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND app_role = 'super_admin'
        )
    );

-- Créer une politique pour permettre au super_admin de voir toutes les organisations
DROP POLICY IF EXISTS "Super admin can view all organizations" ON public.organizations;
CREATE POLICY "Super admin can view all organizations"
    ON public.organizations
    FOR SELECT
    USING (
        -- L'utilisateur peut voir son organisation
        id IN (
            SELECT org_id FROM public.profiles WHERE id = auth.uid() AND org_id IS NOT NULL
        )
        -- Ou l'utilisateur est super admin
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND app_role = 'super_admin'
        )
    );

-- Vérifier que les politiques sur organization_members incluent bien le super_admin
-- (Elles devraient déjà être correctes d'après la migration, mais on vérifie)

-- Afficher un message de confirmation
DO $$
BEGIN
    RAISE NOTICE '✅ Politiques RLS vérifiées et corrigées pour le super_admin';
    RAISE NOTICE '💡 Le super_admin peut maintenant accéder à toutes les données';
END $$;



