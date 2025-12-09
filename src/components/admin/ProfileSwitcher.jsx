// ============================================================================
// BRIQUE 6 : Composant ProfileSwitcher
// Permet de basculer rapidement entre différents profils de test
// ============================================================================

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import {
    User,
    Loader2,
    AlertCircle,
    ChevronDown,
    Shield,
    Users,
    X,
    Search
} from 'lucide-react';

export default function ProfileSwitcher() {
    const {
        profile,
        isSuperAdmin,
        isImpersonating,
        impersonateUser,
        stopImpersonating,
        realProfile
    } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [switching, setSwitching] = useState(false);
    const [error, setError] = useState(null);
    const [allUsers, setAllUsers] = useState([]);
    const [loadingUsers, setLoadingUsers] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Charger tous les utilisateurs depuis la base
    useEffect(() => {
        if (isSuperAdmin) {
            loadAllUsers();
        }
    }, [isSuperAdmin]);

    const loadAllUsers = async () => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, email, full_name, app_role, business_role')
                .order('created_at', { ascending: false })
                .limit(100); // Limiter à 100 utilisateurs pour les performances

            if (error) throw error;

            const usersWithIcons = (data || []).map(user => ({
                ...user,
                label: user.full_name || user.email.split('@')[0],
                icon: user.app_role === 'super_admin' ? Shield : 
                      user.app_role === 'org_admin' ? Shield : Users
            }));

            setAllUsers(usersWithIcons);
        } catch (err) {
            console.error('Erreur lors du chargement des utilisateurs:', err);
            setError(err.message);
        } finally {
            setLoadingUsers(false);
        }
    };

    // Filtrer les utilisateurs selon la recherche
    const filteredUsers = allUsers.filter(u => 
        u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.full_name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleSwitch = async (targetUser) => {
        // Vérifier si c'est déjà le profil actuel (en tenant compte de l'impersonation)
        const currentProfileId = isImpersonating ? profile?.id : realProfile?.id;
        if (targetUser.id === currentProfileId) {
            setIsOpen(false);
            return;
        }

        setSwitching(true);
        setError(null);

        try {
            const result = await impersonateUser(targetUser.id);
            
            if (result.success) {
                setIsOpen(false);
                // Ne pas recharger la page, juste fermer le menu
                // L'état sera mis à jour via le contexte
            } else {
                setError(result.error || 'Erreur lors du changement de profil');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setSwitching(false);
        }
    };

    const handleStopImpersonating = async () => {
        setSwitching(true);
        try {
            stopImpersonating();
            setIsOpen(false);
            // Ne pas recharger, l'état sera mis à jour via le contexte
        } catch (err) {
            setError(err.message);
        } finally {
            setSwitching(false);
        }
    };

    const currentUserLabel = isImpersonating 
        ? (profile?.full_name || profile?.email || 'Profil emprunté')
        : (realProfile?.full_name || realProfile?.email || 'Super Admin');

    const _currentUserEmail = isImpersonating
        ? profile?.email
        : realProfile?.email;

    // Ne pas afficher si pas super_admin
    if (!isSuperAdmin) {
        return null;
    }

    return (
        <div className="relative">
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(!isOpen);
                }}
                disabled={switching}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors disabled:opacity-50 text-sm ${
                    isImpersonating 
                        ? 'bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300' 
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
                title={isImpersonating ? "Mode impersonation actif" : "Basculer entre les profils"}
            >
                {switching ? (
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                ) : (
                    <User className="w-4 h-4" />
                )}
                <span className="font-medium">{currentUserLabel}</span>
                {isImpersonating && (
                    <span className="text-xs bg-amber-200 px-1.5 py-0.5 rounded">IMP</span>
                )}
                <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    />
                    <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-slate-200 py-2 z-50">
                        <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between">
                            <p className="text-xs font-semibold text-slate-500 uppercase">
                                {isImpersonating ? 'Mode impersonation' : 'Tous les utilisateurs'}
                            </p>
                            {isImpersonating && (
                                <button
                                    onClick={handleStopImpersonating}
                                    disabled={switching}
                                    className="p-1 text-amber-600 hover:bg-amber-50 rounded transition-colors"
                                    title="Arrêter l'impersonation"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            )}
                        </div>

                        {/* Recherche */}
                        {!isImpersonating && (
                            <div className="px-3 py-2 border-b border-slate-200">
                                <div className="relative">
                                    <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="Rechercher un utilisateur..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                    />
                                </div>
                            </div>
                        )}

                        {isImpersonating && (
                            <div className="px-3 py-2 bg-amber-50 border-b border-amber-200">
                                <p className="text-xs text-amber-800 font-medium mb-1">
                                    Vous êtes connecté en tant que :
                                </p>
                                <p className="text-sm text-amber-900 font-semibold">
                                    {profile?.full_name || profile?.email}
                                </p>
                                <p className="text-xs text-amber-700 mt-1">
                                    {profile?.email}
                                </p>
                            </div>
                        )}
                        
                        {error && (
                            <div className="mx-3 mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-center gap-2">
                                <AlertCircle className="w-3 h-3" />
                                {error}
                            </div>
                        )}

                        <div className="max-h-96 overflow-y-auto">
                            {loadingUsers ? (
                                <div className="px-3 py-4 text-center">
                                    <Loader2 className="w-4 h-4 animate-spin text-slate-400 mx-auto" />
                                    <p className="text-xs text-slate-500 mt-2">Chargement des utilisateurs...</p>
                                </div>
                            ) : filteredUsers.length === 0 ? (
                                <div className="px-3 py-4 text-center">
                                    <p className="text-xs text-slate-500 mb-2">
                                        {searchTerm ? 'Aucun utilisateur trouvé' : 'Aucun utilisateur dans la base'}
                                    </p>
                                    {searchTerm && (
                                        <button
                                            onClick={() => setSearchTerm('')}
                                            className="text-xs text-indigo-600 hover:underline"
                                        >
                                            Effacer la recherche
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <>
                                    <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200">
                                        <p className="text-xs text-slate-500">
                                            {filteredUsers.length} {filteredUsers.length > 1 ? 'utilisateurs' : 'utilisateur'}
                                            {searchTerm && ` (filtrés)`}
                                        </p>
                                    </div>
                                    {filteredUsers.map((targetUser) => {
                                        const Icon = targetUser.icon;
                                        // Vérifier si c'est le profil actuel (en tenant compte de l'impersonation)
                                        const currentProfileId = isImpersonating ? profile?.id : realProfile?.id;
                                        const isCurrent = targetUser.id === currentProfileId;
                                        
                                        return (
                                            <button
                                                key={targetUser.id}
                                                onClick={() => handleSwitch(targetUser)}
                                                disabled={switching || isCurrent}
                                                className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors ${
                                                    isCurrent
                                                        ? 'bg-indigo-50 text-indigo-700 cursor-not-allowed'
                                                        : 'hover:bg-slate-50 text-slate-700'
                                                } disabled:opacity-50`}
                                            >
                                                <Icon className="w-4 h-4" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium truncate">{targetUser.label}</p>
                                                    <p className="text-xs text-slate-500 truncate">{targetUser.email}</p>
                                                    {targetUser.app_role && (
                                                        <p className="text-xs text-slate-400 mt-0.5">
                                                            {targetUser.app_role === 'super_admin' ? 'Super Admin' :
                                                             targetUser.app_role === 'org_admin' ? 'Org Admin' : 'Utilisateur'}
                                                        </p>
                                                    )}
                                                </div>
                                                {isCurrent && (
                                                    <span className="text-xs text-indigo-600 font-medium flex-shrink-0">Actuel</span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </>
                            )}
                        </div>

                        {isImpersonating && (
                            <div className="px-3 py-2 border-t border-slate-200">
                                <button
                                    onClick={handleStopImpersonating}
                                    disabled={switching}
                                    className="w-full text-left text-sm text-amber-700 hover:bg-amber-50 py-1 font-medium"
                                >
                                    Revenir au profil Super Admin
                                </button>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

