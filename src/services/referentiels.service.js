/**
 * Referentiels Service - Baikal Console
 * ============================================================================
 * Service pour le chargement des référentiels depuis Supabase.
 * Gère : Verticales, Catégories de documents, Domaines Légifrance.
 * 
 * @example
 * import { referentielsService } from '@/services';
 * 
 * const { data: verticals } = await referentielsService.getVerticals();
 * const { data: categories } = await referentielsService.getCategories();
 * ============================================================================
 */

import { supabase } from '../lib/supabaseClient';

// ============================================================================
// VERTICALES
// ============================================================================

/**
 * Récupère toutes les verticales actives
 * @returns {Promise<{data: Array, error: Error|null}>}
 */
export async function getVerticals() {
    try {
        const { data, error } = await supabase
            .from('verticals')
            .select('id, name, description, icon, color, sort_order')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });

        if (error) throw error;
        return { data: data || [], error: null };
    } catch (err) {
        console.error('[ReferentielsService] Error loading verticals:', err);
        return { data: [], error: err };
    }
}

/**
 * Récupère une verticale par son ID
 * @param {string} verticalId - ID de la verticale
 * @returns {Promise<{data: Object|null, error: Error|null}>}
 */
export async function getVerticalById(verticalId) {
    try {
        const { data, error } = await supabase
            .from('verticals')
            .select('*')
            .eq('id', verticalId)
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (err) {
        console.error('[ReferentielsService] Error loading vertical:', err);
        return { data: null, error: err };
    }
}

// ============================================================================
// CATÉGORIES DOCUMENTS
// ============================================================================

/**
 * Récupère toutes les catégories de documents actives
 * @returns {Promise<{data: Array, error: Error|null}>}
 */
export async function getDocumentCategories() {
    try {
        const { data, error } = await supabase
            .from('document_categories')
            .select('id, slug, label, description, icon, sort_order')
            .eq('is_active', true)
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
 */
export async function getCategoryBySlug(slug) {
    try {
        const { data, error } = await supabase
            .from('document_categories')
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
// DOMAINES LÉGIFRANCE
// ============================================================================

/**
 * Récupère tous les domaines Légifrance actifs
 * @returns {Promise<{data: Array, error: Error|null}>}
 */
export async function getLegifranceDomains() {
    try {
        const { data, error } = await supabase
            .schema('legifrance')
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
 */
export async function getLegifranceCodes(filters = {}) {
    try {
        let query = supabase
            .schema('legifrance')
            .from('codes')
            .select('id, name, short_name, code, description, domain_id, is_enabled, last_sync_at, total_articles, indexed_articles, default_verticals')
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
// CACHE LOCAL
// ============================================================================

let cachedVerticals = null;
let cachedCategories = null;
let verticalsLastFetch = 0;
let categoriesLastFetch = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Récupère les verticales avec cache
 * @returns {Promise<{data: Array, error: Error|null}>}
 */
export async function getVerticalsCached() {
    const now = Date.now();
    if (cachedVerticals && (now - verticalsLastFetch) < CACHE_DURATION) {
        return { data: cachedVerticals, error: null };
    }
    const result = await getVerticals();
    if (!result.error) {
        cachedVerticals = result.data;
        verticalsLastFetch = now;
    }
    return result;
}

/**
 * Récupère les catégories avec cache
 * @returns {Promise<{data: Array, error: Error|null}>}
 */
export async function getCategoriesCached() {
    const now = Date.now();
    if (cachedCategories && (now - categoriesLastFetch) < CACHE_DURATION) {
        return { data: cachedCategories, error: null };
    }
    const result = await getDocumentCategories();
    if (!result.error) {
        cachedCategories = result.data;
        categoriesLastFetch = now;
    }
    return result;
}

/**
 * Invalide le cache
 */
export function invalidateCache() {
    cachedVerticals = null;
    cachedCategories = null;
    verticalsLastFetch = 0;
    categoriesLastFetch = 0;
}

// ============================================================================
// EXPORT
// ============================================================================

export const referentielsService = {
    // Verticales
    getVerticals,
    getVerticalById,
    getVerticalsCached,
    
    // Catégories
    getDocumentCategories,
    getCategories, // Alias
    getCategoryBySlug,
    getCategoriesCached,
    
    // Légifrance
    getLegifranceDomains,
    getLegifranceCodes,
    getLegifranceCodesGroupedByDomain,
    
    // Cache
    invalidateCache,
};

export default referentielsService;
