/**
 * Projects Service - Baikal Console
 * ============================================================================
 * Service de gestion des projets.
 * 
 * Fonctionnalités :
 * - CRUD complet des projets
 * - Gestion des membres (ajout, retrait, modification rôles)
 * - Archivage / Suppression
 * 
 * CORRECTIONS 17/12/2025:
 * - Paramètres nommés (name → p_name, orgId → p_org_id, etc.)
 * - Meilleure gestion d'erreurs (success/error check)
 * 
 * PHASE 2 (21/12/2025):
 * - Support identité projet (market_type, project_type, description)
 * - Validation simplifiée (sans main_trades)
 * - CORRECTION SCHÉMA: Ajout .schema('core') sur tous les appels
 * ============================================================================
 */

import { supabase } from '../lib/supabaseClient';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Statuts de projet
 */
export const PROJECT_STATUSES = [
    { value: 'active', label: 'Actif', color: 'bg-green-500/20 text-green-400' },
    { value: 'archived', label: 'Archivé', color: 'bg-gray-500/20 text-gray-400' },
];

/**
 * Rôles dans un projet
 */
export const PROJECT_ROLES = [
    { value: 'leader', label: 'Leader', color: 'text-amber-400' },
    { value: 'member', label: 'Membre', color: 'text-blue-400' },
    { value: 'viewer', label: 'Viewer', color: 'text-gray-400' },
];

// ============================================================================
// GESTION DES PROJETS
// ============================================================================

/**
 * Récupère la liste des projets
 * @param {Object} params - Paramètres de filtre
 * @param {string} params.orgId - ID organisation (optionnel)
 * @param {boolean} params.includeArchived - Inclure les projets archivés
 * @param {string} params.search - Recherche textuelle
 * @returns {Promise<{data: Array|null, error: Error|null}>}
 */
export async function getProjects({ 
    orgId = null, 
    includeArchived = false, 
    search = null 
} = {}) {
    try {
        let query = supabase
            .schema('core')
            .from('projects')
            .select(`
                *,
                organization:organizations(id, name),
                member_count:project_members(count)
            `)
            .order('created_at', { ascending: false });

        // Filtre par organisation
        if (orgId) {
            query = query.eq('org_id', orgId);
        }

        // Filtre par statut
        if (!includeArchived) {
            query = query.eq('status', 'active');
        }

        // Filtre par recherche
        if (search && search.trim().length > 0) {
            query = query.ilike('name', `%${search.trim()}%`);
        }

        const { data, error } = await query;

        if (error) throw error;

        // Formater le compteur de membres
        const formattedData = (data || []).map(project => ({
            ...project,
            member_count: project.member_count?.[0]?.count || 0
        }));

        return { data: formattedData, error: null };
    } catch (error) {
        console.error('[projectsService] Error in getProjects:', error);
        return { data: null, error };
    }
}

/**
 * Récupère un projet par son ID
 * @param {string} projectId - ID du projet
 * @returns {Promise<{data: Object|null, error: Error|null}>}
 */
export async function getProject(projectId) {
    try {
        const { data, error } = await supabase
            .schema('core')
            .from('projects')
            .select(`
                *,
                organization:organizations(id, name),
                members:project_members(
                    user_id,
                    role,
                    user:profiles(id, email, full_name)
                )
            `)
            .eq('id', projectId)
            .single();

        if (error) throw error;

        return { data, error: null };
    } catch (error) {
        console.error('[projectsService] Error in getProject:', error);
        return { data: null, error };
    }
}

/**
 * Crée un nouveau projet
 * @param {Object} params - Paramètres du projet
 * @param {string} params.name - Nom du projet *
 * @param {string} params.orgId - ID organisation (optionnel)
 * @param {string} params.description - Description (optionnel)
 * @param {string} params.slug - Slug personnalisé (optionnel)
 * @param {Object} params.identity - Identité projet (Phase 2)
 * @returns {Promise<{data: Object|null, error: Error|null}>}
 */
export async function createProject({ 
    name, 
    orgId = null, 
    description = null, 
    slug = null,
    identity = null 
}) {
    try {
        // Validation de base
        if (!name || name.trim().length === 0) {
            return {
                data: null,
                error: new Error('Le nom du projet est requis')
            };
        }

        // Validation identité projet (Phase 2 - SANS main_trades)
        if (identity) {
            if (!identity.market_type || !identity.project_type || !identity.description) {
                return {
                    data: null,
                    error: new Error('Identité projet incomplète (market_type, project_type, description requis)')
                };
            }
        }

        // Appel RPC pour créer le projet (CORRECTION: ajout .schema('core'))
        const { data, error } = await supabase
            .schema('core')
            .rpc('create_project', {
                p_name: name.trim(),
                p_org_id: orgId,
                p_description: description ? description.trim() : null,
                p_slug: slug,
                p_identity: identity || {}
            });

        if (error) throw error;

        // Vérifier le format de réponse
        if (data && typeof data === 'object') {
            if (data.success === false) {
                throw new Error(data.error || 'Erreur lors de la création du projet');
            }
        }

        return { data, error: null };
    } catch (error) {
        console.error('[projectsService] Error in createProject:', error);
        return { data: null, error };
    }
}

/**
 * Met à jour un projet existant
 * @param {string} projectId - ID du projet
 * @param {Object} params - Champs à mettre à jour
 * @param {string} params.name - Nouveau nom
 * @param {string} params.description - Nouvelle description
 * @param {string} params.status - Nouveau statut
 * @param {Object} params.identity - Nouvelle identité (Phase 2)
 * @returns {Promise<{data: Object|null, error: Error|null}>}
 */
export async function updateProject(projectId, params = {}) {
    try {
        if (!projectId) {
            return {
                data: null,
                error: new Error('ID du projet requis')
            };
        }

        // Construire l'objet de mise à jour
        const updates = {};

        if (params.name !== undefined) {
            if (!params.name || params.name.trim().length === 0) {
                return {
                    data: null,
                    error: new Error('Le nom du projet ne peut pas être vide')
                };
            }
            updates.name = params.name.trim();
        }

        if (params.description !== undefined) {
            updates.description = params.description ? params.description.trim() : null;
        }

        if (params.status !== undefined) {
            updates.status = params.status;
        }

        // Phase 2: Support identité projet (SANS main_trades)
        if (params.identity !== undefined) {
            // Validation identité
            if (params.identity && typeof params.identity === 'object') {
                if (!params.identity.market_type || !params.identity.project_type || !params.identity.description) {
                    return {
                        data: null,
                        error: new Error('Identité projet incomplète (market_type, project_type, description requis)')
                    };
                }
            }
            updates.identity = params.identity;
        }

        if (Object.keys(updates).length === 0) {
            return {
                data: null,
                error: new Error('Aucun champ à mettre à jour')
            };
        }

        // Mise à jour directe via Supabase (CORRECTION: ajout .schema('core'))
        const { data, error } = await supabase
            .schema('core')
            .from('projects')
            .update(updates)
            .eq('id', projectId)
            .select()
            .single();

        if (error) throw error;

        return { data, error: null };
    } catch (error) {
        console.error('[projectsService] Error in updateProject:', error);
        return { data: null, error };
    }
}

/**
 * Supprime un projet
 * @param {string} projectId - ID du projet
 * @param {boolean} force - Forcer la suppression même avec des membres
 * @returns {Promise<{data: Object|null, error: Error|null}>}
 */
export async function deleteProject(projectId, force = false) {
    try {
        if (!projectId) {
            return {
                data: null,
                error: new Error('ID du projet requis')
            };
        }

        // Vérifier s'il y a des membres (CORRECTION: ajout .schema('core'))
        if (!force) {
            const { count } = await supabase
                .schema('core')
                .from('project_members')
                .select('*', { count: 'exact', head: true })
                .eq('project_id', projectId);

            if (count > 0) {
                return {
                    data: null,
                    error: new Error('Le projet contient des membres. Utilisez force=true pour supprimer.')
                };
            }
        }

        // Supprimer les membres d'abord (CORRECTION: ajout .schema('core'))
        await supabase
            .schema('core')
            .from('project_members')
            .delete()
            .eq('project_id', projectId);

        // Supprimer le projet (CORRECTION: ajout .schema('core'))
        const { data, error } = await supabase
            .schema('core')
            .from('projects')
            .delete()
            .eq('id', projectId)
            .select()
            .single();

        if (error) throw error;

        return { 
            data: { success: true, project: data }, 
            error: null 
        };
    } catch (error) {
        console.error('[projectsService] Error in deleteProject:', error);
        return { data: null, error };
    }
}

// ============================================================================
// GESTION DES MEMBRES
// ============================================================================

/**
 * Récupère les membres d'un projet
 * @param {string} projectId - ID du projet
 * @returns {Promise<{data: Array|null, error: Error|null}>}
 */
export async function getProjectMembers(projectId) {
    try {
        const { data, error } = await supabase
            .schema('core')
            .from('project_members')
            .select(`
                user_id,
                role,
                created_at,
                user:profiles(id, email, full_name, avatar_url)
            `)
            .eq('project_id', projectId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        // Formater les données
        const formattedData = (data || []).map(member => ({
            user_id: member.user_id,
            project_role: member.role,
            email: member.user?.email,
            full_name: member.user?.full_name,
            avatar_url: member.user?.avatar_url,
            created_at: member.created_at
        }));

        return { data: formattedData, error: null };
    } catch (error) {
        console.error('[projectsService] Error in getProjectMembers:', error);
        return { data: null, error };
    }
}

/**
 * Assigne un utilisateur à un projet
 * @param {string} projectId - ID du projet
 * @param {string} userId - ID de l'utilisateur
 * @param {string} role - Rôle (leader, member, viewer)
 * @returns {Promise<{data: Object|null, error: Error|null}>}
 */
export async function assignUserToProject(projectId, userId, role = 'member') {
    try {
        if (!projectId || !userId) {
            return {
                data: null,
                error: new Error('projectId et userId sont requis')
            };
        }

        const validRoles = ['leader', 'member', 'viewer'];
        if (!validRoles.includes(role)) {
            return {
                data: null,
                error: new Error(`Rôle invalide. Valeurs possibles: ${validRoles.join(', ')}`)
            };
        }

        const { data, error } = await supabase
            .schema('core')
            .from('project_members')
            .insert({
                project_id: projectId,
                user_id: userId,
                role: role
            })
            .select()
            .single();

        if (error) throw error;

        return { 
            data: { success: true, member: data }, 
            error: null 
        };
    } catch (error) {
        console.error('[projectsService] Error in assignUserToProject:', error);
        
        // Gestion erreur de doublon
        if (error.code === '23505') {
            return {
                data: null,
                error: new Error('Cet utilisateur est déjà membre du projet')
            };
        }

        return { data: null, error };
    }
}

/**
 * Retire un utilisateur d'un projet
 * @param {string} projectId - ID du projet
 * @param {string} userId - ID de l'utilisateur
 * @returns {Promise<{data: Object|null, error: Error|null}>}
 */
export async function removeUserFromProject(projectId, userId) {
    try {
        if (!projectId || !userId) {
            return {
                data: null,
                error: new Error('projectId et userId sont requis')
            };
        }

        const { data, error } = await supabase
            .schema('core')
            .from('project_members')
            .delete()
            .eq('project_id', projectId)
            .eq('user_id', userId)
            .select()
            .single();

        if (error) throw error;

        return { 
            data: { success: true, removed: data }, 
            error: null 
        };
    } catch (error) {
        console.error('[projectsService] Error in removeUserFromProject:', error);
        return { data: null, error };
    }
}

/**
 * Met à jour le rôle d'un membre
 * @param {string} projectId - ID du projet
 * @param {string} userId - ID de l'utilisateur
 * @param {string} newRole - Nouveau rôle
 * @returns {Promise<{data: Object|null, error: Error|null}>}
 */
export async function updateMemberRole(projectId, userId, newRole) {
    try {
        if (!projectId || !userId || !newRole) {
            return {
                data: null,
                error: new Error('projectId, userId et newRole sont requis')
            };
        }

        const validRoles = ['leader', 'member', 'viewer'];
        if (!validRoles.includes(newRole)) {
            return {
                data: null,
                error: new Error(`Rôle invalide. Valeurs possibles: ${validRoles.join(', ')}`)
            };
        }

        const { data, error } = await supabase
            .schema('core')
            .from('project_members')
            .update({ role: newRole })
            .eq('project_id', projectId)
            .eq('user_id', userId)
            .select()
            .single();

        if (error) throw error;

        return { 
            data: { success: true, member: data }, 
            error: null 
        };
    } catch (error) {
        console.error('[projectsService] Error in updateMemberRole:', error);
        return { data: null, error };
    }
}

// Export nommé ET par défaut (comme organization.service.js)
export const projectsService = {
    getProjects,
    getProject,
    createProject,
    updateProject,
    deleteProject,
    getProjectMembers,
    assignUserToProject,
    removeUserFromProject,
    updateMemberRole,
    // Constantes
    PROJECT_STATUSES,
    PROJECT_ROLES,
};

export default projectsService;
