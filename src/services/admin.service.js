/**
 * admin.service.js - Baikal Console
 * ============================================================================
 * Service pour les statistiques et fonctions d'administration globale.
 * 
 * Ce service récupère les données agrégées pour le dashboard admin :
 * - Statistiques invitations actives
 * - Statistiques utilisateurs (en attente, assignés, par rôle)
 * - Statistiques organisations
 * - Statistiques projets
 * 
 * RPC utilisée :
 * - core.get_admin_stats(p_org_id) - Stats filtrées par org ou globales
 * 
 * CORRECTION 17/12/2025:
 * - Utilisation de la RPC get_admin_stats au lieu de la vue
 * - Filtrage des cards selon le rôle (org_admin vs super_admin)
 * 
 * CORRECTION 03/01/2026:
 * - Lien "UTILISATEURS" pointe vers ?tab=all pour éviter confusion avec "EN ATTENTE"
 * - Ajout carte "INVITATIONS" en première position
 * 
 * @example
 * import { adminService } from '@/services';
 * 
 * // Récupérer les stats du dashboard (super_admin = globales)
 * const { data, error } = await adminService.getAdminStats();
 * 
 * // Récupérer les stats pour une org spécifique (org_admin)
 * const { data, error } = await adminService.getAdminStats(orgId);
 * ============================================================================
 */

import { supabase } from '../lib/supabaseClient';

// ============================================================================
// SERVICE PRINCIPAL
// ============================================================================

/**
 * Service d'administration globale
 */
export const adminService = {
  /**
   * Récupère les statistiques pour le dashboard admin
   * 
   * La RPC `get_admin_stats(p_org_id)` retourne :
   * - active_invitations : Invitations actives (non expirées, non épuisées)
   * - pending_users : Utilisateurs sans organisation (0 si filtré par org)
   * - assigned_users : Utilisateurs avec organisation
   * - super_admins : Nombre de super admins (0 si filtré par org)
   * - org_admins : Nombre d'admins organisation
   * - team_leaders : Nombre de chefs d'équipe
   * - users : Nombre d'utilisateurs standards
   * - total_users : Total des utilisateurs
   * - total_organizations : Organisations actives (1 si filtré par org)
   * - total_projects : Projets actifs
   * - is_filtered : true si stats filtrées par org
   * 
   * @param {string|null} orgId - ID de l'org (null = stats globales pour super_admin)
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   */
  async getAdminStats(orgId = null) {
    try {
      const { data, error } = await supabase.rpc('get_admin_stats', {
        p_org_id: orgId
      });

      if (error) throw error;

      // La RPC retourne un JSONB
      return { data, error: null };
    } catch (error) {
      console.error('[adminService.getAdminStats]', error);
      return { data: null, error };
    }
  },

  /**
   * Récupère les statistiques formatées pour les cards du dashboard
   * 
   * @param {Object} options - Options
   * @param {string|null} options.orgId - ID de l'org (null = globales)
   * @param {boolean} options.isSuperAdmin - Est super_admin
   * @returns {Promise<{data: Array|null, error: Error|null}>}
   * 
   * @example
   * // Super admin - toutes les cards
   * const { data: cards } = await adminService.getDashboardCards({ isSuperAdmin: true });
   * 
   * // Org admin - cards filtrées
   * const { data: cards } = await adminService.getDashboardCards({ 
   *   orgId: 'xxx', 
   *   isSuperAdmin: false 
   * });
   */
  async getDashboardCards({ orgId = null, isSuperAdmin = false } = {}) {
    try {
      const { data: stats, error } = await this.getAdminStats(orgId);

      if (error) throw error;
      if (!stats) return { data: [], error: null };

      // Toutes les cards possibles
      const allCards = [
        {
          id: 'invitations',
          label: 'Invitations',
          value: stats.active_invitations || 0,
          description: 'Invitations actives',
          icon: 'Mail',
          color: 'cyan',
          bgColor: 'bg-cyan-400/10',
          textColor: 'text-cyan-400',
          borderColor: 'border-cyan-400/30',
          link: '/admin/invitations',
          priority: 'normal',
          superAdminOnly: false, // Visible par tous les admins
        },
        {
          id: 'pending',
          label: 'En attente',
          value: stats.pending_users || 0,
          description: 'Utilisateurs sans organisation',
          icon: 'UserPlus',
          color: 'amber',
          bgColor: 'bg-amber-400/10',
          textColor: 'text-amber-400',
          borderColor: 'border-amber-400/30',
          link: '/admin/users?tab=pending',
          priority: stats.pending_users > 0 ? 'high' : 'normal',
          superAdminOnly: true, // Uniquement pour super_admin
        },
        {
          id: 'total_users',
          label: 'Utilisateurs',
          value: stats.total_users || 0,
          description: stats.is_filtered 
            ? 'Membres de l\'organisation' 
            : `${stats.assigned_users || 0} assignés`,
          icon: 'Users',
          color: 'blue',
          bgColor: 'bg-blue-400/10',
          textColor: 'text-blue-400',
          borderColor: 'border-blue-400/30',
          link: '/admin/users?tab=all',
          priority: 'normal',
          superAdminOnly: false,
        },
        {
          id: 'organizations',
          label: 'Organisations',
          value: stats.total_organizations || 0,
          description: 'Organisations actives',
          icon: 'Building2',
          color: 'emerald',
          bgColor: 'bg-emerald-400/10',
          textColor: 'text-emerald-400',
          borderColor: 'border-emerald-400/30',
          link: '/admin/organizations',
          priority: 'normal',
          superAdminOnly: true, // Uniquement pour super_admin
        },
        {
          id: 'projects',
          label: 'Projets',
          value: stats.total_projects || 0,
          description: 'Projets actifs',
          icon: 'FolderOpen',
          color: 'violet',
          bgColor: 'bg-violet-400/10',
          textColor: 'text-violet-400',
          borderColor: 'border-violet-400/30',
          link: '/admin/projects',
          priority: 'normal',
          superAdminOnly: false,
        },
      ];

      // Filtrer selon le rôle
      const cards = isSuperAdmin 
        ? allCards 
        : allCards.filter(card => !card.superAdminOnly);

      return { data: cards, error: null };
    } catch (error) {
      console.error('[adminService.getDashboardCards]', error);
      return { data: null, error };
    }
  },

  /**
   * Récupère la répartition des utilisateurs par rôle
   * 
   * @param {Object} options - Options
   * @param {string|null} options.orgId - ID de l'org (null = globales)
   * @param {boolean} options.isSuperAdmin - Est super_admin
   * @returns {Promise<{data: Array|null, error: Error|null}>}
   */
  async getUsersByRole({ orgId = null, isSuperAdmin = false } = {}) {
    try {
      const { data: stats, error } = await this.getAdminStats(orgId);

      if (error) throw error;
      if (!stats) return { data: [], error: null };

      // Tous les rôles possibles
      const allRoles = [
        {
          role: 'super_admin',
          count: stats.super_admins || 0,
          label: 'Super Admin',
          color: 'text-red-400',
          bgColor: 'bg-red-400/10',
          superAdminOnly: true, // Ne pas afficher pour org_admin
        },
        {
          role: 'org_admin',
          count: stats.org_admins || 0,
          label: 'Admin Org',
          color: 'text-amber-400',
          bgColor: 'bg-amber-400/10',
          superAdminOnly: false,
        },
        {
          role: 'team_leader',
          count: stats.team_leaders || 0,
          label: 'Chef d\'équipe',
          color: 'text-blue-400',
          bgColor: 'bg-blue-400/10',
          superAdminOnly: false,
        },
        {
          role: 'user',
          count: stats.users || 0,
          label: 'Utilisateur',
          color: 'text-slate-400',
          bgColor: 'bg-slate-400/10',
          superAdminOnly: false,
        },
      ];

      // Filtrer selon le rôle
      const roles = isSuperAdmin 
        ? allRoles 
        : allRoles.filter(role => !role.superAdminOnly);

      return { data: roles, error: null };
    } catch (error) {
      console.error('[adminService.getUsersByRole]', error);
      return { data: null, error };
    }
  },

  /**
   * Récupère un résumé rapide pour l'affichage dans le header/sidebar
   * 
   * @param {string|null} orgId - ID de l'org (null = globales)
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   */
  async getQuickSummary(orgId = null) {
    try {
      const { data: stats, error } = await this.getAdminStats(orgId);

      if (error) throw error;
      if (!stats) return { data: null, error: null };

      return {
        data: {
          activeInvitations: stats.active_invitations || 0,
          pendingUsers: stats.pending_users || 0,
          totalUsers: stats.total_users || 0,
          totalOrgs: stats.total_organizations || 0,
          totalProjects: stats.total_projects || 0,
          hasPendingActions: (stats.pending_users || 0) > 0,
          isFiltered: stats.is_filtered || false,
        },
        error: null,
      };
    } catch (error) {
      console.error('[adminService.getQuickSummary]', error);
      return { data: null, error };
    }
  },

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /**
   * Formate un nombre pour l'affichage (ex: 1234 -> "1.2k")
   * 
   * @param {number} value - Valeur à formater
   * @returns {string} Valeur formatée
   */
  formatNumber(value) {
    if (value === null || value === undefined) return '0';
    
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}k`;
    }
    return value.toString();
  },

  /**
   * Calcule le pourcentage d'un sous-ensemble par rapport au total
   * 
   * @param {number} part - Partie
   * @param {number} total - Total
   * @returns {number} Pourcentage (0-100)
   */
  calculatePercentage(part, total) {
    if (!total || total === 0) return 0;
    return Math.round((part / total) * 100);
  },

  /**
   * Retourne la configuration de couleur selon une valeur et des seuils
   * 
   * @param {number} value - Valeur à évaluer
   * @param {Object} thresholds - Seuils { warning: number, danger: number }
   * @returns {Object} Configuration { color, bgColor, status }
   */
  getStatusByThreshold(value, thresholds = { warning: 5, danger: 10 }) {
    if (value >= thresholds.danger) {
      return {
        status: 'danger',
        color: 'text-red-400',
        bgColor: 'bg-red-400/10',
        borderColor: 'border-red-400/30',
      };
    }
    if (value >= thresholds.warning) {
      return {
        status: 'warning',
        color: 'text-amber-400',
        bgColor: 'bg-amber-400/10',
        borderColor: 'border-amber-400/30',
      };
    }
    return {
      status: 'normal',
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-400/10',
      borderColor: 'border-emerald-400/30',
    };
  },
};

export default adminService;
