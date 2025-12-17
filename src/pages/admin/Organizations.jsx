/**
 * Organizations.jsx - Baikal Console
 * ============================================================================
 * Page de gestion des organisations (super_admin uniquement).
 * 
 * Fonctionnalités :
 * - Liste des organisations avec filtres
 * - Création / Modification / Suppression
 * - Assignation d'une App
 * - Gestion des plans
 * 
 * Route : /admin/organizations
 * Accès : super_admin uniquement
 * ============================================================================
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { organizationService, getApps } from '../../services';
import {
    Building2,
    Plus,
    Search,
    Edit2,
    Trash2,
    Users,
    FolderOpen,
    AlertCircle,
    Loader2,
    X,
    Check,
    ChevronLeft,
    MoreVertical,
    Power,
    PowerOff,
    Layers,
} from 'lucide-react';

// ============================================================================
// CONFIGURATION
// ============================================================================

const PLANS = [
    { value: 'free', label: 'Free', color: 'text-gray-400' },
    { value: 'starter', label: 'Starter', color: 'text-blue-400' },
    { value: 'pro', label: 'Pro', color: 'text-violet-400' },
    { value: 'enterprise', label: 'Enterprise', color: 'text-amber-400' },
];

// ============================================================================
// UTILITAIRES
// ============================================================================

function getPlanConfig(plan) {
    return PLANS.find(p => p.value === plan) || PLANS[0];
}

// ============================================================================
// COMPOSANTS INTERNES
// ============================================================================

/**
 * Badge de plan
 */
function PlanBadge({ plan }) {
    const config = getPlanConfig(plan);
    return (
        <span className={`text-xs font-mono uppercase ${config.color}`}>
            {config.label}
        </span>
    );
}

/**
 * Badge de statut
 */
function StatusBadge({ isActive }) {
    return isActive ? (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono bg-green-500/20 text-green-400">
            <Power className="w-3 h-3" />
            ACTIF
        </span>
    ) : (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono bg-red-500/20 text-red-400">
            <PowerOff className="w-3 h-3" />
            INACTIF
        </span>
    );
}

/**
 * Ligne du tableau
 */
function OrganizationRow({ org, apps, onEdit, onToggleStatus, onDelete }) {
    const [showMenu, setShowMenu] = useState(false);
    
    // Trouver le nom de l'app
    const appName = apps.find(a => a.id === org.app_id)?.name || '-';

    return (
        <tr className="border-b border-baikal-border hover:bg-baikal-surface/50 transition-colors">
            {/* Nom & Slug */}
            <td className="px-4 py-4">
                <div>
                    <p className="font-medium text-white">{org.name}</p>
                    <p className="text-xs text-baikal-text font-mono">{org.slug}</p>
                </div>
            </td>

            {/* App */}
            <td className="px-4 py-4">
                <div className="flex items-center gap-2 text-baikal-text">
                    <Layers className="w-4 h-4" />
                    <span className="text-sm">{appName}</span>
                </div>
            </td>

            {/* Plan */}
            <td className="px-4 py-4">
                <PlanBadge plan={org.plan} />
            </td>

            {/* Membres */}
            <td className="px-4 py-4">
                <div className="flex items-center gap-2 text-baikal-text">
                    <Users className="w-4 h-4" />
                    <span className="font-mono">{org.member_count || 0}</span>
                </div>
            </td>

            {/* Projets */}
            <td className="px-4 py-4">
                <div className="flex items-center gap-2 text-baikal-text">
                    <FolderOpen className="w-4 h-4" />
                    <span className="font-mono">{org.project_count || 0}</span>
                </div>
            </td>

            {/* Statut */}
            <td className="px-4 py-4">
                <StatusBadge isActive={org.is_active} />
            </td>

            {/* Actions */}
            <td className="px-4 py-4">
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
                                    onClick={() => { onEdit(org); setShowMenu(false); }}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-left text-baikal-text hover:text-white hover:bg-baikal-bg transition-colors"
                                >
                                    <Edit2 className="w-4 h-4" />
                                    Modifier
                                </button>
                                <button
                                    onClick={() => { onToggleStatus(org); setShowMenu(false); }}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-left text-baikal-text hover:text-white hover:bg-baikal-bg transition-colors"
                                >
                                    {org.is_active ? (
                                        <>
                                            <PowerOff className="w-4 h-4" />
                                            Désactiver
                                        </>
                                    ) : (
                                        <>
                                            <Power className="w-4 h-4" />
                                            Activer
                                        </>
                                    )}
                                </button>
                                <hr className="border-baikal-border" />
                                <button
                                    onClick={() => { onDelete(org); setShowMenu(false); }}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-left text-red-400 hover:bg-red-900/20 transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    Supprimer
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </td>
        </tr>
    );
}

/**
 * Modal de création/modification d'organisation
 */
function OrganizationModal({ isOpen, onClose, organization, apps, onSave }) {
    const isEdit = !!organization;
    
    const [formData, setFormData] = useState({
        name: '',
        plan: 'free',
        app_id: '',
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Reset form when modal opens
    useEffect(() => {
        if (isOpen) {
            if (organization) {
                setFormData({
                    name: organization.name || '',
                    plan: organization.plan || 'free',
                    app_id: organization.app_id || '',
                });
            } else {
                setFormData({
                    name: '',
                    plan: 'free',
                    app_id: apps.length > 0 ? apps[0].id : '',
                });
            }
            setError(null);
        }
    }, [isOpen, organization, apps]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            let result;

            if (isEdit) {
                result = await organizationService.updateOrganization({
                    orgId: organization.id,
                    name: formData.name.trim(),
                    plan: formData.plan,
                    appId: formData.app_id || null,
                });
            } else {
                result = await organizationService.createOrganization({
                    name: formData.name.trim(),
                    plan: formData.plan,
                    appId: formData.app_id || null,
                });
            }

            if (result.error) {
                throw new Error(result.error.message || result.error);
            }

            // Vérifier le retour JSONB
            if (result.data?.success === false) {
                throw new Error(result.data.error || 'Erreur inconnue');
            }

            onSave();
            onClose();
        } catch (err) {
            console.error('[OrganizationModal] Error:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative w-full max-w-md mx-4 bg-baikal-surface border border-baikal-border rounded-lg shadow-xl">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-baikal-border">
                    <h2 className="text-lg font-mono font-semibold text-white">
                        {isEdit ? 'MODIFIER_ORGANISATION' : 'NOUVELLE_ORGANISATION'}
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
                    {/* Erreur */}
                    {error && (
                        <div className="p-3 bg-red-900/20 border border-red-500/50 rounded-md flex items-center gap-2 text-red-300 text-sm">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {error}
                        </div>
                    )}

                    {/* Nom */}
                    <div>
                        <label className="block text-sm font-mono text-baikal-text mb-2">
                            Nom *
                        </label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            placeholder="Mon Organisation"
                            required
                            className="w-full px-4 py-2.5 bg-baikal-bg border border-baikal-border rounded-md text-white placeholder-baikal-text/50 focus:outline-none focus:border-baikal-cyan transition-colors"
                        />
                    </div>

                    {/* App */}
                    <div>
                        <label className="block text-sm font-mono text-baikal-text mb-2">
                            Application *
                        </label>
                        <select
                            value={formData.app_id}
                            onChange={(e) => setFormData({ ...formData, app_id: e.target.value })}
                            required
                            className="w-full px-4 py-2.5 bg-baikal-bg border border-baikal-border rounded-md text-white focus:outline-none focus:border-baikal-cyan transition-colors"
                        >
                            <option value="">-- Sélectionner une app --</option>
                            {apps.map((app) => (
                                <option key={app.id} value={app.id}>
                                    {app.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Plan */}
                    <div>
                        <label className="block text-sm font-mono text-baikal-text mb-2">
                            Plan
                        </label>
                        <select
                            value={formData.plan}
                            onChange={(e) => setFormData({ ...formData, plan: e.target.value })}
                            className="w-full px-4 py-2.5 bg-baikal-bg border border-baikal-border rounded-md text-white focus:outline-none focus:border-baikal-cyan transition-colors"
                        >
                            {PLANS.map((plan) => (
                                <option key={plan.value} value={plan.value}>
                                    {plan.label}
                                </option>
                            ))}
                        </select>
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
                            disabled={loading || !formData.name.trim() || !formData.app_id}
                            className="flex items-center gap-2 px-4 py-2 bg-baikal-cyan text-black font-medium rounded-md hover:bg-baikal-cyan/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-mono"
                        >
                            {loading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Check className="w-4 h-4" />
                            )}
                            {isEdit ? 'ENREGISTRER' : 'CRÉER'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

/**
 * Modal de confirmation de suppression
 */
function DeleteConfirmModal({ isOpen, onClose, organization, onConfirm }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [confirmSlug, setConfirmSlug] = useState('');

    useEffect(() => {
        if (isOpen) {
            setConfirmSlug('');
            setError(null);
        }
    }, [isOpen]);

    const handleConfirm = async () => {
        setLoading(true);
        setError(null);

        try {
            const result = await organizationService.deleteOrganization({
                orgId: organization.id,
                confirm: true,
            });

            if (result.error) {
                throw new Error(result.error.message || result.error);
            }

            if (result.data?.success === false) {
                throw new Error(result.data.error || 'Erreur lors de la suppression');
            }

            onConfirm();
            onClose();
        } catch (err) {
            console.error('[DeleteConfirmModal] Error:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen || !organization) return null;

    const canDelete = confirmSlug.toLowerCase() === organization.slug.toLowerCase();

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
                        <Trash2 className="w-5 h-5 text-red-400" />
                    </div>
                    <h2 className="text-lg font-mono font-semibold text-red-400">
                        SUPPRIMER_ORGANISATION
                    </h2>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                    <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-md">
                        <p className="text-sm text-red-300">
                            <strong>Attention !</strong> Cette action est irréversible.
                        </p>
                        <p className="text-sm text-red-300 mt-2">
                            L'organisation <strong className="font-mono">{organization.name}</strong> sera 
                            définitivement supprimée avec :
                        </p>
                        <ul className="mt-2 text-sm text-red-300 list-disc list-inside">
                            <li>{organization.member_count || 0} membre(s)</li>
                            <li>{organization.project_count || 0} projet(s)</li>
                        </ul>
                    </div>

                    {error && (
                        <div className="p-3 bg-red-900/20 border border-red-500/50 rounded-md flex items-center gap-2 text-red-300 text-sm">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {error}
                        </div>
                    )}

                    <div>
                        <label className="block text-sm text-baikal-text mb-2">
                            Tapez <span className="font-mono text-white">{organization.slug}</span> pour confirmer
                        </label>
                        <input
                            type="text"
                            value={confirmSlug}
                            onChange={(e) => setConfirmSlug(e.target.value)}
                            placeholder={organization.slug}
                            className="w-full px-4 py-2.5 bg-baikal-bg border border-baikal-border rounded-md text-white placeholder-baikal-text/50 focus:outline-none focus:border-red-500 transition-colors"
                        />
                    </div>

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
                            disabled={loading || !canDelete}
                            className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white font-medium rounded-md hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-mono"
                        >
                            {loading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Trash2 className="w-4 h-4" />
                            )}
                            SUPPRIMER
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

export default function Organizations() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { isSuperAdmin } = useAuth();

    // États
    const [organizations, setOrganizations] = useState([]);
    const [apps, setApps] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Filtres
    const [search, setSearch] = useState('');
    const [includeInactive, setIncludeInactive] = useState(false);

    // Modals
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingOrg, setEditingOrg] = useState(null);
    const [deletingOrg, setDeletingOrg] = useState(null);

    // Vérifier l'accès super_admin
    useEffect(() => {
        if (!isSuperAdmin) {
            navigate('/admin', { replace: true });
        }
    }, [isSuperAdmin, navigate]);

    // Vérifier les query params pour ouvrir la modal de création
    useEffect(() => {
        if (searchParams.get('action') === 'create') {
            setShowCreateModal(true);
            setSearchParams({});
        }
    }, [searchParams, setSearchParams]);

    // Charger les apps
    useEffect(() => {
        async function loadApps() {
            try {
                const { data, error } = await getApps();
                if (error) throw error;
                setApps(data || []);
            } catch (err) {
                console.error('[Organizations] Error loading apps:', err);
            }
        }
        loadApps();
    }, []);

    // Charger les organisations
    const loadOrganizations = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            // Utiliser les noms de paramètres camelCase du service
            const result = await organizationService.getOrganizations({
                includeInactive: includeInactive,
                search: search.trim() || null,
            });

            if (result.error) {
                throw new Error(result.error.message || result.error);
            }

            // Le service retourne { data: [...], error: null }
            const data = result.data || [];
            setOrganizations(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('[Organizations] Error loading:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [includeInactive, search]);

    useEffect(() => {
        loadOrganizations();
    }, [loadOrganizations]);

    // Handlers
    const handleEdit = (org) => {
        setEditingOrg(org);
    };

    const handleToggleStatus = async (org) => {
        try {
            const result = await organizationService.updateOrganization({
                orgId: org.id,
                isActive: !org.is_active,
            });

            if (result.error) {
                throw new Error(result.error.message || result.error);
            }

            loadOrganizations();
        } catch (err) {
            console.error('[Organizations] Error toggling status:', err);
            setError(err.message);
        }
    };

    const handleDelete = (org) => {
        setDeletingOrg(org);
    };

    const handleSave = () => {
        loadOrganizations();
    };

    const handleDeleteConfirm = () => {
        loadOrganizations();
    };

    // Filtrer localement par recherche (en plus du filtre serveur)
    const filteredOrgs = organizations.filter(org => {
        if (!search) return true;
        const s = search.toLowerCase();
        return org.name.toLowerCase().includes(s) || org.slug.toLowerCase().includes(s);
    });

    // Accès refusé si pas super_admin
    if (!isSuperAdmin) {
        return (
            <div className="min-h-screen bg-baikal-bg flex items-center justify-center">
                <div className="text-center">
                    <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                    <p className="text-white font-mono">ACCÈS_REFUSÉ</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-baikal-bg">
            {/* Header */}
            <header className="bg-baikal-surface border-b border-baikal-border sticky top-0 z-30">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        {/* Retour + Titre */}
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => navigate('/admin')}
                                className="p-2 text-baikal-text hover:text-white hover:bg-baikal-bg rounded-md transition-colors"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-baikal-cyan/20 rounded-md">
                                    <Building2 className="w-5 h-5 text-baikal-cyan" />
                                </div>
                                <div>
                                    <h1 className="text-lg font-mono font-bold text-white">
                                        ORGANISATIONS
                                    </h1>
                                    <p className="text-xs text-baikal-text font-mono">
                                        Gestion des organisations
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Bouton créer */}
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-baikal-cyan text-black font-medium rounded-md hover:bg-baikal-cyan/90 transition-colors font-mono"
                        >
                            <Plus className="w-4 h-4" />
                            NOUVELLE_ORG
                        </button>
                    </div>
                </div>
            </header>

            {/* Contenu */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Filtres */}
                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                    {/* Recherche */}
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-baikal-text" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Rechercher une organisation..."
                            className="w-full pl-10 pr-4 py-2.5 bg-baikal-surface border border-baikal-border rounded-md text-white placeholder-baikal-text/50 focus:outline-none focus:border-baikal-cyan transition-colors"
                        />
                    </div>

                    {/* Toggle inactives */}
                    <label className="flex items-center gap-2 px-4 py-2 bg-baikal-surface border border-baikal-border rounded-md cursor-pointer hover:border-baikal-cyan transition-colors">
                        <input
                            type="checkbox"
                            checked={includeInactive}
                            onChange={(e) => setIncludeInactive(e.target.checked)}
                            className="w-4 h-4 rounded border-baikal-border bg-baikal-bg text-baikal-cyan focus:ring-baikal-cyan"
                        />
                        <span className="text-sm text-baikal-text whitespace-nowrap">
                            Inclure inactives
                        </span>
                    </label>
                </div>

                {/* Erreur */}
                {error && (
                    <div className="mb-6 p-4 bg-red-900/20 border border-red-500/50 rounded-md flex items-center gap-3 text-red-300">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        <p className="font-mono">{error}</p>
                        <button
                            onClick={loadOrganizations}
                            className="ml-auto text-sm font-medium hover:underline font-mono"
                        >
                            RÉESSAYER
                        </button>
                    </div>
                )}

                {/* Loading */}
                {loading && (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 text-baikal-cyan animate-spin" />
                    </div>
                )}

                {/* Liste vide */}
                {!loading && filteredOrgs.length === 0 && (
                    <div className="bg-baikal-surface border border-baikal-border rounded-md p-12 text-center">
                        <Building2 className="w-12 h-12 text-baikal-text mx-auto mb-4" />
                        <h3 className="text-lg font-mono font-medium text-white mb-2">
                            AUCUNE_ORGANISATION
                        </h3>
                        <p className="text-baikal-text mb-6">
                            {search 
                                ? 'Aucune organisation ne correspond à votre recherche.'
                                : 'Créez votre première organisation pour commencer.'
                            }
                        </p>
                        {!search && (
                            <button
                                onClick={() => setShowCreateModal(true)}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-baikal-cyan text-black font-medium rounded-md hover:bg-baikal-cyan/90 transition-colors font-mono"
                            >
                                <Plus className="w-4 h-4" />
                                CRÉER_ORGANISATION
                            </button>
                        )}
                    </div>
                )}

                {/* Tableau */}
                {!loading && filteredOrgs.length > 0 && (
                    <div className="bg-baikal-surface border border-baikal-border rounded-md overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-baikal-bg/50 border-b border-baikal-border">
                                        <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-baikal-text uppercase tracking-wider">
                                            Organisation
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-baikal-text uppercase tracking-wider">
                                            App
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-baikal-text uppercase tracking-wider">
                                            Plan
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-baikal-text uppercase tracking-wider">
                                            Membres
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-baikal-text uppercase tracking-wider">
                                            Projets
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-baikal-text uppercase tracking-wider">
                                            Statut
                                        </th>
                                        <th className="px-4 py-3 text-right text-xs font-mono font-semibold text-baikal-text uppercase tracking-wider">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredOrgs.map((org) => (
                                        <OrganizationRow
                                            key={org.id}
                                            org={org}
                                            apps={apps}
                                            onEdit={handleEdit}
                                            onToggleStatus={handleToggleStatus}
                                            onDelete={handleDelete}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Footer stats */}
                        <div className="px-4 py-3 bg-baikal-bg/30 border-t border-baikal-border text-sm text-baikal-text font-mono">
                            {filteredOrgs.length} organisation{filteredOrgs.length > 1 ? 's' : ''}
                        </div>
                    </div>
                )}
            </main>

            {/* Modal Créer */}
            <OrganizationModal
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                organization={null}
                apps={apps}
                onSave={handleSave}
            />

            {/* Modal Modifier */}
            <OrganizationModal
                isOpen={!!editingOrg}
                onClose={() => setEditingOrg(null)}
                organization={editingOrg}
                apps={apps}
                onSave={handleSave}
            />

            {/* Modal Supprimer */}
            <DeleteConfirmModal
                isOpen={!!deletingOrg}
                onClose={() => setDeletingOrg(null)}
                organization={deletingOrg}
                onConfirm={handleDeleteConfirm}
            />
        </div>
    );
}
