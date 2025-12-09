/**
 * OrganizationSettings.jsx - Baikal Console
 * ============================================================================
 * Composant pour les paramètres de l'organisation (nom, quotas, facturation).
 * 
 * @example
 * <OrganizationSettings
 *   organization={organization}
 *   loading={loading}
 *   currentUserRole="admin"
 *   onUpdateName={handleUpdateName}
 * />
 * ============================================================================
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Building2,
    Edit3,
    Save,
    X,
    CreditCard,
    BarChart3,
    AlertCircle,
    CheckCircle2,
    Loader2,
    Info,
    Zap,
    Calendar,
    Crown
} from 'lucide-react';

// ============================================================================
// COMPOSANTS INTERNES
// ============================================================================

/**
 * Badge de plan d'abonnement
 * @param {Object} props
 * @param {string} props.plan - Plan (free, pro, enterprise)
 */
function PlanBadge({ plan }) {
    const config = {
        free: {
            label: 'Gratuit',
            className: 'bg-baikal-bg text-baikal-text border-baikal-border',
            icon: null
        },
        pro: {
            label: 'Pro',
            className: 'bg-baikal-cyan/20 text-baikal-cyan border-baikal-cyan/50',
            icon: Zap
        },
        enterprise: {
            label: 'Enterprise',
            className: 'bg-amber-500/20 text-amber-400 border-amber-500/50',
            icon: Crown
        }
    };

    const { label, className, icon: Icon } = config[plan] || config.free;

    return (
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-sm font-mono font-medium rounded-md border ${className}`}>
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {label}
        </span>
    );
}

/**
 * Carte de statistique
 * @param {Object} props
 * @param {string} props.label - Libellé
 * @param {string|number} props.value - Valeur
 * @param {React.ComponentType} props.icon - Icône Lucide
 * @param {string} [props.description] - Description optionnelle
 * @param {string} [props.color] - Couleur (indigo, green, amber, red)
 */
function StatCard({ label, value, icon: Icon, description, color = 'indigo' }) {
    const colorClasses = {
        indigo: 'bg-baikal-cyan/20 text-baikal-cyan',
        green: 'bg-green-500/20 text-green-400',
        amber: 'bg-amber-500/20 text-amber-400',
        red: 'bg-red-500/20 text-red-400'
    };

    return (
        <div className="p-4 bg-baikal-surface rounded-md border border-baikal-border">
            <div className="flex items-center gap-3 mb-2">
                <div className={`w-10 h-10 rounded-md flex items-center justify-center ${colorClasses[color]}`}>
                    <Icon className="w-5 h-5" />
                </div>
                <div>
                    <p className="text-sm text-baikal-text font-sans">{label}</p>
                    <p className="text-2xl font-bold font-mono text-white">{value}</p>
                </div>
            </div>
            {description && (
                <p className="text-xs text-baikal-text mt-2 font-sans">{description}</p>
            )}
        </div>
    );
}

// ============================================================================
// COMPOSANT PRINCIPAL
// ============================================================================

/**
 * Paramètres de l'organisation
 * @param {Object} props
 * @param {Object|null} props.organization - Données de l'organisation
 * @param {boolean} props.loading - État de chargement
 * @param {string} props.currentUserRole - Rôle de l'utilisateur (owner, admin, member)
 * @param {Function} props.onUpdateName - Callback pour mettre à jour le nom
 */
export default function OrganizationSettings({
    organization,
    loading,
    currentUserRole,
    onUpdateName
}) {
    const navigate = useNavigate();
    
    // États locaux
    const [isEditingName, setIsEditingName] = useState(false);
    const [newName, setNewName] = useState(organization?.name || '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);

    const canEdit = currentUserRole === 'owner' || currentUserRole === 'admin';

    /**
     * Sauvegarder le nouveau nom
     */
    const handleSaveName = async () => {
        if (!newName.trim()) {
            setError('Le nom ne peut pas être vide');
            return;
        }

        setSaving(true);
        setError(null);

        try {
            const result = await onUpdateName(newName.trim());

            if (result.success) {
                setSuccess(true);
                setIsEditingName(false);
                setTimeout(() => setSuccess(false), 3000);
            } else {
                setError(result.error || 'Erreur lors de la mise à jour');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    /**
     * Annuler l'édition
     */
    const handleCancelEdit = () => {
        setNewName(organization?.name || '');
        setIsEditingName(false);
        setError(null);
    };

    /**
     * Naviguer vers la page de facturation
     */
    const handleGoToBilling = () => {
        navigate('/admin/billing');
    };

    // État de chargement
    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-baikal-cyan" />
            </div>
        );
    }

    // Organisation non trouvée
    if (!organization) {
        return (
            <div className="p-6 bg-amber-900/20 border border-amber-500/50 rounded-md text-amber-300">
                <p className="flex items-center gap-2 font-mono">
                    <AlertCircle className="w-5 h-5" />
                    ORGANISATION_NON_TROUVÉE
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-xl font-mono font-semibold text-white flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-baikal-cyan" />
                    PARAMÈTRES_DE_L'ORGANISATION
                </h2>
                <p className="text-sm text-baikal-text mt-1 font-sans">
                    Gérez les informations de votre organisation
                </p>
            </div>

            {/* Message de succès */}
            {success && (
                <div className="p-3 bg-green-900/20 border border-green-500/50 rounded-md flex items-center gap-2 text-green-300 text-sm font-mono">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    MODIFICATIONS_ENREGISTRÉES
                </div>
            )}

            {/* Informations principales */}
            <div className="bg-baikal-surface rounded-md border border-baikal-border overflow-hidden">
                {/* Nom de l'organisation */}
                <div className="p-6 border-b border-baikal-border">
                    <div className="flex items-center justify-between">
                        <div className="flex-1">
                            <label className="block text-xs font-mono text-baikal-text mb-1 uppercase">
                                Nom de l'organisation
                            </label>

                            {isEditingName ? (
                                <div className="flex items-center gap-3">
                                    <input
                                        type="text"
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        className="flex-1 px-3 py-2 bg-black border border-baikal-border rounded-md text-white focus:outline-none focus:ring-2 focus:ring-baikal-cyan focus:border-transparent"
                                        autoFocus
                                    />
                                    <button
                                        onClick={handleSaveName}
                                        disabled={saving}
                                        className="flex items-center gap-1 px-3 py-2 bg-baikal-cyan text-black rounded-md hover:opacity-80 transition-opacity disabled:opacity-50 font-mono"
                                    >
                                        {saving ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Save className="w-4 h-4" />
                                        )}
                                    </button>
                                    <button
                                        onClick={handleCancelEdit}
                                        disabled={saving}
                                        className="p-2 text-baikal-text hover:text-white hover:bg-baikal-bg rounded-md transition-colors"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-3">
                                    <p className="text-lg font-medium text-white font-sans">
                                        {organization.name}
                                    </p>
                                    {canEdit && (
                                        <button
                                            onClick={() => setIsEditingName(true)}
                                            className="p-1.5 text-baikal-text hover:text-baikal-cyan hover:bg-baikal-bg rounded-md transition-colors"
                                        >
                                            <Edit3 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            )}

                            {error && (
                                <p className="mt-2 text-sm text-red-400 flex items-center gap-1 font-mono">
                                    <AlertCircle className="w-3.5 h-3.5" />
                                    {error}
                                </p>
                            )}
                        </div>

                        <PlanBadge plan={organization.plan} />
                    </div>
                </div>

                {/* Date de création */}
                <div className="p-6 border-b border-baikal-border">
                    <label className="block text-xs font-mono text-baikal-text mb-1 uppercase">
                        Date de création
                    </label>
                    <p className="text-white flex items-center gap-2 font-sans">
                        <Calendar className="w-4 h-4 text-baikal-text" />
                        {new Date(organization.created_at).toLocaleDateString('fr-FR', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric'
                        })}
                    </p>
                </div>

                {/* ID Stripe (si existant) */}
                {organization.stripe_customer_id && (
                    <div className="p-6">
                        <label className="block text-xs font-mono text-baikal-text mb-1 uppercase">
                            Client Stripe
                        </label>
                        <p className="text-sm text-baikal-text font-mono bg-baikal-bg px-3 py-2 rounded-md inline-block border border-baikal-border">
                            {organization.stripe_customer_id}
                        </p>
                    </div>
                )}
            </div>

            {/* Statistiques */}
            <div>
                <h3 className="text-lg font-mono font-medium text-white mb-4 flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-baikal-text" />
                    QUOTAS_ET_UTILISATION
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <StatCard
                        label="Crédits disponibles"
                        value={organization.credits_balance?.toLocaleString('fr-FR') || '0'}
                        icon={Zap}
                        description="Crédits utilisables pour les requêtes IA"
                        color={
                            organization.credits_balance > 100 
                                ? 'green' 
                                : organization.credits_balance > 10 
                                    ? 'amber' 
                                    : 'red'
                        }
                    />

                    <StatCard
                        label="Plan actuel"
                        value={organization.plan?.charAt(0).toUpperCase() + organization.plan?.slice(1) || 'Free'}
                        icon={CreditCard}
                        description="Votre formule d'abonnement"
                        color="indigo"
                    />
                </div>
            </div>

            {/* Actions de facturation */}
            {canEdit && (
                <div className="bg-baikal-surface rounded-md p-6 border border-baikal-border">
                    <div className="flex items-start gap-3">
                        <Info className="w-5 h-5 text-baikal-text flex-shrink-0 mt-0.5" />
                        <div>
                            <h4 className="font-medium text-white font-mono">BESOIN_DE_PLUS_DE_CRÉDITS?</h4>
                            <p className="text-sm text-baikal-text mt-1 font-sans">
                                Rendez-vous dans la section Facturation pour recharger vos crédits ou passer à un plan supérieur.
                            </p>
                            <button
                                className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-baikal-cyan text-black rounded-md hover:opacity-80 transition-opacity text-sm font-mono"
                                onClick={handleGoToBilling}
                            >
                                <CreditCard className="w-4 h-4" />
                                GÉRER_LA_FACTURATION
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
