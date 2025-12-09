/**
 * Admin.jsx - Baikal Console
 * ============================================================================
 * Console d'administration principale.
 * 
 * Onglets :
 * - Dashboard (stats, vue d'ensemble) - tous les admins
 * - Utilisateurs (gestion membres) - tous les admins (scope différent)
 * - Organisation (paramètres) - tous les admins
 * - Connaissances → Route vers /admin/ingestion
 * - Prompts (config agents) - super_admin uniquement
 * 
 * Accès :
 * - super_admin : tout voir, toutes les orgs, toutes les couches
 * - org_admin : sa propre org, couche org uniquement
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useOrganization } from '../hooks/useOrganization';
import { documentsService } from '../services/documents.service';
import {
    MembersList,
    InviteMemberModal,
    OrganizationSettings,
    ProfileSwitcher,
    UsersList
} from '../components/admin';
import Prompts from './Prompts';
import IngestionContent from './IngestionContent';
import {
    LayoutDashboard,
    Users,
    Building2,
    BookOpen,
    MessageSquareCode,
    Shield,
    AlertCircle,
    Loader2,
    FileText,
    CheckCircle2,
    Clock,
    TrendingUp,
    Upload,
    Eye,
    ChevronRight,
    LogOut,
    Settings,
} from 'lucide-react';

// ============================================================================
// CONFIGURATION DES ONGLETS
// ============================================================================

/**
 * Génère les onglets selon le rôle
 * @param {boolean} isSuperAdmin 
 * @param {number} pendingCount - Documents en attente
 */
const getTabs = (isSuperAdmin, pendingCount = 0) => {
    const tabs = [
        {
            id: 'dashboard',
            label: 'Dashboard',
            icon: LayoutDashboard,
            description: 'Vue d\'ensemble'
        },
        {
            id: 'users',
            label: 'Utilisateurs',
            icon: Users,
            description: 'Gérer les utilisateurs'
        },
        {
            id: 'organization',
            label: 'Organisation',
            icon: Building2,
            description: 'Paramètres organisation'
        },
        {
            id: 'knowledge',
            label: 'Connaissances',
            icon: BookOpen,
            description: 'Base documentaire RAG',
            badge: pendingCount > 0 ? pendingCount : null,
        },
    ];

    // Onglet Prompts uniquement pour super_admin
    if (isSuperAdmin) {
        tabs.push({
            id: 'prompts',
            label: 'Prompts',
            icon: MessageSquareCode,
            description: 'Configuration des prompts RAG'
        });
    }

    return tabs;
};

// ============================================================================
// COMPOSANT STATISTIQUES DASHBOARD
// ============================================================================

function StatCard({ label, value, icon: Icon, color = 'indigo', subValue = null, highlight = false }) {
    const colorClasses = {
        indigo: 'bg-baikal-cyan/20 text-baikal-cyan',
        green: 'bg-green-500/20 text-green-400',
        amber: 'bg-amber-500/20 text-amber-400',
        red: 'bg-red-500/20 text-red-400',
        blue: 'bg-blue-500/20 text-blue-400',
        violet: 'bg-violet-500/20 text-violet-400',
    };

    return (
        <div className={`
            bg-baikal-surface rounded-md p-5 border transition-all duration-200
            ${highlight ? 'border-amber-500/50' : 'border-baikal-border'}
        `}>
            <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-md ${colorClasses[color]}`}>
                    <Icon className="w-5 h-5" />
                </div>
                <div>
                    <p className="text-2xl font-bold font-mono text-white">{value}</p>
                    <p className="text-sm text-baikal-text font-sans">{label}</p>
                    {subValue && (
                        <p className="text-xs text-baikal-text font-mono">{subValue}</p>
                    )}
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// COMPOSANT DASHBOARD TAB
// ============================================================================

function DashboardTab({ orgId, isSuperAdmin, onNavigate }) {
    const [stats, setStats] = useState({
        documents: 0,
        pending: 0,
        approved: 0,
        users: 0
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadStats() {
            if (!orgId) {
                setLoading(false);
                return;
            }
            
            try {
                const { data } = await documentsService.getLayerStats(orgId);
                if (data) {
                    const totalDocs = Object.values(data).reduce((sum, s) => sum + (s.total || 0), 0);
                    const totalPending = Object.values(data).reduce((sum, s) => sum + (s.pending || 0), 0);
                    const totalApproved = Object.values(data).reduce((sum, s) => sum + (s.approved || 0), 0);
                    
                    setStats({
                        documents: totalDocs,
                        pending: totalPending,
                        approved: totalApproved,
                        users: 0 // TODO: charger depuis un autre service
                    });
                }
            } catch (err) {
                console.error('Error loading dashboard stats:', err);
            } finally {
                setLoading(false);
            }
        }
        loadStats();
    }, [orgId]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-baikal-cyan animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* En-tête */}
            <div>
                <h2 className="text-xl font-mono font-semibold text-white">TABLEAU_DE_BORD</h2>
                <p className="text-baikal-text text-sm mt-1 font-sans">Vue d'ensemble de votre organisation</p>
            </div>

            {/* Statistiques principales */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    label="Documents"
                    value={stats.documents}
                    icon={FileText}
                    color="indigo"
                />
                <StatCard
                    label="Approuvés"
                    value={stats.approved}
                    icon={CheckCircle2}
                    color="green"
                />
                <StatCard
                    label="En attente"
                    value={stats.pending}
                    icon={Clock}
                    color="amber"
                    highlight={stats.pending > 0}
                />
                <StatCard
                    label="Utilisateurs"
                    value={stats.users || '-'}
                    icon={Users}
                    color="blue"
                />
            </div>

            {/* Alerte documents en attente */}
            {stats.pending > 0 && (
                <div className="bg-amber-900/20 border border-amber-500/50 rounded-md p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-500/20 rounded-md">
                            <Clock className="w-5 h-5 text-amber-400" />
                        </div>
                        <div>
                            <p className="font-medium text-amber-300 font-mono">
                                {stats.pending} document{stats.pending > 1 ? 's' : ''} en attente
                            </p>
                            <p className="text-sm text-amber-400 font-sans">
                                Des documents nécessitent votre validation
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => onNavigate('/admin/validation')}
                        className="px-4 py-2 bg-amber-500 text-white rounded-md hover:bg-amber-600 transition-colors font-medium font-mono"
                    >
                        VALIDER
                    </button>
                </div>
            )}

            {/* Placeholder pour futur contenu */}
            <div className="bg-baikal-surface border-2 border-dashed border-baikal-border rounded-md p-12 text-center">
                <LayoutDashboard className="w-12 h-12 text-baikal-text mx-auto mb-4" />
                <h3 className="text-lg font-mono font-medium text-white mb-2">
                    DASHBOARD_EN_CONSTRUCTION
                </h3>
                <p className="text-baikal-text font-sans">
                    Cette section affichera bientôt des statistiques détaillées,
                    des graphiques et des indicateurs clés.
                </p>
            </div>
        </div>
    );
}

// ============================================================================
// PAGE ADMIN PRINCIPALE
// ============================================================================

export default function Admin() {
    const navigate = useNavigate();
    const { user, profile, organization: authOrg, isOrgAdmin, isSuperAdmin, isImpersonating, realProfile, signOut } = useAuth();
    
    // État local
    const [activeTab, setActiveTab] = useState('dashboard');
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [effectiveOrgId, setEffectiveOrgId] = useState(profile?.org_id || null);
    const [pendingCount, setPendingCount] = useState(0);

    // Récupérer le rôle de l'utilisateur dans l'org
    const effectiveProfile = isImpersonating ? profile : realProfile || profile;
    const currentUserRole = effectiveProfile?.org_role || 
                           (isSuperAdmin ? 'owner' : isOrgAdmin ? 'admin' : 'member');

    // Hook pour la gestion de l'organisation
    const {
        organization,
        members,
        loading,
        error,
        refresh,
        inviteMember,
        revokeMember,
        updateMemberRole,
        resendInvitation,
        updateOrganizationName
    } = useOrganization(effectiveOrgId);

    // Charger le compteur de documents en attente
    useEffect(() => {
        async function loadPendingCount() {
            if (!effectiveOrgId) return;
            
            try {
                const { count } = await documentsService.getPendingCount(effectiveOrgId);
                setPendingCount(count || 0);
            } catch (err) {
                console.error('Error loading pending count:', err);
            }
        }
        loadPendingCount();
    }, [effectiveOrgId]);

    // Mise à jour de l'org_id effectif
    useEffect(() => {
        if (profile?.org_id) {
            setEffectiveOrgId(profile.org_id);
        }
    }, [profile?.org_id]);

    /**
     * Handler pour les clics sur les onglets
     */
    const handleTabClick = (tab) => {
        setActiveTab(tab.id);
    };

    /**
     * Handler navigation depuis le dashboard
     */
    const handleDashboardNavigate = (route) => {
        navigate(route);
    };

    // Handler déconnexion
    const handleSignOut = async () => {
        await signOut();
        navigate('/login');
    };

    return (
        <div className="min-h-screen bg-baikal-bg">
            {/* Header */}
            <header className="bg-baikal-surface border-b border-baikal-border sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        {/* Logo */}
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-baikal-cyan rounded-md flex items-center justify-center">
                                <Shield className="w-5 h-5 text-black" />
                            </div>
                            <div>
                                <h1 className="text-lg font-mono font-bold text-white">
                                    ADMINISTRATION
                                </h1>
                                <p className="text-xs text-baikal-text font-mono">
                                    {organization?.name || 'CHARGEMENT...'}
                                </p>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-3">
                            {/* Switcher de profil (super_admin) */}
                            {isSuperAdmin && !isImpersonating && (
                                <ProfileSwitcher />
                            )}

                            {/* Badge impersonation */}
                            {isImpersonating && (
                                <div className="px-3 py-1.5 bg-amber-900/20 text-amber-300 border border-amber-500/50 rounded-md text-sm font-mono">
                                    👤 {profile?.full_name || profile?.email}
                                </div>
                            )}

                            {/* Badge rôle */}
                            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-baikal-cyan/20 text-baikal-cyan border border-baikal-cyan rounded-md text-sm font-mono">
                                <Shield className="w-4 h-4" />
                                {isSuperAdmin ? 'SUPER_ADMIN' : 'ADMIN'}
                            </div>

                            {/* Bouton paramètres */}
                            <button
                                onClick={() => navigate('/settings')}
                                className="p-2 text-baikal-text hover:text-baikal-cyan hover:bg-baikal-bg rounded-md transition-colors"
                            >
                                <Settings className="w-5 h-5" />
                            </button>

                            {/* Bouton déconnexion */}
                            <button
                                onClick={handleSignOut}
                                className="p-2 text-baikal-text hover:text-red-400 hover:bg-red-900/20 rounded-md transition-colors"
                            >
                                <LogOut className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Navigation par onglets */}
            <div className="bg-baikal-surface border-b border-baikal-border">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <nav className="flex gap-1 -mb-px overflow-x-auto">
                        {getTabs(isSuperAdmin, pendingCount).map((tab) => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;

                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => handleTabClick(tab)}
                                    className={`
                                        relative flex items-center gap-2 px-4 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                                        ${isActive
                                            ? 'border-baikal-cyan text-baikal-cyan'
                                            : 'border-transparent text-baikal-text hover:text-white hover:border-baikal-border'
                                        }
                                    `}
                                >
                                    <Icon className="w-4 h-4" />
                                    {tab.label}
                                    {tab.badge && (
                                        <span className="ml-1.5 px-1.5 py-0.5 text-xs font-bold bg-red-500 text-white rounded-md font-mono">
                                            {tab.badge}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </nav>
                </div>
            </div>

            {/* Contenu principal */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Erreur globale */}
                {error && (
                    <div className="mb-6 p-4 bg-red-900/20 border border-red-500/50 rounded-md flex items-center gap-3 text-red-300">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        <p className="font-mono">{error}</p>
                        <button
                            onClick={refresh}
                            className="ml-auto text-sm font-medium hover:underline font-mono"
                        >
                            RÉESSAYER
                        </button>
                    </div>
                )}

                {/* Loader */}
                {loading && !['dashboard', 'prompts'].includes(activeTab) && (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 text-baikal-cyan animate-spin" />
                    </div>
                )}

                {/* Onglet Dashboard */}
                {activeTab === 'dashboard' && (
                    <DashboardTab 
                        orgId={effectiveOrgId} 
                        isSuperAdmin={isSuperAdmin}
                        onNavigate={handleDashboardNavigate}
                    />
                )}

                {/* Onglet Utilisateurs */}
                {activeTab === 'users' && !loading && (
                    isSuperAdmin ? (
                        <UsersList />
                    ) : (
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
                    )
                )}

                {/* Onglet Organisation */}
                {activeTab === 'organization' && !loading && (
                    <OrganizationSettings
                        organization={organization}
                        loading={loading}
                        currentUserRole={currentUserRole}
                        onUpdateName={updateOrganizationName}
                    />
                )}

                {/* Note: L'onglet "knowledge" n'est plus rendu ici car il route vers /admin/ingestion */}

                {/* Onglet Connaissances */}
                {activeTab === 'knowledge' && (
                    <IngestionContent 
                        orgId={effectiveOrgId}
                        isSuperAdmin={isSuperAdmin}
                    />
                )}

                {/* Onglet Prompts (super_admin uniquement) */}
                {activeTab === 'prompts' && isSuperAdmin && (
                    <Prompts embedded={true} />
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
