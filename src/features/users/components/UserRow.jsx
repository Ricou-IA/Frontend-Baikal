/**
 * UserRow - Baikal Console
 * ============================================================================
 * Ligne de tableau pour un utilisateur standard (un client du site).
 * Les actions COMPTE (mot de passe, lien, nom, email, blocage) ouvrent les
 * modales partagées comptes/ModalesCompte via onCompte(type, user) ; les
 * actions d'organisation (rôle, retrait, suppression) restent ici.
 * ============================================================================
 */

import { Building2, Pencil, Trash2, UserX, KeyRound, Link2, AtSign, UserPen, Ban, ShieldOff, Shield } from 'lucide-react';
import { formatDate } from '@shared/utils/dateFormatter';
import UserAvatar from './UserAvatar';
import AppRoleBadge from './AppRoleBadge';

const ICONE = 'inline-flex items-center justify-center w-8 h-8 rounded border transition-colors';

/**
 * Ligne utilisateur standard
 * @param {Object} props
 * @param {Object} props.user - Utilisateur
 * @param {Function} props.onEditRole - Callback pour éditer le rôle
 * @param {Function} props.onCompte - (type, user) : mdp | lien | nom | email | bloquer | debloquer
 * @param {boolean} [props.bloque] - Le compte est bloqué (état auth)
 * @param {Function} props.onRemove - Callback pour retirer l'utilisateur de son org
 * @param {Function} [props.onDelete] - Callback pour supprimer le compte (super_admin)
 * @param {boolean} [props.isSuperAdmin] - L'utilisateur courant est super_admin
 * @param {boolean} props.showOrg - Afficher la colonne organisation
 * @param {boolean} props.canEdit - Peut éditer cet utilisateur
 */
export default function UserRow({
    user,
    onEditRole,
    onCompte,
    bloque = false,
    onRemove,
    onDelete,
    isSuperAdmin = false,
    showOrg = true,
    canEdit = true
}) {
    return (
        <tr className={`border-b border-baikal-border hover:bg-baikal-surface/50 transition-colors ${bloque ? 'opacity-70' : ''}`}>
            {/* User */}
            <td className="px-4 py-4">
                <div className="flex items-center gap-3">
                    <UserAvatar user={user} />
                    <div>
                        <p className="font-medium text-white flex items-center gap-2">
                            {user.full_name || 'Sans nom'}
                            {bloque && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-red-500/50 text-red-400 text-[11px] font-mono">
                                    <Ban className="w-3 h-3" />bloqué
                                </span>
                            )}
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
                    <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        <button
                            onClick={() => onEditRole(user)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-mono text-baikal-text hover:text-white hover:bg-baikal-bg border border-baikal-border rounded transition-colors"
                            title="Modifier le rôle"
                        >
                            <Pencil className="w-3.5 h-3.5" />
                            Modifier
                        </button>
                        {onCompte && (
                            <>
                                <button
                                    onClick={() => onCompte('mdp', user)}
                                    className={`${ICONE} text-blue-400 border-blue-500/30 hover:text-white hover:bg-blue-900/30`}
                                    title="Nouveau mot de passe"
                                >
                                    <KeyRound className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    onClick={() => onCompte('lien', user)}
                                    className={`${ICONE} text-blue-400 border-blue-500/30 hover:text-white hover:bg-blue-900/30`}
                                    title="Lien de réinitialisation à transmettre"
                                >
                                    <Link2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    onClick={() => onCompte('nom', user)}
                                    className={`${ICONE} text-baikal-text border-baikal-border hover:text-white hover:bg-baikal-bg`}
                                    title="Renommer"
                                >
                                    <UserPen className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    onClick={() => onCompte('email', user)}
                                    className={`${ICONE} text-baikal-text border-baikal-border hover:text-white hover:bg-baikal-bg`}
                                    title="Changer l'adresse email"
                                >
                                    <AtSign className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    onClick={() => onCompte(bloque ? 'debloquer' : 'bloquer', user)}
                                    className={`${ICONE} ${bloque
                                        ? 'text-emerald-400 border-emerald-500/40 hover:bg-emerald-900/20'
                                        : 'text-amber-400 border-amber-500/40 hover:bg-amber-900/20'}`}
                                    title={bloque ? 'Débloquer : rendre la connexion possible' : 'Bloquer : empêcher toute connexion, sans rien supprimer'}
                                >
                                    {bloque ? <ShieldOff className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                                </button>
                            </>
                        )}
                        {user.org_id ? (
                            <button
                                onClick={() => onRemove(user)}
                                className={`${ICONE} text-red-400 border-red-500/30 hover:text-white hover:bg-red-900/30`}
                                title="Retirer de l'organisation"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        ) : isSuperAdmin && onDelete ? (
                            <button
                                onClick={() => onDelete(user)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-mono text-red-400 hover:text-white hover:bg-red-900/30 border border-red-500/30 rounded transition-colors"
                                title="Supprimer le compte définitivement"
                            >
                                <UserX className="w-3.5 h-3.5" />
                                Supprimer
                            </button>
                        ) : null}
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
