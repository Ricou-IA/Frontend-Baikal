/**
 * UsersList.jsx - Baikal Console
 * ============================================================================
 * MIGRATION PHASE 3 - Schémas explicites
 * 
 * MODIFICATIONS:
 * - profiles → core.profiles (schéma)
 * - organization_members → core.organization_members (schéma)
 * 
 * NOTE: La jointure organizations:org_id ne fonctionne pas cross-schema,
 * donc on fait 2 requêtes séparées.
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import {
    Users,
    Mail,
    Shield,
    User,
    Building2,
    Loader2,
    AlertCircle,
    Search,
    Filter
} from 'lucide-react';

export default function UsersList() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterRole, setFilterRole] = useState('all');

    // Charger tous les utilisateurs
    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        setLoading(true);
        setError(null);

        try {
            // MIGRATION: profiles → core.profiles
            // NOTE: Les jointures cross-schema ne fonctionnent pas, on fait des requêtes séparées
            const { data: profilesData, error: profilesError } = await supabase
                .from('profiles')
                .select(`
                    id,
                    email,
                    full_name,
                    app_role,
                    business_role,
                    org_id,
                    created_at,
                    updated_at
                `)
                .order('created_at', { ascending: false });

            if (profilesError) throw profilesError;

            // Récupérer les organisations pour les profils qui en ont une
            const orgIds = [...new Set(profilesData?.filter(p => p.org_id).map(p => p.org_id) || [])];
            let organizationsMap = {};
            
            if (orgIds.length > 0) {
                // MIGRATION: organizations → core.organizations
                const { data: orgsData, error: orgsError } = await supabase
                        .from('organizations')
                    .select('id, name')
                    .in('id', orgIds);

                if (!orgsError && orgsData) {
                    organizationsMap = orgsData.reduce((acc, org) => {
                        acc[org.id] = org;
                        return acc;
                    }, {});
                }
            }

            // Récupérer les membres d'organisation pour chaque utilisateur
            const userIds = profilesData?.map(p => p.id) || [];
            
            let membersMap = {};
            if (userIds.length > 0) {
                // MIGRATION: organization_members → core.organization_members
                const { data: membersData, error: membersError } = await supabase
                        .from('organization_members')
                    .select('user_id, role, status, org_id')
                    .in('user_id', userIds);

                if (!membersError && membersData) {
                    membersMap = membersData.reduce((acc, member) => {
                        if (!acc[member.user_id]) {
                            acc[member.user_id] = [];
                        }
                        acc[member.user_id].push(member);
                        return acc;
                    }, {});
                }
            }

            // Fusionner les données
            const usersWithDetails = (profilesData || []).map(profile => ({
                ...profile,
                organizations: profile.org_id ? organizationsMap[profile.org_id] : null,
                organization_members: membersMap[profile.id] || []
            }));

            setUsers(usersWithDetails);
        } catch (err) {
            console.error('Erreur lors du chargement des utilisateurs:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Filtrer les utilisateurs
    const filteredUsers = users.filter(user => {
        const matchesSearch = 
            user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.organizations?.name?.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesRole = 
            filterRole === 'all' || 
            user.app_role === filterRole ||
            (filterRole === 'org_member' && user.app_role === 'member');

        return matchesSearch && matchesRole;
    });

    // Badge pour le rôle app
    const getRoleBadge = (role) => {
        switch (role) {
            case 'super_admin':
                return { label: 'SUPER_ADMIN', color: 'bg-purple-500/20 text-purple-400 border-purple-500/50', icon: Shield };
            case 'org_admin':
                return { label: 'ORG_ADMIN', color: 'bg-baikal-cyan/20 text-baikal-cyan border-baikal-cyan/50', icon: Shield };
            default:
                return { label: 'MEMBER', color: 'bg-baikal-text/20 text-baikal-text border-baikal-border', icon: User };
        }
    };

    // Badge pour le rôle business
    const getBusinessRoleBadge = (role) => {
        switch (role) {
            case 'provider':
                return { label: 'Provider', color: 'bg-green-500/20 text-green-400' };
            case 'client':
                return { label: 'Client', color: 'bg-blue-500/20 text-blue-400' };
            default:
                return { label: 'Non défini', color: 'bg-amber-500/20 text-amber-400' };
        }
    };

    // Formater la date
    const formatDate = (dateString) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    // État de chargement
    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-baikal-cyan" />
            </div>
        );
    }

    // État d'erreur
    if (error) {
        return (
            <div className="p-6 bg-red-900/20 border border-red-500/50 rounded-md">
                <p className="flex items-center gap-2 text-red-400 font-mono">
                    <AlertCircle className="w-5 h-5" />
                    ERREUR: {error}
                </p>
                <button
                    onClick={loadUsers}
                    className="mt-4 px-4 py-2 bg-baikal-cyan text-black rounded-md hover:opacity-80 font-mono"
                >
                    RÉESSAYER
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header avec recherche et filtres */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <h2 className="text-xl font-mono font-semibold text-white flex items-center gap-2">
                    <Users className="w-5 h-5 text-baikal-cyan" />
                    TOUS_LES_UTILISATEURS
                    <span className="text-sm text-baikal-text ml-2">({filteredUsers.length})</span>
                </h2>

                <div className="flex flex-wrap gap-3 w-full sm:w-auto">
                    {/* Recherche */}
                    <div className="relative flex-1 sm:flex-none">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-baikal-text" />
                        <input
                            type="text"
                            placeholder="Rechercher..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full sm:w-64 pl-10 pr-4 py-2 bg-baikal-surface border border-baikal-border rounded-md text-white placeholder-baikal-text focus:outline-none focus:ring-2 focus:ring-baikal-cyan focus:border-transparent"
                        />
                    </div>

                    {/* Filtre par rôle */}
                    <div className="relative">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-baikal-text" />
                        <select
                            value={filterRole}
                            onChange={(e) => setFilterRole(e.target.value)}
                            className="pl-10 pr-8 py-2 bg-baikal-surface border border-baikal-border rounded-md text-white appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-baikal-cyan focus:border-transparent"
                        >
                            <option value="all">Tous les rôles</option>
                            <option value="super_admin">Super Admin</option>
                            <option value="org_admin">Org Admin</option>
                            <option value="org_member">Membres</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Liste des utilisateurs */}
            {filteredUsers.length === 0 ? (
                <div className="p-8 bg-baikal-surface rounded-md border border-baikal-border text-center">
                    <Users className="w-12 h-12 text-baikal-text mx-auto mb-4" />
                    <p className="text-baikal-text font-sans">
                        {searchTerm || filterRole !== 'all' 
                            ? 'Aucun utilisateur ne correspond aux critères de recherche'
                            : 'Aucun utilisateur trouvé'}
                    </p>
                </div>
            ) : (
                <div className="bg-baikal-surface rounded-md border border-baikal-border overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-baikal-bg border-b border-baikal-border">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-baikal-text uppercase tracking-wider">
                                        UTILISATEUR
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-baikal-text uppercase tracking-wider">
                                        RÔLE
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-baikal-text uppercase tracking-wider">
                                        ORGANISATION
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-baikal-text uppercase tracking-wider">
                                        MEMBRE
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-baikal-text uppercase tracking-wider">
                                        INSCRIPTION
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-baikal-border">
                                {filteredUsers.map((user) => {
                                    const roleInfo = getRoleBadge(user.app_role);
                                    const businessRoleInfo = getBusinessRoleBadge(user.business_role);
                                    const RoleIcon = roleInfo.icon;
                                    const orgMember = user.organization_members?.[0];

                                    return (
                                        <tr key={user.id} className="hover:bg-baikal-bg/50 transition-colors">
                                            {/* Utilisateur */}
                                            <td className="px-4 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-baikal-cyan/20 flex items-center justify-center">
                                                        <User className="w-5 h-5 text-baikal-cyan" />
                                                    </div>
                                                    <div>
                                                        <p className="text-white font-medium">
                                                            {user.full_name || 'Sans nom'}
                                                        </p>
                                                        <p className="text-sm text-baikal-text flex items-center gap-1">
                                                            <Mail className="w-3 h-3" />
                                                            {user.email}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Rôle app */}
                                            <td className="px-4 py-4">
                                                <div className="flex flex-col gap-1">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-mono border ${roleInfo.color}`}>
                                                        <RoleIcon className="w-3 h-3" />
                                                        {roleInfo.label}
                                                    </span>
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${businessRoleInfo.color}`}>
                                                        {businessRoleInfo.label}
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Organisation */}
                                            <td className="px-4 py-4">
                                                {user.organizations ? (
                                                    <div className="flex items-center gap-2">
                                                        <Building2 className="w-4 h-4 text-baikal-text" />
                                                        <span className="text-white">{user.organizations.name}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-baikal-text italic">Aucune</span>
                                                )}
                                            </td>

                                            {/* Rôle membre */}
                                            <td className="px-4 py-4">
                                                {orgMember ? (
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-white capitalize">{orgMember.role}</span>
                                                        <span className={`text-xs ${orgMember.status === 'active' ? 'text-green-400' : 'text-amber-400'}`}>
                                                            {orgMember.status === 'active' ? 'Actif' : 'Invité'}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-baikal-text italic">-</span>
                                                )}
                                            </td>

                                            {/* Date d'inscription */}
                                            <td className="px-4 py-4">
                                                <span className="text-baikal-text text-sm">
                                                    {formatDate(user.created_at)}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
