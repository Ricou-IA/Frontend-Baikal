/**
 * users.service.js - Baikal Console
 * ============================================================================
 * Service d'administration des utilisateurs.
 * Utilise les fonctions RPC du schéma `core`.
 * 
 * ⚠️ IMPORTANT - Lien avec le système de Layers RAG :
 * Quand on modifie le `app_role` d'un utilisateur, ses permissions sur les
 * couches documentaires changent automatiquement :
 * - super_admin : APP, ORG, PROJECT, USER
 * - org_admin   : ORG, PROJECT, USER
 * - team_leader : PROJECT, USER
 * - user/member : PROJECT (avec validation), USER
 * 
 * Voir `src/config/rag-layers.config.js` pour la matrice complète.
 * 
 * Fonctions RPC utilisées :
 * - core.get_pending_users()
 * - core.get_users_for_admin()
 * - core.assign_user_to_org()
 * - core.update_user_role()
 * - core.remove_user_from_org()
 * - core.is_super_admin()
 * - core.is_org_admin()
 * - core.get_current_user_profile()
 * - core.get_my_app_role()
 * 
 * @example
 * import { usersService } from '@/services';
 * 
 * // Récupérer les users en attente d'assignation
 * const { data, error } = await usersService.getPendingUsers();
 * 
 * // Modifier le rôle d'un utilisateur
 * const { data, error } = await usersService.updateUserRole(userId, {
 *   appRole: 'team_leader',
 *   reason: 'Promotion suite à réussite projet'
 * });
 * ============================================================================
 */

import { supabase } from '../lib/supabaseClient';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Rôles applicatifs disponibles
 * Ordonnés par niveau de privilège (du plus élevé au plus bas)
 * @type {Array<{value: string, label: string, level: number, description: string}>}
 */
export const APP_ROLES = [
  { 
    value: 'super_admin', 
    label: 'Super Admin', 
    level: 1,
    description: 'Accès total, gère toutes les organisations',
    canBeAssignedBy: ['super_admin'],
  },
  { 
    value: 'org_admin', 
    label: 'Admin Organisation', 
    level: 2,
    description: 'Administrateur de son organisation',
    canBeAssignedBy: ['super_admin'],
  },
  { 
    value: 'team_leader', 
    label: 'Chef d\'équipe', 
    level: 3,
    description: 'Gère ses projets et son équipe',
    canBeAssignedBy: ['super_admin', 'org_admin'],
  },
  { 
    value: 'user', 
    label: 'Utilisateur', 
    level: 4,
    description: 'Membre standard',
    canBeAssignedBy: ['super_admin', 'org_admin'],
  },
];

/**
 * Rôles métier disponibles
 * @type {Array<{value: string, label: string, description: string}>}
 */
export const BUSINESS_ROLES = [
  { 
    value: 'provider', 
    label: 'Prestataire',
    description: 'Consultant, Auditeur, Expert...',
  },
  { 
    value: 'client', 
    label: 'Client',
    description: 'Entreprise, PME, Organisation...',
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
 * Service d'administration des utilisateurs
 */
export const usersService = {
  // ==========================================================================
  // LECTURE
  // ==========================================================================

  /**
   * Récupère les utilisateurs en attente d'assignation (sans organisation)
   * ⚠️ Réservé aux super_admin
   * 
   * @returns {Promise<{data: Array|null, error: Error|null}>}
   * 
   * @example
   * const { data: pendingUsers, error } = await usersService.getPendingUsers();
   * 
   * if (data) {
   *   console.log(`${data.length} utilisateurs en attente`);
   * }
   */
  async getPendingUsers() {
    try {
      const { data, error } = await supabase.rpc('get_pending_users');

      if (error) throw error;

      // La RPC retourne directement un tableau de users
      return { data: data || [], error: null };
    } catch (error) {
      console.error('[usersService.getPendingUsers]', error);
      return { data: null, error };
    }
  },

  /**
   * Récupère la liste des utilisateurs pour l'administration
   * - super_admin : tous les users (ou filtrés par org)
   * - org_admin : uniquement les users de son organisation
   * 
   * @param {Object} params - Paramètres de filtrage
   * @param {string} [params.orgId] - Filtrer par organisation
   * @param {string} [params.search] - Recherche par nom/email
   * @param {number} [params.limit=20] - Nombre de résultats
   * @param {number} [params.offset=0] - Offset pour pagination
   * @returns {Promise<{data: Array|null, error: Error|null}>}
   * 
   * @example
   * // Tous les users de mon org
   * const { data, error } = await usersService.getUsersForAdmin({});
   * 
   * // Recherche avec pagination
   * const { data, error } = await usersService.getUsersForAdmin({
   *   search: 'martin',
   *   limit: 10,
   *   offset: 0
   * });
   */
  async getUsersForAdmin({
    orgId = null,
    search = null,
    limit = DEFAULT_LIMIT,
    offset = DEFAULT_OFFSET,
  } = {}) {
    try {
      const { data, error } = await supabase.rpc('get_users_for_admin', {
        p_org_id: orgId,
        p_search: search,
        p_limit: limit,
        p_offset: offset,
      });

      if (error) throw error;

      // La RPC retourne un tableau avec les infos users + org
      return { data: data || [], error: null };
    } catch (error) {
      console.error('[usersService.getUsersForAdmin]', error);
      return { data: null, error };
    }
  },

  /**
   * Récupère le profil de l'utilisateur connecté via RPC
   * 
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   */
  async getCurrentUserProfile() {
    try {
      const { data, error } = await supabase.rpc('get_current_user_profile');

      if (error) throw error;

      return { data, error: null };
    } catch (error) {
      console.error('[usersService.getCurrentUserProfile]', error);
      return { data: null, error };
    }
  },

  /**
   * Récupère le rôle applicatif de l'utilisateur connecté
   * 
   * @returns {Promise<{data: string|null, error: Error|null}>}
   */
  async getMyAppRole() {
    try {
      const { data, error } = await supabase.rpc('get_my_app_role');

      if (error) throw error;

      return { data, error: null };
    } catch (error) {
      console.error('[usersService.getMyAppRole]', error);
      return { data: null, error };
    }
  },

  // ==========================================================================
  // VÉRIFICATIONS DE PERMISSIONS
  // ==========================================================================

  /**
   * Vérifie si l'utilisateur connecté est super_admin
   * 
   * @returns {Promise<{data: boolean, error: Error|null}>}
   */
  async isSuperAdmin() {
    try {
      const { data, error } = await supabase.rpc('is_super_admin');

      if (error) throw error;

      return { data: !!data, error: null };
    } catch (error) {
      console.error('[usersService.isSuperAdmin]', error);
      return { data: false, error };
    }
  },

  /**
   * Vérifie si l'utilisateur connecté est admin d'une organisation
   * 
   * @param {string} orgId - ID de l'organisation
   * @returns {Promise<{data: boolean, error: Error|null}>}
   */
  async isOrgAdmin(orgId) {
    try {
      if (!orgId) {
        return { data: false, error: null };
      }

      const { data, error } = await supabase.rpc('is_org_admin', {
        p_org_id: orgId,
      });

      if (error) throw error;

      return { data: !!data, error: null };
    } catch (error) {
      console.error('[usersService.isOrgAdmin]', error);
      return { data: false, error };
    }
  },

  // ==========================================================================
  // ACTIONS D'ADMINISTRATION
  // ==========================================================================

  /**
   * Assigne un utilisateur à une organisation
   * ⚠️ Réservé aux super_admin
   * 
   * @param {string} userId - ID de l'utilisateur à assigner
   * @param {string} orgId - ID de l'organisation cible
   * @param {string} [reason] - Raison de l'assignation (pour l'audit)
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   * 
   * @example
   * const { data, error } = await usersService.assignUserToOrg(
   *   'user-uuid',
   *   'org-uuid',
   *   'Demande client validée'
   * );
   * 
   * if (data?.success) {
   *   console.log('Utilisateur assigné !');
   * }
   */
  async assignUserToOrg(userId, orgId, reason = null) {
    try {
      if (!userId || !orgId) {
        return { 
          data: null, 
          error: new Error('ID utilisateur et ID organisation requis') 
        };
      }

      const { data, error } = await supabase.rpc('assign_user_to_org', {
        p_target_user_id: userId,
        p_org_id: orgId,
        p_reason: reason,
      });

      if (error) throw error;

      // La RPC retourne { success: boolean, message?: string, error?: string }
      if (data?.success) {
        return { data, error: null };
      } else {
        return { 
          data: null, 
          error: new Error(data?.error || 'Erreur lors de l\'assignation') 
        };
      }
    } catch (error) {
      console.error('[usersService.assignUserToOrg]', error);
      return { data: null, error };
    }
  },

  /**
   * Modifie le rôle d'un utilisateur
   * 
   * ⚠️ IMPACT SUR LES LAYERS RAG :
   * Changer le `appRole` modifie automatiquement les permissions de l'utilisateur
   * sur les couches documentaires (APP, ORG, PROJECT, USER).
   * Voir `src/config/rag-layers.config.js` pour la matrice de permissions.
   * 
   * Règles de hiérarchie :
   * - super_admin peut promouvoir jusqu'à org_admin
   * - org_admin peut promouvoir jusqu'à team_leader (dans son org)
   * - On ne peut pas promouvoir quelqu'un à un niveau >= au sien
   * 
   * @param {string} userId - ID de l'utilisateur cible
   * @param {Object} params - Nouveaux rôles
   * @param {string} params.appRole - Nouveau rôle applicatif
   * @param {string} [params.businessRole] - Nouveau rôle métier
   * @param {string} [params.reason] - Raison du changement (pour l'audit)
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   * 
   * @example
   * const { data, error } = await usersService.updateUserRole(userId, {
   *   appRole: 'team_leader',
   *   businessRole: 'provider',
   *   reason: 'Promotion suite à réussite projet'
   * });
   */
  async updateUserRole(userId, { appRole, businessRole = null, reason = null }) {
    try {
      if (!userId || !appRole) {
        return { 
          data: null, 
          error: new Error('ID utilisateur et nouveau rôle requis') 
        };
      }

      // Valider que le rôle existe
      const validRole = APP_ROLES.find(r => r.value === appRole);
      if (!validRole) {
        return { 
          data: null, 
          error: new Error(`Rôle invalide: ${appRole}`) 
        };
      }

      const { data, error } = await supabase.rpc('update_user_role', {
        p_target_user_id: userId,
        p_new_app_role: appRole,
        p_new_business_role: businessRole,
        p_reason: reason,
      });

      if (error) throw error;

      // La RPC retourne { success: boolean, message?: string, error?: string }
      if (data?.success) {
        return { data, error: null };
      } else {
        return { 
          data: null, 
          error: new Error(data?.error || 'Erreur lors de la modification du rôle') 
        };
      }
    } catch (error) {
      console.error('[usersService.updateUserRole]', error);
      return { data: null, error };
    }
  },

  /**
   * Retire un utilisateur de son organisation
   * 
   * ⚠️ IMPACT SUR LES DONNÉES :
   * L'utilisateur perd l'accès aux documents des couches ORG et PROJECT
   * de cette organisation. Ses documents personnels (USER) sont conservés.
   * 
   * Règles :
   * - super_admin peut retirer n'importe qui
   * - org_admin peut retirer les membres de son org (sauf autres org_admin)
   * 
   * @param {string} userId - ID de l'utilisateur à retirer
   * @param {string} [reason] - Raison du retrait (pour l'audit)
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   * 
   * @example
   * const { data, error } = await usersService.removeUserFromOrg(
   *   userId,
   *   'Fin de mission'
   * );
   */
  async removeUserFromOrg(userId, reason = null) {
    try {
      if (!userId) {
        return { 
          data: null, 
          error: new Error('ID utilisateur requis') 
        };
      }

      const { data, error } = await supabase.rpc('remove_user_from_org', {
        p_target_user_id: userId,
        p_reason: reason,
      });

      if (error) throw error;

      // La RPC retourne { success: boolean, message?: string, error?: string }
      if (data?.success) {
        return { data, error: null };
      } else {
        return { 
          data: null, 
          error: new Error(data?.error || 'Erreur lors du retrait') 
        };
      }
    } catch (error) {
      console.error('[usersService.removeUserFromOrg]', error);
      return { data: null, error };
    }
  },

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /**
   * Retourne les rôles qu'un utilisateur peut assigner selon son propre rôle
   * 
   * @param {string} currentUserRole - Rôle de l'utilisateur connecté
   * @returns {Array} Liste des rôles assignables
   * 
   * @example
   * const assignableRoles = usersService.getAssignableRoles('org_admin');
   * // [{ value: 'team_leader', ... }, { value: 'user', ... }]
   */
  getAssignableRoles(currentUserRole) {
    return APP_ROLES.filter(role => 
      role.canBeAssignedBy.includes(currentUserRole)
    );
  },

  /**
   * Vérifie si un utilisateur peut modifier le rôle d'un autre
   * 
   * @param {string} currentUserRole - Rôle de l'utilisateur qui veut modifier
   * @param {string} targetUserRole - Rôle actuel de l'utilisateur cible
   * @param {string} newRole - Nouveau rôle souhaité
   * @returns {boolean}
   */
  canChangeRole(currentUserRole, targetUserRole, newRole) {
    const currentLevel = APP_ROLES.find(r => r.value === currentUserRole)?.level || 99;
    const targetLevel = APP_ROLES.find(r => r.value === targetUserRole)?.level || 99;
    const newLevel = APP_ROLES.find(r => r.value === newRole)?.level || 99;

    // On ne peut pas modifier quelqu'un d'un niveau >= au sien
    if (targetLevel <= currentLevel) return false;
    
    // On ne peut pas promouvoir à un niveau >= au sien
    if (newLevel <= currentLevel) return false;

    // Vérifier que le rôle peut être assigné par l'utilisateur courant
    const roleConfig = APP_ROLES.find(r => r.value === newRole);
    return roleConfig?.canBeAssignedBy.includes(currentUserRole) || false;
  },

  /**
   * Retourne la configuration d'affichage pour un rôle
   * 
   * @param {string} role - Rôle applicatif
   * @returns {Object} Configuration { label, color, bgColor, description }
   */
  getRoleConfig(role) {
    const configs = {
      super_admin: {
        label: 'Super Admin',
        color: 'text-red-400',
        bgColor: 'bg-red-400/10',
        borderColor: 'border-red-400/30',
        icon: 'Shield',
      },
      org_admin: {
        label: 'Admin Org',
        color: 'text-amber-400',
        bgColor: 'bg-amber-400/10',
        borderColor: 'border-amber-400/30',
        icon: 'Building2',
      },
      team_leader: {
        label: 'Chef d\'équipe',
        color: 'text-blue-400',
        bgColor: 'bg-blue-400/10',
        borderColor: 'border-blue-400/30',
        icon: 'Users',
      },
      user: {
        label: 'Utilisateur',
        color: 'text-slate-400',
        bgColor: 'bg-slate-400/10',
        borderColor: 'border-slate-400/30',
        icon: 'User',
      },
    };
    
    return configs[role] || configs.user;
  },

  /**
   * Retourne la configuration d'affichage pour un rôle métier
   * 
   * @param {string} businessRole - Rôle métier
   * @returns {Object} Configuration { label, color, bgColor }
   */
  getBusinessRoleConfig(businessRole) {
    const configs = {
      provider: {
        label: 'Prestataire',
        color: 'text-indigo-400',
        bgColor: 'bg-indigo-400/10',
        borderColor: 'border-indigo-400/30',
      },
      client: {
        label: 'Client',
        color: 'text-emerald-400',
        bgColor: 'bg-emerald-400/10',
        borderColor: 'border-emerald-400/30',
      },
    };
    
    return configs[businessRole] || { 
      label: businessRole || 'Non défini', 
      color: 'text-slate-400',
      bgColor: 'bg-slate-400/10',
      borderColor: 'border-slate-400/30',
    };
  },
};

export default usersService;
