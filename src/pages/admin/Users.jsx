/**
 * Users.jsx - Baikal Console
 * ============================================================================
 * Page de gestion des utilisateurs (refonte complète).
 *
 * Vues selon le rôle :
 * - super_admin : 2 onglets (En attente / Tous les utilisateurs)
 * - org_admin : Liste des membres de son organisation
 *
 * Fonctionnalités :
 * - Créer un utilisateur (super_admin)
 * - Assigner un utilisateur à une organisation (super_admin)
 * - Modifier le rôle d'un utilisateur
 * - Renvoyer un email de réinitialisation de mot de passe
 * - Retirer un utilisateur de son organisation
 * - Recherche et filtres
 *
 * REFACTORING 04/01/2026:
 * - Migration vers architecture Option B (features/)
 * - Composants extraits vers @features/users/components
 * - Utilitaires centralisés dans @shared/utils
 *
 * Route : /admin/users
 * Accès : super_admin / org_admin
 * ============================================================================
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@contexts/AuthContext';
import { usersService, organizationService } from '@services';
import { supabase } from '@lib/supabaseClient';
import {
    Users,
    UserPlus,
    Search,
    AlertCircle,
    Loader2,
    Check,
    ChevronLeft,
    Clock,
    Plus,
} from 'lucide-react';

// ============================================================================
// IMPORTS DEPUIS @features/users (architecture Option B)
// ============================================================================

import { APP_ROLES } from '@features/users/config';
import {
    UserRow,
    PendingUserRow,
    CreateUserModal,
    AssignOrgModal,
    EditRoleModal,
    RemoveUserModal,
} from '@features/users/components';

// ============================================================================
// PAGE PRINCIPALE
// ============================================================================

export default function UsersPage() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { isSuperAdmin, isOrgAdmin, profile } = useAuth();

    // Onglet actif (super_admin uniquement)
    const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'pending');

    // États - Pending users
    const [pendingUsers, setPendingUsers] = useState([]);
    const [loadingPending, setLoadingPending] = useState(true);

    // États - All users
    const [users, setUsers] = useState([]);
    const [loadingUsers, setLoadingUsers] = useState(true);

    // États - Organisations (pour filtres et assignation)
    const [organizations, setOrganizations] = useState([]);

    // Filtres
    const [search, setSearch] = useState('');
    const [orgFilter, setOrgFilter] = useState('');

    // Erreurs
    const [error, setError] = useState(null);

    // Feedback
    const [feedback, setFeedback] = useState(null);

    // Modals
    const [creatingUser, setCreatingUser] = useState(false);
    const [assigningUser, setAssigningUser] = useState(null);
    const [editingUser, setEditingUser] = useState(null);
    const [removingUser, setRemovingUser] = useState(null);

    // Charger les organisations
    useEffect(() => {
        async function loadOrganizations() {
            if (!isSuperAdmin) return;

            try {
                const result = await organizationService.getOrganizations({ include_inactive: false });
                if (result.data?.organizations) {
                    setOrganizations(result.data.organizations);
                } else if (Array.isArray(result.data)) {
                    setOrganizations(result.data);
                }
            } catch (err) {
                console.error('[Users] Error loading organizations:', err);
            }
        }
        loadOrganizations();
    }, [isSuperAdmin]);

    // Charger les utilisateurs en attente
    const loadPendingUsers = useCallback(async () => {
        if (!isSuperAdmin) return;

        setLoadingPending(true);
        try {
            const result = await usersService.getPendingUsers();

            if (result.error) {
                throw new Error(result.error.message || result.error);
            }

            setPendingUsers(result.data?.users || result.data || []);
        } catch (err) {
            console.error('[Users] Error loading pending:', err);
            setError(err.message);
        } finally {
            setLoadingPending(false);
        }
    }, [isSuperAdmin]);

    // Charger tous les utilisateurs
    const loadUsers = useCallback(async () => {
        setLoadingUsers(true);
        try {
            const params = {
                orgId: isSuperAdmin ? (orgFilter || null) : profile?.org_id,
                search: search.trim() || null,
            };

            const result = await usersService.getUsersForAdmin(params);

            if (result.error) {
                throw new Error(result.error.message || result.error);
            }

            setUsers(result.data?.users || result.data || []);
        } catch (err) {
            console.error('[Users] Error loading users:', err);
            setError(err.message);
        } finally {
            setLoadingUsers(false);
        }
    }, [isSuperAdmin, orgFilter, search, profile?.org_id]);

    // Charger les données initiales
    useEffect(() => {
        if (isSuperAdmin) {
            loadPendingUsers();
        }
        loadUsers();
    }, [isSuperAdmin, loadPendingUsers, loadUsers]);

    // Auto-hide feedback
    useEffect(() => {
        if (feedback) {
            const timer = setTimeout(() => setFeedback(null), 4000);
            return () => clearTimeout(timer);
        }
    }, [feedback]);

    // Handlers
    const handleAssign = (user) => {
        setAssigningUser(user);
    };

    const handleEditRole = (user) => {
        setEditingUser(user);
    };

    const handleRemove = (user) => {
        setRemovingUser(user);
    };

    const handleResetPassword = async (user) => {
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
                redirectTo: `${window.location.origin}/reset-password`,
            });

            if (error) {
                throw new Error(error.message);
            }

            setFeedback({
                type: 'success',
                message: `Email de réinitialisation envoyé à ${user.email}`,
            });
        } catch (err) {
            console.error('[handleResetPassword] Error:', err);
            setFeedback({
                type: 'error',
                message: err.message || 'Erreur lors de l\'envoi de l\'email',
            });
        }
    };

    const handleUserCreated = () => {
        loadUsers();
        loadPendingUsers();
        setFeedback({
            type: 'success',
            message: 'Utilisateur créé avec succès',
        });
    };

    const handleAssigned = () => {
        loadPendingUsers();
        loadUsers();
    };

    const handleRoleSaved = () => {
        loadUsers();
    };

    const handleRemoved = () => {
        loadUsers();
    };

    // Déterminer les rôles éditables selon le contexte
    const getAllowedRoles = () => {
        if (isSuperAdmin) {
            return APP_ROLES; // super_admin peut tout
        }
        // org_admin ne peut pas promouvoir au-dessus de team_leader
        return APP_ROLES.filter(r => r.level >= 3);
    };

    // =========================================================================
    // RENDER - Vue org_admin (membres de son org uniquement)
    // =========================================================================

    if (!isSuperAdmin && isOrgAdmin) {
        return (
            <div className="min-h-screen bg-baikal-bg">
                {/* Header */}
                <header className="bg-baikal-surface border-b border-baikal-border sticky top-0 z-30">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="flex items-center justify-between h-16">
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => navigate('/admin')}
                                    className="p-2 text-baikal-text hover:text-white hover:bg-baikal-bg rounded-md transition-colors"
                                >
                                    <ChevronLeft className="w-5 h-5" />
                                </button>
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-baikal-cyan/20 rounded-md">
                                        <Users className="w-5 h-5 text-baikal-cyan" />
                                    </div>
                                    <div>
                                        <h1 className="text-lg font-mono font-bold text-white">
                                            UTILISATEURS
                                        </h1>
                                        <p className="text-xs text-baikal-text font-mono">
                                            Membres de votre organisation
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Contenu */}
                <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    {/* Feedback */}
                    {feedback && (
                        <div className={`mb-6 p-4 rounded-md flex items-center gap-3 ${
                            feedback.type === 'success'
                                ? 'bg-green-900/20 border border-green-500/50 text-green-300'
                                : 'bg-red-900/20 border border-red-500/50 text-red-300'
                        }`}>
                            {feedback.type === 'success' ? (
                                <Check className="w-5 h-5 flex-shrink-0" />
                            ) : (
                                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                            )}
                            <p className="font-mono">{feedback.message}</p>
                        </div>
                    )}

                    {/* Recherche */}
                    <div className="mb-6">
                        <div className="relative max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-baikal-text" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Rechercher un membre..."
                                className="w-full pl-10 pr-4 py-2.5 bg-baikal-surface border border-baikal-border rounded-md text-white placeholder-baikal-text/50 focus:outline-none focus:border-baikal-cyan transition-colors"
                            />
                        </div>
                    </div>

                    {/* Erreur */}
                    {error && (
                        <div className="mb-6 p-4 bg-red-900/20 border border-red-500/50 rounded-md flex items-center gap-3 text-red-300">
                            <AlertCircle className="w-5 h-5 flex-shrink-0" />
                            <p className="font-mono">{error}</p>
                        </div>
                    )}

                    {/* Loading */}
                    {loadingUsers && (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-8 h-8 text-baikal-cyan animate-spin" />
                        </div>
                    )}

                    {/* Liste */}
                    {!loadingUsers && users.length > 0 && (
                        <div className="bg-baikal-surface border border-baikal-border rounded-md overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="bg-baikal-bg/50 border-b border-baikal-border">
                                            <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-baikal-text uppercase">Utilisateur</th>
                                            <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-baikal-text uppercase">Rôle App</th>
                                            <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-baikal-text uppercase">Inscrit le</th>
                                            <th className="px-4 py-3 text-right text-xs font-mono font-semibold text-baikal-text uppercase">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {users.map((user) => (
                                            <UserRow
                                                key={user.id}
                                                user={user}
                                                showOrg={false}
                                                onEditRole={handleEditRole}
                                                onResetPassword={handleResetPassword}
                                                onRemove={handleRemove}
                                                canEdit={user.app_role !== 'org_admin' && user.app_role !== 'super_admin'}
                                            />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="px-4 py-3 bg-baikal-bg/30 border-t border-baikal-border text-sm text-baikal-text font-mono">
                                {users.length} membre{users.length > 1 ? 's' : ''}
                            </div>
                        </div>
                    )}

                    {/* Liste vide */}
                    {!loadingUsers && users.length === 0 && (
                        <div className="bg-baikal-surface border border-baikal-border rounded-md p-12 text-center">
                            <Users className="w-12 h-12 text-baikal-text mx-auto mb-4" />
                            <h3 className="text-lg font-mono font-medium text-white mb-2">
                                AUCUN_MEMBRE
                            </h3>
                            <p className="text-baikal-text">
                                {search ? 'Aucun membre ne correspond à votre recherche.' : 'Votre organisation n\'a pas encore de membres.'}
                            </p>
                        </div>
                    )}
                </main>

                {/* Modals */}
                <EditRoleModal
                    isOpen={!!editingUser}
                    onClose={() => setEditingUser(null)}
                    user={editingUser}
                    onSave={handleRoleSaved}
                    allowedRoles={getAllowedRoles()}
                />

                <RemoveUserModal
                    isOpen={!!removingUser}
                    onClose={() => setRemovingUser(null)}
                    user={removingUser}
                    onConfirm={handleRemoved}
                />
            </div>
        );
    }

    // =========================================================================
    // RENDER - Vue super_admin (avec onglets)
    // =========================================================================

    return (
        <div className="min-h-screen bg-baikal-bg">
            {/* Header */}
            <header className="bg-baikal-surface border-b border-baikal-border sticky top-0 z-30">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => navigate('/admin')}
                                className="p-2 text-baikal-text hover:text-white hover:bg-baikal-bg rounded-md transition-colors"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-baikal-cyan/20 rounded-md">
                                    <Users className="w-5 h-5 text-baikal-cyan" />
                                </div>
                                <div>
                                    <h1 className="text-lg font-mono font-bold text-white">
                                        UTILISATEURS
                                    </h1>
                                    <p className="text-xs text-baikal-text font-mono">
                                        Gestion des utilisateurs
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Bouton Créer */}
                        <button
                            onClick={() => setCreatingUser(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-baikal-cyan text-black font-medium rounded-md hover:bg-baikal-cyan/90 transition-colors font-mono"
                        >
                            <Plus className="w-4 h-4" />
                            NOUVEL_USER
                        </button>
                    </div>
                </div>
            </header>

            {/* Tabs */}
            <div className="bg-baikal-surface border-b border-baikal-border">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <nav className="flex gap-1 -mb-px">
                        <button
                            onClick={() => setActiveTab('pending')}
                            className={`
                                relative flex items-center gap-2 px-4 py-4 text-sm font-medium border-b-2 transition-colors
                                ${activeTab === 'pending'
                                    ? 'border-baikal-cyan text-baikal-cyan'
                                    : 'border-transparent text-baikal-text hover:text-white hover:border-baikal-border'
                                }
                            `}
                        >
                            <Clock className="w-4 h-4" />
                            En attente
                            {pendingUsers.length > 0 && (
                                <span className="ml-1.5 px-1.5 py-0.5 text-xs font-bold bg-amber-500 text-white rounded font-mono">
                                    {pendingUsers.length}
                                </span>
                            )}
                        </button>
                        <button
                            onClick={() => setActiveTab('all')}
                            className={`
                                relative flex items-center gap-2 px-4 py-4 text-sm font-medium border-b-2 transition-colors
                                ${activeTab === 'all'
                                    ? 'border-baikal-cyan text-baikal-cyan'
                                    : 'border-transparent text-baikal-text hover:text-white hover:border-baikal-border'
                                }
                            `}
                        >
                            <Users className="w-4 h-4" />
                            Tous les utilisateurs
                        </button>
                    </nav>
                </div>
            </div>

            {/* Contenu */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Feedback */}
                {feedback && (
                    <div className={`mb-6 p-4 rounded-md flex items-center gap-3 ${
                        feedback.type === 'success'
                            ? 'bg-green-900/20 border border-green-500/50 text-green-300'
                            : 'bg-red-900/20 border border-red-500/50 text-red-300'
                    }`}>
                        {feedback.type === 'success' ? (
                            <Check className="w-5 h-5 flex-shrink-0" />
                        ) : (
                            <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        )}
                        <p className="font-mono">{feedback.message}</p>
                    </div>
                )}

                {/* Erreur */}
                {error && (
                    <div className="mb-6 p-4 bg-red-900/20 border border-red-500/50 rounded-md flex items-center gap-3 text-red-300">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        <p className="font-mono">{error}</p>
                    </div>
                )}

                {/* =============== ONGLET EN ATTENTE =============== */}
                {activeTab === 'pending' && (
                    <>
                        {loadingPending && (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="w-8 h-8 text-baikal-cyan animate-spin" />
                            </div>
                        )}

                        {!loadingPending && pendingUsers.length === 0 && (
                            <div className="bg-baikal-surface border border-baikal-border rounded-md p-12 text-center">
                                <UserPlus className="w-12 h-12 text-baikal-text mx-auto mb-4" />
                                <h3 className="text-lg font-mono font-medium text-white mb-2">
                                    AUCUN_UTILISATEUR_EN_ATTENTE
                                </h3>
                                <p className="text-baikal-text">
                                    Tous les utilisateurs sont assignés à une organisation.
                                </p>
                            </div>
                        )}

                        {!loadingPending && pendingUsers.length > 0 && (
                            <div className="bg-baikal-surface border border-baikal-border rounded-md overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="bg-baikal-bg/50 border-b border-baikal-border">
                                                <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-baikal-text uppercase">Utilisateur</th>
                                                <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-baikal-text uppercase">Inscrit le</th>
                                                <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-baikal-text uppercase">Statut</th>
                                                <th className="px-4 py-3 text-right text-xs font-mono font-semibold text-baikal-text uppercase">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {pendingUsers.map((user) => (
                                                <PendingUserRow
                                                    key={user.id}
                                                    user={user}
                                                    onAssign={handleAssign}
                                                />
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="px-4 py-3 bg-baikal-bg/30 border-t border-baikal-border text-sm text-baikal-text font-mono">
                                    {pendingUsers.length} utilisateur{pendingUsers.length > 1 ? 's' : ''} en attente
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* =============== ONGLET TOUS =============== */}
                {activeTab === 'all' && (
                    <>
                        {/* Filtres */}
                        <div className="flex flex-col sm:flex-row gap-4 mb-6">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-baikal-text" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Rechercher un utilisateur..."
                                    className="w-full pl-10 pr-4 py-2.5 bg-baikal-surface border border-baikal-border rounded-md text-white placeholder-baikal-text/50 focus:outline-none focus:border-baikal-cyan transition-colors"
                                />
                            </div>

                            {organizations.length > 0 && (
                                <select
                                    value={orgFilter}
                                    onChange={(e) => setOrgFilter(e.target.value)}
                                    className="px-4 py-2.5 bg-baikal-surface border border-baikal-border rounded-md text-white focus:outline-none focus:border-baikal-cyan transition-colors"
                                >
                                    <option value="">Toutes les organisations</option>
                                    {organizations.map((org) => (
                                        <option key={org.id} value={org.id}>
                                            {org.name}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>

                        {loadingUsers && (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="w-8 h-8 text-baikal-cyan animate-spin" />
                            </div>
                        )}

                        {!loadingUsers && users.length === 0 && (
                            <div className="bg-baikal-surface border border-baikal-border rounded-md p-12 text-center">
                                <Users className="w-12 h-12 text-baikal-text mx-auto mb-4" />
                                <h3 className="text-lg font-mono font-medium text-white mb-2">
                                    AUCUN_UTILISATEUR
                                </h3>
                                <p className="text-baikal-text">
                                    {search || orgFilter ? 'Aucun utilisateur ne correspond à vos critères.' : 'Aucun utilisateur enregistré.'}
                                </p>
                            </div>
                        )}

                        {!loadingUsers && users.length > 0 && (
                            <div className="bg-baikal-surface border border-baikal-border rounded-md overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="bg-baikal-bg/50 border-b border-baikal-border">
                                                <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-baikal-text uppercase">Utilisateur</th>
                                                <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-baikal-text uppercase">Organisation</th>
                                                <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-baikal-text uppercase">Rôle App</th>
                                                <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-baikal-text uppercase">Inscrit le</th>
                                                <th className="px-4 py-3 text-right text-xs font-mono font-semibold text-baikal-text uppercase">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {users.map((user) => (
                                                <UserRow
                                                    key={user.id}
                                                    user={user}
                                                    showOrg={true}
                                                    onEditRole={handleEditRole}
                                                    onResetPassword={handleResetPassword}
                                                    onRemove={handleRemove}
                                                    canEdit={user.app_role !== 'super_admin'}
                                                />
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="px-4 py-3 bg-baikal-bg/30 border-t border-baikal-border text-sm text-baikal-text font-mono">
                                    {users.length} utilisateur{users.length > 1 ? 's' : ''}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </main>

            {/* Modals */}
            <CreateUserModal
                isOpen={creatingUser}
                onClose={() => setCreatingUser(false)}
                organizations={organizations}
                onCreate={handleUserCreated}
            />

            <AssignOrgModal
                isOpen={!!assigningUser}
                onClose={() => setAssigningUser(null)}
                user={assigningUser}
                organizations={organizations}
                onAssign={handleAssigned}
            />

            <EditRoleModal
                isOpen={!!editingUser}
                onClose={() => setEditingUser(null)}
                user={editingUser}
                onSave={handleRoleSaved}
                allowedRoles={getAllowedRoles()}
            />

            <RemoveUserModal
                isOpen={!!removingUser}
                onClose={() => setRemovingUser(null)}
                user={removingUser}
                onConfirm={handleRemoved}
            />
        </div>
    );
}
