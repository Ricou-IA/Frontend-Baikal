// ============================================================================
// BRIQUE 6 : Composant MembersList
// Liste des membres de l'organisation
// ============================================================================

import React from 'react';
import {
    Users,
    UserPlus,
    MoreVertical,
    Mail,
    Shield,
    User,
    Loader2,
    AlertCircle
} from 'lucide-react';

export default function MembersList({
    members = [],
    loading = false,
    currentUserId = '',
    currentUserRole = 'member',
    onInvite = () => {},
    onRevoke = () => {},
    onUpdateRole = () => {},
    onResendInvitation = () => {}
}) {
    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
                        <Users className="w-5 h-5 text-indigo-600" />
                        Membres de l'équipe
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">
                        {members.length} {members.length > 1 ? 'membres' : 'membre'}
                    </p>
                </div>

                {(currentUserRole === 'owner' || currentUserRole === 'admin') && (
                    <button
                        onClick={onInvite}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                        <UserPlus className="w-4 h-4" />
                        Inviter un membre
                    </button>
                )}
            </div>

            {/* Liste des membres */}
            {members.length === 0 ? (
                <div className="p-8 bg-white rounded-xl border border-slate-200 text-center">
                    <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-500">Aucun membre pour le moment</p>
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="divide-y divide-slate-200">
                        {members.map((member) => (
                            <div
                                key={member.id}
                                className="p-4 hover:bg-slate-50 transition-colors"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                                            {member.role === 'owner' ? (
                                                <Shield className="w-5 h-5 text-indigo-600" />
                                            ) : (
                                                <User className="w-5 h-5 text-indigo-600" />
                                            )}
                                        </div>
                                        <div>
                                            <p className="font-medium text-slate-800">
                                                {member.profiles?.full_name || member.invited_email || 'Membre'}
                                            </p>
                                            <p className="text-sm text-slate-500 flex items-center gap-1">
                                                <Mail className="w-3.5 h-3.5" />
                                                {member.profiles?.email || member.invited_email}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-700">
                                            {member.role === 'owner' ? 'Propriétaire' :
                                             member.role === 'admin' ? 'Admin' : 'Membre'}
                                        </span>
                                        {member.status === 'invited' && (
                                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-700">
                                                Invité
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

