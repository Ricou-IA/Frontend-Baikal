/**
 * Admin.jsx - Baikal Console
 * ============================================================================
 * Console d'administration principale.
 * 
 * Onglets :
 * - Dashboard (stats, vue d'ensemble) - tous les admins
 * - Connaissances → Contenu inline
 * - Prompts (config agents) - super_admin uniquement
 * - Indexation (concepts & catégories) - super_admin uniquement
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
    AdminDashboard,
    OrganizationSettings,
    ProfileSwitcher,
    IndexationSettings,
} from '../components/admin';
import Prompts from './Prompts';
import IngestionContent from './IngestionContent';
import {
    LayoutDashboard,
    BookOpen,
    MessageSquareCode,
    Database,
    Shield,
    AlertCircle,
    Loader2,
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
            id: 'knowledge',
            label: 'Connaissances',
            icon: BookOpen,
            description: 'Base documentaire RAG',
            badge: pendingCount > 0 ? pendingCount : null,
        },
    ];

    // Onglets super_admin uniquement
    if (isSuperAdmin) {
        tabs.push({
            id: 'prompts',
            label: 'Prompts',
            icon: MessageSquareCode,
            description: 'Configuration des prompts RAG'
        });
        tabs.push({
            id: 'indexation',
            label: 'Indexation',
            icon: Database,
            description: 'Concepts et catégories par application'
        });
    }

    return tabs;
};

// ============================================================================
// PAGE ADMIN PRINCIPALE
// ============================================================================

export default function Admin() {
    const navigate = useNavigate();
    const { user, profile, organization: authOrg, isOrgAdmin, isSuperAdmin, isImpersonating, realProfile, signOut } = useAuth();
    
    // État local
    const [activeTab, setActiveTab] = useState('dashboard');
    const [effectiveOrgId, setEffectiveOrgId] = useState(profile?.org_id || null);
    const [pendingCount, setPendingCount] = useState(0);

    // Récupérer le rôle de l'utilisateur dans l'org
    const effectiveProfile = isImpersonating ? profile : realProfile || profile;
    const currentUserRole = effectiveProfile?.org_role || 
                           (isSuperAdmin ? 'owner' : isOrgAdmin ? 'admin' : 'member');

    // Hook pour la gestion de l'organisation
    const {
        organization,
        loading,
        error,
        refresh,
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
     * Si l'onglet a une route, naviguer vers cette route
     * Sinon, changer l'onglet actif
     */
    const handleTabClick = (tab) => {
        if (tab.route) {
            navigate(tab.route);
        } else {
            setActiveTab(tab.id);
        }
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
                            <h1 className="text-lg font-mono font-bold text-white">
                                BAIKAL_CONSOLE
                            </h1>
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
                {loading && !['dashboard', 'prompts', 'indexation'].includes(activeTab) && (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 text-baikal-cyan animate-spin" />
                    </div>
                )}

                {/* Onglet Dashboard */}
                {activeTab === 'dashboard' && (
                    <AdminDashboard 
                        isSuperAdmin={isSuperAdmin}
                        isOrgAdmin={isOrgAdmin}
                        orgId={effectiveOrgId}
                        onNavigate={handleDashboardNavigate}
                    />
                )}

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

                {/* Onglet Indexation (super_admin uniquement) */}
                {activeTab === 'indexation' && isSuperAdmin && (
                    <IndexationSettings />
                )}
            </main>
        </div>
    );
}
