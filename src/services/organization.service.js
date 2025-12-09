/**
 * Organization Service - Baikal Console
 * ============================================================================
 * MIGRATION PHASE 3 - Schémas explicites
 * 
 * MODIFICATIONS:
 * - organizations → core.organizations (schéma)
 * - organization_members → core.organization_members (schéma)
 * - profiles → core.profiles (schéma)
 * ============================================================================
 */

import { supabase } from '../lib/supabaseClient';

/**
 * Service de gestion des organisations
 */
export const organizationService = {
  /**
   * Récupère une organisation par son ID
   * @param {string} orgId - ID de l'organisation
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   */
  async getOrganization(orgId) {
    try {
      // MIGRATION: organizations → core.organizations
      const { data, error } = await supabase
        .schema('core')
        .from('organizations')
        .select('*')
        .eq('id', orgId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return { data: null, error: null };
        }
        throw error;
      }

      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  /**
   * Met à jour une organisation
   * @param {string} orgId - ID de l'organisation
   * @param {Object} data - Données à mettre à jour
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   */
  async updateOrganization(orgId, data) {
    try {
      // MIGRATION: organizations → core.organizations
      const { data: updated, error } = await supabase
        .schema('core')
        .from('organizations')
        .update({
          ...data,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orgId)
        .select()
        .single();

      if (error) throw error;
      return { data: updated, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  /**
   * Récupère les membres d'une organisation avec leurs profils
   * @param {string} orgId - ID de l'organisation
   * @returns {Promise<{data: Array|null, error: Error|null}>}
   */
  async getMembers(orgId) {
    try {
      // MIGRATION: organization_members → core.organization_members
      const { data: membersData, error: membersError } = await supabase
        .schema('core')
        .from('organization_members')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });

      if (membersError) throw membersError;

      if (!membersData || membersData.length === 0) {
        return { data: [], error: null };
      }

      // Récupérer les user_ids non nulls
      const userIds = membersData
        .map(m => m.user_id)
        .filter(id => id !== null);

      let profilesMap = {};
      if (userIds.length > 0) {
        // MIGRATION: profiles → core.profiles
        const { data: profilesData, error: profilesError } = await supabase
          .schema('core')
          .from('profiles')
          .select('id, email, full_name, avatar_url')
          .in('id', userIds);

        if (!profilesError && profilesData) {
          profilesMap = profilesData.reduce((acc, profile) => {
            acc[profile.id] = profile;
            return acc;
          }, {});
        }
      }

      // Fusionner les membres avec leurs profils
      const membersWithProfiles = membersData.map(member => ({
        ...member,
        profiles: member.user_id ? profilesMap[member.user_id] || null : null,
      }));

      return { data: membersWithProfiles, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  /**
   * Invite un nouveau membre dans l'organisation
   * Utilise l'Edge Function invite-user
   * @param {string} orgId - ID de l'organisation
   * @param {string} email - Email du membre à inviter
   * @param {string} role - Rôle du membre ('admin' | 'member')
   * @returns {Promise<{success: boolean, error: Error|null}>}
   */
  async inviteMember(orgId, email, role = 'member') {
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

      return { success: true, error: null };
    } catch (error) {
      return { success: false, error };
    }
  },

  /**
   * Révoque un membre de l'organisation
   * @param {string} memberId - ID du membre (dans organization_members)
   * @returns {Promise<{success: boolean, error: Error|null}>}
   */
  async revokeMember(memberId) {
    try {
      // MIGRATION: organization_members → core.organization_members
      const { error } = await supabase
        .schema('core')
        .from('organization_members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;
      return { success: true, error: null };
    } catch (error) {
      return { success: false, error };
    }
  },

  /**
   * Met à jour le rôle d'un membre
   * @param {string} memberId - ID du membre
   * @param {string} newRole - Nouveau rôle ('owner' | 'admin' | 'member')
   * @returns {Promise<{success: boolean, error: Error|null}>}
   */
  async updateMemberRole(memberId, newRole) {
    try {
      // MIGRATION: organization_members → core.organization_members
      const { error } = await supabase
        .schema('core')
        .from('organization_members')
        .update({ 
          role: newRole,
          updated_at: new Date().toISOString(),
        })
        .eq('id', memberId);

      if (error) throw error;
      return { success: true, error: null };
    } catch (error) {
      return { success: false, error };
    }
  },

  /**
   * Récupère toutes les organisations (super_admin uniquement)
   * @param {Object} options - Options de filtrage
   * @param {number} options.limit - Limite de résultats
   * @param {number} options.offset - Offset pour pagination
   * @returns {Promise<{data: Array|null, count: number, error: Error|null}>}
   */
  async getAllOrganizations(options = {}) {
    const {
      limit = 100,
      offset = 0,
    } = options;

    try {
      // MIGRATION: organizations → core.organizations
      const { data, error, count } = await supabase
        .schema('core')
        .from('organizations')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      return { data, count, error: null };
    } catch (error) {
      return { data: null, count: 0, error };
    }
  },

  /**
   * Crée une nouvelle organisation
   * @param {Object} data - Données de l'organisation
   * @param {string} data.name - Nom de l'organisation
   * @param {string} data.plan - Plan de l'organisation ('free' | 'starter' | 'pro' | 'enterprise')
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   */
  async createOrganization(data) {
    try {
      // MIGRATION: organizations → core.organizations
      const { data: created, error } = await supabase
        .schema('core')
        .from('organizations')
        .insert({
          name: data.name,
          plan: data.plan || 'free',
          ...data,
        })
        .select()
        .single();

      if (error) throw error;
      return { data: created, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  /**
   * Supprime une organisation
   * @param {string} orgId - ID de l'organisation
   * @returns {Promise<{success: boolean, error: Error|null}>}
   */
  async deleteOrganization(orgId) {
    try {
      // MIGRATION: organizations → core.organizations
      const { error } = await supabase
        .schema('core')
        .from('organizations')
        .delete()
        .eq('id', orgId);

      if (error) throw error;
      return { success: true, error: null };
    } catch (error) {
      return { success: false, error };
    }
  },

  /**
   * Vérifie si un email est déjà membre de l'organisation
   * @param {string} orgId - ID de l'organisation
   * @param {string} email - Email à vérifier
   * @returns {Promise<{exists: boolean, error: Error|null}>}
   */
  async checkMemberExists(orgId, email) {
    try {
      // MIGRATION: organization_members → core.organization_members
      const { data, error } = await supabase
        .schema('core')
        .from('organization_members')
        .select('id')
        .eq('org_id', orgId)
        .eq('invited_email', email)
        .maybeSingle();

      if (error) throw error;
      return { exists: !!data, error: null };
    } catch (error) {
      return { exists: false, error };
    }
  },

  /**
   * Met à jour le statut d'un membre (invited → active)
   * @param {string} memberId - ID du membre
   * @param {string} status - Nouveau statut ('active' | 'invited')
   * @returns {Promise<{success: boolean, error: Error|null}>}
   */
  async updateMemberStatus(memberId, status) {
    try {
      // MIGRATION: organization_members → core.organization_members
      const { error } = await supabase
        .schema('core')
        .from('organization_members')
        .update({ 
          status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', memberId);

      if (error) throw error;
      return { success: true, error: null };
    } catch (error) {
      return { success: false, error };
    }
  },
};

export default organizationService;
