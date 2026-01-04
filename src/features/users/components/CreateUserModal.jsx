/**
 * CreateUserModal - Baikal Console
 * ============================================================================
 * Modal de création d'un nouvel utilisateur (super_admin).
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import {
    UserPlus,
    AlertCircle,
    Loader2,
    X,
    Eye,
    EyeOff,
} from 'lucide-react';
import { supabase } from '@lib/supabaseClient';
import { APP_ROLES } from '../config';

/**
 * Modal de création d'utilisateur
 * @param {Object} props
 * @param {boolean} props.isOpen - État d'ouverture
 * @param {Function} props.onClose - Callback de fermeture
 * @param {Array} props.organizations - Liste des organisations
 * @param {Function} props.onCreate - Callback après création
 */
export default function CreateUserModal({ isOpen, onClose, organizations, onCreate }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [fullName, setFullName] = useState('');
    const [selectedOrg, setSelectedOrg] = useState('');
    const [appRole, setAppRole] = useState('user');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (isOpen) {
            setEmail('');
            setPassword('');
            setShowPassword(false);
            setFullName('');
            setSelectedOrg('');
            setAppRole('user');
            setError(null);
        }
    }, [isOpen]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!email || !password) return;

        setLoading(true);
        setError(null);

        try {
            // 1. Créer l'utilisateur dans auth.users via admin API
            const { data: authData, error: authError } = await supabase.auth.admin.createUser({
                email: email.trim(),
                password: password,
                email_confirm: true,
                user_metadata: {
                    full_name: fullName.trim() || null,
                },
            });

            if (authError) {
                throw new Error(authError.message);
            }

            const userId = authData.user.id;

            // 2. Mettre à jour le profil avec le rôle et l'organisation
            const { error: profileError } = await supabase
                .from('profiles')
                .update({
                    full_name: fullName.trim() || null,
                    app_role: appRole,
                    org_id: selectedOrg || null,
                })
                .eq('id', userId);

            if (profileError) {
                console.error('[CreateUserModal] Profile update error:', profileError);
            }

            // 3. Si une organisation est sélectionnée, ajouter comme membre
            if (selectedOrg) {
                const { error: memberError } = await supabase
                    .from('organization_members')
                    .insert({
                        org_id: selectedOrg,
                        user_id: userId,
                        role: 'member',
                        status: 'active',
                    });

                if (memberError) {
                    console.error('[CreateUserModal] Member insert error:', memberError);
                }
            }

            onCreate();
            onClose();
        } catch (err) {
            console.error('[CreateUserModal] Error:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={onClose}
            />

            <div className="relative w-full max-w-md mx-4 bg-baikal-surface border border-baikal-border rounded-lg shadow-xl">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-baikal-border">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-baikal-cyan/20 rounded-md">
                            <UserPlus className="w-5 h-5 text-baikal-cyan" />
                        </div>
                        <h2 className="text-lg font-mono font-semibold text-white">
                            NOUVEL_UTILISATEUR
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-baikal-text hover:text-white hover:bg-baikal-bg rounded-md transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {/* Erreur */}
                    {error && (
                        <div className="p-3 bg-red-900/20 border border-red-500/50 rounded-md flex items-center gap-2 text-red-300 text-sm">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {error}
                        </div>
                    )}

                    {/* Email */}
                    <div>
                        <label className="block text-sm font-mono text-baikal-text mb-2">
                            Email *
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            placeholder="utilisateur@example.com"
                            className="w-full px-4 py-2.5 bg-baikal-bg border border-baikal-border rounded-md text-white placeholder-baikal-text/50 focus:outline-none focus:border-baikal-cyan transition-colors"
                        />
                    </div>

                    {/* Mot de passe */}
                    <div>
                        <label className="block text-sm font-mono text-baikal-text mb-2">
                            Mot de passe *
                        </label>
                        <div className="relative">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                minLength={6}
                                placeholder="Min. 6 caractères"
                                className="w-full px-4 py-2.5 pr-12 bg-baikal-bg border border-baikal-border rounded-md text-white placeholder-baikal-text/50 focus:outline-none focus:border-baikal-cyan transition-colors"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-baikal-text hover:text-white transition-colors"
                            >
                                {showPassword ? (
                                    <EyeOff className="w-5 h-5" />
                                ) : (
                                    <Eye className="w-5 h-5" />
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Nom complet */}
                    <div>
                        <label className="block text-sm font-mono text-baikal-text mb-2">
                            Nom complet
                        </label>
                        <input
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder="Jean Dupont"
                            className="w-full px-4 py-2.5 bg-baikal-bg border border-baikal-border rounded-md text-white placeholder-baikal-text/50 focus:outline-none focus:border-baikal-cyan transition-colors"
                        />
                    </div>

                    {/* Organisation */}
                    <div>
                        <label className="block text-sm font-mono text-baikal-text mb-2">
                            Organisation
                        </label>
                        <select
                            value={selectedOrg}
                            onChange={(e) => setSelectedOrg(e.target.value)}
                            className="w-full px-4 py-2.5 bg-baikal-bg border border-baikal-border rounded-md text-white focus:outline-none focus:border-baikal-cyan transition-colors"
                        >
                            <option value="">-- Aucune --</option>
                            {organizations.map((org) => (
                                <option key={org.id} value={org.id}>
                                    {org.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Rôle App */}
                    <div>
                        <label className="block text-sm font-mono text-baikal-text mb-2">
                            Rôle application
                        </label>
                        <select
                            value={appRole}
                            onChange={(e) => setAppRole(e.target.value)}
                            className="w-full px-4 py-2.5 bg-baikal-bg border border-baikal-border rounded-md text-white focus:outline-none focus:border-baikal-cyan transition-colors"
                        >
                            {APP_ROLES.map((role) => (
                                <option key={role.value} value={role.value}>
                                    {role.label}
                                </option>
                            ))}
                        </select>
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
                            disabled={loading || !email || !password}
                            className="flex items-center gap-2 px-4 py-2 bg-baikal-cyan text-black font-medium rounded-md hover:bg-baikal-cyan/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-mono"
                        >
                            {loading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <UserPlus className="w-4 h-4" />
                            )}
                            CRÉER
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
