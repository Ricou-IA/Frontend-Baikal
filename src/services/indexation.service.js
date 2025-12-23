/**
 * Indexation Service - Baikal Console
 * ============================================================================
 * Service pour la gestion des concepts et catégories documentaires.
 * Utilisé par l'interface admin "Indexation" (super_admin uniquement).
 * 
 * Vues ciblées :
 * - public.v_config_concepts (vue sur config.concepts)
 * - public.v_config_document_categories (vue sur config.document_categories)
 * 
 * @version 2.1.0 - Ajout reorderCategories pour drag & drop
 * ============================================================================
 */

import { supabase } from '../lib/supabaseClient';

// ============================================================================
// CONSTANTES - Noms des vues
// ============================================================================
const VIEWS = {
    CONCEPTS: 'v_config_concepts',
    CATEGORIES: 'v_config_document_categories',
};

// ============================================================================
// APPS
// ============================================================================

/**
 * Récupère toutes les apps actives
 * @returns {Promise<{data: Array, error: Error|null}>}
 */
export async function getApps() {
    try {
        const { data, error } = await supabase
            .from('apps')
            .select('id, name, description, icon, color, sort_order')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });

        if (error) throw error;
        return { data: data || [], error: null };
    } catch (err) {
        console.error('[IndexationService] Error loading apps:', err);
        return { data: [], error: err };
    }
}

// ============================================================================
// CONCEPTS
// ============================================================================

/**
 * Récupère les concepts pour une app donnée
 * Filtre sur target_apps contenant l'appId ou 'all'
 * @param {string} appId - ID de l'app (ex: 'arpet')
 * @returns {Promise<{data: Array, error: Error|null}>}
 */
export async function getConceptsByApp(appId) {
    try {
        const { data, error } = await supabase
            .from(VIEWS.CONCEPTS)
            .select('id, slug, label, description, parent_id, status, target_apps, created_at, updated_at')
            .eq('status', 'active')
            .or(`target_apps.cs.{"${appId}"},target_apps.cs.{"all"}`)
            .order('label', { ascending: true });

        if (error) throw error;
        return { data: data || [], error: null };
    } catch (err) {
        console.error('[IndexationService] Error loading concepts:', err);
        return { data: [], error: err };
    }
}

/**
 * Récupère un concept par son ID
 * @param {string} conceptId - UUID du concept
 * @returns {Promise<{data: Object|null, error: Error|null}>}
 */
export async function getConceptById(conceptId) {
    try {
        const { data, error } = await supabase
            .from(VIEWS.CONCEPTS)
            .select('*')
            .eq('id', conceptId)
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (err) {
        console.error('[IndexationService] Error loading concept:', err);
        return { data: null, error: err };
    }
}

/**
 * Crée un nouveau concept
 * @param {Object} conceptData - Données du concept
 * @param {string} conceptData.slug - Identifiant unique
 * @param {string} conceptData.label - Libellé affiché
 * @param {string} [conceptData.description] - Description
 * @param {string} [conceptData.parent_id] - UUID du concept parent
 * @param {string[]} conceptData.target_apps - Apps ciblées
 * @returns {Promise<{data: Object|null, error: Error|null}>}
 */
export async function createConcept(conceptData) {
    try {
        const { data, error } = await supabase
            .from(VIEWS.CONCEPTS)
            .insert({
                slug: conceptData.slug,
                label: conceptData.label,
                description: conceptData.description || null,
                parent_id: conceptData.parent_id || null,
                target_apps: conceptData.target_apps || ['all'],
                status: 'active',
            })
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (err) {
        console.error('[IndexationService] Error creating concept:', err);
        return { data: null, error: err };
    }
}

/**
 * Met à jour un concept existant
 * @param {string} conceptId - UUID du concept
 * @param {Object} updates - Champs à mettre à jour
 * @returns {Promise<{data: Object|null, error: Error|null}>}
 */
export async function updateConcept(conceptId, updates) {
    try {
        const { data, error } = await supabase
            .from(VIEWS.CONCEPTS)
            .update({
                ...updates,
                updated_at: new Date().toISOString(),
            })
            .eq('id', conceptId)
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (err) {
        console.error('[IndexationService] Error updating concept:', err);
        return { data: null, error: err };
    }
}

/**
 * Supprime un concept (HARD DELETE)
 * Vérifie d'abord s'il a des enfants
 * @param {string} conceptId - UUID du concept
 * @returns {Promise<{success: boolean, error: Error|null, hasChildren: boolean}>}
 */
export async function deleteConcept(conceptId) {
    try {
        // Vérifier s'il y a des enfants
        const { data: children, error: childError } = await supabase
            .from(VIEWS.CONCEPTS)
            .select('id')
            .eq('parent_id', conceptId)
            .eq('status', 'active')
            .limit(1);

        if (childError) throw childError;

        if (children && children.length > 0) {
            return { success: false, error: null, hasChildren: true };
        }

        // Hard delete
        const { error } = await supabase
            .from(VIEWS.CONCEPTS)
            .delete()
            .eq('id', conceptId);

        if (error) throw error;
        return { success: true, error: null, hasChildren: false };
    } catch (err) {
        console.error('[IndexationService] Error deleting concept:', err);
        return { success: false, error: err, hasChildren: false };
    }
}

// ============================================================================
// CATÉGORIES DOCUMENTAIRES
// ============================================================================

/**
 * Récupère les catégories pour une app donnée
 * Filtre sur target_apps contenant l'appId ou 'all'
 * Tri par sort_order
 * @param {string} appId - ID de l'app (ex: 'arpet')
 * @returns {Promise<{data: Array, error: Error|null}>}
 */
export async function getCategoriesByApp(appId) {
    try {
        const { data, error } = await supabase
            .from(VIEWS.CATEGORIES)
            .select(`
                id, 
                slug, 
                label, 
                description, 
                target_apps,
                target_layers,
                linked_concept_id,
                sort_order,
                created_at, 
                updated_at
            `)
            .or(`target_apps.cs.{"${appId}"},target_apps.cs.{"all"}`)
            .order('sort_order', { ascending: true });

        if (error) throw error;

        // Enrichir avec les concepts liés si présents
        if (data && data.length > 0) {
            const conceptIds = data
                .filter(cat => cat.linked_concept_id)
                .map(cat => cat.linked_concept_id);

            if (conceptIds.length > 0) {
                const { data: concepts } = await supabase
                    .from(VIEWS.CONCEPTS)
                    .select('id, slug, label')
                    .in('id', conceptIds);

                if (concepts) {
                    const conceptMap = new Map(concepts.map(c => [c.id, c]));
                    data.forEach(cat => {
                        if (cat.linked_concept_id && conceptMap.has(cat.linked_concept_id)) {
                            cat.linked_concept = conceptMap.get(cat.linked_concept_id);
                        } else {
                            cat.linked_concept = null;
                        }
                    });
                }
            } else {
                data.forEach(cat => { cat.linked_concept = null; });
            }
        }

        return { data: data || [], error: null };
    } catch (err) {
        console.error('[IndexationService] Error loading categories:', err);
        return { data: [], error: err };
    }
}

/**
 * Récupère une catégorie par son ID
 * @param {string} categoryId - UUID de la catégorie
 * @returns {Promise<{data: Object|null, error: Error|null}>}
 */
export async function getCategoryById(categoryId) {
    try {
        const { data, error } = await supabase
            .from(VIEWS.CATEGORIES)
            .select('*')
            .eq('id', categoryId)
            .single();

        if (error) throw error;

        // Enrichir avec le concept lié
        if (data && data.linked_concept_id) {
            const { data: concept } = await supabase
                .from(VIEWS.CONCEPTS)
                .select('id, slug, label')
                .eq('id', data.linked_concept_id)
                .single();
            
            data.linked_concept = concept || null;
        } else if (data) {
            data.linked_concept = null;
        }

        return { data, error: null };
    } catch (err) {
        console.error('[IndexationService] Error loading category:', err);
        return { data: null, error: err };
    }
}

/**
 * Crée une nouvelle catégorie
 * @param {Object} categoryData - Données de la catégorie
 * @param {string} categoryData.slug - Identifiant unique
 * @param {string} categoryData.label - Libellé affiché
 * @param {string} [categoryData.description] - Description
 * @param {string[]} categoryData.target_apps - Apps ciblées
 * @param {string[]} [categoryData.target_layers] - Layers autorisés
 * @param {string} [categoryData.linked_concept_id] - UUID du concept lié
 * @param {number} [categoryData.sort_order] - Ordre d'affichage
 * @returns {Promise<{data: Object|null, error: Error|null}>}
 */
export async function createCategory(categoryData) {
    try {
        const { data, error } = await supabase
            .from(VIEWS.CATEGORIES)
            .insert({
                slug: categoryData.slug,
                label: categoryData.label,
                description: categoryData.description || null,
                target_apps: categoryData.target_apps || ['all'],
                target_layers: categoryData.target_layers || ['app', 'org', 'project', 'user'],
                linked_concept_id: categoryData.linked_concept_id || null,
                sort_order: categoryData.sort_order || 0,
            })
            .select()
            .single();

        if (error) throw error;

        // Enrichir avec le concept lié
        if (data && data.linked_concept_id) {
            const { data: concept } = await supabase
                .from(VIEWS.CONCEPTS)
                .select('id, slug, label')
                .eq('id', data.linked_concept_id)
                .single();
            
            data.linked_concept = concept || null;
        } else if (data) {
            data.linked_concept = null;
        }

        return { data, error: null };
    } catch (err) {
        console.error('[IndexationService] Error creating category:', err);
        return { data: null, error: err };
    }
}

/**
 * Met à jour une catégorie existante
 * @param {string} categoryId - UUID de la catégorie
 * @param {Object} updates - Champs à mettre à jour
 * @returns {Promise<{data: Object|null, error: Error|null}>}
 */
export async function updateCategory(categoryId, updates) {
    try {
        const { data, error } = await supabase
            .from(VIEWS.CATEGORIES)
            .update({
                ...updates,
                updated_at: new Date().toISOString(),
            })
            .eq('id', categoryId)
            .select()
            .single();

        if (error) throw error;

        // Enrichir avec le concept lié
        if (data && data.linked_concept_id) {
            const { data: concept } = await supabase
                .from(VIEWS.CONCEPTS)
                .select('id, slug, label')
                .eq('id', data.linked_concept_id)
                .single();
            
            data.linked_concept = concept || null;
        } else if (data) {
            data.linked_concept = null;
        }

        return { data, error: null };
    } catch (err) {
        console.error('[IndexationService] Error updating category:', err);
        return { data: null, error: err };
    }
}

/**
 * Supprime une catégorie (HARD DELETE)
 * @param {string} categoryId - UUID de la catégorie
 * @returns {Promise<{success: boolean, error: Error|null}>}
 */
export async function deleteCategory(categoryId) {
    try {
        const { error } = await supabase
            .from(VIEWS.CATEGORIES)
            .delete()
            .eq('id', categoryId);

        if (error) throw error;
        return { success: true, error: null };
    } catch (err) {
        console.error('[IndexationService] Error deleting category:', err);
        return { success: false, error: err };
    }
}

/**
 * Réordonne les catégories (batch update des sort_order)
 * @param {Array<{id: string, sort_order: number}>} updates - Liste des mises à jour
 * @returns {Promise<{success: boolean, error: Error|null}>}
 */
export async function reorderCategories(updates) {
    try {
        // Utiliser Promise.all pour mettre à jour en parallèle
        const promises = updates.map(({ id, sort_order }) =>
            supabase
                .from(VIEWS.CATEGORIES)
                .update({ sort_order, updated_at: new Date().toISOString() })
                .eq('id', id)
        );

        const results = await Promise.all(promises);

        // Vérifier les erreurs
        const errors = results.filter(r => r.error);
        if (errors.length > 0) {
            throw errors[0].error;
        }

        return { success: true, error: null };
    } catch (err) {
        console.error('[IndexationService] Error reordering categories:', err);
        return { success: false, error: err };
    }
}

// ============================================================================
// EXPORT PAR DÉFAUT
// ============================================================================

export const indexationService = {
    // Apps
    getApps,
    // Concepts
    getConceptsByApp,
    getConceptById,
    createConcept,
    updateConcept,
    deleteConcept,
    // Catégories
    getCategoriesByApp,
    getCategoryById,
    createCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
};

export default indexationService;
