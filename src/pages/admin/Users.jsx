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
 * - Assigner un utilisateur à une organisation (super_admin)
 * - Modifier le rôle d'un utilisateur
 * - Retirer un utilisateur de son organisation
 * - Recherche et filtres
 * 
 * Route : /admin/users
 * Accès : super_admin / org_admin
 * ============================================================================
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usersService, organizationService } from '../../services';
import {
    Users,
    UserPlus,
    UserMinus,
    UserCog,
    Search,
    Filter,
    Building2,
    Shield,
    AlertCircle,
    Loader2,
    X,
    Check,
    ChevronLeft,
    MoreVertical,
    Clock,
    Mail,
    Calendar,
    AlertTriangle,
} from 'lucide-react';

// ============================================================================
// CONFIGURATION
// ============================================================================

const APP_ROLES = [
    { value: 'user', label: 'User', level: 4, color: 'text-gray-400' },
    { value: 'team_leader', label: 'Team Leader', level: 3, color: 'text-blue-400' },
    { value: 'org_admin', label: 'Org Admin', level: 2, color: 'text-violet-400' },
    { value: 'super_admin', label: 'Super Admin', level: 1, color: 'text-amber-400' },
];

const BUSINESS_ROLES = [
    { value: 'provider', label: 'Provider' },
    { value: 'client', label: 'Client' },
];

// ============================================================================
// UTILITAIRES
// ============================================================================

/**
 * Formate une date
 */
function formatDate(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
}

/**
 * Obtient la config d'un rôle app
 */
function getAppRoleConfig(role) {
    return APP_ROLES.find(r => r.value === role) || APP_ROLES[0];
}

// ============================================================================
// COMPOSANTS INTERNES
// ============================================================================

/**
 * Badge de rôle app
 */
function AppRoleBadge({ role }) {
    const config = getAppRoleConfig(role);
    return (
        <span className={`text-xs font-mono uppercase ${config.color}`}>
            {config.label}
        </span>
    );
}

/**
 * Badge de rôle business
 */
function BusinessRoleBadge({ role }) {
    if (!role) return <span className="text-xs text-baikal-text">-</span>;
    return (
        <span className="text-xs font-mono text-blue-400 uppercase">
            {role}
        </span>
    );
}

/**
 * Avatar utilisateur
 */
function UserAvatar({ user, size = 'md' }) {
    const sizeClasses = {
        sm: 'w-8 h-8 text-xs',
        md: 'w-10 h-10 text-sm',
        lg: 'w-12 h-12 text-base',
    };

    const initials = user.full_name
        ? user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
        : user.email?.slice(0, 2).toUpperCase() || '??';

    return (
        <div className={`
            ${sizeClasses[size]} 
            bg-baikal-cyan/20 text-baikal-cyan 
            rounded-full flex items-center justify-center font-mono font-bold
        `}>
            {initials}
        </div>
    );
}

/**
 * Ligne utilisateur en attente (pending)
 */
function PendingUserRow({ user, onAssign }) {
    return (
        <tr className="border-b border-baikal-border hover:bg-baikal-surface/50 transition-colors">
            {/* User */}
            <td className="px-4 py-4">
                <div className="flex items-center gap-3">
                    <UserAvatar user={user} />
                    <div>
                        <p className="font-medium text-white">
                            {user.full_name || 'Sans nom'}
                        </p>
                        <p className="text-xs text-baikal-text">{user.email}</p>
                    </div>
                </div>
            </td>

            {/* Date inscription */}
            <td className="px-4 py-4">
                <div className="flex items-center gap-2 text-baikal-text text-sm">
                    <Calendar className="w-4 h-4" />
                    {formatDate(user.created_at)}
                </div>
            </td>

            {/* Statut */}
            <td className="px-4 py-4">
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono bg-amber-500/20 text-amber-400">
                    <Clock className="w-3 h-3" />
                    EN_ATTENTE
                </span>
            </td>

            {/* Actions */}
            <td className="px-4 py-4">
                <button
                    onClick={() => onAssign(user)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-baikal-cyan text-black text-sm font-medium rounded hover:bg-baikal-cyan/90 transition-colors font-mono"
                >
                    <Building2 className="w-4 h-4" />
                    ASSIGNER
                </button>
            </td>
        </tr>
    );
}

/**
 * Ligne utilisateur standard
 */
function UserRow({ user, onEditRole, onRemove, showOrg = true, canEdit = true }) {
    const [showMenu, setShowMenu] = useState(false);

    return (
        <tr className="border-b border-baikal-border hover:bg-baikal-surface/50 transition-colors">
            {/* User */}
            <td className="px-4 py-4">
                <div className="flex items-center gap-3">
                    <UserAvatar user={user} />
                    <div>
                        <p className="font-medium text-white">
                            {user.full_name || 'Sans nom'}
                        </p>
                        <p className="text-xs text-baikal-text">{user.email}</p>
                    </div>
                </div>
            </td>

            {/* Organisation */}
            {showOrg && (
                <td className="px-4 py-4">
                    <div className="flex items-center gap-2 text-baikal-text">
                        <Building2 className="w-4 h-4" />
                        <span className="text-sm">{user.organization?.name || '-'}</span>
                    </div>
                </td>
            )}

            {/* Rôle App */}
            <td className="px-4 py-4">
                <AppRoleBadge role={user.app_role} />
            </td>

            {/* Rôle Business */}
            <td className="px-4 py-4">
                <BusinessRoleBadge role={user.business_role} />
            </td>

            {/* Date */}
            <td className="px-4 py-4">
                <span className="text-sm text-baikal-text">
                    {formatDate(user.created_at)}
                </span>
            </td>

            {/* Actions */}
            <td className="px-4 py-4">
                {canEdit && (
                    <div className="relative">
                        <button
                            onClick={() => setShowMenu(!showMenu)}
                            className="p-2 text-baikal-text hover:text-white hover:bg-baikal-bg rounded-md transition-colors"
                        >
                            <MoreVertical className="w-4 h-4" />
                        </button>

                        {showMenu && (
                            <>
                                <div 
                                    className="fixed inset-0 z-10" 
                                    onClick={() => setShowMenu(false)}
                                />
                                
                                <div className="absolute right-0 top-full mt-1 w-48 bg-baikal-surface border border-baikal-border rounded-md shadow-lg z-20">
                                    <button
                                        onClick={() => { onEditRole(user); setShowMenu(false); }}
                                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-left text-baikal-text hover:text-white hover:bg-baikal-bg transition-colors"
                                    >
                                        <UserCog className="w-4 h-4" />
                                        Modifier le rôle
                                    </button>
                                    <hr className="border-baikal-border" />
                                    <button
                                        onClick={() => { onRemove(user); setShowMenu(false); }}
                                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-left text-red-400 hover:bg-red-900/20 transition-colors"
                                    >
                                        <UserMinus className="w-4 h-4" />
                                        Retirer de l'org
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </td>
        </tr>
    );
}

/**
 * Modal d'assignation à une organisation
 */
function AssignOrgModal({ isOpen, onClose, user, organizations, onAssign }) {
    const [selectedOrg, setSelectedOrg] = useState('');
    const [reason, setReason] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (isOpen) {
            setSelectedOrg('');
            setReason('');
            setError(null);
        }
    }, [isOpen]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!selectedOrg) return;

        setLoading(true);
        setError(null);

        try {
            const result = await usersService.assignUserToOrg({
                p_target_user_id: user.id,
                p_org_id: selectedOrg,
                p_reason: reason.trim() || null,
            });

            if (result.error) {
                throw new Error(result.error.message || result.error);
            }

            if (result.data?.success === false) {
                throw new Error(result.data.error || 'Erreur lors de l\'assignation');
            }

            onAssign();
            onClose();
        } catch (err) {
            console.error('[AssignOrgModal] Error:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen || !user) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div 
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={onClose}
            />

            <div className="relative w-full max-w-md mx-4 bg-baikal-surface border border-baikal-border rounded-lg shadow-xl">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-baikal-border">
                    <h2 className="text-lg font-mono font-semibold text-white">
                        ASSIGNER_À_ORGANISATION
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 text-baikal-text hover:text-white hover:bg-baikal-bg rounded-md transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {/* User info */}
                    <div className="flex items-center gap-3 p-3 bg-baikal-bg rounded-md">
                        <UserAvatar user={user} />
                        <div>
                            <p className="font-medium text-white">{user.full_name || 'Sans nom'}</p>
                            <p className="text-xs text-baikal-text">{user.email}</p>
                        </div>
                    </div>

                    {/* Erreur */}
                    {error && (
                        <div className="p-3 bg-red-900/20 border border-red-500/50 rounded-md flex items-center gap-2 text-red-300 text-sm">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {error}
                        </div>
                    )}

                    {/* Select org */}
                    <div>
                        <label className="block text-sm font-mono text-baikal-text mb-2">
                            Organisation *
                        </label>
                        <select
                            value={selectedOrg}
                            onChange={(e) => setSelectedOrg(e.target.value)}
                            required
                            className="w-full px-4 py-2.5 bg-baikal-bg border border-baikal-border rounded-md text-white focus:outline-none focus:border-baikal-cyan transition-colors"
                        >
                            <option value="">-- Sélectionner --</option>
                            {organizations.map((org) => (
                                <option key={org.id} value={org.id}>
                                    {org.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Raison */}
                    <div>
                        <label className="block text-sm font-mono text-baikal-text mb-2">
                            Raison (optionnel)
                        </label>
                        <input
                            type="text"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Ex: Nouveau collaborateur"
                            className="w-full px-4 py-2.5 bg-baikal-bg border border-baikal-border rounded-md text-white placeholder-baikal-text/50 focus:outline-none focus:border-baikal-cyan transition-colors"
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={loading}
                            className="px-4 py-2 text-baikal-text hover:text-white transition-colors font-mono"
                        >
                            ANNULER
                        </button>
                        <button
                            type="submit"
                            disabled={loading || !selectedOrg}
                            className="flex items-center gap-2 px-4 py-2 bg-baikal-cyan text-black font-medium rounded-md hover:bg-baikal-cyan/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-mono"
                        >
                            {loading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Check className="w-4 h-4" />
                            )}
                            ASSIGNER
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

/**
 * Modal de modification de rôle
 */
function EditRoleModal({ isOpen, onClose, user, onSave, allowedRoles }) {
    const [appRole, setAppRole] = useState('user');
    const [businessRole, setBusinessRole] = useState('');
    const [reason, setReason] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (isOpen && user) {
            setAppRole(user.app_role || 'user');
            setBusinessRole(user.business_role || '');
            setReason('');
            setError(null);
        }
    }, [isOpen, user]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const result = await usersService.updateUserRole({
                p_target_user_id: user.id,
                p_new_app_role: appRole,
                p_new_business_role: businessRole || null,
                p_reason: reason.trim() || null,
            });

            if (result.error) {
                throw new Error(result.error.message || result.error);
            }

            if (result.data?.success === false) {
                throw new Error(result.data.error || 'Erreur lors de la modification');
            }

            onSave();
            onClose();
        } catch (err) {
            console.error('[EditRoleModal] Error:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen || !user) return null;

    // Filtrer les rôles disponibles selon les permissions
    const availableRoles = allowedRoles || APP_ROLES;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div 
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={onClose}
            />

            <div className="relative w-full max-w-md mx-4 bg-baikal-surface border border-baikal-border rounded-lg shadow-xl">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-baikal-border">
                    <h2 className="text-lg font-mono font-semibold text-white">
                        MODIFIER_RÔLE
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 text-baikal-text hover:text-white hover:bg-baikal-bg rounded-md transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {/* User info */}
                    <div className="flex items-center gap-3 p-3 bg-baikal-bg rounded-md">
                        <UserAvatar user={user} />
                        <div>
                            <p className="font-medium text-white">{user.full_name || 'Sans nom'}</p>
                            <p className="text-xs text-baikal-text">{user.email}</p>
                        </div>
                    </div>

                    {/* Erreur */}
                    {error && (
                        <div className="p-3 bg-red-900/20 border border-red-500/50 rounded-md flex items-center gap-2 text-red-300 text-sm">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {error}
                        </div>
                    )}

                    {/* App Role */}
                    <div>
                        <label className="block text-sm font-mono text-baikal-text mb-2">
                            Rôle application
                        </label>
                        <select
                            value={appRole}
                            onChange={(e) => setAppRole(e.target.value)}
                            className="w-full px-4 py-2.5 bg-baikal-bg border border-baikal-border rounded-md text-white focus:outline-none focus:border-baikal-cyan transition-colors"
                        >
                            {availableRoles.map((role) => (
                                <option key={role.value} value={role.value}>
                                    {role.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Business Role */}
                    <div>
                        <label className="block text-sm font-mono text-baikal-text mb-2">
                            Rôle business
                        </label>
                        <select
                            value={businessRole}
                            onChange={(e) => setBusinessRole(e.target.value)}
                            className="w-full px-4 py-2.5 bg-baikal-bg border border-baikal-border rounded-md text-white focus:outline-none focus:border-baikal-cyan transition-colors"
                        >
                            <option value="">-- Aucun --</option>
                            {BUSINESS_ROLES.map((role) => (
                                <option key={role.value} value={role.value}>
                                    {role.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Raison */}
                    <div>
                        <label className="block text-sm font-mono text-baikal-text mb-2">
                            Raison du changement (optionnel)
                        </label>
                        <input
                            type="text"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Ex: Promotion"
                            className="w-full px-4 py-2.5 bg-baikal-bg border border-baikal-border rounded-md text-white placeholder-baikal-text/50 focus:outline-none focus:border-baikal-cyan transition-colors"
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={loading}
                            className="px-4 py-2 text-baikal-text hover:text-white transition-colors font-mono"
                        >
                            ANNULER
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex items-center gap-2 px-4 py-2 bg-baikal-cyan text-black font-medium rounded-md hover:bg-baikal-cyan/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-mono"
                        >
                            {loading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Check className="w-4 h-4" />
                            )}
                            ENREGISTRER
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

/**
 * Modal de confirmation de retrait
 */
function RemoveUserModal({ isOpen, onClose, user, onConfirm }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [reason, setReason] = useState('');

    useEffect(() => {
        if (isOpen) {
            setReason('');
            setError(null);
        }
    }, [isOpen]);

    const handleConfirm = async () => {
        setLoading(true);
        setError(null);

        try {
            const result = await usersService.removeUserFromOrg({
                p_target_user_id: user.id,
                p_reason: reason.trim() || null,
            });

            if (result.error) {
                throw new Error(result.error.message || result.error);
            }

            if (result.data?.success === false) {
                throw new Error(result.data.error || 'Erreur lors du retrait');
            }

            onConfirm();
            onClose();
        } catch (err) {
            console.error('[RemoveUserModal] Error:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen || !user) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div 
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={onClose}
            />

            <div className="relative w-full max-w-md mx-4 bg-baikal-surface border border-red-500/50 rounded-lg shadow-xl">
                {/* Header */}
                <div className="flex items-center gap-3 px-6 py-4 border-b border-baikal-border bg-red-900/20">
                    <div className="p-2 bg-red-500/20 rounded-md">
                        <UserMinus className="w-5 h-5 text-red-400" />
                    </div>
                    <h2 className="text-lg font-mono font-semibold text-red-400">
                        RETIRER_UTILISATEUR
                    </h2>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                    {/* User info */}
                    <div className="flex items-center gap-3 p-3 bg-baikal-bg rounded-md">
                        <UserAvatar user={user} />
                        <div>
                            <p className="font-medium text-white">{user.full_name || 'Sans nom'}</p>
                            <p className="text-xs text-baikal-text">{user.email}</p>
                        </div>
                    </div>

                    {/* Warning */}
                    <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-md">
                        <p className="text-sm text-red-300">
                            <AlertTriangle className="w-4 h-4 inline mr-1" />
                            Cet utilisateur sera retiré de l'organisation et n'aura plus accès aux ressources.
                        </p>
                    </div>

                    {/* Erreur */}
                    {error && (
                        <div className="p-3 bg-red-900/20 border border-red-500/50 rounded-md flex items-center gap-2 text-red-300 text-sm">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {error}
                        </div>
                    )}

                    {/* Raison */}
                    <div>
                        <label className="block text-sm font-mono text-baikal-text mb-2">
                            Raison (optionnel)
                        </label>
                        <input
                            type="text"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Ex: Fin de contrat"
                            className="w-full px-4 py-2.5 bg-baikal-bg border border-baikal-border rounded-md text-white placeholder-baikal-text/50 focus:outline-none focus:border-baikal-cyan transition-colors"
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={loading}
                            className="px-4 py-2 text-baikal-text hover:text-white transition-colors font-mono"
                        >
                            ANNULER
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={loading}
                            className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white font-medium rounded-md hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-mono"
                        >
                            {loading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <UserMinus className="w-4 h-4" />
                            )}
                            RETIRER
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

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

    // Modals
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
                p_org_id: isSuperAdmin ? (orgFilter || null) : profile?.org_id,
                p_search: search.trim() || null,
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
                                            <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-baikal-text uppercase">Rôle Business</th>
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
                                                <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-baikal-text uppercase">Rôle Business</th>
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
