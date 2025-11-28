// ============================================================================
// BRIQUE 6 : Composant InviteMemberModal
// Modal pour inviter un nouveau membre
// ============================================================================

import React, { useState } from 'react';
import {
    X,
    Mail,
    UserPlus,
    Loader2,
    AlertCircle,
    CheckCircle2
} from 'lucide-react';

export default function InviteMemberModal({
    isOpen = false,
    onClose = () => {},
    onInvite = () => {},
    currentUserRole = 'member',
    organizationName = 'Mon Organisation'
}) {
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('member');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const result = await onInvite(email, role);
            if (result.success) {
                setSuccess(true);
                setTimeout(() => {
                    setSuccess(false);
                    setEmail('');
                    setRole('member');
                    onClose();
                }, 2000);
            } else {
                setError(result.error || 'Erreur lors de l\'invitation');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        if (!loading) {
            setEmail('');
            setRole('member');
            setError(null);
            setSuccess(false);
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                            <UserPlus className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-slate-800">
                                Inviter un membre
                            </h2>
                            <p className="text-sm text-slate-500">
                                {organizationName}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleClose}
                        disabled={loading}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Formulaire */}
                {success ? (
                    <div className="py-8 text-center">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <CheckCircle2 className="w-8 h-8 text-green-600" />
                        </div>
                        <h3 className="text-lg font-semibold text-slate-800 mb-2">
                            Invitation envoyée !
                        </h3>
                        <p className="text-slate-600">
                            Un email a été envoyé à {email}
                        </p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Email */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                Adresse email
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="collegue@exemple.com"
                                    required
                                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                />
                            </div>
                        </div>

                        {/* Rôle */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                Rôle
                            </label>
                            <select
                                value={role}
                                onChange={(e) => setRole(e.target.value)}
                                disabled={currentUserRole !== 'owner'}
                                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <option value="member">Membre</option>
                                {currentUserRole === 'owner' && (
                                    <option value="admin">Administrateur</option>
                                )}
                            </select>
                            {currentUserRole !== 'owner' && (
                                <p className="mt-1 text-xs text-slate-500">
                                    Seul le propriétaire peut nommer des administrateurs
                                </p>
                            )}
                        </div>

                        {/* Erreur */}
                        {error && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
                                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                {error}
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-3 pt-4">
                            <button
                                type="button"
                                onClick={handleClose}
                                disabled={loading}
                                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
                            >
                                Annuler
                            </button>
                            <button
                                type="submit"
                                disabled={loading || !email}
                                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Envoi...
                                    </>
                                ) : (
                                    <>
                                        <UserPlus className="w-4 h-4" />
                                        Inviter
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}

