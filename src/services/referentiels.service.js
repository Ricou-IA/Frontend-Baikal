/**
 * Referentiels Service - Baikal Console
 * ============================================================================
 * MIGRATION PHASE 3 - Base de données Baikal v2
 * 
 * MODIFICATIONS APPORTÉES:
 * - verticals → config.apps (table renommée, schéma changé)
 * - vertical_id → app_id (colonne renommée)
 * - document_categories → config.document_categories (schéma changé)
 * - Ajout de .schema('config') pour toutes les requêtes apps/categories
 * 
 * MODIFICATIONS V2 (Phase 1.1):
 * - getDocumentCategories: ajout target_apps, target_layers, linked_concept_id
 * 
 * @example
 * import { referentielsService } from '@/services';
 * 
 * const { data: apps } = await referentielsService.getApps();
 * const { data: categories } = await referentielsService.getCategories();
 * ============================================================================
 */

import { supabase } from '../lib/supabaseClient';

// ============================================================================
// APPS (anciennement VERTICALES)
// ============================================================================

/**
 * Récupère toutes les apps actives
 * @returns {Promise<{data: Array, error: Error|null}>}
 * 
 * MIGRATION: verticals → config.apps
 * - Ajout .schema('config')
 * - Table renommée: verticals → apps
 */
export async function getApps() {
    try {
        const { data, error } = await supabase
            .from('apps')                        // ← CHANGÉ: verticals → apps
            .select('id, name, description, icon, color, sort_order')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });

        if (error) throw error;
        return { data: data || [], error: null };
    } catch (err) {
        console.error('[ReferentielsService] Error loading apps:', err);
        return { data: [], error: err };
    }
}

/**
 * Alias pour compatibilité ascendante
 * @deprecated Utiliser getApps() à la place
 */
export const getVerticals = getApps;

/**
 * Récupère une app par son ID
 * @param {string} appId - ID de l'app
 * @returns {Promise<{data: Object|null, error: Error|null}>}
 * 
 * MIGRATION: getVerticalById → getAppById
 * - Ajout .schema('config')
 * - Table renommée: verticals → apps
 * - Paramètre renommé: verticalId → appId
 */
export async function getAppById(appId) {
    try {
        const { data, error } = await supabase
            .from('apps')                        // ← CHANGÉ: verticals → apps
            .select('*')
            .eq('id', appId)
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (err) {
        console.error('[ReferentielsService] Error loading app:', err);
        return { data: null, error: err };
    }
}

/**
 * Alias pour compatibilité ascendante
 * @deprecated Utiliser getAppById() à la place
 */
export const getVerticalById = getAppById;

// ============================================================================
// CATÉGORIES DOCUMENTS
// ============================================================================

/**
 * Récupère toutes les catégories de documents actives
 * @returns {Promise<{data: Array, error: Error|null}>}
 * 
 * MIGRATION: document_categories → config.document_categories
 * - Ajout .schema('config')
 * 
 * V2: Ajout target_apps, target_layers, linked_concept_id pour filtrage par app
 */
export async function getDocumentCategories() {
    try {
        const { data, error } = await supabase
            .from('v_config_document_categories')  // ⭐ V2: Vue exposée dans public
            // ⭐ V2: Ajout target_apps, target_layers, linked_concept_id
            .select('id, slug, label, description, sort_order, target_apps, target_layers, linked_concept_id')
            .order('sort_order', { ascending: true });

        if (error) throw error;
        
        // Mapper pour avoir un format cohérent
        const mapped = (data || []).map(cat => ({
            ...cat,
            name: cat.label, // Alias pour compatibilité
        }));
        
        return { data: mapped, error: null };
    } catch (err) {
        console.error('[ReferentielsService] Error loading categories:', err);
        return { data: [], error: err };
    }
}

/**
 * Alias pour getDocumentCategories (pour compatibilité)
 */
export const getCategories = getDocumentCategories;

/**
 * Récupère une catégorie par son slug
 * @param {string} slug - Slug de la catégorie
 * @returns {Promise<{data: Object|null, error: Error|null}>}
 * 
 * MIGRATION: document_categories → config.document_categories
 * - Ajout .schema('config')
 */
export async function getCategoryBySlug(slug) {
    try {
        const { data, error } = await supabase
            .from('v_config_document_categories')  // ⭐ Vue exposée dans public
            .select('*')
            .eq('slug', slug)
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (err) {
        console.error('[ReferentielsService] Error loading category:', err);
        return { data: null, error: err };
    }
}

// ============================================================================
// DOMAINES LÉGIFRANCE (déjà dans le bon schéma)
// ============================================================================

/**
 * Récupère tous les domaines Légifrance actifs
 * @returns {Promise<{data: Array, error: Error|null}>}
 * 
 * NOTE: Pas de changement, déjà dans schéma legifrance
 */
export async function getLegifranceDomains() {
    try {
        const { data, error } = await supabase
            .from('code_domains')
            .select('id, name, description, icon, color, sort_order')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });

        if (error) throw error;
        return { data: data || [], error: null };
    } catch (err) {
        console.error('[ReferentielsService] Error loading legifrance domains:', err);
        return { data: [], error: err };
    }
}

/**
 * Récupère les codes Légifrance avec filtres optionnels
 * @param {Object} filters - Filtres optionnels
 * @param {string} filters.domainId - Filtrer par domaine
 * @param {boolean} filters.enabledOnly - Uniquement les codes activés
 * @returns {Promise<{data: Array, error: Error|null}>}
 * 
 * MIGRATION: default_verticals → default_apps (colonne renommée)
 */
export async function getLegifranceCodes(filters = {}) {
    try {
        let query = supabase
            .from('codes')
            .select('id, name, short_name, description, domain_id, is_enabled, last_sync_at, total_articles, indexed_articles, default_apps')
            .order('name', { ascending: true });

        if (filters.domainId) {
            query = query.eq('domain_id', filters.domainId);
        }
        if (filters.enabledOnly) {
            query = query.eq('is_enabled', true);
        }

        const { data, error } = await query;
        if (error) throw error;
        return { data: data || [], error: null };
    } catch (err) {
        console.error('[ReferentielsService] Error loading legifrance codes:', err);
        return { data: [], error: err };
    }
}

/**
 * Récupère les codes Légifrance groupés par domaine
 * @returns {Promise<{data: Object, error: Error|null}>}
 */
export async function getLegifranceCodesGroupedByDomain() {
    try {
        const [domainsResult, codesResult] = await Promise.all([
            getLegifranceDomains(),
            getLegifranceCodes()
        ]);

        if (domainsResult.error) throw domainsResult.error;
        if (codesResult.error) throw codesResult.error;

        const grouped = {};
        domainsResult.data.forEach(domain => {
            grouped[domain.id] = { ...domain, codes: [] };
        });
        codesResult.data.forEach(code => {
            if (code.domain_id && grouped[code.domain_id]) {
                grouped[code.domain_id].codes.push(code);
            }
        });

        return { data: grouped, error: null };
    } catch (err) {
        console.error('[ReferentielsService] Error grouping codes by domain:', err);
        return { data: {}, error: err };
    }
}

// ============================================================================
// EXPORT GROUPÉ POUR COMPATIBILITÉ
// ============================================================================

export const referentielsService = {
    // Apps (nouveau nom)
    getApps,
    getAppById,
    
    // Aliases pour compatibilité ascendante (deprecated)
    getVerticals,
    getVerticalById,
    
    // Catégories
    getDocumentCategories,
    getCategories,
    getCategoryBySlug,
    
    // Légifrance
    getLegifranceDomains,
    getLegifranceCodes,
    getLegifranceCodesGroupedByDomain,
};

export default referentielsService;
