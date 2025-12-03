// ============================================================================
// BRIQUE 6 : Page Admin
// Interface d'administration de l'organisation
// Inclut : Gestion Légifrance pour SuperAdmin
// ============================================================================

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useOrganization } from '../hooks/useOrganization';
import { supabase } from '../lib/supabaseClient';
import {
    MembersList,
    InviteMemberModal,
    OrganizationSettings,
    ProfileSwitcher,
    UsersList
} from '../components/admin';
// Import du composant Légifrance
import LegifranceAdmin from '../components/admin/LegifranceAdmin';
import {
    ArrowLeft,
    Users,
    Building2,
    Settings,
    Shield,
    AlertCircle,
    Loader2,
    UserCog,
    Scale  // Icône pour Légifrance
} from 'lucide-react';

/**
 * Onglets disponibles
 */
const getTabs = (isSuperAdmin) => {
    const baseTabs = [
        {
            id: 'members',
            label: 'Membres',
            icon: Users,
            description: 'Gérer les membres de l\'équipe'
        },
        {
            id: 'settings',
            label: 'Organisation',
            icon: Building2,
            description: 'Paramètres de l\'organisation'
        }
    ];

    // Ajouter les onglets SuperAdmin uniquement
    if (isSuperAdmin) {
        baseTabs.push({
            id: 'users',
            label: 'Utilisateurs',
            icon: UserCog,
            description: 'Voir tous les utilisateurs de la plateforme'
        });
        
        // Onglet Légifrance
        baseTabs.push({
            id: 'legifrance',
            label: 'Légifrance',
            icon: Scale,
            description: 'Gestion des codes juridiques'
        });
    }

    return baseTabs;
};

/**
 * Page Admin principale
 */
export default function Admin() {
    const navigate = useNavigate();
    const { user, profile, organization: authOrg, isOrgAdmin, isSuperAdmin, isImpersonating, realProfile } = useAuth();
    
    // État local
    const [activeTab, setActiveTab] = useState('members');
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [effectiveOrgId, setEffectiveOrgId] = useState(profile?.org_id || null);

    // Récupérer le rôle de l'utilisateur dans l'org
    // Utiliser le profil emprunté si en mode impersonation, sinon le profil réel
    const effectiveProfile = isImpersonating ? profile : realProfile;
    
    const getCurrentUserRole = () => {
        // Le super_admin garde toujours ses droits même en impersonation
        if (isSuperAdmin && !isImpersonating) return 'owner';
        if (effectiveProfile?.app_role === 'org_admin') return 'admin';
        // Récupérer depuis organization_members si nécessaire
        return 'member';
    };

    const currentUserRole = getCurrentUserRole();

    // Pour le super_admin sans org_id, récupérer la première organisation disponible
    // Utiliser le profil emprunté si en mode impersonation
    useEffect(() => {
        const targetProfile = isImpersonating ? profile : realProfile;
        
        if (isSuperAdmin && !targetProfile?.org_id && !effectiveOrgId && !isImpersonating) {
            supabase
                .from('organizations')
                .select('id')
                .limit(1)
                .single()
                .then(({ data, error }) => {
                    if (!error && data) {
                        setEffectiveOrgId(data.id);
                    }
                });
        } else if (targetProfile?.org_id) {
            setEffectiveOrgId(targetProfile.org_id);
        } else if (isImpersonating && !targetProfile?.org_id) {
            // En impersonation sans org, ne pas charger d'org
            setEffectiveOrgId(null);
        }
    }, [isSuperAdmin, isImpersonating, profile?.org_id, realProfile?.org_id, effectiveOrgId]);

    // Hook de gestion de l'organisation
    const {
        organization,
        members,
        loading,
        error,
        inviteMember,
        revokeMember,
        updateMemberRole,
        updateOrganizationName,
        resendInvitation,
        refresh
    } = useOrganization(effectiveOrgId);

    // Vérification des droits
    if (!isOrgAdmin && !isSuperAdmin) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                <div className="max-w-md bg-white rounded-2xl shadow-lg p-8 text-center">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Shield className="w-8 h-8 text-red-600" />
                    </div>
                    <h1 className="text-xl font-semibold text-slate-800 mb-2">
                        Accès refusé
                    </h1>
                    <p className="text-slate-600 mb-6">
                        Vous n'avez pas les permissions nécessaires pour accéder à cette page.
                        Seuls les administrateurs peuvent gérer l'organisation.
                    </p>
                    <button
                        onClick={() => navigate('/dashboard')}
                        className="btn-primary w-full"
                    >
                        Retour au Dashboard
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header */}
            <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => navigate('/dashboard')}
                                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                            <div>
                                <h1 className="text-lg font-semibold text-slate-800">
                                    Administration
                                </h1>
                                <p className="text-sm text-slate-500">
                                    {organization?.name || 'Chargement...'}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            {/* Profile Switcher pour les tests */}
                            {isSuperAdmin && <ProfileSwitcher />}
                            
                            {/* Indicateur d'impersonation */}
                            {isImpersonating && (
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-100 text-amber-800 rounded-full text-xs font-medium border border-amber-300">
                                    <Shield className="w-3.5 h-3.5" />
                                    Mode impersonation
                                </div>
                            )}
                            
                            {/* Badge rôle */}
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-full text-sm font-medium">
                                <Shield className="w-4 h-4" />
                                {currentUserRole === 'owner' ? 'Propriétaire' : 
                                 currentUserRole === 'admin' ? 'Administrateur' : 'Membre'}
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Navigation par onglets */}
            <div className="bg-white border-b border-slate-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <nav className="flex gap-1 -mb-px overflow-x-auto">
                        {getTabs(isSuperAdmin).map((tab) => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;

                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`
                                        flex items-center gap-2 px-4 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                                        ${isActive
                                            ? 'border-indigo-600 text-indigo-600'
                                            : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                                        }
                                    `}
                                >
                                    <Icon className="w-4 h-4" />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </nav>
                </div>
            </div>

            {/* Contenu principal */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Erreur globale */}
                {error && activeTab !== 'legifrance' && (
                    <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        <p>{error}</p>
                        <button
                            onClick={refresh}
                            className="ml-auto text-sm font-medium hover:underline"
                        >
                            Réessayer
                        </button>
                    </div>
                )}

                {/* Loader pour les onglets org-dépendants */}
                {loading && activeTab !== 'users' && activeTab !== 'legifrance' && (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                    </div>
                )}

                {/* Vue Membres */}
                {activeTab === 'members' && !loading && (
                    <MembersList
                        members={members}
                        loading={loading}
                        currentUserId={user?.id || ''}
                        currentUserRole={currentUserRole}
                        onInvite={() => setShowInviteModal(true)}
                        onRevoke={revokeMember}
                        onUpdateRole={updateMemberRole}
                        onResendInvitation={resendInvitation}
                    />
                )}

                {/* Vue Paramètres Organisation */}
                {activeTab === 'settings' && !loading && (
                    <OrganizationSettings
                        organization={organization}
                        loading={loading}
                        currentUserRole={currentUserRole}
                        onUpdateName={updateOrganizationName}
                    />
                )}

                {/* Vue Utilisateurs (uniquement pour super_admin) */}
                {activeTab === 'users' && isSuperAdmin && (
                    <UsersList />
                )}

                {/* Vue Légifrance (uniquement pour super_admin) */}
                {activeTab === 'legifrance' && isSuperAdmin && (
                    <LegifranceAdmin />
                )}
            </main>

            {/* Modal d'invitation */}
            <InviteMemberModal
                isOpen={showInviteModal}
                onClose={() => setShowInviteModal(false)}
                onInvite={inviteMember}
                currentUserRole={currentUserRole}
                organizationName={organization?.name || 'Mon Organisation'}
            />
        </div>
    );
}