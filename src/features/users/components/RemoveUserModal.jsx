/**
 * RemoveUserModal - Baikal Console
 * ============================================================================
 * Modal de confirmation pour retirer un utilisateur d'une organisation.
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { UserMinus, AlertCircle, Loader2, AlertTriangle } from 'lucide-react';
import { usersService } from '@services';
import UserAvatar from './UserAvatar';

/**
 * Modal de confirmation de retrait
 * @param {Object} props
 * @param {boolean} props.isOpen - État d'ouverture
 * @param {Function} props.onClose - Callback de fermeture
 * @param {Object} props.user - Utilisateur à retirer
 * @param {Function} props.onConfirm - Callback après confirmation
 */
export default function RemoveUserModal({ isOpen, onClose, user, onConfirm }) {
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
            const result = await usersService.removeUserFromOrg(
                user.id,
                reason.trim() || null
            );

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
