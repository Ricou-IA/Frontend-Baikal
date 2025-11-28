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
            const { data, error: membersError } = await supabase
                .from('organization_members')
                .select(`
                    *,
                    profiles:user_id (
                        id,
                        email,
                        full_name,
                        avatar_url
                    )
                `)
                .eq('org_id', orgId)
                .order('created_at', { ascending: false });

            if (membersError) throw membersError;
            setMembers(data || []);
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
    const resendInvitation = useCallback(async (memberId) => {
        try {
            // TODO: Implémenter la logique de renvoi d'invitation
            // Pour l'instant, on recharge juste les membres
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

