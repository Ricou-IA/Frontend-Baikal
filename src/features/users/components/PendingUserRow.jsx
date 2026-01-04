/**
 * PendingUserRow - Baikal Console
 * ============================================================================
 * Ligne de tableau pour un utilisateur en attente d'assignation.
 * ============================================================================
 */

import React from 'react';
import { Calendar, Clock, Building2 } from 'lucide-react';
import { formatDate } from '@shared/utils/dateFormatter';
import UserAvatar from './UserAvatar';

/**
 * Ligne utilisateur en attente (pending)
 * @param {Object} props
 * @param {Object} props.user - Utilisateur
 * @param {Function} props.onAssign - Callback pour assigner à une organisation
 */
export default function PendingUserRow({ user, onAssign }) {
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

            {/* Date inscription */}
            <td className="px-4 py-4">
                <div className="flex items-center gap-2 text-baikal-text text-sm">
                    <Calendar className="w-4 h-4" />
                    {formatDate(user.created_at)}
                </div>
            </td>

            {/* Statut */}
            <td className="px-4 py-4">
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono bg-amber-500/20 text-amber-400">
                    <Clock className="w-3 h-3" />
                    EN_ATTENTE
                </span>
            </td>

            {/* Actions */}
            <td className="px-4 py-4">
                <button
                    onClick={() => onAssign(user)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-baikal-cyan text-black text-sm font-medium rounded hover:bg-baikal-cyan/90 transition-colors font-mono"
                >
                    <Building2 className="w-4 h-4" />
                    ASSIGNER
                </button>
            </td>
        </tr>
    );
}
