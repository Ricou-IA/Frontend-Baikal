/**
 * Profile Service - Baikal Console
 * ============================================================================
 * MIGRATION PHASE 3 - Schémas explicites
 * 
 * MODIFICATIONS:
 * - profiles → core.profiles (schéma)
 * - organizations → core.organizations (schéma)
 * ============================================================================
 */

import { supabase } from '../lib/supabaseClient';

/**
 * Service de gestion des profils
 */
export const profileService = {
  /**
   * Récupère un profil par son ID
   * @param {string} userId - ID de l'utilisateur
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   */
  async getProfile(userId) {
    try {
      // Tables dans search_path: core
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        // PGRST116 = No rows found
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
   * Récupère un profil avec son organisation
   * @param {string} userId - ID de l'utilisateur
   * @returns {Promise<{profile: Object|null, organization: Object|null, error: Error|null}>}
   */
  async getProfileWithOrganization(userId) {
    try {
      // Tables dans search_path: core
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError) {
        if (profileError.code === 'PGRST116') {
          return { profile: null, organization: null, error: null };
        }
        throw profileError;
      }

      // Récupère l'organisation si présente
      let organization = null;
      if (profile?.org_id) {
        // Tables dans search_path: core
        const { data: orgData, error: orgError } = await supabase
          .from('organizations')
          .select('*')
          .eq('id', profile.org_id)
          .single();

        if (!orgError) {
          organization = orgData;
        }
      }

      return { profile, organization, error: null };
    } catch (error) {
      return { profile: null, organization: null, error };
    }
  },

  /**
   * Met à jour un profil
   * @param {string} userId - ID de l'utilisateur
   * @param {Object} data - Données à mettre à jour
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   */
  async updateProfile(userId, data) {
    try {
      // Tables dans search_path: core
      const { data: updated, error } = await supabase
        .from('profiles')
        .update({
          ...data,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;
      return { data: updated, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  /**
   * Complète l'onboarding d'un utilisateur
   * @param {string} userId - ID de l'utilisateur
   * @param {string} businessRole - Rôle business (provider/client)
   * @param {string} bio - Bio de l'utilisateur
   * @param {Object} additionalData - Données supplémentaires
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   */
  async completeOnboarding(userId, businessRole, bio = '', additionalData = {}) {
    try {
      // Tables dans search_path: core
      const { data, error } = await supabase
        .from('profiles')
        .update({
          business_role: businessRole,
          bio,
          ...additionalData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  /**
   * Utilise la fonction RPC pour compléter l'onboarding
   * NOTE: Les RPC ne nécessitent pas de changement de schéma
   * @param {string} businessRole - Rôle business
   * @param {string} bio - Bio
   * @returns {Promise<{success: boolean, error: Error|null}>}
   */
  async completeOnboardingRPC(businessRole, bio = '') {
    try {
      const { data, error } = await supabase.rpc('complete_onboarding', {
        p_business_role: businessRole,
        p_bio: bio,
      });

      if (error) throw error;
      return { success: true, data, error: null };
    } catch (error) {
      return { success: false, data: null, error };
    }
  },

  /**
   * Récupère le profil de l'utilisateur connecté via RPC
   * NOTE: Les RPC ne nécessitent pas de changement de schéma
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   */
  async getMyProfile() {
    try {
      const { data, error } = await supabase.rpc('get_my_profile');

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  /**
   * Met à jour l'avatar d'un utilisateur
   * @param {string} userId - ID de l'utilisateur
   * @param {string} avatarUrl - URL de l'avatar
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   */
  async updateAvatar(userId, avatarUrl) {
    return this.updateProfile(userId, { avatar_url: avatarUrl });
  },

  /**
   * Met à jour le nom complet
   * @param {string} userId - ID de l'utilisateur
   * @param {string} fullName - Nom complet
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   */
  async updateFullName(userId, fullName) {
    return this.updateProfile(userId, { full_name: fullName });
  },

  /**
   * Récupère tous les profils (admin uniquement)
   * @param {Object} options - Options de filtrage
   * @param {number} options.limit - Limite de résultats
   * @param {number} options.offset - Offset pour pagination
   * @param {string} options.orderBy - Champ de tri
   * @param {boolean} options.ascending - Ordre croissant
   * @returns {Promise<{data: Array|null, count: number, error: Error|null}>}
   */
  async getAllProfiles(options = {}) {
    const {
      limit = 100,
      offset = 0,
      orderBy = 'created_at',
      ascending = false,
    } = options;

    try {
      // Tables dans search_path: core
      const { data, error, count } = await supabase
        .from('profiles')
        .select('*', { count: 'exact' })
        .order(orderBy, { ascending })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      return { data, count, error: null };
    } catch (error) {
      return { data: null, count: 0, error };
    }
  },
};

export default profileService;
