// ============================================================================
// BRIQUE 6 : Hook useOrganization
// Gestion de l'organisation et de ses membres
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

export function useOrganization(orgId) {
    const [organization, setOrganization] = useState(null);
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Charger l'organisation
    const loadOrganization = useCallback(async () => {
        if (!orgId) {
            setLoading(false);
            return;
        }

        try {
            const { data, error: orgError } = await supabase
                .from('organizations')
                .select('*')
                .eq('id', orgId)
                .single();

            if (orgError) throw orgError;
            setOrganization(data);
        } catch (err) {
            setError(err.message);
        }
    }, [orgId]);

    // Charger les membres
    const loadMembers = useCallback(async () => {
        if (!orgId) {
            setLoading(false);
            return;
        }

        try {
            // Récupérer les membres
            const { data: membersData, error: membersError } = await supabase
                .from('organization_members')
                .select('*')
                .eq('org_id', orgId)
                .order('created_at', { ascending: false });

            if (membersError) {
                console.error('Erreur lors de la récupération des membres:', membersError);
                throw membersError;
            }

            // Si aucun membre, retourner un tableau vide
            if (!membersData || membersData.length === 0) {
                setMembers([]);
                return;
            }

            // Récupérer les profils pour les membres qui ont un user_id
            const userIds = membersData
                .map(m => m.user_id)
                .filter(id => id !== null);

            let profilesMap = {};
            if (userIds.length > 0) {
                const { data: profilesData, error: profilesError } = await supabase
                    .from('profiles')
                    .select('id, email, full_name, avatar_url')
                    .in('id', userIds);

                if (profilesError) {
                    console.error('Erreur lors de la récupération des profils:', profilesError);
                    // Continuer même en cas d'erreur sur les profils
                } else if (profilesData) {
                    // Créer un map pour accès rapide
                    profilesMap = profilesData.reduce((acc, profile) => {
                        acc[profile.id] = profile;
                        return acc;
                    }, {});
                }
            }

            // Fusionner les membres avec leurs profils
            const membersWithProfiles = membersData.map(member => ({
                ...member,
                profiles: member.user_id ? profilesMap[member.user_id] || null : null
            }));

            setMembers(membersWithProfiles);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [orgId]);

    // Charger les données au montage et quand orgId change
    useEffect(() => {
        setLoading(true);
        setError(null);
        loadOrganization();
        loadMembers();
    }, [loadOrganization, loadMembers]);

    // Inviter un membre
    const inviteMember = useCallback(async (email, role) => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Non authentifié');

            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const response = await fetch(`${supabaseUrl}/functions/v1/invite-user`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                    email,
                    role,
                    org_id: orgId,
                }),
            });

            const result = await response.json();
            if (!result.success) throw new Error(result.error);

            await loadMembers();
            return { success: true };
        } catch (err) {
            setError(err.message);
            return { success: false, error: err.message };
        }
    }, [orgId, loadMembers]);

    // Révoquer un membre
    const revokeMember = useCallback(async (memberId) => {
        try {
            const { error } = await supabase
                .from('organization_members')
                .delete()
                .eq('id', memberId);

            if (error) throw error;
            await loadMembers();
            return { success: true };
        } catch (err) {
            setError(err.message);
            return { success: false, error: err.message };
        }
    }, [loadMembers]);

    // Mettre à jour le rôle d'un membre
    const updateMemberRole = useCallback(async (memberId, newRole) => {
        try {
            const { error } = await supabase
                .from('organization_members')
                .update({ role: newRole })
                .eq('id', memberId);

            if (error) throw error;
            await loadMembers();
            return { success: true };
        } catch (err) {
            setError(err.message);
            return { success: false, error: err.message };
        }
    }, [loadMembers]);

    // Mettre à jour le nom de l'organisation
    const updateOrganizationName = useCallback(async (newName) => {
        try {
            const { error } = await supabase
                .from('organizations')
                .update({ name: newName })
                .eq('id', orgId);

            if (error) throw error;
            await loadOrganization();
            return { success: true };
        } catch (err) {
            setError(err.message);
            return { success: false, error: err.message };
        }
    }, [orgId, loadOrganization]);

    // Renvoyer une invitation
    // Note: Nécessite une fonction Supabase Edge pour renvoyer l'email d'invitation
    const resendInvitation = useCallback(async (_memberId) => {
        try {
            // Placeholder - recharge les membres en attendant l'implémentation backend
            await loadMembers();
            return { success: true };
        } catch (err) {
            setError(err.message);
            return { success: false, error: err.message };
        }
    }, [loadMembers]);

    // Rafraîchir les données
    const refresh = useCallback(() => {
        setLoading(true);
        setError(null);
        loadOrganization();
        loadMembers();
    }, [loadOrganization, loadMembers]);

    return {
        organization,
        members,
        loading,
        error,
        inviteMember,
        revokeMember,
        updateMemberRole,
        updateOrganizationName,
        resendInvitation,
        refresh,
    };
}


