/**
 * Projects.jsx - Baikal Console
 * ============================================================================
 * Page de gestion des projets.
 * 
 * Fonctionnalités :
 * - Liste des projets avec filtres (org, statut, recherche)
 * - Création / Modification / Suppression de projets
 * - Gestion des membres du projet
 * - Archivage / Réactivation de projets
 * 
 * Route : /admin/projects
 * Accès : super_admin (toutes orgs) / org_admin (son org)
 * 
 * CORRECTIONS 17/12/2025:
 * - Fix appels projectsService avec bons noms de paramètres
 * - Boutons d'actions directs (Modifier, Archiver/Réactiver, Gérer)
 * - Suppression filtre "Terminés" (non utilisé en base)
 * - Correction texte modal suppression (clarification membres)
 * - Ajout bouton Réactiver pour projets archivés
 * 
 * PHASE 2 (21/12/2025):
 * - Ajout champs identité projet (market_type, project_type, description)
 * - Validation obligatoire des champs identité
 * - Suppression description générale (une seule description dans identity)
 * - Suppression corps d'état (doublon avec type de projet)
 * ============================================================================
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { projectsService, organizationService, usersService } from '../../services';
import {
    FolderOpen,
    Plus,
    Search,
    Trash2,
    Users,
    Building2,
    AlertCircle,
    Loader2,
    X,
    Check,
    ChevronLeft,
    Archive,
    CheckCircle2,
    UserPlus,
    UserMinus,
    Crown,
    Eye,
    Pencil,
    RotateCcw,
} from 'lucide-react';

// Import centralisé depuis @shared/utils (architecture Option B)
import { formatDate } from '@shared/utils';

// ============================================================================
// CONFIGURATION
// ============================================================================

const PROJECT_STATUSES = [
    { value: 'active', label: 'Actif', color: 'bg-green-500/20 text-green-400', icon: CheckCircle2 },
    { value: 'archived', label: 'Archivé', color: 'bg-gray-500/20 text-gray-400', icon: Archive },
];

const PROJECT_ROLES = [
    { value: 'leader', label: 'Leader', color: 'text-amber-400', icon: Crown },
    { value: 'member', label: 'Membre', color: 'text-blue-400', icon: Users },
    { value: 'viewer', label: 'Viewer', color: 'text-gray-400', icon: Eye },
];

const STATUS_FILTERS = [
    { value: 'all', label: 'Tous' },
    { value: 'active', label: 'Actifs' },
    { value: 'archived', label: 'Archivés' },
];

// ============================================================================
// UTILITAIRES
// ============================================================================

function getStatusConfig(status) {
    return PROJECT_STATUSES.find(s => s.value === status) || PROJECT_STATUSES[0];
}

function getRoleConfig(role) {
    return PROJECT_ROLES.find(r => r.value === role) || PROJECT_ROLES[1];
}

// ============================================================================
// COMPOSANTS INTERNES
// ============================================================================

/**
 * Badge de statut projet
 */
function StatusBadge({ status }) {
    const config = getStatusConfig(status);
    const Icon = config.icon;

    return (
        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono ${config.color}`}>
            <Icon className="w-3 h-3" />
            {config.label.toUpperCase()}
        </span>
    );
}

/**
 * Badge de rôle projet
 */
function ProjectRoleBadge({ role }) {
    const config = getRoleConfig(role);
    const Icon = config.icon;

    return (
        <span className={`inline-flex items-center gap-1 text-xs font-mono ${config.color}`}>
            <Icon className="w-3 h-3" />
            {config.label}
        </span>
    );
}

/**
 * Ligne du tableau projet
 */
function ProjectRow({ project, onEdit, onManageMembers, onArchive, onReactivate, onDelete, showOrg = true }) {
    return (
        <tr className="border-b border-baikal-border hover:bg-baikal-surface/50 transition-colors">
            {/* Nom & Description */}
            <td className="px-4 py-4">
                <div>
                    <p className="font-medium text-white">{project.name}</p>
                    {project.identity?.description && (
                        <p className="text-xs text-baikal-text mt-0.5 line-clamp-1">
                            {project.identity.description}
                        </p>
                    )}
                </div>
            </td>

            {/* Organisation */}
            {showOrg && (
                <td className="px-4 py-4">
                    <div className="flex items-center gap-2 text-baikal-text">
                        <Building2 className="w-4 h-4" />
                        <span className="text-sm">{project.organization?.name || project.org_name || '-'}</span>
                    </div>
                </td>
            )}

            {/* Membres */}
            <td className="px-4 py-4">
                <div className="flex items-center gap-2 text-baikal-text">
                    <Users className="w-4 h-4" />
                    <span className="font-mono">{project.member_count || 0}</span>
                </div>
            </td>

            {/* Statut */}
            <td className="px-4 py-4">
                <StatusBadge status={project.status} />
            </td>

            {/* Date création */}
            <td className="px-4 py-4">
                <span className="text-sm text-baikal-text">
                    {formatDate(project.created_at)}
                </span>
            </td>

            {/* Actions - Boutons directs */}
            <td className="px-4 py-4">
                <div className="flex items-center justify-end gap-2">
                    {/* Modifier */}
                    <button
                        onClick={() => onEdit(project)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono text-baikal-text hover:text-white hover:bg-baikal-bg border border-baikal-border rounded transition-colors"
                        title="Modifier le projet"
                    >
                        <Pencil className="w-3.5 h-3.5" />
                        Modifier
                    </button>

                    {/* Archiver (si actif) */}
                    {project.status === 'active' && (
                        <button
                            onClick={() => onArchive(project)}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono text-amber-400 hover:text-white hover:bg-amber-900/30 border border-amber-500/30 rounded transition-colors"
                            title="Archiver le projet"
                        >
                            <Archive className="w-3.5 h-3.5" />
                            Archiver
                        </button>
                    )}

                    {/* Réactiver (si archivé) */}
                    {project.status === 'archived' && (
                        <button
                            onClick={() => onReactivate(project)}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono text-green-400 hover:text-white hover:bg-green-900/30 border border-green-500/30 rounded transition-colors"
                            title="Réactiver le projet"
                        >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Réactiver
                        </button>
                    )}

                    {/* Gérer les membres */}
                    <button
                        onClick={() => onManageMembers(project)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono text-blue-400 hover:text-white hover:bg-blue-900/30 border border-blue-500/30 rounded transition-colors"
                        title="Gérer les membres"
                    >
                        <Users className="w-3.5 h-3.5" />
                        Gérer
                    </button>

                    {/* Supprimer */}
                    <button
                        onClick={() => onDelete(project)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono text-red-400 hover:text-white hover:bg-red-900/30 border border-red-500/30 rounded transition-colors"
                        title="Supprimer le projet"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            </td>
        </tr>
    );
}

/**
 * Modal de création/modification de projet
 * PHASE 2: Identité projet simplifiée (market_type, project_type, description)
 */
function ProjectModal({ isOpen, onClose, project, organizations, defaultOrgId, onSave }) {
    const isEdit = !!project;
    
    const [formData, setFormData] = useState({
        name: '',
        org_id: defaultOrgId || '',
        status: 'active',
        // IDENTITÉ PROJET (PHASE 2 - SIMPLIFIÉ)
        identity: {
            market_type: '',
            project_type: '',
            description: '',
        },
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [identityErrors, setIdentityErrors] = useState({});

    useEffect(() => {
        if (isOpen) {
            if (project) {
                setFormData({
                    name: project.name || '',
                    org_id: project.org_id || defaultOrgId || '',
                    status: project.status || 'active',
                    identity: project.identity || {
                        market_type: '',
                        project_type: '',
                        description: '',
                    },
                });
            } else {
                setFormData({
                    name: '',
                    org_id: defaultOrgId || '',
                    status: 'active',
                    identity: {
                        market_type: '',
                        project_type: '',
                        description: '',
                    },
                });
            }
            setError(null);
            setIdentityErrors({});
        }
    }, [isOpen, project, defaultOrgId]);

    const handleIdentityChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            identity: {
                ...prev.identity,
                [field]: value,
            },
        }));
        // Clear error for this field
        if (identityErrors[field]) {
            setIdentityErrors(prev => {
                const newErrors = { ...prev };
                delete newErrors[field];
                return newErrors;
            });
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Validation de base
        if (!formData.name.trim()) {
            setError('Le nom du projet est requis');
            return;
        }

        // Validation identité projet (Phase 2)
        const newIdentityErrors = {};
        
        if (!formData.identity.market_type) {
            newIdentityErrors.market_type = 'Type de marché requis';
        }
        
        if (!formData.identity.project_type) {
            newIdentityErrors.project_type = 'Type de projet requis';
        }
        
        if (!formData.identity.description || formData.identity.description.trim().length === 0) {
            newIdentityErrors.description = 'Description requise';
        }

        if (Object.keys(newIdentityErrors).length > 0) {
            setIdentityErrors(newIdentityErrors);
            setError('Veuillez remplir tous les champs obligatoires de l\'identité projet');
            return;
        }
        
        setLoading(true);
        setError(null);

        try {
            let result;

            if (isEdit) {
                result = await projectsService.updateProject(project.id, {
                    name: formData.name.trim(),
                    status: formData.status,
                    identity: formData.identity,
                });
            } else {
                result = await projectsService.createProject({
                    name: formData.name.trim(),
                    orgId: formData.org_id || null,
                    identity: formData.identity,
                });
            }

            if (result.error) {
                throw new Error(result.error.message || result.error);
            }

            if (result.data?.success === false) {
                throw new Error(result.data.error || 'Erreur inconnue');
            }

            onSave();
            onClose();
        } catch (err) {
            console.error('[ProjectModal] Error:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div 
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={onClose}
            />

            <div className="relative w-full max-w-2xl mx-4 bg-baikal-surface border border-baikal-border rounded-lg shadow-xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between px-6 py-4 border-b border-baikal-border sticky top-0 bg-baikal-surface z-10">
                    <h2 className="text-lg font-mono font-semibold text-white">
                        {isEdit ? 'MODIFIER_PROJET' : 'NOUVEAU_PROJET'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 text-baikal-text hover:text-white hover:bg-baikal-bg rounded-md transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {error && (
                        <div className="p-3 bg-red-900/20 border border-red-500/50 rounded-md flex items-center gap-2 text-red-300 text-sm">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {error}
                        </div>
                    )}

                    {/* SECTION: Informations générales */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-mono font-semibold text-baikal-cyan uppercase">
                            Informations générales
                        </h3>

                        <div>
                            <label className="block text-sm font-mono text-baikal-text mb-2">
                                Nom du projet *
                            </label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => {
                                    setFormData({ ...formData, name: e.target.value });
                                    if (error) setError(null);
                                }}
                                placeholder="Mon Projet"
                                required
                                className="w-full px-4 py-2.5 bg-baikal-bg border border-baikal-border rounded-md text-white placeholder-baikal-text/50 focus:outline-none focus:border-baikal-cyan transition-colors"
                            />
                        </div>

                        {!isEdit && organizations.length > 0 && (
                            <div>
                                <label className="block text-sm font-mono text-baikal-text mb-2">
                                    Organisation
                                </label>
                                <select
                                    value={formData.org_id}
                                    onChange={(e) => setFormData({ ...formData, org_id: e.target.value })}
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
                        )}
                    </div>

                    {/* SECTION: Identité Projet (PHASE 2 - SIMPLIFIÉ) */}
                    <div className="space-y-4 pt-4 border-t border-baikal-border">
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-mono font-semibold text-baikal-cyan uppercase">
                                Identité du Projet
                            </h3>
                            <span className="text-xs text-baikal-text font-mono">
                                (obligatoire pour personnaliser les réponses)
                            </span>
                        </div>

                        {/* Type de marché */}
                        <div>
                            <label className="block text-sm font-mono text-baikal-text mb-2">
                                Type de marché *
                            </label>
                            <select
                                value={formData.identity.market_type}
                                onChange={(e) => handleIdentityChange('market_type', e.target.value)}
                                className={`w-full px-4 py-2.5 bg-baikal-bg border rounded-md text-white focus:outline-none focus:border-baikal-cyan transition-colors ${
                                    identityErrors.market_type ? 'border-red-500' : 'border-baikal-border'
                                }`}
                            >
                                <option value="">-- Sélectionner --</option>
                                <option value="public">Marché Public</option>
                                <option value="prive">Marché Privé</option>
                            </select>
                            {identityErrors.market_type && (
                                <p className="text-xs text-red-400 mt-1">{identityErrors.market_type}</p>
                            )}
                        </div>

                        {/* Type de projet */}
                        <div>
                            <label className="block text-sm font-mono text-baikal-text mb-2">
                                Type de projet *
                            </label>
                            <select
                                value={formData.identity.project_type}
                                onChange={(e) => handleIdentityChange('project_type', e.target.value)}
                                className={`w-full px-4 py-2.5 bg-baikal-bg border rounded-md text-white focus:outline-none focus:border-baikal-cyan transition-colors ${
                                    identityErrors.project_type ? 'border-red-500' : 'border-baikal-border'
                                }`}
                            >
                                <option value="">-- Sélectionner --</option>
                                <option value="entreprise_generale">Entreprise Générale</option>
                                <option value="macro_lot">Macro-Lot</option>
                                <option value="gros_oeuvre">Gros-Œuvre</option>
                                <option value="lots_techniques">Lots Techniques</option>
                                <option value="lots_architecturaux">Lots Architecturaux</option>
                            </select>
                            {identityErrors.project_type && (
                                <p className="text-xs text-red-400 mt-1">{identityErrors.project_type}</p>
                            )}
                        </div>

                        {/* Description projet */}
                        <div>
                            <label className="block text-sm font-mono text-baikal-text mb-2">
                                Description du projet *
                            </label>
                            <textarea
                                value={formData.identity.description}
                                onChange={(e) => handleIdentityChange('description', e.target.value)}
                                placeholder="Ex: École primaire 12 classes, ZAC des Lilas, construction neuve R+2, livraison Q3 2026, surface 2500m²..."
                                rows={4}
                                className={`w-full px-4 py-2.5 bg-baikal-bg border rounded-md text-white placeholder-baikal-text/50 focus:outline-none focus:border-baikal-cyan transition-colors resize-none ${
                                    identityErrors.description ? 'border-red-500' : 'border-baikal-border'
                                }`}
                            />
                            {identityErrors.description && (
                                <p className="text-xs text-red-400 mt-1">{identityErrors.description}</p>
                            )}
                            <p className="text-xs text-baikal-text/60 mt-1">
                                Cette description sera utilisée pour contextualiser les réponses de BAIKAL
                            </p>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-baikal-border">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={loading}
                            className="px-4 py-2 bg-baikal-surface text-white font-medium rounded-md hover:bg-baikal-border transition-colors font-mono disabled:opacity-50"
                        >
                            ANNULER
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-baikal-cyan text-black font-medium rounded-md hover:bg-baikal-cyan/90 transition-colors font-mono disabled:opacity-50"
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
 * Modal de gestion des membres du projet
 */
function ProjectMembersModal({ isOpen, onClose, project, onUpdate }) {
    const [members, setMembers] = useState([]);
    const [availableUsers, setAvailableUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    
    const [showAddForm, setShowAddForm] = useState(false);
    const [selectedUserId, setSelectedUserId] = useState('');
    const [selectedRole, setSelectedRole] = useState('member');
    const [addingMember, setAddingMember] = useState(false);

    useEffect(() => {
        if (isOpen && project) {
            loadData();
        }
    }, [isOpen, project]);

    const loadData = async () => {
        setLoading(true);
        setError(null);

        try {
            const membersResult = await projectsService.getProjectMembers(project.id);

            if (membersResult.error) {
                throw new Error(membersResult.error.message || membersResult.error);
            }

            const projectMembers = membersResult.data || [];
            setMembers(projectMembers);

            if (project.org_id) {
                const usersResult = await usersService.getUsersForAdmin({
                    orgId: project.org_id,
                });

                if (usersResult.data) {
                    const users = usersResult.data?.users || usersResult.data || [];
                    const memberIds = projectMembers.map(m => m.user_id || m.id);
                    const available = users.filter(u => !memberIds.includes(u.id));
                    setAvailableUsers(available);
                }
            }
        } catch (err) {
            console.error('[ProjectMembersModal] Error:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAddMember = async () => {
        if (!selectedUserId) return;

        setAddingMember(true);
        setError(null);

        try {
            const result = await projectsService.assignUserToProject(
                project.id,
                selectedUserId,
                selectedRole
            );

            if (result.error) {
                throw new Error(result.error.message || result.error);
            }

            if (result.data?.success === false) {
                throw new Error(result.data.error || 'Erreur lors de l\'ajout');
            }

            await loadData();
            setShowAddForm(false);
            setSelectedUserId('');
            setSelectedRole('member');
            onUpdate();
        } catch (err) {
            console.error('[ProjectMembersModal] Error adding:', err);
            setError(err.message);
        } finally {
            setAddingMember(false);
        }
    };

    const handleRemoveMember = async (userId) => {
        try {
            const result = await projectsService.removeUserFromProject(project.id, userId);

            if (result.error) {
                throw new Error(result.error.message || result.error);
            }

            if (result.data?.success === false) {
                throw new Error(result.data.error || 'Erreur lors du retrait');
            }

            await loadData();
            onUpdate();
        } catch (err) {
            console.error('[ProjectMembersModal] Error removing:', err);
            setError(err.message);
        }
    };

    if (!isOpen || !project) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div 
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={onClose}
            />

            <div className="relative w-full max-w-2xl mx-4 bg-baikal-surface border border-baikal-border rounded-lg shadow-xl max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 border-b border-baikal-border">
                    <div>
                        <h2 className="text-lg font-mono font-semibold text-white">
                            MEMBRES_DU_PROJET
                        </h2>
                        <p className="text-sm text-baikal-text">{project.name}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-baikal-text hover:text-white hover:bg-baikal-bg rounded-md transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {error && (
                        <div className="p-3 bg-red-900/20 border border-red-500/50 rounded-md flex items-center gap-2 text-red-300 text-sm">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {error}
                        </div>
                    )}

                    {!showAddForm && availableUsers.length > 0 && (
                        <button
                            onClick={() => setShowAddForm(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-baikal-cyan text-black font-medium rounded-md hover:bg-baikal-cyan/90 transition-colors font-mono"
                        >
                            <UserPlus className="w-4 h-4" />
                            AJOUTER_MEMBRE
                        </button>
                    )}

                    {showAddForm && (
                        <div className="p-4 bg-baikal-bg border border-baikal-border rounded-md space-y-4">
                            <h3 className="text-sm font-mono text-white">Ajouter un membre</h3>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-mono text-baikal-text mb-1">
                                        Utilisateur
                                    </label>
                                    <select
                                        value={selectedUserId}
                                        onChange={(e) => setSelectedUserId(e.target.value)}
                                        className="w-full px-3 py-2 bg-baikal-surface border border-baikal-border rounded-md text-white text-sm focus:outline-none focus:border-baikal-cyan"
                                    >
                                        <option value="">-- Sélectionner --</option>
                                        {availableUsers.map((user) => (
                                            <option key={user.id} value={user.id}>
                                                {user.full_name || user.email}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-mono text-baikal-text mb-1">
                                        Rôle
                                    </label>
                                    <select
                                        value={selectedRole}
                                        onChange={(e) => setSelectedRole(e.target.value)}
                                        className="w-full px-3 py-2 bg-baikal-surface border border-baikal-border rounded-md text-white text-sm focus:outline-none focus:border-baikal-cyan"
                                    >
                                        {PROJECT_ROLES.map((role) => (
                                            <option key={role.value} value={role.value}>
                                                {role.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleAddMember}
                                    disabled={!selectedUserId || addingMember}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-baikal-cyan text-black text-sm font-medium rounded hover:bg-baikal-cyan/90 disabled:opacity-50 transition-colors font-mono"
                                >
                                    {addingMember ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Check className="w-4 h-4" />
                                    )}
                                    AJOUTER
                                </button>
                                <button
                                    onClick={() => { setShowAddForm(false); setSelectedUserId(''); }}
                                    className="px-3 py-1.5 text-sm text-baikal-text hover:text-white transition-colors font-mono"
                                >
                                    ANNULER
                                </button>
                            </div>
                        </div>
                    )}

                    {loading && (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-6 h-6 text-baikal-cyan animate-spin" />
                        </div>
                    )}

                    {!loading && members.length === 0 && (
                        <div className="text-center py-8">
                            <Users className="w-10 h-10 text-baikal-text mx-auto mb-3" />
                            <p className="text-baikal-text">Aucun membre dans ce projet</p>
                        </div>
                    )}

                    {!loading && members.length > 0 && (
                        <div className="space-y-2">
                            {members.map((member) => (
                                <div
                                    key={member.user_id || member.id}
                                    className="flex items-center justify-between p-3 bg-baikal-bg rounded-md"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-baikal-cyan/20 text-baikal-cyan rounded-full flex items-center justify-center font-mono font-bold text-sm">
                                            {(member.full_name || member.email || '??')
                                                .split(' ')
                                                .map(n => n[0])
                                                .join('')
                                                .toUpperCase()
                                                .slice(0, 2)}
                                        </div>
                                        <div>
                                            <p className="text-white font-medium">
                                                {member.full_name || 'Sans nom'}
                                            </p>
                                            <p className="text-xs text-baikal-text">
                                                {member.email}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <ProjectRoleBadge role={member.project_role || member.role} />
                                        <button
                                            onClick={() => handleRemoveMember(member.user_id || member.id)}
                                            className="p-1.5 text-baikal-text hover:text-red-400 hover:bg-red-900/20 rounded transition-colors"
                                            title="Retirer du projet"
                                        >
                                            <UserMinus className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="px-6 py-4 border-t border-baikal-border bg-baikal-bg/30">
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-baikal-text font-mono">
                            {members.length} membre{members.length > 1 ? 's' : ''}
                        </span>
                        <button
                            onClick={onClose}
                            className="px-4 py-2 bg-baikal-surface text-white font-medium rounded-md hover:bg-baikal-border transition-colors font-mono"
                        >
                            FERMER
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * Modal de confirmation de suppression
 */
function DeleteConfirmModal({ isOpen, onClose, project, onConfirm }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [confirmText, setConfirmText] = useState('');

    useEffect(() => {
        if (isOpen) {
            setConfirmText('');
            setError(null);
        }
    }, [isOpen]);

    const handleConfirm = async () => {
        setLoading(true);
        setError(null);

        try {
            const result = await projectsService.deleteProject(project.id, true);

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

    if (!isOpen || !project) return null;

    const canDelete = confirmText.toLowerCase() === project.name.toLowerCase();

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div 
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={onClose}
            />

            <div className="relative w-full max-w-md mx-4 bg-baikal-surface border border-red-500/50 rounded-lg shadow-xl">
                <div className="flex items-center gap-3 px-6 py-4 border-b border-baikal-border bg-red-900/20">
                    <div className="p-2 bg-red-500/20 rounded-md">
                        <Trash2 className="w-5 h-5 text-red-400" />
                    </div>
                    <h2 className="text-lg font-mono font-semibold text-red-400">
                        SUPPRIMER_PROJET
                    </h2>
                </div>

                <div className="p-6 space-y-4">
                    <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-md">
                        <p className="text-sm text-red-300">
                            <strong>Attention !</strong> Cette action est irréversible.
                        </p>
                        <p className="text-sm text-red-300 mt-2">
                            Le projet <strong className="font-mono">{project.name}</strong> sera 
                            définitivement supprimé. Les membres ne seront plus associés à ce projet.
                        </p>
                    </div>

                    {error && (
                        <div className="p-3 bg-red-900/20 border border-red-500/50 rounded-md flex items-center gap-2 text-red-300 text-sm">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {error}
                        </div>
                    )}

                    <div>
                        <label className="block text-sm text-baikal-text mb-2">
                            Tapez <span className="font-mono text-white">{project.name}</span> pour confirmer
                        </label>
                        <input
                            type="text"
                            value={confirmText}
                            onChange={(e) => setConfirmText(e.target.value)}
                            placeholder={project.name}
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

export default function Projects() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { isSuperAdmin, isOrgAdmin, profile } = useAuth();

    const [projects, setProjects] = useState([]);
    const [organizations, setOrganizations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [orgFilter, setOrgFilter] = useState('');

    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingProject, setEditingProject] = useState(null);
    const [managingMembers, setManagingMembers] = useState(null);
    const [deletingProject, setDeletingProject] = useState(null);

    useEffect(() => {
        if (searchParams.get('action') === 'create') {
            setShowCreateModal(true);
            setSearchParams({});
        }
    }, [searchParams, setSearchParams]);

    useEffect(() => {
        async function loadOrganizations() {
            if (!isSuperAdmin) return;

            try {
                const result = await organizationService.getOrganizations({ includeInactive: false });
                if (result.data?.organizations) {
                    setOrganizations(result.data.organizations);
                } else if (Array.isArray(result.data)) {
                    setOrganizations(result.data);
                }
            } catch (err) {
                console.error('[Projects] Error loading organizations:', err);
            }
        }
        loadOrganizations();
    }, [isSuperAdmin]);

    const loadProjects = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const params = {
                orgId: isSuperAdmin ? (orgFilter || null) : profile?.org_id,
                includeArchived: statusFilter === 'archived' || statusFilter === 'all',
                search: search.trim() || null,
            };

            const result = await projectsService.getProjects(params);

            if (result.error) {
                throw new Error(result.error.message || result.error);
            }

            let data = result.data || [];

            if (statusFilter !== 'all') {
                data = data.filter(p => p.status === statusFilter);
            }

            setProjects(data);
        } catch (err) {
            console.error('[Projects] Error loading:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [isSuperAdmin, orgFilter, statusFilter, search, profile?.org_id]);

    useEffect(() => {
        loadProjects();
    }, [loadProjects]);

    const handleEdit = (project) => {
        setEditingProject(project);
    };

    const handleManageMembers = (project) => {
        setManagingMembers(project);
    };

    const handleArchive = async (project) => {
        try {
            const result = await projectsService.updateProject(project.id, {
                status: 'archived',
            });

            if (result.error) {
                throw new Error(result.error.message || result.error);
            }

            loadProjects();
        } catch (err) {
            console.error('[Projects] Error archiving:', err);
            setError(err.message);
        }
    };

    const handleReactivate = async (project) => {
        try {
            const result = await projectsService.updateProject(project.id, {
                status: 'active',
            });

            if (result.error) {
                throw new Error(result.error.message || result.error);
            }

            loadProjects();
        } catch (err) {
            console.error('[Projects] Error reactivating:', err);
            setError(err.message);
        }
    };

    const handleDelete = (project) => {
        setDeletingProject(project);
    };

    const handleSave = () => {
        loadProjects();
    };

    const handleMembersUpdate = () => {
        loadProjects();
    };

    const handleDeleteConfirm = () => {
        loadProjects();
    };

    const defaultOrgId = !isSuperAdmin ? profile?.org_id : '';

    return (
        <div className="min-h-screen bg-baikal-bg">
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
                                    <FolderOpen className="w-5 h-5 text-baikal-cyan" />
                                </div>
                                <div>
                                    <h1 className="text-lg font-mono font-bold text-white">
                                        PROJETS
                                    </h1>
                                    <p className="text-xs text-baikal-text font-mono">
                                        Gestion des projets
                                    </p>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-baikal-cyan text-black font-medium rounded-md hover:bg-baikal-cyan/90 transition-colors font-mono"
                        >
                            <Plus className="w-4 h-4" />
                            NOUVEAU_PROJET
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-baikal-text" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Rechercher un projet..."
                            className="w-full pl-10 pr-4 py-2.5 bg-baikal-surface border border-baikal-border rounded-md text-white placeholder-baikal-text/50 focus:outline-none focus:border-baikal-cyan transition-colors"
                        />
                    </div>

                    <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0">
                        {STATUS_FILTERS.map((filter) => (
                            <button
                                key={filter.value}
                                onClick={() => setStatusFilter(filter.value)}
                                className={`
                                    px-3 py-1.5 rounded text-sm font-mono whitespace-nowrap transition-colors
                                    ${statusFilter === filter.value
                                        ? 'bg-baikal-cyan text-black'
                                        : 'bg-baikal-surface text-baikal-text hover:text-white border border-baikal-border'
                                    }
                                `}
                            >
                                {filter.label}
                            </button>
                        ))}
                    </div>

                    {isSuperAdmin && organizations.length > 0 && (
                        <select
                            value={orgFilter}
                            onChange={(e) => setOrgFilter(e.target.value)}
                            className="px-4 py-2 bg-baikal-surface border border-baikal-border rounded-md text-white focus:outline-none focus:border-baikal-cyan transition-colors"
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

                {error && (
                    <div className="mb-6 p-4 bg-red-900/20 border border-red-500/50 rounded-md flex items-center gap-3 text-red-300">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        <p className="font-mono">{error}</p>
                        <button
                            onClick={loadProjects}
                            className="ml-auto text-sm font-medium hover:underline font-mono"
                        >
                            RÉESSAYER
                        </button>
                    </div>
                )}

                {loading && (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 text-baikal-cyan animate-spin" />
                    </div>
                )}

                {!loading && projects.length === 0 && (
                    <div className="bg-baikal-surface border border-baikal-border rounded-md p-12 text-center">
                        <FolderOpen className="w-12 h-12 text-baikal-text mx-auto mb-4" />
                        <h3 className="text-lg font-mono font-medium text-white mb-2">
                            AUCUN_PROJET
                        </h3>
                        <p className="text-baikal-text mb-6">
                            {search || statusFilter !== 'all'
                                ? 'Aucun projet ne correspond à vos critères.'
                                : 'Créez votre premier projet pour commencer.'
                            }
                        </p>
                        {!search && statusFilter === 'all' && (
                            <button
                                onClick={() => setShowCreateModal(true)}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-baikal-cyan text-black font-medium rounded-md hover:bg-baikal-cyan/90 transition-colors font-mono"
                            >
                                <Plus className="w-4 h-4" />
                                CRÉER_PROJET
                            </button>
                        )}
                    </div>
                )}

                {!loading && projects.length > 0 && (
                    <div className="bg-baikal-surface border border-baikal-border rounded-md overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-baikal-bg/50 border-b border-baikal-border">
                                        <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-baikal-text uppercase tracking-wider">
                                            Projet
                                        </th>
                                        {isSuperAdmin && (
                                            <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-baikal-text uppercase tracking-wider">
                                                Organisation
                                            </th>
                                        )}
                                        <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-baikal-text uppercase tracking-wider">
                                            Membres
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-baikal-text uppercase tracking-wider">
                                            Statut
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-baikal-text uppercase tracking-wider">
                                            Créé le
                                        </th>
                                        <th className="px-4 py-3 text-right text-xs font-mono font-semibold text-baikal-text uppercase tracking-wider">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {projects.map((project) => (
                                        <ProjectRow
                                            key={project.id}
                                            project={project}
                                            showOrg={isSuperAdmin}
                                            onEdit={handleEdit}
                                            onManageMembers={handleManageMembers}
                                            onArchive={handleArchive}
                                            onReactivate={handleReactivate}
                                            onDelete={handleDelete}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="px-4 py-3 bg-baikal-bg/30 border-t border-baikal-border text-sm text-baikal-text font-mono">
                            {projects.length} projet{projects.length > 1 ? 's' : ''}
                        </div>
                    </div>
                )}
            </main>

            <ProjectModal
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                project={null}
                organizations={isSuperAdmin ? organizations : []}
                defaultOrgId={defaultOrgId}
                onSave={handleSave}
            />

            <ProjectModal
                isOpen={!!editingProject}
                onClose={() => setEditingProject(null)}
                project={editingProject}
                organizations={isSuperAdmin ? organizations : []}
                defaultOrgId={defaultOrgId}
                onSave={handleSave}
            />

            <ProjectMembersModal
                isOpen={!!managingMembers}
                onClose={() => setManagingMembers(null)}
                project={managingMembers}
                onUpdate={handleMembersUpdate}
            />

            <DeleteConfirmModal
                isOpen={!!deletingProject}
                onClose={() => setDeletingProject(null)}
                project={deletingProject}
                onConfirm={handleDeleteConfirm}
            />
        </div>
    );
}
