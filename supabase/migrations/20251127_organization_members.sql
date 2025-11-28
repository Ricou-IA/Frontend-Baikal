-- ============================================================================
-- BRIQUE 6 : Migration - organization_members
-- Table pour gérer les membres des organisations
-- ============================================================================

-- Création de la table organization_members
CREATE TABLE IF NOT EXISTS public.organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')) DEFAULT 'member',
    status TEXT NOT NULL CHECK (status IN ('active', 'invited')) DEFAULT 'invited',
    invited_email TEXT,
    invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    invited_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_organization_members_org_id ON public.organization_members(org_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_user_id ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_invited_email ON public.organization_members(invited_email);
CREATE INDEX IF NOT EXISTS idx_organization_members_status ON public.organization_members(status);
CREATE INDEX IF NOT EXISTS idx_organization_members_org_user ON public.organization_members(org_id, user_id);

-- Contrainte unique : un utilisateur ne peut être membre qu'une seule fois par organisation
CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_members_unique_user 
    ON public.organization_members(org_id, user_id) 
    WHERE user_id IS NOT NULL;

-- Contrainte unique : un email ne peut être invité qu'une seule fois par organisation
CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_members_unique_email 
    ON public.organization_members(org_id, invited_email) 
    WHERE invited_email IS NOT NULL;

-- Fonction pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_organization_members_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour mettre à jour updated_at
DROP TRIGGER IF EXISTS trigger_update_organization_members_updated_at ON public.organization_members;
CREATE TRIGGER trigger_update_organization_members_updated_at
    BEFORE UPDATE ON public.organization_members
    FOR EACH ROW
    EXECUTE FUNCTION update_organization_members_updated_at();

-- Activer RLS (Row Level Security)
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- Politique RLS : Les membres peuvent voir les autres membres de leur organisation
DROP POLICY IF EXISTS "Members can view organization members" ON public.organization_members;
CREATE POLICY "Members can view organization members"
    ON public.organization_members
    FOR SELECT
    USING (
        -- L'utilisateur est membre de l'organisation
        EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.org_id = organization_members.org_id
            AND om.user_id = auth.uid()
            AND om.status = 'active'
        )
        -- Ou l'utilisateur est super admin
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND app_role = 'super_admin'
        )
    );

-- Politique RLS : Seuls les admins peuvent insérer des membres
DROP POLICY IF EXISTS "Admins can insert members" ON public.organization_members;
CREATE POLICY "Admins can insert members"
    ON public.organization_members
    FOR INSERT
    WITH CHECK (
        -- L'utilisateur est admin ou owner de l'organisation
        EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.org_id = organization_members.org_id
            AND om.user_id = auth.uid()
            AND om.status = 'active'
            AND om.role IN ('owner', 'admin')
        )
        -- Ou l'utilisateur est super admin
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND app_role = 'super_admin'
        )
    );

-- Politique RLS : Seuls les admins peuvent mettre à jour les membres
DROP POLICY IF EXISTS "Admins can update members" ON public.organization_members;
CREATE POLICY "Admins can update members"
    ON public.organization_members
    FOR UPDATE
    USING (
        -- L'utilisateur est admin ou owner de l'organisation
        EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.org_id = organization_members.org_id
            AND om.user_id = auth.uid()
            AND om.status = 'active'
            AND om.role IN ('owner', 'admin')
        )
        -- Ou l'utilisateur est super admin
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND app_role = 'super_admin'
        )
    );

-- Politique RLS : Seuls les admins peuvent supprimer des membres
DROP POLICY IF EXISTS "Admins can delete members" ON public.organization_members;
CREATE POLICY "Admins can delete members"
    ON public.organization_members
    FOR DELETE
    USING (
        -- L'utilisateur est admin ou owner de l'organisation
        EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.org_id = organization_members.org_id
            AND om.user_id = auth.uid()
            AND om.status = 'active'
            AND om.role IN ('owner', 'admin')
        )
        -- Ou l'utilisateur est super admin
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND app_role = 'super_admin'
        )
    );

-- Commentaires pour la documentation
COMMENT ON TABLE public.organization_members IS 'Table de gestion des membres des organisations';
COMMENT ON COLUMN public.organization_members.org_id IS 'ID de l''organisation';
COMMENT ON COLUMN public.organization_members.user_id IS 'ID de l''utilisateur (null si invitation en attente)';
COMMENT ON COLUMN public.organization_members.role IS 'Rôle: owner, admin, ou member';
COMMENT ON COLUMN public.organization_members.status IS 'Statut: active ou invited';
COMMENT ON COLUMN public.organization_members.invited_email IS 'Email de l''invité (si user_id est null)';
COMMENT ON COLUMN public.organization_members.invited_by IS 'ID de l''utilisateur qui a envoyé l''invitation';
