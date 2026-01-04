/**
 * UserRow - Baikal Console
 * ============================================================================
 * Ligne de tableau pour un utilisateur standard.
 * ============================================================================
 */

import React, { useState } from 'react';
import { Building2, Pencil, Trash2, KeyRound, Loader2, Shield } from 'lucide-react';
import { formatDate } from '@shared/utils/dateFormatter';
import UserAvatar from './UserAvatar';
import AppRoleBadge from './AppRoleBadge';

/**
 * Ligne utilisateur standard
 * @param {Object} props
 * @param {Object} props.user - Utilisateur
 * @param {Function} props.onEditRole - Callback pour éditer le rôle
 * @param {Function} props.onResetPassword - Callback pour reset password
 * @param {Function} props.onRemove - Callback pour retirer l'utilisateur
 * @param {boolean} props.showOrg - Afficher la colonne organisation
 * @param {boolean} props.canEdit - Peut éditer cet utilisateur
 */
export default function UserRow({
    user,
    onEditRole,
    onResetPassword,
    onRemove,
    showOrg = true,
    canEdit = true
}) {
    const [resetting, setResetting] = useState(false);

    const handleResetPassword = async () => {
        setResetting(true);
        await onResetPassword(user);
        setResetting(false);
    };

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
                        <span className="text-sm">{user.org_name || '-'}</span>
                    </div>
                </td>
            )}

            {/* Rôle App */}
            <td className="px-4 py-4">
                <AppRoleBadge role={user.app_role} />
            </td>

            {/* Date */}
            <td className="px-4 py-4">
                <span className="text-sm text-baikal-text">
                    {formatDate(user.created_at)}
                </span>
            </td>

            {/* Actions */}
            <td className="px-4 py-4">
                {canEdit ? (
                    <div className="flex items-center justify-end gap-2">
                        <button
                            onClick={() => onEditRole(user)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-mono text-baikal-text hover:text-white hover:bg-baikal-bg border border-baikal-border rounded transition-colors"
                            title="Modifier le rôle"
                        >
                            <Pencil className="w-3.5 h-3.5" />
                            Modifier
                        </button>
                        <button
                            onClick={handleResetPassword}
                            disabled={resetting}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-mono text-blue-400 hover:text-white hover:bg-blue-900/30 border border-blue-500/30 rounded transition-colors disabled:opacity-50"
                            title="Renvoyer email de mot de passe"
                        >
                            {resetting ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <KeyRound className="w-3.5 h-3.5" />
                            )}
                        </button>
                        <button
                            onClick={() => onRemove(user)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-mono text-red-400 hover:text-white hover:bg-red-900/30 border border-red-500/30 rounded transition-colors"
                            title="Retirer de l'organisation"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center justify-end">
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono bg-amber-500/20 text-amber-400 border border-amber-500/30">
                            <Shield className="w-3 h-3" />
                            PROTÉGÉ
                        </span>
                    </div>
                )}
            </td>
        </tr>
    );
}
