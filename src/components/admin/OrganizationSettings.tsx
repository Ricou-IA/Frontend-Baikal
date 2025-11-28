// ============================================================================
// BRIQUE 6 : Composant OrganizationSettings
// Paramètres de l'organisation (nom, quotas, etc.)
// ============================================================================

import React, { useState } from 'react';
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

/**
 * Props du composant
 */
interface OrganizationSettingsProps {
    organization: {
        id: string;
        name: string;
        plan: 'free' | 'pro' | 'enterprise';
        credits_balance: number;
        stripe_customer_id: string | null;
        created_at: string;
    } | null;
    loading: boolean;
    currentUserRole: 'owner' | 'admin' | 'member';
    onUpdateName: (name: string) => Promise<{ success: boolean; error?: string }>;
}

/**
 * Badge de plan
 */
const PlanBadge = ({ plan }: { plan: string }) => {
    const config = {
        free: {
            label: 'Gratuit',
            className: 'bg-slate-100 text-slate-700 border-slate-200',
            icon: null
        },
        pro: {
            label: 'Pro',
            className: 'bg-indigo-100 text-indigo-700 border-indigo-200',
            icon: Zap
        },
        enterprise: {
            label: 'Enterprise',
            className: 'bg-amber-100 text-amber-700 border-amber-200',
            icon: Crown
        }
    };

    const { label, className, icon: Icon } = config[plan] || config.free;

    return (
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-sm font-medium rounded-full border ${className}`}>
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {label}
        </span>
    );
};

/**
 * Carte de statistique
 */
const StatCard = ({
    label,
    value,
    icon: Icon,
    description,
    color = 'indigo'
}: {
    label: string;
    value: string | number;
    icon: any;
    description?: string;
    color?: 'indigo' | 'green' | 'amber' | 'red';
}) => {
    const colorClasses = {
        indigo: 'bg-indigo-100 text-indigo-600',
        green: 'bg-green-100 text-green-600',
        amber: 'bg-amber-100 text-amber-600',
        red: 'bg-red-100 text-red-600'
    };

    return (
        <div className="p-4 bg-white rounded-xl border border-slate-200">
            <div className="flex items-center gap-3 mb-2">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorClasses[color]}`}>
                    <Icon className="w-5 h-5" />
                </div>
                <div>
                    <p className="text-sm text-slate-500">{label}</p>
                    <p className="text-2xl font-bold text-slate-800">{value}</p>
                </div>
            </div>
            {description && (
                <p className="text-xs text-slate-500 mt-2">{description}</p>
            )}
        </div>
    );
};

/**
 * Composant principal OrganizationSettings
 */
export default function OrganizationSettings({
    organization,
    loading,
    currentUserRole,
    onUpdateName
}: OrganizationSettingsProps) {
    const [isEditingName, setIsEditingName] = useState(false);
    const [newName, setNewName] = useState(organization?.name || '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const canEdit = currentUserRole === 'owner' || currentUserRole === 'admin';

    // Sauvegarder le nouveau nom
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
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    // Annuler l'édition
    const handleCancelEdit = () => {
        setNewName(organization?.name || '');
        setIsEditingName(false);
        setError(null);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
        );
    }

    if (!organization) {
        return (
            <div className="p-6 bg-amber-50 border border-amber-200 rounded-xl text-amber-700">
                <p className="flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" />
                    Organisation non trouvée
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-indigo-600" />
                    Paramètres de l'organisation
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                    Gérez les informations de votre organisation
                </p>
            </div>

            {/* Message de succès */}
            {success && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700 text-sm">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    Modifications enregistrées avec succès
                </div>
            )}

            {/* Informations principales */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                {/* Nom de l'organisation */}
                <div className="p-6 border-b border-slate-200">
                    <div className="flex items-center justify-between">
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-slate-500 mb-1">
                                Nom de l'organisation
                            </label>

                            {isEditingName ? (
                                <div className="flex items-center gap-3">
                                    <input
                                        type="text"
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                        autoFocus
                                    />
                                    <button
                                        onClick={handleSaveName}
                                        disabled={saving}
                                        className="flex items-center gap-1 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
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
                                        className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-3">
                                    <p className="text-lg font-medium text-slate-800">
                                        {organization.name}
                                    </p>
                                    {canEdit && (
                                        <button
                                            onClick={() => setIsEditingName(true)}
                                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                        >
                                            <Edit3 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            )}

                            {error && (
                                <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
                                    <AlertCircle className="w-3.5 h-3.5" />
                                    {error}
                                </p>
                            )}
                        </div>

                        <PlanBadge plan={organization.plan} />
                    </div>
                </div>

                {/* Date de création */}
                <div className="p-6 border-b border-slate-200">
                    <label className="block text-sm font-medium text-slate-500 mb-1">
                        Date de création
                    </label>
                    <p className="text-slate-800 flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-slate-400" />
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
                        <label className="block text-sm font-medium text-slate-500 mb-1">
                            Client Stripe
                        </label>
                        <p className="text-sm text-slate-600 font-mono bg-slate-50 px-3 py-2 rounded-lg inline-block">
                            {organization.stripe_customer_id}
                        </p>
                    </div>
                )}
            </div>

            {/* Statistiques */}
            <div>
                <h3 className="text-lg font-medium text-slate-800 mb-4 flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-slate-400" />
                    Quotas et utilisation
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <StatCard
                        label="Crédits disponibles"
                        value={organization.credits_balance.toLocaleString('fr-FR')}
                        icon={Zap}
                        description="Crédits utilisables pour les requêtes IA"
                        color={organization.credits_balance > 100 ? 'green' : organization.credits_balance > 10 ? 'amber' : 'red'}
                    />

                    <StatCard
                        label="Plan actuel"
                        value={organization.plan.charAt(0).toUpperCase() + organization.plan.slice(1)}
                        icon={CreditCard}
                        description="Votre formule d'abonnement"
                        color="indigo"
                    />
                </div>
            </div>

            {/* Actions de facturation */}
            {(currentUserRole === 'owner' || currentUserRole === 'admin') && (
                <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
                    <div className="flex items-start gap-3">
                        <Info className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
                        <div>
                            <h4 className="font-medium text-slate-800">Besoin de plus de crédits ?</h4>
                            <p className="text-sm text-slate-600 mt-1">
                                Rendez-vous dans la section Facturation pour recharger vos crédits ou passer à un plan supérieur.
                            </p>
                            <button
                                className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm"
                                onClick={() => {
                                    // TODO: Rediriger vers la page billing (Brique 7)
                                    console.log('Redirection vers Billing...');
                                }}
                            >
                                <CreditCard className="w-4 h-4" />
                                Gérer la facturation
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

