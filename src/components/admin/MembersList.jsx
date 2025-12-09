// ============================================================================
// BRIQUE 6 : Composant MembersList
// Liste des membres de l'organisation
// ============================================================================

import React, { useState } from 'react';
import {
    Users,
    UserPlus,
    MoreVertical,
    Mail,
    Shield,
    User,
    Loader2,
    AlertCircle,
    Edit2,
    Trash2,
    Check,
    X
} from 'lucide-react';

export default function MembersList({
    members = [],
    loading = false,
    currentUserId = '',
    currentUserRole = 'member',
    onInvite = () => {},
    onRevoke = () => {},
    onUpdateRole = () => {},
    onResendInvitation: _onResendInvitation = () => {}
}) {
    const [editingMemberId, setEditingMemberId] = useState(null);
    const [selectedRole, setSelectedRole] = useState('');
    const [updating, setUpdating] = useState(false);
    const [error, setError] = useState(null);
    const [showMenuId, setShowMenuId] = useState(null);

    // Démarrer l'édition du rôle
    const handleStartEdit = (member) => {
        setEditingMemberId(member.id);
        setSelectedRole(member.role);
        setError(null);
        setShowMenuId(null);
    };

    // Annuler l'édition
    const handleCancelEdit = () => {
        setEditingMemberId(null);
        setSelectedRole('');
        setError(null);
    };

    // Sauvegarder le nouveau rôle
    const handleSaveRole = async (memberId) => {
        if (!selectedRole) {
            setError('Veuillez sélectionner un rôle');
            return;
        }

        setUpdating(true);
        setError(null);

        try {
            const result = await onUpdateRole(memberId, selectedRole);
            if (result.success) {
                setEditingMemberId(null);
                setSelectedRole('');
            } else {
                setError(result.error || 'Erreur lors de la mise à jour');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setUpdating(false);
        }
    };

    // Révoquer un membre
    const handleRevoke = async (memberId, memberName) => {
        if (!window.confirm(`Êtes-vous sûr de vouloir révoquer ${memberName} ?`)) {
            return;
        }

        setUpdating(true);
        setError(null);

        try {
            const result = await onRevoke(memberId);
            if (!result.success) {
                setError(result.error || 'Erreur lors de la révocation');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setUpdating(false);
        }
    };

    // Vérifier si on peut modifier le rôle d'un membre
    const canEditRole = (member) => {
        // Ne pas modifier son propre rôle
        if (member.user_id === currentUserId) return false;
        // Ne pas modifier le propriétaire
        if (member.role === 'owner') return false;
        // Seul le propriétaire peut nommer des admins
        if (currentUserRole !== 'owner' && selectedRole === 'admin') return false;
        // Admin et owner peuvent modifier les membres
        return currentUserRole === 'owner' || currentUserRole === 'admin';
    };

    // Vérifier si on peut révoquer un membre
    const canRevoke = (member) => {
        if (member.user_id === currentUserId) return false;
        if (member.role === 'owner') return false;
        return currentUserRole === 'owner' || currentUserRole === 'admin';
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-baikal-cyan" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-mono font-semibold text-white flex items-center gap-2">
                        <Users className="w-5 h-5 text-baikal-cyan" />
                        MEMBRES_DE_L'ÉQUIPE
                    </h2>
                    <p className="text-sm text-baikal-text mt-1 font-sans">
                        {members.length} {members.length > 1 ? 'membres' : 'membre'}
                    </p>
                </div>

                {(currentUserRole === 'owner' || currentUserRole === 'admin') && (
                    <button
                        onClick={onInvite}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-baikal-cyan text-black rounded-md hover:opacity-80 transition-opacity font-mono"
                    >
                        <UserPlus className="w-4 h-4" />
                        INVITER_UN_MEMBRE
                    </button>
                )}
            </div>

            {/* Message d'erreur global */}
            {error && (
                <div className="p-3 bg-red-900/20 border border-red-500/50 rounded-md flex items-center gap-2 text-red-300 text-sm font-mono">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                </div>
            )}

            {/* Liste des membres */}
            {members.length === 0 ? (
                <div className="p-8 bg-baikal-surface rounded-md border border-baikal-border text-center">
                    <Users className="w-12 h-12 text-baikal-text mx-auto mb-4" />
                    <p className="text-baikal-text font-sans">Aucun membre pour le moment</p>
                </div>
            ) : (
                <div className="bg-baikal-surface rounded-md border border-baikal-border overflow-hidden">
                    <div className="divide-y divide-baikal-border">
                        {members.map((member) => {
                            const isEditing = editingMemberId === member.id;
                            const memberName = member.profiles?.full_name || member.invited_email || 'Membre';
                            const canEdit = canEditRole(member);
                            const canRevokeMember = canRevoke(member);

                            return (
                                <div
                                    key={member.id}
                                    className="p-4 hover:bg-baikal-bg transition-colors"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3 flex-1">
                                            <div className="w-10 h-10 bg-baikal-cyan/20 rounded-full flex items-center justify-center border border-baikal-cyan/50">
                                                {member.role === 'owner' ? (
                                                    <Shield className="w-5 h-5 text-baikal-cyan" />
                                                ) : (
                                                    <User className="w-5 h-5 text-baikal-cyan" />
                                                )}
                                            </div>
                                            <div className="flex-1">
                                                <p className="font-medium text-white font-sans">
                                                    {memberName}
                                                </p>
                                                <p className="text-sm text-baikal-text flex items-center gap-1 font-mono">
                                                    <Mail className="w-3.5 h-3.5" />
                                                    {member.profiles?.email || member.invited_email}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            {/* Édition du rôle */}
                                            {isEditing ? (
                                                <div className="flex items-center gap-2">
                                                    <select
                                                        value={selectedRole}
                                                        onChange={(e) => setSelectedRole(e.target.value)}
                                                        disabled={updating}
                                                        className="px-3 py-1.5 text-sm bg-black border border-baikal-border rounded-md text-white focus:outline-none focus:ring-2 focus:ring-baikal-cyan focus:border-transparent disabled:opacity-50"
                                                    >
                                                        <option value="member">Membre</option>
                                                        {currentUserRole === 'owner' && (
                                                            <option value="admin">Administrateur</option>
                                                        )}
                                                    </select>
                                                    <button
                                                        onClick={() => handleSaveRole(member.id)}
                                                        disabled={updating || selectedRole === member.role}
                                                        className="p-1.5 text-green-400 hover:bg-green-900/20 rounded-md transition-colors disabled:opacity-50"
                                                        title="Enregistrer"
                                                    >
                                                        <Check className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={handleCancelEdit}
                                                        disabled={updating}
                                                        className="p-1.5 text-red-400 hover:bg-red-900/20 rounded-md transition-colors disabled:opacity-50"
                                                        title="Annuler"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <>
                                                    <span className="px-2 py-1 text-xs font-medium rounded-md bg-baikal-bg text-baikal-text border border-baikal-border font-mono">
                                                        {member.role === 'owner' ? 'PROPRIÉTAIRE' :
                                                         member.role === 'admin' ? 'ADMIN' : 'MEMBRE'}
                                                    </span>
                                                    {member.status === 'invited' && (
                                                        <span className="px-2 py-1 text-xs font-medium rounded-md bg-amber-900/20 text-amber-300 border border-amber-500/50 font-mono">
                                                            INVITÉ
                                                        </span>
                                                    )}

                                                    {/* Menu d'actions */}
                                                    {(canEdit || canRevokeMember) && (
                                                        <div className="relative">
                                                            <button
                                                                onClick={() => setShowMenuId(showMenuId === member.id ? null : member.id)}
                                                                className="p-1.5 text-baikal-text hover:text-white hover:bg-baikal-bg rounded-md transition-colors"
                                                                title="Actions"
                                                            >
                                                                <MoreVertical className="w-4 h-4" />
                                                            </button>

                                                            {showMenuId === member.id && (
                                                                <>
                                                                    <div
                                                                        className="fixed inset-0 z-10"
                                                                        onClick={() => setShowMenuId(null)}
                                                                    />
                                                                    <div className="absolute right-0 mt-1 w-48 bg-baikal-surface rounded-md border border-baikal-border py-1 z-20">
                                                                        {canEdit && (
                                                                            <button
                                                                                onClick={() => {
                                                                                    handleStartEdit(member);
                                                                                }}
                                                                                className="w-full px-4 py-2 text-left text-sm text-white hover:bg-baikal-bg flex items-center gap-2 font-sans"
                                                                            >
                                                                                <Edit2 className="w-4 h-4" />
                                                                                Modifier le rôle
                                                                            </button>
                                                                        )}
                                                                        {canRevokeMember && (
                                                                            <button
                                                                                onClick={() => {
                                                                                    handleRevoke(member.id, memberName);
                                                                                    setShowMenuId(null);
                                                                                }}
                                                                                className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-900/20 flex items-center gap-2 font-sans"
                                                                            >
                                                                                <Trash2 className="w-4 h-4" />
                                                                                Révoquer
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </>
                                                            )}
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
