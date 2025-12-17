/**
 * projects.service.js - Baikal Console
 * ============================================================================
 * Service de gestion des projets.
 * Utilise les fonctions RPC du schéma `core`.
 * 
 * ⚠️ IMPORTANT - Lien avec le système de Layers RAG :
 * Les projets sont directement liés à la couche documentaire PROJECT.
 * - Les documents peuvent cibler un ou plusieurs projets via `target_projects`
 * - Les `project_members` ont accès aux documents de leurs projets
 * - Les rôles projet (leader, member, viewer) définissent les droits d'accès
 * 
 * Voir `src/config/rag-layers.config.js` pour la matrice complète.
 * 
 * Fonctions RPC utilisées :
 * - core.create_project()
 * - core.update_project()
 * - core.delete_project()
 * - core.get_projects()
 * - core.get_project_members()
 * - core.assign_user_to_project()
 * - core.remove_user_from_project()
 * 
 * @example
 * import { projectsService } from '@/services';
 * 
 * // Créer un projet
 * const { data, error } = await projectsService.createProject({
 *   name: 'Chantier Résidence Les Ormes',
 *   description: 'Construction de 24 logements'
 * });
 * 
 * // Ajouter un membre au projet
 * const { data, error } = await projectsService.assignUserToProject(
 *   projectId, 
 *   userId, 
 *   'member'
 * );
 * ============================================================================
 */

import { supabase } from '../lib/supabaseClient';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Statuts de projet disponibles
 * @type {Array<{value: string, label: string, description: string}>}
 */
export const PROJECT_STATUSES = [
  { 
    value: 'active', 
    label: 'Actif', 
    description: 'Projet en cours',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-400/10',
    borderColor: 'border-emerald-400/30',
  },
  { 
    value: 'archived', 
    label: 'Archivé', 
    description: 'Projet terminé et archivé',
    color: 'text-slate-400',
    bgColor: 'bg-slate-400/10',
    borderColor: 'border-slate-400/30',
  },
  { 
    value: 'completed', 
    label: 'Terminé', 
    description: 'Projet livré avec succès',
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/10',
    borderColor: 'border-blue-400/30',
  },
];

/**
 * Rôles disponibles dans un projet
 * Ordonnés par niveau de privilège (du plus élevé au plus bas)
 * @type {Array<{value: string, label: string, description: string, level: number}>}
 */
export const PROJECT_ROLES = [
  { 
    value: 'leader', 
    label: 'Chef de projet', 
    description: 'Peut modifier le projet et gérer les membres',
    level: 1,
    color: 'text-amber-400',
    bgColor: 'bg-amber-400/10',
    borderColor: 'border-amber-400/30',
    canManageMembers: true,
    canEdit: true,
  },
  { 
    value: 'member', 
    label: 'Membre', 
    description: 'Accès complet en lecture/écriture',
    level: 2,
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/10',
    borderColor: 'border-blue-400/30',
    canManageMembers: false,
    canEdit: true,
  },
  { 
    value: 'viewer', 
    label: 'Observateur', 
    description: 'Accès en lecture seule',
    level: 3,
    color: 'text-slate-400',
    bgColor: 'bg-slate-400/10',
    borderColor: 'border-slate-400/30',
    canManageMembers: false,
    canEdit: false,
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
 * Service de gestion des projets
 */
export const projectsService = {
  // ==========================================================================
  // LECTURE
  // ==========================================================================

  /**
   * Récupère la liste des projets
   * - super_admin : tous les projets (ou filtrés par org)
   * - org_admin : projets de son organisation
   * - team_leader/user : projets auxquels ils appartiennent
   * 
   * @param {Object} params - Paramètres de filtrage
   * @param {string} [params.orgId] - Filtrer par organisation
   * @param {boolean} [params.includeArchived=false] - Inclure les projets archivés
   * @param {string} [params.search] - Recherche par nom
   * @param {number} [params.limit=20] - Nombre de résultats
   * @param {number} [params.offset=0] - Offset pour pagination
   * @returns {Promise<{data: Array|null, error: Error|null}>}
   * 
   * @example
   * // Tous les projets actifs de mon org
   * const { data, error } = await projectsService.getProjects({});
   * 
   * // Inclure les archivés avec recherche
   * const { data, error } = await projectsService.getProjects({
   *   includeArchived: true,
   *   search: 'résidence'
   * });
   */
  async getProjects({
    orgId = null,
    includeArchived = false,
    search = null,
    limit = DEFAULT_LIMIT,
    offset = DEFAULT_OFFSET,
  } = {}) {
    try {
      const { data, error } = await supabase.rpc('get_projects', {
        p_org_id: orgId,
        p_include_archived: includeArchived,
        p_search: search,
        p_limit: limit,
        p_offset: offset,
      });

      if (error) throw error;

      // La RPC retourne un tableau de projets avec infos org
      return { data: data || [], error: null };
    } catch (error) {
      console.error('[projectsService.getProjects]', error);
      return { data: null, error };
    }
  },

  /**
   * Récupère les membres d'un projet
   * 
   * @param {string} projectId - ID du projet
   * @returns {Promise<{data: Array|null, error: Error|null}>}
   * 
   * @example
   * const { data: members, error } = await projectsService.getProjectMembers(projectId);
   * 
   * members.forEach(m => {
   *   console.log(`${m.full_name} - ${m.role}`);
   * });
   */
  async getProjectMembers(projectId) {
    try {
      if (!projectId) {
        return { data: [], error: null };
      }

      const { data, error } = await supabase.rpc('get_project_members', {
        p_project_id: projectId,
      });

      if (error) throw error;

      // La RPC retourne un tableau de membres avec profils
      return { data: data || [], error: null };
    } catch (error) {
      console.error('[projectsService.getProjectMembers]', error);
      return { data: null, error };
    }
  },

  // ==========================================================================
  // CRÉATION / MODIFICATION
  // ==========================================================================

  /**
   * Crée un nouveau projet
   * Le créateur est automatiquement ajouté comme "leader"
   * 
   * ⚠️ IMPACT SUR LES LAYERS RAG :
   * Le nouveau projet devient disponible comme cible pour les documents
   * de la couche PROJECT. Le créateur aura immédiatement accès à cette couche.
   * 
   * @param {Object} params - Paramètres du projet
   * @param {string} params.name - Nom du projet (requis)
   * @param {string} [params.orgId] - ID de l'organisation (requis pour super_admin)
   * @param {string} [params.description] - Description du projet
   * @param {string} [params.slug] - Slug URL-friendly (auto-généré si non fourni)
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   * 
   * @example
   * const { data, error } = await projectsService.createProject({
   *   name: 'Chantier Résidence Les Ormes',
   *   description: 'Construction de 24 logements collectifs',
   * });
   * 
   * if (data?.success) {
   *   console.log('Projet créé:', data.project_id);
   * }
   */
  async createProject({
    name,
    orgId = null,
    description = null,
    slug = null,
  }) {
    try {
      if (!name || name.trim() === '') {
        return { 
          data: null, 
          error: new Error('Le nom du projet est requis') 
        };
      }

      const { data, error } = await supabase.rpc('create_project', {
        p_name: name.trim(),
        p_org_id: orgId,
        p_description: description,
        p_slug: slug,
      });

      if (error) throw error;

      // La RPC retourne { success, message, project_id, slug } ou { success: false, error }
      if (data?.success) {
        return { data, error: null };
      } else {
        return { 
          data: null, 
          error: new Error(data?.error || 'Erreur lors de la création du projet') 
        };
      }
    } catch (error) {
      console.error('[projectsService.createProject]', error);
      return { data: null, error };
    }
  },

  /**
   * Met à jour un projet existant
   * 
   * @param {string} projectId - ID du projet
   * @param {Object} params - Paramètres à modifier
   * @param {string} [params.name] - Nouveau nom
   * @param {string} [params.description] - Nouvelle description
   * @param {string} [params.status] - Nouveau statut (active, archived, completed)
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   * 
   * @example
   * const { data, error } = await projectsService.updateProject(projectId, {
   *   status: 'completed',
   *   description: 'Projet livré le 15/12/2025'
   * });
   */
  async updateProject(projectId, { name = null, description = null, status = null }) {
    try {
      if (!projectId) {
        return { 
          data: null, 
          error: new Error('ID du projet requis') 
        };
      }

      // Valider le statut si fourni
      if (status) {
        const validStatus = PROJECT_STATUSES.find(s => s.value === status);
        if (!validStatus) {
          return { 
            data: null, 
            error: new Error(`Statut invalide: ${status}`) 
          };
        }
      }

      const { data, error } = await supabase.rpc('update_project', {
        p_project_id: projectId,
        p_name: name,
        p_description: description,
        p_status: status,
      });

      if (error) throw error;

      // La RPC retourne { success, message } ou { success: false, error }
      if (data?.success) {
        return { data, error: null };
      } else {
        return { 
          data: null, 
          error: new Error(data?.error || 'Erreur lors de la modification du projet') 
        };
      }
    } catch (error) {
      console.error('[projectsService.updateProject]', error);
      return { data: null, error };
    }
  },

  /**
   * Supprime un projet
   * 
   * ⚠️ ATTENTION :
   * - Nécessite une confirmation si le projet a des membres
   * - Les documents associés perdent leur référence au projet
   * 
   * @param {string} projectId - ID du projet
   * @param {boolean} [confirm=false] - Confirmer la suppression
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   * 
   * @example
   * // Premier appel - demande de confirmation
   * const { data, error } = await projectsService.deleteProject(projectId);
   * 
   * if (data?.error === 'confirmation_required') {
   *   // Afficher modal de confirmation
   *   const confirmDelete = window.confirm(data.message);
   *   if (confirmDelete) {
   *     // Deuxième appel avec confirmation
   *     await projectsService.deleteProject(projectId, true);
   *   }
   * }
   */
  async deleteProject(projectId, confirm = false) {
    try {
      if (!projectId) {
        return { 
          data: null, 
          error: new Error('ID du projet requis') 
        };
      }

      const { data, error } = await supabase.rpc('delete_project', {
        p_project_id: projectId,
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
        // Cas spécial : confirmation requise
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
      console.error('[projectsService.deleteProject]', error);
      return { data: null, error };
    }
  },

  // ==========================================================================
  // GESTION DES MEMBRES
  // ==========================================================================

  /**
   * Ajoute un utilisateur à un projet
   * 
   * ⚠️ IMPACT SUR LES LAYERS RAG :
   * L'utilisateur aura accès aux documents de la couche PROJECT pour ce projet.
   * Le niveau d'accès dépend du rôle :
   * - leader : lecture/écriture + gestion membres
   * - member : lecture/écriture
   * - viewer : lecture seule
   * 
   * @param {string} projectId - ID du projet
   * @param {string} userId - ID de l'utilisateur à ajouter
   * @param {string} [role='member'] - Rôle dans le projet (leader, member, viewer)
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   * 
   * @example
   * const { data, error } = await projectsService.assignUserToProject(
   *   projectId,
   *   userId,
   *   'member'
   * );
   */
  async assignUserToProject(projectId, userId, role = 'member') {
    try {
      if (!projectId || !userId) {
        return { 
          data: null, 
          error: new Error('ID du projet et ID utilisateur requis') 
        };
      }

      // Valider le rôle
      const validRole = PROJECT_ROLES.find(r => r.value === role);
      if (!validRole) {
        return { 
          data: null, 
          error: new Error(`Rôle invalide: ${role}`) 
        };
      }

      const { data, error } = await supabase.rpc('assign_user_to_project', {
        p_project_id: projectId,
        p_user_id: userId,
        p_role: role,
      });

      if (error) throw error;

      // La RPC retourne { success, message } ou { success: false, error }
      if (data?.success) {
        return { data, error: null };
      } else {
        return { 
          data: null, 
          error: new Error(data?.error || 'Erreur lors de l\'ajout au projet') 
        };
      }
    } catch (error) {
      console.error('[projectsService.assignUserToProject]', error);
      return { data: null, error };
    }
  },

  /**
   * Retire un utilisateur d'un projet
   * 
   * ⚠️ IMPACT SUR LES LAYERS RAG :
   * L'utilisateur perd l'accès aux documents de la couche PROJECT pour ce projet.
   * 
   * @param {string} projectId - ID du projet
   * @param {string} userId - ID de l'utilisateur à retirer
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   * 
   * @example
   * const { data, error } = await projectsService.removeUserFromProject(
   *   projectId,
   *   userId
   * );
   */
  async removeUserFromProject(projectId, userId) {
    try {
      if (!projectId || !userId) {
        return { 
          data: null, 
          error: new Error('ID du projet et ID utilisateur requis') 
        };
      }

      const { data, error } = await supabase.rpc('remove_user_from_project', {
        p_project_id: projectId,
        p_user_id: userId,
      });

      if (error) throw error;

      // La RPC retourne { success, message } ou { success: false, error }
      if (data?.success) {
        return { data, error: null };
      } else {
        return { 
          data: null, 
          error: new Error(data?.error || 'Erreur lors du retrait du projet') 
        };
      }
    } catch (error) {
      console.error('[projectsService.removeUserFromProject]', error);
      return { data: null, error };
    }
  },

  /**
   * Met à jour le rôle d'un membre dans un projet
   * 
   * @param {string} projectId - ID du projet
   * @param {string} userId - ID de l'utilisateur
   * @param {string} newRole - Nouveau rôle (leader, member, viewer)
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   * 
   * @example
   * const { data, error } = await projectsService.updateProjectMemberRole(
   *   projectId,
   *   userId,
   *   'leader'
   * );
   */
  async updateProjectMemberRole(projectId, userId, newRole) {
    try {
      if (!projectId || !userId || !newRole) {
        return { 
          data: null, 
          error: new Error('ID du projet, ID utilisateur et nouveau rôle requis') 
        };
      }

      // Valider le rôle
      const validRole = PROJECT_ROLES.find(r => r.value === newRole);
      if (!validRole) {
        return { 
          data: null, 
          error: new Error(`Rôle invalide: ${newRole}`) 
        };
      }

      // Pour l'instant, on retire et réajoute avec le nouveau rôle
      // TODO: Créer une RPC dédiée update_project_member_role si nécessaire
      const { error: removeError } = await this.removeUserFromProject(projectId, userId);
      if (removeError) throw removeError;

      const { data, error: assignError } = await this.assignUserToProject(projectId, userId, newRole);
      if (assignError) throw assignError;

      return { 
        data: { success: true, message: 'Rôle mis à jour' }, 
        error: null 
      };
    } catch (error) {
      console.error('[projectsService.updateProjectMemberRole]', error);
      return { data: null, error };
    }
  },

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /**
   * Retourne la configuration d'affichage pour un statut de projet
   * 
   * @param {string} status - Statut du projet
   * @returns {Object} Configuration { label, color, bgColor, borderColor }
   */
  getStatusConfig(status) {
    const config = PROJECT_STATUSES.find(s => s.value === status);
    return config || {
      value: status,
      label: status || 'Inconnu',
      color: 'text-slate-400',
      bgColor: 'bg-slate-400/10',
      borderColor: 'border-slate-400/30',
    };
  },

  /**
   * Retourne la configuration d'affichage pour un rôle projet
   * 
   * @param {string} role - Rôle dans le projet
   * @returns {Object} Configuration { label, color, bgColor, borderColor, canManageMembers, canEdit }
   */
  getRoleConfig(role) {
    const config = PROJECT_ROLES.find(r => r.value === role);
    return config || {
      value: role,
      label: role || 'Inconnu',
      level: 99,
      color: 'text-slate-400',
      bgColor: 'bg-slate-400/10',
      borderColor: 'border-slate-400/30',
      canManageMembers: false,
      canEdit: false,
    };
  },

  /**
   * Vérifie si un rôle peut gérer les membres d'un projet
   * 
   * @param {string} role - Rôle à vérifier
   * @returns {boolean}
   */
  canManageMembers(role) {
    const config = PROJECT_ROLES.find(r => r.value === role);
    return config?.canManageMembers || false;
  },

  /**
   * Vérifie si un rôle peut modifier un projet
   * 
   * @param {string} role - Rôle à vérifier
   * @returns {boolean}
   */
  canEditProject(role) {
    const config = PROJECT_ROLES.find(r => r.value === role);
    return config?.canEdit || false;
  },

  /**
   * Retourne les rôles qu'un utilisateur peut assigner selon son propre rôle projet
   * 
   * @param {string} currentUserRole - Rôle de l'utilisateur connecté dans le projet
   * @param {string} currentUserAppRole - Rôle applicatif de l'utilisateur (super_admin, org_admin, etc.)
   * @returns {Array} Liste des rôles assignables
   */
  getAssignableRoles(currentUserRole, currentUserAppRole) {
    // super_admin et org_admin peuvent tout assigner
    if (['super_admin', 'org_admin'].includes(currentUserAppRole)) {
      return PROJECT_ROLES;
    }

    // Les leaders peuvent assigner member et viewer
    if (currentUserRole === 'leader') {
      return PROJECT_ROLES.filter(r => r.value !== 'leader');
    }

    // Les autres ne peuvent pas assigner
    return [];
  },

  /**
   * Génère un slug à partir d'un nom de projet
   * 
   * @param {string} name - Nom du projet
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

export default projectsService;
