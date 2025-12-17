/**
 * admin.service.js - Baikal Console
 * ============================================================================
 * Service pour les statistiques et fonctions d'administration globale.
 * 
 * Ce service récupère les données agrégées pour le dashboard admin :
 * - Statistiques utilisateurs (en attente, assignés, par rôle)
 * - Statistiques organisations
 * - Statistiques projets
 * 
 * Vue utilisée :
 * - core.admin_users_stats (accessible aux super_admin et org_admin)
 * 
 * @example
 * import { adminService } from '@/services';
 * 
 * // Récupérer les stats du dashboard
 * const { data, error } = await adminService.getAdminStats();
 * 
 * if (data) {
 *   console.log(`${data.pending_users} utilisateurs en attente`);
 *   console.log(`${data.total_organizations} organisations actives`);
 * }
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
   * Récupère les statistiques globales pour le dashboard admin
   * 
   * La vue `core.admin_users_stats` retourne :
   * - pending_users : Utilisateurs sans organisation
   * - assigned_users : Utilisateurs avec organisation
   * - super_admins : Nombre de super admins
   * - org_admins : Nombre d'admins organisation
   * - team_leaders : Nombre de chefs d'équipe
   * - users : Nombre d'utilisateurs standards
   * - total_users : Total des utilisateurs
   * - total_organizations : Organisations actives
   * - total_projects : Projets actifs
   * 
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   * 
   * @example
   * const { data, error } = await adminService.getAdminStats();
   * 
   * if (data) {
   *   // Afficher les cards du dashboard
   *   console.log('En attente:', data.pending_users);
   *   console.log('Total users:', data.total_users);
   *   console.log('Organisations:', data.total_organizations);
   *   console.log('Projets:', data.total_projects);
   * }
   */
  async getAdminStats() {
    try {
      const { data, error } = await supabase
        .from('admin_users_stats')
        .select('*')
        .single();

      if (error) throw error;

      return { data, error: null };
    } catch (error) {
      console.error('[adminService.getAdminStats]', error);
      return { data: null, error };
    }
  },

  /**
   * Récupère les statistiques formatées pour les cards du dashboard
   * 
   * @returns {Promise<{data: Array|null, error: Error|null}>}
   * 
   * @example
   * const { data: cards, error } = await adminService.getDashboardCards();
   * 
   * // cards = [
   * //   { id: 'pending', label: 'En attente', value: 5, ... },
   * //   { id: 'total_users', label: 'Total utilisateurs', value: 42, ... },
   * //   ...
   * // ]
   */
  async getDashboardCards() {
    try {
      const { data: stats, error } = await this.getAdminStats();

      if (error) throw error;
      if (!stats) return { data: [], error: null };

      const cards = [
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
        },
        {
          id: 'total_users',
          label: 'Utilisateurs',
          value: stats.total_users || 0,
          description: `${stats.assigned_users || 0} assignés`,
          icon: 'Users',
          color: 'blue',
          bgColor: 'bg-blue-400/10',
          textColor: 'text-blue-400',
          borderColor: 'border-blue-400/30',
          link: '/admin/users',
          priority: 'normal',
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
        },
      ];

      return { data: cards, error: null };
    } catch (error) {
      console.error('[adminService.getDashboardCards]', error);
      return { data: null, error };
    }
  },

  /**
   * Récupère la répartition des utilisateurs par rôle
   * 
   * @returns {Promise<{data: Array|null, error: Error|null}>}
   * 
   * @example
   * const { data: roles, error } = await adminService.getUsersByRole();
   * 
   * // roles = [
   * //   { role: 'super_admin', count: 2, label: 'Super Admin', ... },
   * //   { role: 'org_admin', count: 5, label: 'Admin Org', ... },
   * //   ...
   * // ]
   */
  async getUsersByRole() {
    try {
      const { data: stats, error } = await this.getAdminStats();

      if (error) throw error;
      if (!stats) return { data: [], error: null };

      const roles = [
        {
          role: 'super_admin',
          count: stats.super_admins || 0,
          label: 'Super Admin',
          color: 'text-red-400',
          bgColor: 'bg-red-400/10',
        },
        {
          role: 'org_admin',
          count: stats.org_admins || 0,
          label: 'Admin Org',
          color: 'text-amber-400',
          bgColor: 'bg-amber-400/10',
        },
        {
          role: 'team_leader',
          count: stats.team_leaders || 0,
          label: 'Chef d\'équipe',
          color: 'text-blue-400',
          bgColor: 'bg-blue-400/10',
        },
        {
          role: 'user',
          count: stats.users || 0,
          label: 'Utilisateur',
          color: 'text-slate-400',
          bgColor: 'bg-slate-400/10',
        },
      ];

      return { data: roles, error: null };
    } catch (error) {
      console.error('[adminService.getUsersByRole]', error);
      return { data: null, error };
    }
  },

  /**
   * Récupère un résumé rapide pour l'affichage dans le header/sidebar
   * 
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   */
  async getQuickSummary() {
    try {
      const { data: stats, error } = await this.getAdminStats();

      if (error) throw error;
      if (!stats) return { data: null, error: null };

      return {
        data: {
          pendingUsers: stats.pending_users || 0,
          totalUsers: stats.total_users || 0,
          totalOrgs: stats.total_organizations || 0,
          totalProjects: stats.total_projects || 0,
          hasPendingActions: (stats.pending_users || 0) > 0,
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
