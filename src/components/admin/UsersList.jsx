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
            'super_admin': { label: 'Super Admin', color: 'bg-purple-100 text-purple-700', icon: Shield },
            'org_admin': { label: 'Org Admin', color: 'bg-indigo-100 text-indigo-700', icon: Shield },
            'user': { label: 'Utilisateur', color: 'bg-slate-100 text-slate-700', icon: User }
        };
        return roles[appRole] || roles['user'];
    };

    // Obtenir le badge de business role
    const getBusinessRoleBadge = (businessRole) => {
        const roles = {
            'provider': { label: 'Expert', color: 'bg-blue-100 text-blue-700' },
            'client': { label: 'Client', color: 'bg-green-100 text-green-700' }
        };
        return roles[businessRole] || { label: businessRole || 'N/A', color: 'bg-gray-100 text-gray-700' };
    };

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
            <div>
                <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
                    <Users className="w-5 h-5 text-indigo-600" />
                    Tous les utilisateurs
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                    {filteredUsers.length} {filteredUsers.length > 1 ? 'utilisateurs' : 'utilisateur'}
                    {searchTerm && ` (filtrés)`}
                </p>
            </div>

            {/* Erreur */}
            {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                </div>
            )}

            {/* Filtres et recherche */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex flex-col sm:flex-row gap-4">
                    {/* Recherche */}
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Rechercher par email, nom ou organisation..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                    </div>

                    {/* Filtre par rôle */}
                    <div className="relative">
                        <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <select
                            value={filterRole}
                            onChange={(e) => setFilterRole(e.target.value)}
                            className="pl-10 pr-8 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent appearance-none bg-white"
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
                <div className="p-8 bg-white rounded-xl border border-slate-200 text-center">
                    <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-500">
                        {searchTerm || filterRole !== 'all' 
                            ? 'Aucun utilisateur ne correspond aux critères de recherche'
                            : 'Aucun utilisateur trouvé'}
                    </p>
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                        Utilisateur
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                        Rôle
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                        Organisation
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                        Membre
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                        Inscription
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {filteredUsers.map((user) => {
                                    const roleInfo = getRoleBadge(user.app_role);
                                    const businessRoleInfo = getBusinessRoleBadge(user.business_role);
                                    const RoleIcon = roleInfo.icon;
                                    const orgMember = user.organization_members?.[0];

                                    return (
                                        <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-4 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                                                        <RoleIcon className="w-5 h-5 text-indigo-600" />
                                                    </div>
                                                    <div>
                                                        <p className="font-medium text-slate-800">
                                                            {user.full_name || 'Sans nom'}
                                                        </p>
                                                        <p className="text-sm text-slate-500 flex items-center gap-1">
                                                            <Mail className="w-3.5 h-3.5" />
                                                            {user.email}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4">
                                                <div className="flex flex-col gap-1">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${roleInfo.color}`}>
                                                        <RoleIcon className="w-3 h-3" />
                                                        {roleInfo.label}
                                                    </span>
                                                    <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${businessRoleInfo.color}`}>
                                                        {businessRoleInfo.label}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4">
                                                {user.organizations ? (
                                                    <div className="flex items-center gap-2">
                                                        <Building2 className="w-4 h-4 text-slate-400" />
                                                        <span className="text-sm text-slate-700">
                                                            {user.organizations.name}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-sm text-slate-400">Aucune</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-4">
                                                {orgMember ? (
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-xs font-medium text-slate-700">
                                                            {orgMember.role === 'owner' ? 'Propriétaire' :
                                                             orgMember.role === 'admin' ? 'Admin' : 'Membre'}
                                                        </span>
                                                        <span className={`text-xs px-2 py-0.5 rounded-full inline-block w-fit ${
                                                            orgMember.status === 'active' 
                                                                ? 'bg-green-100 text-green-700' 
                                                                : 'bg-amber-100 text-amber-700'
                                                        }`}>
                                                            {orgMember.status === 'active' ? 'Actif' : 'Invité'}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-sm text-slate-400">-</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-4">
                                                <span className="text-sm text-slate-600">
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



