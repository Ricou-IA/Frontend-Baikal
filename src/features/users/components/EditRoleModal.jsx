/**
 * EditRoleModal - Baikal Console
 * ============================================================================
 * Modal de modification du rôle d'un utilisateur.
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { AlertCircle, Loader2, X, Check } from 'lucide-react';
import { usersService } from '@services';
import { APP_ROLES } from '../config';
import UserAvatar from './UserAvatar';

/**
 * Modal de modification de rôle
 * @param {Object} props
 * @param {boolean} props.isOpen - État d'ouverture
 * @param {Function} props.onClose - Callback de fermeture
 * @param {Object} props.user - Utilisateur à modifier
 * @param {Function} props.onSave - Callback après sauvegarde
 * @param {Array} props.allowedRoles - Rôles disponibles selon les permissions
 */
export default function EditRoleModal({ isOpen, onClose, user, onSave, allowedRoles }) {
    const [appRole, setAppRole] = useState('user');
    const [reason, setReason] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (isOpen && user) {
            setAppRole(user.app_role || 'user');
            setReason('');
            setError(null);
        }
    }, [isOpen, user]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const result = await usersService.updateUserRole(user.id, {
                appRole: appRole,
                businessRole: null,
                reason: reason.trim() || null,
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
