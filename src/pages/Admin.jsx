// ============================================================================
// BRIQUE 6 : Page Admin
// Interface d'administration de l'organisation
// Inclut : Gestion Documents RAG + Légifrance pour SuperAdmin
// ============================================================================

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useOrganization } from '../hooks/useOrganization';
import { documentsService } from '../services/documents.service';
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
// Import de la page Prompts
import Prompts from './Prompts';
import {
    ArrowLeft,
    Users,
    Building2,
    Settings,
    Shield,
    AlertCircle,
    Loader2,
    UserCog,
    Scale,
    Layers,
    Upload,
    CheckCircle2,
    Clock,
    FileText,
    ChevronRight,
    Sparkles,
    Eye,
    BookOpen,
    FolderOpen,
    User,
    TrendingUp,
    MessageSquareCode
} from 'lucide-react';

// ============================================================================
// CONFIGURATION DES ONGLETS
// ============================================================================

/**
 * Onglets disponibles
 */
const getTabs = (isSuperAdmin, isOrgAdmin, pendingCount = 0) => {
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

    // Onglet Documents pour tous les admins
    if (isOrgAdmin || isSuperAdmin) {
        baseTabs.push({
            id: 'documents',
            label: 'Documents',
            icon: Layers,
            description: 'Gestion de la base documentaire RAG',
            badge: pendingCount > 0 ? pendingCount : null
        });
    }

    // Ajouter les onglets SuperAdmin uniquement
    if (isSuperAdmin) {
        // Onglet Prompts RAG
        baseTabs.push({
            id: 'prompts',
            label: 'Prompts',
            icon: MessageSquareCode,
            description: 'Configuration des prompts RAG'
        });

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

// ============================================================================
// COMPOSANT DOCUMENTS ADMIN (Nouvel onglet)
// ============================================================================

function DocumentsAdmin({ orgId, onNavigate }) {
    const [stats, setStats] = useState({
        vertical: { total: 0, pending: 0, approved: 0 },
        org: { total: 0, pending: 0, approved: 0 },
        project: { total: 0, pending: 0, approved: 0 },
        user: { total: 0, pending: 0, approved: 0 },
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadStats() {
            if (!orgId) return;
            
            setLoading(true);
            try {
                const { data } = await documentsService.getLayerStats(orgId);
                if (data) {
                    setStats(data);
                }
            } catch (err) {
                console.error('Error loading document stats:', err);
            } finally {
                setLoading(false);
            }
        }

        loadStats();
    }, [orgId]);

    const totalDocuments = Object.values(stats).reduce((sum, s) => sum + s.total, 0);
    const totalPending = Object.values(stats).reduce((sum, s) => sum + s.pending, 0);
    const totalApproved = Object.values(stats).reduce((sum, s) => sum + s.approved, 0);

    const layers = [
        { key: 'vertical', label: 'Verticale Métier', icon: BookOpen, color: 'purple', description: 'Normes et DTU partagés' },
        { key: 'org', label: 'Organisation', icon: Building2, color: 'blue', description: 'Documents internes' },
        { key: 'project', label: 'Projet', icon: FolderOpen, color: 'green', description: 'Documents par chantier' },
        { key: 'user', label: 'Personnel', icon: User, color: 'amber', description: 'Documents privés' },
    ];

    const colorClasses = {
        purple: { bg: 'bg-purple-100', text: 'text-purple-600', badge: 'bg-purple-600' },
        blue: { bg: 'bg-blue-100', text: 'text-blue-600', badge: 'bg-blue-600' },
        green: { bg: 'bg-green-100', text: 'text-green-600', badge: 'bg-green-600' },
        amber: { bg: 'bg-amber-100', text: 'text-amber-600', badge: 'bg-amber-600' },
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Header avec actions rapides */}
            <div className="bg-gradient-to-r from-indigo-500 via-indigo-600 to-purple-600 rounded-2xl p-6 text-white shadow-xl">
                <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                        <div className="w-14 h-14 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center">
                            <Layers className="w-7 h-7" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold mb-1">Base documentaire RAG</h2>
                            <p className="text-indigo-100 text-sm">
                                Gérez les documents de votre organisation par couche
                            </p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => onNavigate('/admin/documents')}
                            className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors"
                        >
                            <Eye className="w-4 h-4" />
                            Voir tout
                        </button>
                        <button
                            onClick={() => onNavigate('/admin/documents/upload')}
                            className="flex items-center gap-2 px-4 py-2 bg-white text-indigo-600 rounded-lg text-sm font-medium hover:bg-indigo-50 transition-colors"
                        >
                            <Upload className="w-4 h-4" />
                            Ingérer
                        </button>
                    </div>
                </div>
            </div>

            {/* Statistiques globales */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    icon={FileText}
                    label="Documents totaux"
                    value={totalDocuments}
                    color="slate"
                />
                <StatCard
                    icon={CheckCircle2}
                    label="Approuvés"
                    value={totalApproved}
                    subValue={totalDocuments > 0 ? `${Math.round((totalApproved / totalDocuments) * 100)}%` : null}
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
                    value={Object.values(stats).filter(s => s.total > 0).length}
                    subValue="sur 4"
                    color="indigo"
                />
            </div>

            {/* Alerte validation si documents en attente */}
            {totalPending > 0 && (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                            <Clock className="w-5 h-5 text-yellow-600" />
                        </div>
                        <div>
                            <p className="font-medium text-yellow-800">
                                {totalPending} document{totalPending > 1 ? 's' : ''} en attente
                            </p>
                            <p className="text-sm text-yellow-600">
                                Des documents nécessitent votre validation
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => onNavigate('/admin/documents/validation')}
                        className="flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors font-medium"
                    >
                        Valider maintenant
                        <ChevronRight className="w-4 h-4" />
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
                                onClick={() => onNavigate(`/admin/documents?layer=${layer.key}`)}
                                className="flex items-center gap-4 p-4 bg-white rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all text-left group"
                            >
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colors.bg}`}>
                                    <Icon className={`w-6 h-6 ${colors.text}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="font-semibold text-slate-800">{layer.label}</p>
                                        {layerStats.total > 0 && (
                                            <span className={`px-2 py-0.5 text-xs font-bold text-white rounded-full ${colors.badge}`}>
                                                {layerStats.total}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-slate-500">{layer.description}</p>
                                    {layerStats.total > 0 && (
                                        <div className="flex items-center gap-3 mt-1 text-xs">
                                            <span className="text-green-600">{layerStats.approved} approuvés</span>
                                            {layerStats.pending > 0 && (
                                                <span className="text-yellow-600">{layerStats.pending} en attente</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-colors" />
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Actions rapides */}
            <div>
                <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wider mb-4">
                    Actions rapides
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <ActionCard
                        icon={Upload}
                        label="Ingestion Premium"
                        description="Upload de documents enrichis"
                        onClick={() => onNavigate('/admin/documents/upload')}
                        color="indigo"
                    />
                    <ActionCard
                        icon={Eye}
                        label="Explorer"
                        description="Visualiser par couche"
                        onClick={() => onNavigate('/admin/documents')}
                        color="blue"
                    />
                    <ActionCard
                        icon={CheckCircle2}
                        label="Validation"
                        description={totalPending > 0 ? `${totalPending} en attente` : 'Aucun en attente'}
                        onClick={() => onNavigate('/admin/documents/validation')}
                        color="green"
                        badge={totalPending > 0 ? totalPending : null}
                    />
                </div>
            </div>
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

function ActionCard({ icon: Icon, label, description, onClick, color = 'indigo', badge = null }) {
    const colorClasses = {
        indigo: 'bg-indigo-100 text-indigo-600 group-hover:bg-indigo-200',
        blue: 'bg-blue-100 text-blue-600 group-hover:bg-blue-200',
        green: 'bg-green-100 text-green-600 group-hover:bg-green-200',
    };

    return (
        <button
            onClick={onClick}
            className="relative flex items-center gap-4 p-4 bg-white rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all text-left group"
        >
            {badge && (
                <span className="absolute -top-2 -right-2 px-2 py-0.5 text-xs font-bold bg-red-500 text-white rounded-full">
                    {badge}
                </span>
            )}
            <div className={`p-3 rounded-xl transition-colors ${colorClasses[color]}`}>
                <Icon className="w-5 h-5" />
            </div>
            <div>
                <p className="font-semibold text-slate-800">{label}</p>
                <p className="text-sm text-slate-500">{description}</p>
            </div>
        </button>
    );
}

// ============================================================================
// PAGE ADMIN PRINCIPALE
// ============================================================================

export default function Admin() {
    const navigate = useNavigate();
    const { user, profile, organization: authOrg, isOrgAdmin, isSuperAdmin, isImpersonating, realProfile } = useAuth();
    
    // État local
    const [activeTab, setActiveTab] = useState('members');
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
                setPendingCount(count);
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

    // Navigation handler
    const handleNavigate = (path) => {
        navigate(path);
    };

    // ========================================================================
    // RENDER - Non autorisé
    // ========================================================================
    
    if (!isOrgAdmin && !isSuperAdmin) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl border border-slate-200 p-8 max-w-md text-center">
                    <Shield className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-slate-800 mb-2">
                        Accès restreint
                    </h2>
                    <p className="text-slate-600 mb-6">
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

    // ========================================================================
    // RENDER - Page principale
    // ========================================================================

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
                        {getTabs(isSuperAdmin, isOrgAdmin, pendingCount).map((tab) => {
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
                                    {/* Badge pour les documents en attente */}
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
                {error && activeTab !== 'legifrance' && activeTab !== 'documents' && (
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
                {loading && activeTab !== 'users' && activeTab !== 'legifrance' && activeTab !== 'documents' && (
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

                {/* Vue Documents RAG */}
                {activeTab === 'documents' && (
                    <DocumentsAdmin
                        orgId={effectiveOrgId}
                        onNavigate={handleNavigate}
                    />
                )}

                {/* Vue Prompts RAG (uniquement pour super_admin) */}
                {activeTab === 'prompts' && isSuperAdmin && (
                    <Prompts embedded={true} />
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
