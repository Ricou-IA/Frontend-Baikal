/**
 * Admin.jsx - Baikal Console
 * ============================================================================
 * Console d'administration principale.
 * 
 * Onglets :
 * - Dashboard (stats, vue d'ensemble) - tous les admins
 * - Utilisateurs (gestion membres) - tous les admins (scope différent)
 * - Organisation (paramètres) - tous les admins
 * - Connaissances (base RAG + Légifrance) - tous les admins (scope différent)
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
import LegifranceAdmin from '../components/admin/LegifranceAdmin';
import Prompts from './Prompts';
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
    Layers,
    FolderOpen,
    User,
    Scale,
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
            badge: pendingCount > 0 ? pendingCount : null
        },
    ];

    // Onglet Prompts - super_admin uniquement
    if (isSuperAdmin) {
        tabs.push({
            id: 'prompts',
            label: 'Prompts',
            icon: MessageSquareCode,
            description: 'Configuration des agents RAG'
        });
    }

    return tabs;
};

// ============================================================================
// COMPOSANT DASHBOARD (placeholder pour l'instant)
// ============================================================================

function DashboardTab({ orgId, isSuperAdmin, onNavigate }) {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadStats() {
            if (!orgId) {
                setLoading(false);
                return;
            }
            
            setLoading(true);
            try {
                const { data } = await documentsService.getLayerStats(orgId);
                setStats(data);
            } catch (err) {
                console.error('Error loading stats:', err);
            } finally {
                setLoading(false);
            }
        }
        loadStats();
    }, [orgId]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
        );
    }

    const totalDocuments = stats ? Object.values(stats).reduce((sum, s) => sum + s.total, 0) : 0;
    const totalPending = stats ? Object.values(stats).reduce((sum, s) => sum + s.pending, 0) : 0;
    const totalApproved = stats ? Object.values(stats).reduce((sum, s) => sum + s.approved, 0) : 0;

    return (
        <div className="space-y-6">
            {/* Message de bienvenue */}
            <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-6 text-white">
                <h2 className="text-2xl font-bold mb-2">
                    Bienvenue sur Baikal Console
                </h2>
                <p className="text-indigo-100">
                    {isSuperAdmin 
                        ? 'Console d\'administration globale - Accès super admin'
                        : 'Gérez votre organisation et sa base de connaissances'
                    }
                </p>
            </div>

            {/* Stats rapides */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    icon={FileText}
                    label="Documents"
                    value={totalDocuments}
                    color="slate"
                />
                <StatCard
                    icon={CheckCircle2}
                    label="Approuvés"
                    value={totalApproved}
                    color="green"
                />
                <StatCard
                    icon={Clock}
                    label="En attente"
                    value={totalPending}
                    color="amber"
                    highlight={totalPending > 0}
                />
                <StatCard
                    icon={TrendingUp}
                    label="Couches actives"
                    value={stats ? Object.values(stats).filter(s => s.total > 0).length : 0}
                    subValue="sur 4"
                    color="indigo"
                />
            </div>

            {/* Alerte si documents en attente */}
            {totalPending > 0 && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Clock className="w-6 h-6 text-amber-600" />
                        <div>
                            <p className="font-medium text-amber-800">
                                {totalPending} document{totalPending > 1 ? 's' : ''} en attente
                            </p>
                            <p className="text-sm text-amber-600">
                                Des documents nécessitent votre validation
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => onNavigate('knowledge')}
                        className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors font-medium"
                    >
                        Voir
                    </button>
                </div>
            )}

            {/* Placeholder pour futur contenu */}
            <div className="bg-slate-100 border-2 border-dashed border-slate-300 rounded-xl p-12 text-center">
                <LayoutDashboard className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-600 mb-2">
                    Dashboard en construction
                </h3>
                <p className="text-slate-500">
                    Cette section affichera bientôt des statistiques détaillées,
                    des graphiques et des indicateurs clés.
                </p>
            </div>
        </div>
    );
}

// ============================================================================
// COMPOSANT CONNAISSANCES (Base RAG + Légifrance intégré)
// ============================================================================

function KnowledgeTab({ orgId, isSuperAdmin, isOrgAdmin }) {
    const [stats, setStats] = useState({
        vertical: { total: 0, pending: 0, approved: 0 },
        org: { total: 0, pending: 0, approved: 0 },
        project: { total: 0, pending: 0, approved: 0 },
        user: { total: 0, pending: 0, approved: 0 },
    });
    const [loading, setLoading] = useState(true);
    const [activeView, setActiveView] = useState('overview'); // 'overview' | 'legifrance'
    const navigate = useNavigate();

    useEffect(() => {
        async function loadStats() {
            if (!orgId) return;
            
            setLoading(true);
            try {
                const { data } = await documentsService.getLayerStats(orgId);
                if (data) setStats(data);
            } catch (err) {
                console.error('Error loading stats:', err);
            } finally {
                setLoading(false);
            }
        }
        loadStats();
    }, [orgId]);

    const totalDocuments = Object.values(stats).reduce((sum, s) => sum + s.total, 0);
    const totalPending = Object.values(stats).reduce((sum, s) => sum + s.pending, 0);
    const totalApproved = Object.values(stats).reduce((sum, s) => sum + s.approved, 0);

    // Couches visibles selon le rôle
    const visibleLayers = isSuperAdmin 
        ? ['vertical', 'org', 'project', 'user']
        : ['org']; // org_admin ne voit que sa couche org

    const layers = [
        { key: 'vertical', label: 'Verticale Métier', icon: Scale, color: 'purple', description: 'Normes, DTU, Légifrance' },
        { key: 'org', label: 'Organisation', icon: Building2, color: 'blue', description: 'Documents internes' },
        { key: 'project', label: 'Projet', icon: FolderOpen, color: 'green', description: 'Documents par projet' },
        { key: 'user', label: 'Personnel', icon: User, color: 'slate', description: 'Documents privés' },
    ].filter(l => visibleLayers.includes(l.key));

    const colorClasses = {
        purple: { bg: 'bg-purple-100', text: 'text-purple-600', border: 'border-purple-200' },
        blue: { bg: 'bg-blue-100', text: 'text-blue-600', border: 'border-blue-200' },
        green: { bg: 'bg-green-100', text: 'text-green-600', border: 'border-green-200' },
        slate: { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200' },
    };

    // Vue Légifrance (super_admin uniquement, couche vertical)
    if (activeView === 'legifrance' && isSuperAdmin) {
        return (
            <div className="space-y-4">
                <button
                    onClick={() => setActiveView('overview')}
                    className="flex items-center gap-2 text-slate-600 hover:text-slate-800"
                >
                    <ChevronRight className="w-4 h-4 rotate-180" />
                    Retour à la vue d'ensemble
                </button>
                <LegifranceAdmin />
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-500 via-indigo-600 to-purple-600 rounded-2xl p-6 text-white">
                <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                        <div className="w-14 h-14 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center">
                            <BookOpen className="w-7 h-7" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold mb-1">Base de connaissances</h2>
                            <p className="text-indigo-100 text-sm">
                                {isSuperAdmin 
                                    ? 'Toutes les couches documentaires'
                                    : 'Documents de votre organisation'
                                }
                            </p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigate('/admin/ingestion')}
                            className="flex items-center gap-2 px-4 py-2 bg-white text-indigo-600 rounded-lg text-sm font-medium hover:bg-indigo-50 transition-colors"
                        >
                            <Upload className="w-4 h-4" />
                            Ingérer
                        </button>
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard icon={FileText} label="Documents" value={totalDocuments} color="slate" />
                <StatCard icon={CheckCircle2} label="Approuvés" value={totalApproved} color="green" />
                <StatCard 
                    icon={Clock} 
                    label="En attente" 
                    value={totalPending} 
                    color="amber" 
                    highlight={totalPending > 0} 
                />
                <StatCard 
                    icon={Layers} 
                    label="Couches" 
                    value={visibleLayers.length} 
                    color="indigo" 
                />
            </div>

            {/* Alerte validation */}
            {totalPending > 0 && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Clock className="w-6 h-6 text-amber-600" />
                        <div>
                            <p className="font-medium text-amber-800">
                                {totalPending} document{totalPending > 1 ? 's' : ''} en attente
                            </p>
                            <p className="text-sm text-amber-600">
                                Documents nécessitant validation
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => navigate('/admin/validation')}
                        className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors font-medium"
                    >
                        Valider
                    </button>
                </div>
            )}

            {/* Couches documentaires */}
            <div>
                <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wider mb-4">
                    Couches documentaires
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {layers.map((layer) => {
                        const Icon = layer.icon;
                        const colors = colorClasses[layer.color];
                        const layerStats = stats[layer.key];

                        return (
                            <button
                                key={layer.key}
                                onClick={() => navigate(`/admin/documents?layer=${layer.key}`)}
                                className="flex items-center gap-4 p-4 bg-white rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all text-left group"
                            >
                                <div className={`p-3 rounded-xl ${colors.bg}`}>
                                    <Icon className={`w-6 h-6 ${colors.text}`} />
                                </div>
                                <div className="flex-1">
                                    <p className="font-semibold text-slate-800">{layer.label}</p>
                                    <p className="text-sm text-slate-500">{layer.description}</p>
                                    {layerStats && layerStats.total > 0 && (
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-xs text-slate-400">
                                                {layerStats.total} doc{layerStats.total > 1 ? 's' : ''}
                                            </span>
                                            {layerStats.pending > 0 && (
                                                <span className="text-xs text-amber-600">
                                                    • {layerStats.pending} en attente
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-600" />
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Accès Légifrance - super_admin uniquement, couche vertical */}
            {isSuperAdmin && (
                <div>
                    <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wider mb-4">
                        Sources externes
                    </h3>
                    <button
                        onClick={() => setActiveView('legifrance')}
                        className="flex items-center gap-4 p-4 bg-white rounded-xl border border-emerald-200 hover:border-emerald-300 hover:shadow-sm transition-all text-left group w-full"
                    >
                        <div className="p-3 rounded-xl bg-emerald-100">
                            <Scale className="w-6 h-6 text-emerald-600" />
                        </div>
                        <div className="flex-1">
                            <p className="font-semibold text-slate-800">Légifrance</p>
                            <p className="text-sm text-slate-500">
                                Importer des codes juridiques vers la couche Verticale Métier
                            </p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-600" />
                    </button>
                </div>
            )}
        </div>
    );
}

// ============================================================================
// COMPOSANTS UTILITAIRES
// ============================================================================

function StatCard({ icon: Icon, label, value, subValue, color = 'slate', highlight = false }) {
    const colorClasses = {
        slate: 'bg-slate-100 text-slate-600',
        green: 'bg-green-100 text-green-600',
        amber: 'bg-amber-100 text-amber-600',
        indigo: 'bg-indigo-100 text-indigo-600',
    };

    return (
        <div className={`
            bg-white rounded-xl border p-4 transition-all
            ${highlight ? 'border-amber-300 shadow-sm' : 'border-slate-200'}
        `}>
            <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${colorClasses[color]}`}>
                    <Icon className="w-5 h-5" />
                </div>
                <div>
                    <p className="text-2xl font-bold text-slate-800">{value}</p>
                    <p className="text-sm text-slate-500">{label}</p>
                    {subValue && (
                        <p className="text-xs text-slate-400">{subValue}</p>
                    )}
                </div>
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

    // Handler navigation onglet
    const handleTabNavigate = (tabId) => {
        setActiveTab(tabId);
    };

    // Handler déconnexion
    const handleSignOut = async () => {
        await signOut();
        navigate('/login');
    };

    // ========================================================================
    // RENDER
    // ========================================================================

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header */}
            <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
                                <Layers className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h1 className="text-lg font-semibold text-slate-800">
                                    Baikal Console
                                </h1>
                                <p className="text-sm text-slate-500">
                                    {organization?.name || 'Administration'}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            {/* Profile Switcher pour super_admin */}
                            {isSuperAdmin && <ProfileSwitcher />}
                            
                            {/* Indicateur d'impersonation */}
                            {isImpersonating && (
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-100 text-amber-800 rounded-full text-xs font-medium border border-amber-300">
                                    <Shield className="w-3.5 h-3.5" />
                                    Mode impersonation
                                </div>
                            )}
                            
                            {/* Badge rôle */}
                            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-full text-sm font-medium">
                                <Shield className="w-4 h-4" />
                                {isSuperAdmin ? 'Super Admin' : 'Admin'}
                            </div>

                            {/* Bouton paramètres */}
                            <button
                                onClick={() => navigate('/settings')}
                                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                                <Settings className="w-5 h-5" />
                            </button>

                            {/* Bouton déconnexion */}
                            <button
                                onClick={handleSignOut}
                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                                <LogOut className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Navigation par onglets */}
            <div className="bg-white border-b border-slate-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <nav className="flex gap-1 -mb-px overflow-x-auto">
                        {getTabs(isSuperAdmin, pendingCount).map((tab) => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;

                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`
                                        relative flex items-center gap-2 px-4 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                                        ${isActive
                                            ? 'border-indigo-600 text-indigo-600'
                                            : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                                        }
                                    `}
                                >
                                    <Icon className="w-4 h-4" />
                                    {tab.label}
                                    {tab.badge && (
                                        <span className="ml-1.5 px-1.5 py-0.5 text-xs font-bold bg-red-500 text-white rounded-full">
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
                {error && activeTab !== 'knowledge' && (
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

                {/* Loader */}
                {loading && !['dashboard', 'knowledge', 'prompts'].includes(activeTab) && (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                    </div>
                )}

                {/* Onglet Dashboard */}
                {activeTab === 'dashboard' && (
                    <DashboardTab 
                        orgId={effectiveOrgId} 
                        isSuperAdmin={isSuperAdmin}
                        onNavigate={handleTabNavigate}
                    />
                )}

                {/* Onglet Utilisateurs */}
                {activeTab === 'users' && !loading && (
                    isSuperAdmin ? (
                        // Super admin voit tous les utilisateurs
                        <UsersList />
                    ) : (
                        // Org admin voit les membres de son org
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

                {/* Onglet Connaissances */}
                {activeTab === 'knowledge' && (
                    <KnowledgeTab
                        orgId={effectiveOrgId}
                        isSuperAdmin={isSuperAdmin}
                        isOrgAdmin={isOrgAdmin}
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
