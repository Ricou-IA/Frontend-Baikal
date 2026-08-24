/**
 * DeleteUserModal - Baikal Console
 * ============================================================================
 * Modal de confirmation pour supprimer définitivement un compte utilisateur.
 * Réservé aux super_admin. L'utilisateur doit taper l'email pour confirmer.
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { UserX, AlertCircle, Loader2, AlertTriangle } from 'lucide-react';
import { usersService } from '@services';
import UserAvatar from './UserAvatar';

/**
 * Modal de suppression définitive
 * @param {Object} props
 * @param {boolean} props.isOpen - État d'ouverture
 * @param {Function} props.onClose - Callback de fermeture
 * @param {Object} props.user - Utilisateur à supprimer
 * @param {Function} props.onConfirm - Callback après suppression
 */
export default function DeleteUserModal({ isOpen, onClose, user, onConfirm }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [confirmEmail, setConfirmEmail] = useState('');

    useEffect(() => {
        if (isOpen) {
            setConfirmEmail('');
            setError(null);
        }
    }, [isOpen]);

    const canConfirm = confirmEmail === user?.email;

    const handleConfirm = async () => {
        if (!canConfirm) return;

        setLoading(true);
        setError(null);

        try {
            const result = await usersService.deleteUser(user.id);

            if (result.error) {
                throw new Error(result.error.message || result.error);
            }

            onConfirm();
            onClose();
        } catch (err) {
            console.error('[DeleteUserModal] Error:', err);
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
                <div className="flex items-center gap-3 px-6 py-4 border-b border-baikal-border bg-red-900/30">
                    <div className="p-2 bg-red-500/20 rounded-md">
                        <UserX className="w-5 h-5 text-red-400" />
                    </div>
                    <h2 className="text-lg font-mono font-semibold text-red-400">
                        SUPPRIMER_COMPTE
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
                    <div className="p-3 bg-red-900/30 border border-red-500/50 rounded-md space-y-2">
                        <p className="text-sm text-red-300 font-semibold">
                            <AlertTriangle className="w-4 h-4 inline mr-1" />
                            Action irréversible
                        </p>
                        <p className="text-sm text-red-300/80">
                            Le compte sera supprimé définitivement. Toutes les données associées
                            (profil, accès, historique) seront perdues.
                        </p>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="p-3 bg-red-900/20 border border-red-500/50 rounded-md flex items-center gap-2 text-red-300 text-sm">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {error}
                        </div>
                    )}

                    {/* Confirmation */}
                    <div>
                        <label className="block text-sm font-mono text-baikal-text mb-2">
                            Tapez <span className="text-red-400">{user.email}</span> pour confirmer
                        </label>
                        <input
                            type="text"
                            value={confirmEmail}
                            onChange={(e) => setConfirmEmail(e.target.value)}
                            placeholder={user.email}
                            className="w-full px-4 py-2.5 bg-baikal-bg border border-baikal-border rounded-md text-white placeholder-baikal-text/30 focus:outline-none focus:border-red-500 transition-colors font-mono text-sm"
                            autoComplete="off"
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
                            disabled={loading || !canConfirm}
                            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white font-medium rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-mono"
                        >
                            {loading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <UserX className="w-4 h-4" />
                            )}
                            SUPPRIMER
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
