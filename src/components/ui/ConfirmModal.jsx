/**
 * ConfirmModal.jsx - Baikal Console
 * ============================================================================
 * Modal de confirmation générique réutilisable.
 * Utilisée pour les suppressions, actions destructives, etc.
 * 
 * @example
 * <ConfirmModal
 *   isOpen={showConfirm}
 *   onClose={() => setShowConfirm(false)}
 *   onConfirm={handleDelete}
 *   title="SUPPRIMER_CONCEPT"
 *   message="Ce concept sera supprimé définitivement."
 *   confirmLabel="SUPPRIMER"
 *   variant="danger"
 *   icon={Trash2}
 *   itemPreview={{ label: "Concept X", sublabel: "slug_x" }}
 * />
 * 
 * @version 1.0.0
 * ============================================================================
 */

import React, { useState } from 'react';
import {
    X,
    AlertTriangle,
    Trash2,
    Loader2,
} from 'lucide-react';

// ============================================================================
// CONFIGURATION
// ============================================================================

const VARIANTS = {
    danger: {
        iconBg: 'bg-red-500/20',
        iconColor: 'text-red-400',
        buttonBg: 'bg-red-600 hover:bg-red-700',
        buttonText: 'text-white',
        alertBg: 'bg-red-900/20 border-red-500/30',
        alertText: 'text-red-300',
    },
    warning: {
        iconBg: 'bg-amber-500/20',
        iconColor: 'text-amber-400',
        buttonBg: 'bg-amber-600 hover:bg-amber-700',
        buttonText: 'text-white',
        alertBg: 'bg-amber-900/20 border-amber-500/30',
        alertText: 'text-amber-300',
    },
    info: {
        iconBg: 'bg-blue-500/20',
        iconColor: 'text-blue-400',
        buttonBg: 'bg-blue-600 hover:bg-blue-700',
        buttonText: 'text-white',
        alertBg: 'bg-blue-900/20 border-blue-500/30',
        alertText: 'text-blue-300',
    },
};

// ============================================================================
// COMPOSANT PRINCIPAL
// ============================================================================

export default function ConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    title = 'CONFIRMATION',
    message = 'Êtes-vous sûr de vouloir continuer ?',
    confirmLabel = 'CONFIRMER',
    cancelLabel = 'ANNULER',
    variant = 'danger',
    icon: Icon = AlertTriangle,
    itemPreview = null,
    showReasonField = false,
    reasonLabel = 'Raison (optionnel)',
    reasonPlaceholder = 'Ex: Raison de cette action',
    loading = false,
}) {
    const [reason, setReason] = useState('');
    const styles = VARIANTS[variant] || VARIANTS.danger;

    // Reset reason quand la modal se ferme
    React.useEffect(() => {
        if (!isOpen) {
            setReason('');
        }
    }, [isOpen]);

    const handleConfirm = () => {
        if (showReasonField) {
            onConfirm(reason);
        } else {
            onConfirm();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/70"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative w-full max-w-md bg-baikal-surface border border-baikal-border rounded-lg shadow-xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center gap-3 px-6 py-4 border-b border-baikal-border">
                    <div className={`p-2 rounded-lg ${styles.iconBg}`}>
                        <Icon className={`w-5 h-5 ${styles.iconColor}`} />
                    </div>
                    <h2 className={`text-lg font-semibold font-mono ${styles.iconColor}`}>
                        {title}
                    </h2>
                </div>

                {/* Body */}
                <div className="px-6 py-4 space-y-4">
                    {/* Preview de l'élément concerné */}
                    {itemPreview && (
                        <div className="flex items-center gap-3 p-3 bg-baikal-bg rounded-lg border border-baikal-border">
                            {itemPreview.icon && (
                                <span className="text-2xl">{itemPreview.icon}</span>
                            )}
                            <div className="flex-1 min-w-0">
                                <p className="text-white font-medium truncate">
                                    {itemPreview.label}
                                </p>
                                {itemPreview.sublabel && (
                                    <p className="text-sm text-baikal-cyan font-mono truncate">
                                        {itemPreview.sublabel}
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Message d'alerte */}
                    <div className={`flex items-start gap-2 p-3 rounded-lg border ${styles.alertBg}`}>
                        <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${styles.alertText}`} />
                        <p className={`text-sm ${styles.alertText}`}>
                            {message}
                        </p>
                    </div>

                    {/* Champ raison optionnel */}
                    {showReasonField && (
                        <div className="space-y-1.5">
                            <label className="block text-sm font-medium text-baikal-text font-mono">
                                {reasonLabel}
                            </label>
                            <input
                                type="text"
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder={reasonPlaceholder}
                                className="w-full px-3 py-2 bg-baikal-bg border border-baikal-border rounded-md text-white text-sm font-mono placeholder-baikal-text focus:outline-none focus:ring-2 focus:ring-baikal-cyan focus:border-transparent"
                            />
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-baikal-border bg-baikal-bg/50">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={loading}
                        className="px-4 py-2 text-sm font-mono text-baikal-text hover:text-white transition-colors disabled:opacity-50"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={loading}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-mono font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${styles.buttonBg} ${styles.buttonText}`}
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                EN COURS...
                            </>
                        ) : (
                            <>
                                <Icon className="w-4 h-4" />
                                {confirmLabel}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
