// ============================================================================
// Service Référentiels - Chargement depuis Supabase
// Verticales, Catégories, Domaines Légifrance
// ============================================================================

import { supabase } from '../lib/supabaseClient';

// ============================================================================
// VERTICALES
// ============================================================================

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

export async function getDocumentCategories() {
    try {
        const { data, error } = await supabase
            .from('document_categories')
            .select('id, slug, label, description, icon, sort_order')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });

        if (error) throw error;
        return { data: data || [], error: null };
    } catch (err) {
        console.error('[ReferentielsService] Error loading categories:', err);
        return { data: [], error: err };
    }
}

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

export async function getLegifranceCodes(filters = {}) {
    try {
        let query = supabase
            .schema('legifrance')
            .from('codes')
            .select('id, name, short_name, description, domain_id, is_enabled, last_sync_at, total_articles, indexed_articles, default_verticals')
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
const CACHE_DURATION = 5 * 60 * 1000;

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
    getVerticals,
    getVerticalById,
    getVerticalsCached,
    getDocumentCategories,
    getCategoryBySlug,
    getCategoriesCached,
    getLegifranceDomains,
    getLegifranceCodes,
    getLegifranceCodesGroupedByDomain,
    invalidateCache,
};

export default referentielsService;
