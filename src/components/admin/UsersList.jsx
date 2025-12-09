// ============================================================================
// BRIQUE 6 : Composant UsersList
// Liste de tous les utilisateurs (visible uniquement pour super_admin)
// ============================================================================

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
            // Récupérer tous les profils avec leurs organisations
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
                    updated_at,
                    organizations:org_id (
                        id,
                        name
                    )
                `)
                .order('created_at', { ascending: false });

            if (profilesError) throw profilesError;

            // Récupérer les membres d'organisation pour chaque utilisateur
            const userIds = profilesData?.map(p => p.id) || [];
            
            let membersMap = {};
            if (userIds.length > 0) {
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
            (filterRole === 'org_member' && user.app_role === 'user' && user.org_id);

        return matchesSearch && matchesRole;
    });

    // Obtenir le badge de rôle
    const getRoleBadge = (appRole) => {
        const roles = {
            'super_admin': { label: 'SUPER_ADMIN', color: 'bg-violet-900/20 text-violet-300 border-violet-500/50', icon: Shield },
            'org_admin': { label: 'ORG_ADMIN', color: 'bg-baikal-cyan/20 text-baikal-cyan border-baikal-cyan/50', icon: Shield },
            'user': { label: 'UTILISATEUR', color: 'bg-baikal-bg text-baikal-text border-baikal-border', icon: User }
        };
        return roles[appRole] || roles['user'];
    };

    // Obtenir le badge de business role
    const getBusinessRoleBadge = (businessRole) => {
        const roles = {
            'provider': { label: 'Expert', color: 'bg-blue-500/20 text-blue-400 border-blue-500/50' },
            'client': { label: 'Client', color: 'bg-green-500/20 text-green-400 border-green-500/50' }
        };
        return roles[businessRole] || { label: businessRole || 'N/A', color: 'bg-baikal-bg text-baikal-text border-baikal-border' };
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
            <div>
                <h2 className="text-xl font-mono font-semibold text-white flex items-center gap-2">
                    <Users className="w-5 h-5 text-baikal-cyan" />
                    TOUS_LES_UTILISATEURS
                </h2>
                <p className="text-sm text-baikal-text mt-1 font-sans">
                    {filteredUsers.length} {filteredUsers.length > 1 ? 'utilisateurs' : 'utilisateur'}
                    {searchTerm && ` (filtrés)`}
                </p>
            </div>

            {/* Erreur */}
            {error && (
                <div className="p-3 bg-red-900/20 border border-red-500/50 rounded-md flex items-center gap-2 text-red-300 text-sm font-mono">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                </div>
            )}

            {/* Filtres et recherche */}
            <div className="bg-baikal-surface rounded-md border border-baikal-border p-4">
                <div className="flex flex-col sm:flex-row gap-4">
                    {/* Recherche */}
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-baikal-text" />
                        <input
                            type="text"
                            placeholder="Rechercher par email, nom ou organisation..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-black border border-baikal-border rounded-md text-white placeholder-baikal-text focus:outline-none focus:ring-2 focus:ring-baikal-cyan focus:border-transparent"
                        />
                    </div>

                    {/* Filtre par rôle */}
                    <div className="relative">
                        <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-baikal-text" />
                        <select
                            value={filterRole}
                            onChange={(e) => setFilterRole(e.target.value)}
                            className="pl-10 pr-8 py-2 bg-black border border-baikal-border rounded-md text-white focus:outline-none focus:ring-2 focus:ring-baikal-cyan focus:border-transparent appearance-none"
                        >
                            <option value="all">Tous les rôles</option>
                            <option value="super_admin">Super Admin</option>
                            <option value="org_admin">Org Admin</option>
                            <option value="user">Utilisateur</option>
                            <option value="org_member">Membre d'organisation</option>
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
                                        <tr key={user.id} className="hover:bg-baikal-bg transition-colors">
                                            <td className="px-4 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 bg-baikal-cyan/20 rounded-full flex items-center justify-center border border-baikal-cyan/50">
                                                        <RoleIcon className="w-5 h-5 text-baikal-cyan" />
                                                    </div>
                                                    <div>
                                                        <p className="font-medium text-white font-sans">
                                                            {user.full_name || 'Sans nom'}
                                                        </p>
                                                        <p className="text-sm text-baikal-text flex items-center gap-1 font-mono">
                                                            <Mail className="w-3.5 h-3.5" />
                                                            {user.email}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4">
                                                <div className="flex flex-col gap-1">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border ${roleInfo.color}`}>
                                                        <RoleIcon className="w-3 h-3" />
                                                        {roleInfo.label}
                                                    </span>
                                                    <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-md border ${businessRoleInfo.color}`}>
                                                        {businessRoleInfo.label}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4">
                                                {user.organizations ? (
                                                    <div className="flex items-center gap-2">
                                                        <Building2 className="w-4 h-4 text-baikal-text" />
                                                        <span className="text-sm text-white font-sans">
                                                            {user.organizations.name}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-sm text-baikal-text font-mono">Aucune</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-4">
                                                {orgMember ? (
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-xs font-medium text-white font-mono">
                                                            {orgMember.role === 'owner' ? 'PROPRIÉTAIRE' :
                                                             orgMember.role === 'admin' ? 'ADMIN' : 'MEMBRE'}
                                                        </span>
                                                        <span className={`text-xs px-2 py-0.5 rounded-md inline-block w-fit border ${
                                                            orgMember.status === 'active' 
                                                                ? 'bg-green-900/20 text-green-300 border-green-500/50' 
                                                                : 'bg-amber-900/20 text-amber-300 border-amber-500/50'
                                                        }`}>
                                                            {orgMember.status === 'active' ? 'Actif' : 'Invité'}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-sm text-baikal-text font-mono">-</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-4">
                                                <span className="text-sm text-baikal-text font-mono">
                                                    {new Date(user.created_at).toLocaleDateString('fr-FR', {
                                                        day: 'numeric',
                                                        month: 'short',
                                                        year: 'numeric'
                                                    })}
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



