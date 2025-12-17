/**
 * invitations.service.js - Baikal Console
 * ============================================================================
 * Service de gestion des invitations par code.
 * Utilise les fonctions RPC du schéma `core`.
 * 
 * Fonctions RPC utilisées :
 * - core.create_invitation()
 * - core.validate_invitation_code()
 * - core.get_invitations()
 * - core.revoke_invitation()
 * 
 * @example
 * import { invitationsService } from '@/services';
 * 
 * // Créer une invitation
 * const { data, error } = await invitationsService.createInvitation({
 *   label: 'Équipe chantier Nord',
 *   maxUses: 10,
 *   expiresInDays: 30
 * });
 * 
 * // Valider un code (page signup)
 * const { data, error } = await invitationsService.validateInvitationCode('ABC123XY');
 * ============================================================================
 */

import { supabase } from '../lib/supabaseClient';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * URL de base pour les liens d'invitation
 * @type {string}
 */
const APP_BASE_URL = import.meta.env.VITE_APP_URL || window.location.origin;

/**
 * Rôles applicatifs disponibles pour les invitations
 * Note: On ne peut pas inviter directement en super_admin ou org_admin
 * @type {Array<{value: string, label: string}>}
 */
export const INVITATION_APP_ROLES = [
  { value: 'user', label: 'Utilisateur' },
  { value: 'team_leader', label: 'Chef d\'équipe' },
];

/**
 * Rôles métier disponibles pour les invitations
 * @type {Array<{value: string, label: string}>}
 */
export const INVITATION_BUSINESS_ROLES = [
  { value: 'provider', label: 'Prestataire' },
  { value: 'client', label: 'Client' },
];

// ============================================================================
// SERVICE PRINCIPAL
// ============================================================================

/**
 * Service de gestion des invitations
 */
export const invitationsService = {
  /**
   * Crée une nouvelle invitation
   * 
   * @param {Object} params - Paramètres de l'invitation
   * @param {string} [params.orgId] - ID de l'organisation (optionnel pour super_admin)
   * @param {string} [params.label] - Libellé descriptif
   * @param {number} [params.maxUses] - Nombre max d'utilisations (null = illimité)
   * @param {number} [params.expiresInDays] - Expiration en jours (null = jamais)
   * @param {string} [params.defaultAppRole='user'] - Rôle applicatif par défaut
   * @param {string} [params.defaultBusinessRole] - Rôle métier par défaut
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   * 
   * @example
   * const { data, error } = await invitationsService.createInvitation({
   *   label: 'Invitation équipe chantier',
   *   maxUses: 5,
   *   expiresInDays: 14,
   *   defaultAppRole: 'user',
   *   defaultBusinessRole: 'provider'
   * });
   * 
   * if (data?.success) {
   *   console.log('Code:', data.code);
   *   console.log('URL:', invitationsService.getInvitationUrl(data.code));
   * }
   */
  async createInvitation({
    orgId = null,
    label = null,
    maxUses = null,
    expiresInDays = null,
    defaultAppRole = 'user',
    defaultBusinessRole = null,
  } = {}) {
    try {
      const { data, error } = await supabase.rpc('create_invitation', {
        p_org_id: orgId,
        p_label: label,
        p_max_uses: maxUses,
        p_expires_in_days: expiresInDays,
        p_default_app_role: defaultAppRole,
        p_default_business_role: defaultBusinessRole,
      });

      if (error) throw error;

      // La RPC retourne un JSONB avec { success, code, org_name, expires_at, max_uses }
      if (data?.success) {
        return { 
          data: {
            ...data,
            invitationUrl: this.getInvitationUrl(data.code),
          }, 
          error: null 
        };
      } else {
        // Erreur métier retournée par la RPC
        return { 
          data: null, 
          error: new Error(data?.error || 'Erreur lors de la création de l\'invitation') 
        };
      }
    } catch (error) {
      console.error('[invitationsService.createInvitation]', error);
      return { data: null, error };
    }
  },

  /**
   * Valide un code d'invitation (utilisé sur la page signup)
   * Cette fonction est accessible aux utilisateurs non authentifiés.
   * 
   * @param {string} code - Code d'invitation à valider
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   * 
   * @example
   * const { data, error } = await invitationsService.validateInvitationCode('ABC123XY');
   * 
   * if (data?.valid) {
   *   console.log('Organisation:', data.org_name);
   *   console.log('Rôle assigné:', data.default_app_role);
   * } else {
   *   console.log('Code invalide:', data?.error);
   * }
   */
  async validateInvitationCode(code) {
    try {
      if (!code || typeof code !== 'string') {
        return { 
          data: { valid: false, error: 'Code invalide' }, 
          error: null 
        };
      }

      const { data, error } = await supabase.rpc('validate_invitation_code', {
        p_code: code.trim().toUpperCase(),
      });

      if (error) throw error;

      // La RPC retourne { valid: boolean, org_name?, org_id?, default_app_role?, error? }
      return { data, error: null };
    } catch (error) {
      console.error('[invitationsService.validateInvitationCode]', error);
      return { data: null, error };
    }
  },

  /**
   * Récupère la liste des invitations
   * - super_admin : toutes les invitations (ou filtrées par org)
   * - org_admin : uniquement les invitations de son organisation
   * 
   * @param {Object} params - Paramètres de filtrage
   * @param {string} [params.orgId] - Filtrer par organisation
   * @param {boolean} [params.includeInactive=false] - Inclure les invitations révoquées
   * @param {boolean} [params.includeExpired=false] - Inclure les invitations expirées
   * @returns {Promise<{data: Array|null, error: Error|null}>}
   * 
   * @example
   * // Toutes les invitations actives de mon org
   * const { data, error } = await invitationsService.getInvitations({});
   * 
   * // Inclure les expirées
   * const { data, error } = await invitationsService.getInvitations({
   *   includeExpired: true
   * });
   */
  async getInvitations({
    orgId = null,
    includeInactive = false,
    includeExpired = false,
  } = {}) {
    try {
      const { data, error } = await supabase.rpc('get_invitations', {
        p_org_id: orgId,
        p_include_inactive: includeInactive,
        p_include_expired: includeExpired,
      });

      if (error) throw error;

      // La RPC retourne un tableau d'invitations
      return { data: data || [], error: null };
    } catch (error) {
      console.error('[invitationsService.getInvitations]', error);
      return { data: null, error };
    }
  },

  /**
   * Révoque une invitation (la désactive)
   * 
   * @param {string} invitationId - ID de l'invitation à révoquer
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   * 
   * @example
   * const { data, error } = await invitationsService.revokeInvitation('uuid-xxx');
   * 
   * if (data?.success) {
   *   console.log('Invitation révoquée');
   * }
   */
  async revokeInvitation(invitationId) {
    try {
      if (!invitationId) {
        return { 
          data: null, 
          error: new Error('ID d\'invitation requis') 
        };
      }

      const { data, error } = await supabase.rpc('revoke_invitation', {
        p_invitation_id: invitationId,
      });

      if (error) throw error;

      // La RPC retourne { success: boolean, message?: string, error?: string }
      if (data?.success) {
        return { data, error: null };
      } else {
        return { 
          data: null, 
          error: new Error(data?.error || 'Erreur lors de la révocation') 
        };
      }
    } catch (error) {
      console.error('[invitationsService.revokeInvitation]', error);
      return { data: null, error };
    }
  },

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /**
   * Génère l'URL complète d'invitation
   * 
   * @param {string} code - Code d'invitation
   * @returns {string} URL complète
   * 
   * @example
   * const url = invitationsService.getInvitationUrl('ABC123XY');
   * // => "https://app.baikal.com/signup?invite=ABC123XY"
   */
  getInvitationUrl(code) {
    if (!code) return '';
    return `${APP_BASE_URL}/signup?invite=${code}`;
  },

  /**
   * Copie l'URL d'invitation dans le presse-papier
   * 
   * @param {string} code - Code d'invitation
   * @returns {Promise<boolean>} true si copié avec succès
   * 
   * @example
   * const success = await invitationsService.copyInvitationUrl('ABC123XY');
   * if (success) {
   *   toast.success('Lien copié !');
   * }
   */
  async copyInvitationUrl(code) {
    try {
      const url = this.getInvitationUrl(code);
      await navigator.clipboard.writeText(url);
      return true;
    } catch (error) {
      console.error('[invitationsService.copyInvitationUrl]', error);
      return false;
    }
  },

  /**
   * Copie uniquement le code dans le presse-papier
   * 
   * @param {string} code - Code d'invitation
   * @returns {Promise<boolean>} true si copié avec succès
   */
  async copyCode(code) {
    try {
      await navigator.clipboard.writeText(code);
      return true;
    } catch (error) {
      console.error('[invitationsService.copyCode]', error);
      return false;
    }
  },

  /**
   * Détermine le statut d'affichage d'une invitation
   * 
   * @param {Object} invitation - Objet invitation
   * @returns {'active'|'expired'|'exhausted'|'revoked'} Statut
   */
  getInvitationStatus(invitation) {
    if (!invitation) return 'revoked';
    
    if (!invitation.is_active) {
      return 'revoked';
    }
    
    if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
      return 'expired';
    }
    
    if (invitation.max_uses && invitation.current_uses >= invitation.max_uses) {
      return 'exhausted';
    }
    
    return 'active';
  },

  /**
   * Retourne la configuration d'affichage pour un statut
   * 
   * @param {'active'|'expired'|'exhausted'|'revoked'} status - Statut
   * @returns {Object} Configuration { label, color, bgColor, icon }
   */
  getStatusConfig(status) {
    const configs = {
      active: {
        label: 'Active',
        color: 'text-emerald-400',
        bgColor: 'bg-emerald-400/10',
        borderColor: 'border-emerald-400/30',
      },
      expired: {
        label: 'Expirée',
        color: 'text-amber-400',
        bgColor: 'bg-amber-400/10',
        borderColor: 'border-amber-400/30',
      },
      exhausted: {
        label: 'Épuisée',
        color: 'text-slate-400',
        bgColor: 'bg-slate-400/10',
        borderColor: 'border-slate-400/30',
      },
      revoked: {
        label: 'Révoquée',
        color: 'text-red-400',
        bgColor: 'bg-red-400/10',
        borderColor: 'border-red-400/30',
      },
    };
    
    return configs[status] || configs.revoked;
  },
};

export default invitationsService;
