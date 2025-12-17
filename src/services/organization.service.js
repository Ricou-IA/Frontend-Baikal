/**
 * organization.service.js - Baikal Console
 * ============================================================================
 * Service de gestion des organisations.
 * 
 * REFACTORISATION v2.0 - Utilisation des RPC
 * 
 * Ce service utilise maintenant les fonctions RPC du schéma `core` :
 * - core.create_organization()
 * - core.update_organization()
 * - core.delete_organization()
 * - core.get_organizations()
 * 
 * ⚠️ FONCTIONS DEPRECATED :
 * Les fonctions de gestion des membres (inviteMember, revokeMember, etc.)
 * sont remplacées par le nouveau système :
 * - invitationsService : pour inviter via codes
 * - usersService : pour assigner/retirer des utilisateurs
 * 
 * @example
 * import { organizationService } from '@/services';
 * 
 * // Créer une organisation
 * const { data, error } = await organizationService.createOrganization({
 *   name: 'Mon Entreprise',
 *   plan: 'starter',
 *   appId: 'arpet'
 * });
 * 
 * // Lister les organisations
 * const { data, error } = await organizationService.getOrganizations({
 *   search: 'entreprise'
 * });
 * ============================================================================
 */

import { supabase } from '../lib/supabaseClient';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Plans disponibles pour les organisations
 * @type {Array<{value: string, label: string, description: string}>}
 */
export const ORGANIZATION_PLANS = [
  { 
    value: 'free', 
    label: 'Gratuit', 
    description: 'Fonctionnalités de base',
    color: 'text-slate-400',
    bgColor: 'bg-slate-400/10',
    borderColor: 'border-slate-400/30',
  },
  { 
    value: 'starter', 
    label: 'Starter', 
    description: 'Pour les petites équipes',
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/10',
    borderColor: 'border-blue-400/30',
  },
  { 
    value: 'pro', 
    label: 'Pro', 
    description: 'Pour les entreprises',
    color: 'text-violet-400',
    bgColor: 'bg-violet-400/10',
    borderColor: 'border-violet-400/30',
  },
  { 
    value: 'enterprise', 
    label: 'Enterprise', 
    description: 'Solutions personnalisées',
    color: 'text-amber-400',
    bgColor: 'bg-amber-400/10',
    borderColor: 'border-amber-400/30',
  },
];

/**
 * Pagination par défaut
 */
const DEFAULT_LIMIT = 20;
const DEFAULT_OFFSET = 0;

// ============================================================================
// SERVICE PRINCIPAL
// ============================================================================

/**
 * Service de gestion des organisations
 */
export const organizationService = {
  // ==========================================================================
  // LECTURE (via RPC)
  // ==========================================================================

  /**
   * Récupère la liste des organisations
   * - super_admin : toutes les organisations
   * - org_admin : uniquement son organisation
   * 
   * @param {Object} params - Paramètres de filtrage
   * @param {boolean} [params.includeInactive=false] - Inclure les organisations désactivées
   * @param {string} [params.search] - Recherche par nom
   * @param {number} [params.limit=20] - Nombre de résultats
   * @param {number} [params.offset=0] - Offset pour pagination
   * @returns {Promise<{data: Array|null, error: Error|null}>}
   * 
   * @example
   * const { data, error } = await organizationService.getOrganizations({
   *   search: 'martin',
   *   limit: 10
   * });
   */
  async getOrganizations({
    includeInactive = false,
    search = null,
    limit = DEFAULT_LIMIT,
    offset = DEFAULT_OFFSET,
  } = {}) {
    try {
      const { data, error } = await supabase.rpc('get_organizations', {
        p_include_inactive: includeInactive,
        p_search: search,
        p_limit: limit,
        p_offset: offset,
      });

      if (error) throw error;

      return { data: data || [], error: null };
    } catch (error) {
      console.error('[organizationService.getOrganizations]', error);
      return { data: null, error };
    }
  },

  /**
   * Récupère une organisation par son ID
   * Utilise get_organizations avec un filtre côté client
   * 
   * @param {string} orgId - ID de l'organisation
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   * 
   * @example
   * const { data: org, error } = await organizationService.getOrganization(orgId);
   */
  async getOrganization(orgId) {
    try {
      if (!orgId) {
        return { data: null, error: null };
      }

      // Utiliser la requête directe pour un seul enregistrement (plus efficace)
      const { data, error } = await supabase
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
      console.error('[organizationService.getOrganization]', error);
      return { data: null, error };
    }
  },

  /**
   * Récupère les membres d'une organisation avec leurs profils
   * 
   * @param {string} orgId - ID de l'organisation
   * @returns {Promise<{data: Array|null, error: Error|null}>}
   * 
   * @example
   * const { data: members, error } = await organizationService.getMembers(orgId);
   */
  async getMembers(orgId) {
    try {
      if (!orgId) {
        return { data: [], error: null };
      }

      // Récupérer les membres
      const { data: membersData, error: membersError } = await supabase
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
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, email, full_name, avatar_url, app_role, business_role')
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
        profile: member.user_id ? profilesMap[member.user_id] || null : null,
      }));

      return { data: membersWithProfiles, error: null };
    } catch (error) {
      console.error('[organizationService.getMembers]', error);
      return { data: null, error };
    }
  },

  // ==========================================================================
  // CRÉATION / MODIFICATION (via RPC)
  // ==========================================================================

  /**
   * Crée une nouvelle organisation
   * ⚠️ Réservé aux super_admin
   * 
   * @param {Object} params - Paramètres de l'organisation
   * @param {string} params.name - Nom de l'organisation (requis)
   * @param {string} [params.slug] - Slug URL-friendly (auto-généré si non fourni)
   * @param {string} [params.description] - Description
   * @param {string} [params.plan='free'] - Plan (free, starter, pro, enterprise)
   * @param {Object} [params.settings] - Paramètres JSON personnalisés
   * @param {string} [params.appId] - ID de l'application associée
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   * 
   * @example
   * const { data, error } = await organizationService.createOrganization({
   *   name: 'Mon Entreprise BTP',
   *   description: 'Entreprise générale de bâtiment',
   *   plan: 'starter',
   *   appId: 'arpet'
   * });
   * 
   * if (data?.success) {
   *   console.log('Org créée:', data.org_id);
   *   console.log('Slug:', data.slug);
   * }
   */
  async createOrganization({
    name,
    slug = null,
    description = null,
    plan = 'free',
    settings = null,
    appId = null,
  }) {
    try {
      if (!name || name.trim() === '') {
        return { 
          data: null, 
          error: new Error('Le nom de l\'organisation est requis') 
        };
      }

      // Valider le plan
      const validPlan = ORGANIZATION_PLANS.find(p => p.value === plan);
      if (!validPlan) {
        return { 
          data: null, 
          error: new Error(`Plan invalide: ${plan}`) 
        };
      }

      const { data, error } = await supabase.rpc('create_organization', {
        p_name: name.trim(),
        p_slug: slug,
        p_description: description,
        p_plan: plan,
        p_settings: settings,
        p_app_id: appId,
      });

      if (error) throw error;

      // La RPC retourne { success, message, org_id, slug } ou { success: false, error }
      if (data?.success) {
        return { data, error: null };
      } else {
        return { 
          data: null, 
          error: new Error(data?.error || 'Erreur lors de la création de l\'organisation') 
        };
      }
    } catch (error) {
      console.error('[organizationService.createOrganization]', error);
      return { data: null, error };
    }
  },

  /**
   * Met à jour une organisation existante
   * - super_admin : peut tout modifier
   * - org_admin : peut modifier name et description de son org
   * 
   * @param {string} orgId - ID de l'organisation
   * @param {Object} params - Paramètres à modifier
   * @param {string} [params.name] - Nouveau nom
   * @param {string} [params.description] - Nouvelle description
   * @param {string} [params.plan] - Nouveau plan (super_admin only)
   * @param {Object} [params.settings] - Nouveaux paramètres
   * @param {boolean} [params.isActive] - Activer/désactiver (super_admin only)
   * @param {string} [params.appId] - ID de l'application associée
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   * 
   * @example
   * const { data, error } = await organizationService.updateOrganization(orgId, {
   *   name: 'Nouveau Nom',
   *   plan: 'pro',
   *   appId: 'arpet'
   * });
   */
  async updateOrganization(orgId, { 
    name = null, 
    description = null, 
    plan = null, 
    settings = null, 
    isActive = null,
    appId = null,
  }) {
    try {
      if (!orgId) {
        return { 
          data: null, 
          error: new Error('ID de l\'organisation requis') 
        };
      }

      // Valider le plan si fourni
      if (plan) {
        const validPlan = ORGANIZATION_PLANS.find(p => p.value === plan);
        if (!validPlan) {
          return { 
            data: null, 
            error: new Error(`Plan invalide: ${plan}`) 
          };
        }
      }

      const { data, error } = await supabase.rpc('update_organization', {
        p_org_id: orgId,
        p_name: name,
        p_description: description,
        p_plan: plan,
        p_settings: settings,
        p_is_active: isActive,
        p_app_id: appId,
      });

      if (error) throw error;

      // La RPC retourne { success, message } ou { success: false, error }
      if (data?.success) {
        return { data, error: null };
      } else {
        return { 
          data: null, 
          error: new Error(data?.error || 'Erreur lors de la modification') 
        };
      }
    } catch (error) {
      console.error('[organizationService.updateOrganization]', error);
      return { data: null, error };
    }
  },

  /**
   * Supprime une organisation
   * ⚠️ Réservé aux super_admin
   * 
   * @param {string} orgId - ID de l'organisation
   * @param {boolean} [confirm=false] - Confirmer la suppression
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   * 
   * @example
   * // Premier appel - demande de confirmation
   * const { data, error } = await organizationService.deleteOrganization(orgId);
   * 
   * if (data?.confirmationRequired) {
   *   // Afficher modal de confirmation avec data.memberCount
   *   const confirmDelete = window.confirm(data.message);
   *   if (confirmDelete) {
   *     await organizationService.deleteOrganization(orgId, true);
   *   }
   * }
   */
  async deleteOrganization(orgId, confirm = false) {
    try {
      if (!orgId) {
        return { 
          data: null, 
          error: new Error('ID de l\'organisation requis') 
        };
      }

      const { data, error } = await supabase.rpc('delete_organization', {
        p_org_id: orgId,
        p_confirm: confirm,
      });

      if (error) throw error;

      // La RPC peut retourner :
      // - { success: false, error: 'confirmation_required', message, member_count }
      // - { success: true, message }
      // - { success: false, error }
      
      if (data?.success) {
        return { data, error: null };
      } else if (data?.error === 'confirmation_required') {
        return { 
          data: {
            confirmationRequired: true,
            message: data.message,
            memberCount: data.member_count,
          }, 
          error: null 
        };
      } else {
        return { 
          data: null, 
          error: new Error(data?.error || 'Erreur lors de la suppression') 
        };
      }
    } catch (error) {
      console.error('[organizationService.deleteOrganization]', error);
      return { data: null, error };
    }
  },

  // ==========================================================================
  // FONCTIONS DEPRECATED (pour compatibilité)
  // ==========================================================================

  /**
   * @deprecated Utiliser getOrganizations() à la place
   */
  async getAllOrganizations(options = {}) {
    console.warn('[organizationService] getAllOrganizations() est deprecated. Utilisez getOrganizations()');
    return this.getOrganizations(options);
  },

  /**
   * @deprecated Utiliser invitationsService.createInvitation() à la place
   * Le nouveau système utilise des codes d'invitation
   */
  async inviteMember(orgId, email, role = 'member') {
    console.warn('[organizationService] inviteMember() est deprecated. Utilisez invitationsService.createInvitation()');
    
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
   * @deprecated Utiliser usersService.removeUserFromOrg() à la place
   */
  async revokeMember(memberId) {
    console.warn('[organizationService] revokeMember() est deprecated. Utilisez usersService.removeUserFromOrg()');
    
    try {
      const { error } = await supabase
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
   * @deprecated Utiliser usersService.updateUserRole() à la place
   */
  async updateMemberRole(memberId, newRole) {
    console.warn('[organizationService] updateMemberRole() est deprecated. Utilisez usersService.updateUserRole()');
    
    try {
      const { error } = await supabase
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
   * @deprecated Plus nécessaire avec le système d'invitations par code
   */
  async checkMemberExists(orgId, email) {
    console.warn('[organizationService] checkMemberExists() est deprecated');
    
    try {
      const { data, error } = await supabase
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
   * @deprecated Plus nécessaire avec le système d'invitations par code
   */
  async updateMemberStatus(memberId, status) {
    console.warn('[organizationService] updateMemberStatus() est deprecated');
    
    try {
      const { error } = await supabase
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

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /**
   * Retourne la configuration d'affichage pour un plan
   * 
   * @param {string} plan - Plan de l'organisation
   * @returns {Object} Configuration { label, color, bgColor, borderColor, description }
   */
  getPlanConfig(plan) {
    const config = ORGANIZATION_PLANS.find(p => p.value === plan);
    return config || {
      value: plan,
      label: plan || 'Inconnu',
      description: '',
      color: 'text-slate-400',
      bgColor: 'bg-slate-400/10',
      borderColor: 'border-slate-400/30',
    };
  },

  /**
   * Génère un slug à partir d'un nom d'organisation
   * 
   * @param {string} name - Nom de l'organisation
   * @returns {string} Slug URL-friendly
   */
  generateSlug(name) {
    if (!name) return '';
    
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Supprime les accents
      .replace(/[^a-z0-9]+/g, '-')     // Remplace les caractères spéciaux par des tirets
      .replace(/^-+|-+$/g, '')          // Supprime les tirets en début/fin
      .substring(0, 50);                // Limite la longueur
  },
};

export default organizationService;
