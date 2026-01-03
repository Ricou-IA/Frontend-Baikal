/**
 * Invitations.jsx - Baikal Console
 * ============================================================================
 * Page de gestion des invitations (codes d'invitation).
 * 
 * Fonctionnalités :
 * - Liste des invitations avec filtres (statut, org)
 * - Création d'invitation avec options avancées
 * - Copie du lien d'invitation
 * - Révocation d'invitation
 * - Affichage des utilisations
 * 
 * Route : /admin/invitations
 * Accès : super_admin (toutes orgs) / org_admin (son org)
 * 
 * CORRECTIONS 17/12/2025:
 * - Suppression du champ "Rôle business"
 * - super_admin peut inviter: org_admin, team_leader, user
 * - org_admin peut inviter: team_leader, user
 * - Correction affichage org_name
 * 
 * CORRECTIONS 03/01/2026:
 * - État vide : titre dynamique selon le filtre actif
 * - État vide : suppression description et bouton (redondant avec header)
 * ============================================================================
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { invitationsService, organizationService } from '../../services';
import {
    Mail,
    Plus,
    Search,
    Filter,
    Copy,
    Check,
    Trash2,
    Users,
    Clock,
    AlertCircle,
    Loader2,
    X,
    ChevronLeft,
    ExternalLink,
    Calendar,
    UserPlus,
    Building2,
    Link as LinkIcon,
    Eye,
    Ban,
    CheckCircle2,
    XCircle,
    AlertTriangle,
} from 'lucide-react';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Rôles disponibles pour les invitations
 * Filtrés dynamiquement selon le rôle de l'utilisateur connecté
 */
const ALL_APP_ROLES = [
    { value: 'org_admin', label: 'Admin Organisation', description: 'Administrateur de l\'organisation', forSuperAdminOnly: true },
    { value: 'team_leader', label: 'Team Leader', description: 'Chef de projet' },
    { value: 'user', label: 'User', description: 'Membre standard' },
];

const STATUS_FILTERS = [
    { value: 'all', label: 'Toutes' },
    { value: 'active', label: 'Actives' },
    { value: 'expired', label: 'Expirées' },
    { value: 'exhausted', label: 'Épuisées' },
    { value: 'revoked', label: 'Révoquées' },
];

/**
 * Titres pour l'état vide selon le filtre actif
 */
const EMPTY_STATE_TITLES = {
    all: 'AUCUNE_INVITATION',
    active: 'AUCUNE_INVITATION_ACTIVE',
    expired: 'AUCUNE_INVITATION_EXPIRÉE',
    exhausted: 'AUCUNE_INVITATION_ÉPUISÉE',
    revoked: 'AUCUNE_INVITATION_RÉVOQUÉE',
};

// ============================================================================
// UTILITAIRES
// ============================================================================

/**
 * Génère l'URL d'invitation complète
 */
function getInvitationUrl(code) {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    return `${baseUrl}/login?invite=${code}`;
}

/**
 * Calcule le statut d'une invitation
 */
function getInvitationStatus(invitation) {
    if (!invitation.is_active) {
        return 'revoked';
    }
    if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
        return 'expired';
    }
    if (invitation.max_uses && invitation.use_count >= invitation.max_uses) {
        return 'exhausted';
    }
    return 'active';
}

/**
 * Formate une date relative
 */
function formatRelativeDate(dateStr) {
    if (!dateStr) return 'Jamais';
    
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = date - now;
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
        return `Expiré il y a ${Math.abs(diffDays)} jour${Math.abs(diffDays) > 1 ? 's' : ''}`;
    } else if (diffDays === 0) {
        return "Expire aujourd'hui";
    } else if (diffDays === 1) {
        return 'Expire demain';
    } else {
        return `Expire dans ${diffDays} jours`;
    }
}

/**
 * Retourne les rôles disponibles selon le rôle de l'utilisateur
 */
function getAvailableRoles(isSuperAdmin) {
    if (isSuperAdmin) {
        return ALL_APP_ROLES;
    }
    // org_admin ne peut pas inviter d'org_admin
    return ALL_APP_ROLES.filter(role => !role.forSuperAdminOnly);
}

// ============================================================================
// COMPOSANTS INTERNES
// ============================================================================

/**
 * Badge de statut d'invitation
 */
function StatusBadge({ status }) {
    const config = {
        active: {
            icon: CheckCircle2,
            label: 'Active',
            className: 'bg-green-500/20 text-green-400',
        },
        expired: {
            icon: Clock,
            label: 'Expirée',
            className: 'bg-amber-500/20 text-amber-400',
        },
        exhausted: {
            icon: Users,
            label: 'Épuisée',
            className: 'bg-blue-500/20 text-blue-400',
        },
        revoked: {
            icon: XCircle,
            label: 'Révoquée',
            className: 'bg-red-500/20 text-red-400',
        },
    };

    const { icon: Icon, label, className } = config[status] || config.active;

    return (
        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono ${className}`}>
            <Icon className="w-3 h-3" />
            {label.toUpperCase()}
        </span>
    );
}

/**
 * Bouton copier avec feedback
 */
function CopyButton({ text, label = 'Copier' }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    return (
        <button
            onClick={handleCopy}
            className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-mono transition-colors
                ${copied 
                    ? 'bg-green-500/20 text-green-400' 
                    : 'bg-baikal-bg text-baikal-text hover:text-white hover:bg-baikal-surface'
                }
            `}
        >
            {copied ? (
                <>
                    <Check className="w-3.5 h-3.5" />
                    Copié !
                </>
            ) : (
                <>
                    <Copy className="w-3.5 h-3.5" />
                    {label}
                </>
            )}
        </button>
    );
}

/**
 * Ligne du tableau invitation
 */
function InvitationRow({ invitation, onCopyLink, onRevoke, showOrg = true }) {
    const status = getInvitationStatus(invitation);
    const isActive = status === 'active';

    return (
        <tr className="border-b border-baikal-border hover:bg-baikal-surface/50 transition-colors">
            {/* Code & Label */}
            <td className="px-4 py-4">
                <div>
                    <p className="font-mono text-white text-sm">{invitation.code}</p>
                    {invitation.label && (
                        <p className="text-xs text-baikal-text mt-0.5">{invitation.label}</p>
                    )}
                </div>
            </td>

            {/* Organisation */}
            {showOrg && (
                <td className="px-4 py-4">
                    <div className="flex items-center gap-2 text-baikal-text">
                        <Building2 className="w-4 h-4" />
                        <span className="text-sm">{invitation.organization?.name || invitation.org_name || '-'}</span>
                    </div>
                </td>
            )}

            {/* Utilisations */}
            <td className="px-4 py-4">
                <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-baikal-text" />
                    <span className="font-mono text-white">
                        {invitation.use_count || 0}
                        <span className="text-baikal-text">
                            /{invitation.max_uses || '∞'}
                        </span>
                    </span>
                </div>
            </td>

            {/* Expiration */}
            <td className="px-4 py-4">
                <div className="text-sm">
                    {invitation.expires_at ? (
                        <span className={status === 'expired' ? 'text-amber-400' : 'text-baikal-text'}>
                            {formatRelativeDate(invitation.expires_at)}
                        </span>
                    ) : (
                        <span className="text-baikal-text">Sans expiration</span>
                    )}
                </div>
            </td>

            {/* Rôle */}
            <td className="px-4 py-4">
                <span className="text-xs font-mono text-violet-400">
                    {invitation.default_app_role || 'user'}
                </span>
            </td>

            {/* Statut */}
            <td className="px-4 py-4">
                <StatusBadge status={status} />
            </td>

            {/* Actions */}
            <td className="px-4 py-4">
                <div className="flex items-center justify-end gap-2">
                    {isActive && (
                        <CopyButton 
                            text={getInvitationUrl(invitation.code)} 
                            label="Lien"
                        />
                    )}
                    {isActive && (
                        <button
                            onClick={() => onRevoke(invitation)}
                            className="p-2 text-baikal-text hover:text-red-400 hover:bg-red-900/20 rounded-md transition-colors"
                            title="Révoquer"
                        >
                            <Ban className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </td>
        </tr>
    );
}

/**
 * Modal de création d'invitation
 */
function CreateInvitationModal({ isOpen, onClose, organizations, defaultOrgId, onCreated, isSuperAdmin }) {
    const availableRoles = getAvailableRoles(isSuperAdmin);
    
    const [formData, setFormData] = useState({
        org_id: defaultOrgId || '',
        label: '',
        max_uses: '',
        expires_in_days: '7',
        default_app_role: 'user',
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [createdInvitation, setCreatedInvitation] = useState(null);

    // Reset form when modal opens
    useEffect(() => {
        if (isOpen) {
            setFormData({
                org_id: defaultOrgId || '',
                label: '',
                max_uses: '',
                expires_in_days: '7',
                default_app_role: 'user',
            });
            setError(null);
            setCreatedInvitation(null);
        }
    }, [isOpen, defaultOrgId]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const result = await invitationsService.createInvitation({
                orgId: formData.org_id || null,
                label: formData.label.trim() || null,
                maxUses: formData.max_uses ? parseInt(formData.max_uses, 10) : null,
                expiresInDays: formData.expires_in_days ? parseInt(formData.expires_in_days, 10) : null,
                defaultAppRole: formData.default_app_role || 'user',
            });

            if (result.error) {
                throw new Error(result.error.message || result.error);
            }

            if (result.data?.success === false) {
                throw new Error(result.data.error || 'Erreur lors de la création');
            }

            // Afficher l'invitation créée
            setCreatedInvitation(result.data);
            onCreated();
        } catch (err) {
            console.error('[CreateInvitationModal] Error:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    // Vue "Invitation créée"
    if (createdInvitation) {
        const invitationUrl = getInvitationUrl(createdInvitation.code);

        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
                <div 
                    className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                    onClick={onClose}
                />

                <div className="relative w-full max-w-lg mx-4 bg-baikal-surface border border-green-500/50 rounded-lg shadow-xl">
                    {/* Header */}
                    <div className="flex items-center gap-3 px-6 py-4 border-b border-baikal-border bg-green-900/20">
                        <div className="p-2 bg-green-500/20 rounded-md">
                            <CheckCircle2 className="w-5 h-5 text-green-400" />
                        </div>
                        <h2 className="text-lg font-mono font-semibold text-green-400">
                            INVITATION_CRÉÉE
                        </h2>
                    </div>

                    {/* Content */}
                    <div className="p-6 space-y-4">
                        {/* Code */}
                        <div>
                            <label className="block text-sm font-mono text-baikal-text mb-2">
                                Code d'invitation
                            </label>
                            <div className="flex items-center gap-2">
                                <code className="flex-1 px-4 py-3 bg-baikal-bg border border-baikal-border rounded-md text-lg font-mono text-baikal-cyan">
                                    {createdInvitation.code}
                                </code>
                                <CopyButton text={createdInvitation.code} label="Code" />
                            </div>
                        </div>

                        {/* URL */}
                        <div>
                            <label className="block text-sm font-mono text-baikal-text mb-2">
                                Lien d'inscription
                            </label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={invitationUrl}
                                    readOnly
                                    className="flex-1 px-4 py-2.5 bg-baikal-bg border border-baikal-border rounded-md text-sm font-mono text-white"
                                />
                                <CopyButton text={invitationUrl} label="Lien" />
                            </div>
                        </div>

                        {/* Info */}
                        <div className="p-4 bg-baikal-bg/50 border border-baikal-border rounded-md">
                            <h4 className="text-sm font-mono text-white mb-2">Récapitulatif</h4>
                            <ul className="text-sm text-baikal-text space-y-1">
                                {createdInvitation.org_name && (
                                    <li>Organisation : <span className="text-white">{createdInvitation.org_name}</span></li>
                                )}
                                {createdInvitation.label && (
                                    <li>Label : <span className="text-white">{createdInvitation.label}</span></li>
                                )}
                                <li>
                                    Utilisations : <span className="text-white">
                                        {createdInvitation.max_uses || 'Illimitées'}
                                    </span>
                                </li>
                                <li>
                                    Expiration : <span className="text-white">
                                        {createdInvitation.expires_at 
                                            ? new Date(createdInvitation.expires_at).toLocaleDateString('fr-FR')
                                            : 'Sans expiration'
                                        }
                                    </span>
                                </li>
                                <li>
                                    Rôle : <span className="text-violet-400 font-mono">
                                        {createdInvitation.default_app_role}
                                    </span>
                                </li>
                            </ul>
                        </div>

                        {/* Actions */}
                        <div className="flex justify-end pt-2">
                            <button
                                onClick={onClose}
                                className="px-4 py-2 bg-baikal-cyan text-black font-medium rounded-md hover:bg-baikal-cyan/90 transition-colors font-mono"
                            >
                                FERMER
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Vue formulaire
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div 
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={onClose}
            />

            <div className="relative w-full max-w-lg mx-4 bg-baikal-surface border border-baikal-border rounded-lg shadow-xl max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-baikal-border sticky top-0 bg-baikal-surface">
                    <h2 className="text-lg font-mono font-semibold text-white">
                        NOUVELLE_INVITATION
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

                    {/* Organisation */}
                    {organizations.length > 0 && (
                        <div>
                            <label className="block text-sm font-mono text-baikal-text mb-2">
                                Organisation cible *
                            </label>
                            <select
                                value={formData.org_id}
                                onChange={(e) => setFormData({ ...formData, org_id: e.target.value })}
                                required
                                className="w-full px-4 py-2.5 bg-baikal-bg border border-baikal-border rounded-md text-white focus:outline-none focus:border-baikal-cyan transition-colors"
                            >
                                <option value="">-- Sélectionner une organisation --</option>
                                {organizations.map((org) => (
                                    <option key={org.id} value={org.id}>
                                        {org.name}
                                    </option>
                                ))}
                            </select>
                            <p className="mt-1 text-xs text-baikal-text">
                                L'utilisateur sera ajouté à cette organisation
                            </p>
                        </div>
                    )}

                    {/* Label */}
                    <div>
                        <label className="block text-sm font-mono text-baikal-text mb-2">
                            Label (optionnel)
                        </label>
                        <input
                            type="text"
                            value={formData.label}
                            onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                            placeholder="Ex: Recrutement Mars 2025"
                            className="w-full px-4 py-2.5 bg-baikal-bg border border-baikal-border rounded-md text-white placeholder-baikal-text/50 focus:outline-none focus:border-baikal-cyan transition-colors"
                        />
                    </div>

                    {/* Max uses & Expiration */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-mono text-baikal-text mb-2">
                                Max utilisations
                            </label>
                            <input
                                type="number"
                                min="1"
                                value={formData.max_uses}
                                onChange={(e) => setFormData({ ...formData, max_uses: e.target.value })}
                                placeholder="Illimité"
                                className="w-full px-4 py-2.5 bg-baikal-bg border border-baikal-border rounded-md text-white placeholder-baikal-text/50 focus:outline-none focus:border-baikal-cyan transition-colors"
                            />
                            <p className="mt-1 text-xs text-baikal-text">
                                Vide = illimité
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-mono text-baikal-text mb-2">
                                Expire dans (jours)
                            </label>
                            <input
                                type="number"
                                min="1"
                                value={formData.expires_in_days}
                                onChange={(e) => setFormData({ ...formData, expires_in_days: e.target.value })}
                                placeholder="Sans expiration"
                                className="w-full px-4 py-2.5 bg-baikal-bg border border-baikal-border rounded-md text-white placeholder-baikal-text/50 focus:outline-none focus:border-baikal-cyan transition-colors"
                            />
                            <p className="mt-1 text-xs text-baikal-text">
                                Vide = sans expiration
                            </p>
                        </div>
                    </div>

                    {/* Rôle app */}
                    <div>
                        <label className="block text-sm font-mono text-baikal-text mb-2">
                            Rôle attribué
                        </label>
                        <select
                            value={formData.default_app_role}
                            onChange={(e) => setFormData({ ...formData, default_app_role: e.target.value })}
                            className="w-full px-4 py-2.5 bg-baikal-bg border border-baikal-border rounded-md text-white focus:outline-none focus:border-baikal-cyan transition-colors"
                        >
                            {availableRoles.map((role) => (
                                <option key={role.value} value={role.value}>
                                    {role.label} - {role.description}
                                </option>
                            ))}
                        </select>
                        <p className="mt-1 text-xs text-baikal-text">
                            Tous les utilisateurs utilisant ce code auront ce rôle
                        </p>
                    </div>

                    {/* Info */}
                    <div className="p-3 bg-baikal-bg/50 border border-baikal-border rounded-md">
                        <p className="text-xs text-baikal-text">
                            <strong className="text-white">Note :</strong> Le code d'invitation sera 
                            généré automatiquement. L'utilisateur pourra s'inscrire via le lien 
                            <code className="mx-1 px-1 bg-baikal-surface rounded text-baikal-cyan">/login?invite=CODE</code>
                        </p>
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
                            disabled={loading || (organizations.length > 0 && !formData.org_id)}
                            className="flex items-center gap-2 px-4 py-2 bg-baikal-cyan text-black font-medium rounded-md hover:bg-baikal-cyan/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-mono"
                        >
                            {loading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Plus className="w-4 h-4" />
                            )}
                            CRÉER
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

/**
 * Modal de confirmation de révocation
 */
function RevokeConfirmModal({ isOpen, onClose, invitation, onConfirm }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleConfirm = async () => {
        setLoading(true);
        setError(null);

        try {
            const result = await invitationsService.revokeInvitation(invitation.id);

            if (result.error) {
                throw new Error(result.error.message || result.error);
            }

            if (result.data?.success === false) {
                throw new Error(result.data.error || 'Erreur lors de la révocation');
            }

            onConfirm();
            onClose();
        } catch (err) {
            console.error('[RevokeConfirmModal] Error:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen || !invitation) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div 
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={onClose}
            />

            <div className="relative w-full max-w-md mx-4 bg-baikal-surface border border-amber-500/50 rounded-lg shadow-xl">
                {/* Header */}
                <div className="flex items-center gap-3 px-6 py-4 border-b border-baikal-border bg-amber-900/20">
                    <div className="p-2 bg-amber-500/20 rounded-md">
                        <Ban className="w-5 h-5 text-amber-400" />
                    </div>
                    <h2 className="text-lg font-mono font-semibold text-amber-400">
                        RÉVOQUER_INVITATION
                    </h2>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                    <p className="text-baikal-text">
                        Êtes-vous sûr de vouloir révoquer cette invitation ?
                    </p>

                    <div className="p-4 bg-baikal-bg border border-baikal-border rounded-md">
                        <p className="font-mono text-baikal-cyan">{invitation.code}</p>
                        {invitation.label && (
                            <p className="text-sm text-baikal-text mt-1">{invitation.label}</p>
                        )}
                        <p className="text-sm text-baikal-text mt-2">
                            {invitation.use_count || 0} utilisation(s) • 
                            {invitation.organization?.name || invitation.org_name || 'Sans org'}
                        </p>
                    </div>

                    <div className="p-3 bg-amber-900/20 border border-amber-500/30 rounded-md">
                        <p className="text-sm text-amber-300">
                            <AlertTriangle className="w-4 h-4 inline mr-1" />
                            Cette action est irréversible. Le code ne pourra plus être utilisé.
                        </p>
                    </div>

                    {/* Erreur */}
                    {error && (
                        <div className="p-3 bg-red-900/20 border border-red-500/50 rounded-md flex items-center gap-2 text-red-300 text-sm">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {error}
                        </div>
                    )}

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
                            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white font-medium rounded-md hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-mono"
                        >
                            {loading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Ban className="w-4 h-4" />
                            )}
                            RÉVOQUER
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

export default function Invitations() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { isSuperAdmin, profile } = useAuth();

    // États
    const [invitations, setInvitations] = useState([]);
    const [organizations, setOrganizations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Filtres
    const [statusFilter, setStatusFilter] = useState('all');
    const [orgFilter, setOrgFilter] = useState('');

    // Modals
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [revokingInvitation, setRevokingInvitation] = useState(null);

    // Vérifier les query params pour ouvrir la modal de création
    useEffect(() => {
        if (searchParams.get('action') === 'create') {
            setShowCreateModal(true);
            setSearchParams({});
        }
    }, [searchParams, setSearchParams]);

    // Charger les organisations (pour le filtre et la création)
    useEffect(() => {
        async function loadOrganizations() {
            if (!isSuperAdmin) {
                // org_admin ne peut créer que pour son org
                return;
            }

            try {
                const result = await organizationService.getOrganizations({ includeInactive: false });
                if (result.data?.organizations) {
                    setOrganizations(result.data.organizations);
                } else if (Array.isArray(result.data)) {
                    setOrganizations(result.data);
                }
            } catch (err) {
                console.error('[Invitations] Error loading organizations:', err);
            }
        }
        loadOrganizations();
    }, [isSuperAdmin]);

    // Charger les invitations
    const loadInvitations = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const result = await invitationsService.getInvitations({
                orgId: orgFilter || null,
                includeInactive: statusFilter === 'revoked' || statusFilter === 'all',
                includeExpired: statusFilter === 'expired' || statusFilter === 'all',
            });

            if (result.error) {
                throw new Error(result.error.message || result.error);
            }

            let data = result.data || [];

            // Filtrer côté client selon le statut
            if (statusFilter !== 'all') {
                data = data.filter(inv => getInvitationStatus(inv) === statusFilter);
            }

            setInvitations(data);
        } catch (err) {
            console.error('[Invitations] Error loading:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [statusFilter, orgFilter]);

    useEffect(() => {
        loadInvitations();
    }, [loadInvitations]);

    // Handlers
    const handleRevoke = (invitation) => {
        setRevokingInvitation(invitation);
    };

    const handleCreated = () => {
        loadInvitations();
    };

    const handleRevoked = () => {
        loadInvitations();
    };

    // Org par défaut pour la création (org_admin)
    const defaultOrgId = !isSuperAdmin ? profile?.org_id : '';

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
                                    <Mail className="w-5 h-5 text-baikal-cyan" />
                                </div>
                                <h1 className="text-lg font-mono font-bold text-white">
                                    INVITATIONS
                                </h1>
                            </div>
                        </div>

                        {/* Bouton créer */}
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-baikal-cyan text-black font-medium rounded-md hover:bg-baikal-cyan/90 transition-colors font-mono"
                        >
                            <Plus className="w-4 h-4" />
                            NOUVELLE_INVITATION
                        </button>
                    </div>
                </div>
            </header>

            {/* Contenu */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Filtres */}
                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                    {/* Filtre par statut */}
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

                    {/* Filtre par org (super_admin) */}
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

                {/* Erreur */}
                {error && (
                    <div className="mb-6 p-4 bg-red-900/20 border border-red-500/50 rounded-md flex items-center gap-3 text-red-300">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        <p className="font-mono">{error}</p>
                        <button
                            onClick={loadInvitations}
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
                {!loading && invitations.length === 0 && (
                    <div className="bg-baikal-surface border border-baikal-border rounded-md p-12 text-center">
                        <Mail className="w-12 h-12 text-baikal-text mx-auto mb-4" />
                        <h3 className="text-lg font-mono font-medium text-white">
                            {EMPTY_STATE_TITLES[statusFilter] || 'AUCUNE_INVITATION'}
                        </h3>
                    </div>
                )}

                {/* Tableau */}
                {!loading && invitations.length > 0 && (
                    <div className="bg-baikal-surface border border-baikal-border rounded-md overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-baikal-bg/50 border-b border-baikal-border">
                                        <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-baikal-text uppercase tracking-wider">
                                            Code
                                        </th>
                                        {isSuperAdmin && (
                                            <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-baikal-text uppercase tracking-wider">
                                                Organisation
                                            </th>
                                        )}
                                        <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-baikal-text uppercase tracking-wider">
                                            Utilisations
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-baikal-text uppercase tracking-wider">
                                            Expiration
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-baikal-text uppercase tracking-wider">
                                            Rôle
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
                                    {invitations.map((invitation) => (
                                        <InvitationRow
                                            key={invitation.id}
                                            invitation={invitation}
                                            showOrg={isSuperAdmin}
                                            onRevoke={handleRevoke}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Footer stats */}
                        <div className="px-4 py-3 bg-baikal-bg/30 border-t border-baikal-border text-sm text-baikal-text font-mono">
                            {invitations.length} invitation{invitations.length > 1 ? 's' : ''}
                        </div>
                    </div>
                )}
            </main>

            {/* Modal Créer */}
            <CreateInvitationModal
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                organizations={isSuperAdmin ? organizations : []}
                defaultOrgId={defaultOrgId}
                onCreated={handleCreated}
                isSuperAdmin={isSuperAdmin}
            />

            {/* Modal Révoquer */}
            <RevokeConfirmModal
                isOpen={!!revokingInvitation}
                onClose={() => setRevokingInvitation(null)}
                invitation={revokingInvitation}
                onConfirm={handleRevoked}
            />
        </div>
    );
}
