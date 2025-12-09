/**
 * useLegifrance.js - Baikal Console
 * ============================================================================
 * Hook pour la gestion des données Légifrance (SuperAdmin uniquement).
 * Gère les codes juridiques, domaines, verticales et synchronisation.
 * 
 * @example
 * const { codes, domains, verticals, loading, triggerSync } = useLegifrance();
 * ============================================================================
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';

// URL de l'Edge Function Supabase
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SYNC_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/trigger-legifrance-sync`;

/**
 * Hook principal pour la gestion Légifrance
 */
export function useLegifrance() {
    // ========================================================================
    // ÉTATS
    // ========================================================================
    
    // Données
    const [codes, setCodes] = useState([]);
    const [domains, setDomains] = useState([]);
    const [verticals, setVerticals] = useState([]);
    const [syncJobs, setSyncJobs] = useState([]);
    const [organizations, setOrganizations] = useState([]);
    
    // UI
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [syncing, setSyncing] = useState(false);

    // ========================================================================
    // CHARGEMENT DES DONNÉES
    // ========================================================================

    // Charger les verticales depuis Supabase
    const loadVerticals = useCallback(async () => {
        try {
            const { data, error: fetchError } = await supabase
                .from('verticals')
                .select('id, name, description, icon, color, sort_order')
                .eq('is_active', true)
                .order('sort_order', { ascending: true });

            if (fetchError) throw fetchError;
            
            // Mapper pour compatibilité avec l'ancien format
            const mappedVerticals = (data || []).map(v => ({
                id: v.id,
                label: v.name,
                description: v.description,
                icon: v.icon,
                color: v.color || 'indigo',
            }));
            
            setVerticals(mappedVerticals);
        } catch (err) {
            console.error('Erreur chargement verticales:', err);
        }
    }, []);

    // Charger les domaines Légifrance
    const loadDomains = useCallback(async () => {
        try {
            const { data, error: fetchError } = await supabase
                .schema('legifrance')
                .from('code_domains')
                .select('id, name, description, icon, color, sort_order')
                .eq('is_active', true)
                .order('sort_order', { ascending: true });

            if (fetchError) throw fetchError;
            setDomains(data || []);
        } catch (err) {
            console.error('Erreur chargement domaines:', err);
        }
    }, []);

    // Charger les codes juridiques avec leur domaine
    const loadCodes = useCallback(async () => {
        try {
            setError(null);
            const { data, error: fetchError } = await supabase
                .schema('legifrance')
                .from('codes')
                .select('*, domain:code_domains(id, name, icon, color)')
                .order('name', { ascending: true });

            if (fetchError) throw fetchError;
            setCodes(data || []);
        } catch (err) {
            console.error('Erreur chargement codes:', err);
            setError(err.message);
        }
    }, []);

    // Charger les jobs de synchronisation
    const loadSyncJobs = useCallback(async (codeId = null) => {
        try {
            let query = supabase
                .schema('legifrance')
                .from('sync_jobs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(50);

            if (codeId) {
                query = query.eq('code_id', codeId);
            }

            const { data, error: fetchError } = await query;
            if (fetchError) throw fetchError;
            setSyncJobs(data || []);
        } catch (err) {
            console.error('Erreur chargement sync jobs:', err);
        }
    }, []);

    // Charger les organisations
    const loadOrganizations = useCallback(async () => {
        try {
            const { data, error: fetchError } = await supabase
                .from('organizations')
                .select('id, name')
                .order('name', { ascending: true });

            if (fetchError) throw fetchError;
            setOrganizations(data || []);
        } catch (err) {
            console.error('Erreur chargement organisations:', err);
        }
    }, []);

    // Chargement initial
    useEffect(() => {
        const loadAll = async () => {
            setLoading(true);
            await Promise.all([
                loadVerticals(),
                loadDomains(),
                loadCodes(),
                loadSyncJobs(),
                loadOrganizations()
            ]);
            setLoading(false);
        };
        loadAll();
    }, [loadVerticals, loadDomains, loadCodes, loadSyncJobs, loadOrganizations]);

    // ========================================================================
    // ACTIONS SUR LES CODES
    // ========================================================================

    // Mettre à jour un code
    const updateCode = useCallback(async (codeId, updates) => {
        try {
            setError(null);
            const { error: updateError } = await supabase
                .schema('legifrance')
                .from('codes')
                .update({
                    ...updates,
                    updated_at: new Date().toISOString()
                })
                .eq('id', codeId);

            if (updateError) throw updateError;
            
            await loadCodes();
            return { success: true };
        } catch (err) {
            console.error('Erreur mise à jour code:', err);
            setError(err.message);
            return { success: false, error: err.message };
        }
    }, [loadCodes]);

    // Activer/désactiver un code
    const toggleCodeEnabled = useCallback(async (codeId, isEnabled) => {
        return updateCode(codeId, { is_enabled: isEnabled });
    }, [updateCode]);

    // Mettre à jour les verticales par défaut
    const updateCodeVerticals = useCallback(async (codeId, verticalIds) => {
        return updateCode(codeId, { default_verticals: verticalIds });
    }, [updateCode]);

    // Mettre à jour les grants organisations
    const updateCodeGrants = useCallback(async (codeId, orgIds) => {
        return updateCode(codeId, { granted_org_ids: orgIds });
    }, [updateCode]);

    // Ajouter un grant organisation
    const addOrgGrant = useCallback(async (codeId, orgId) => {
        const code = codes.find(c => c.id === codeId);
        if (!code) return { success: false, error: 'Code non trouvé' };
        
        const currentGrants = code.granted_org_ids || [];
        if (currentGrants.includes(orgId)) {
            return { success: true };
        }
        
        return updateCodeGrants(codeId, [...currentGrants, orgId]);
    }, [codes, updateCodeGrants]);

    // Supprimer un grant organisation
    const removeOrgGrant = useCallback(async (codeId, orgId) => {
        const code = codes.find(c => c.id === codeId);
        if (!code) return { success: false, error: 'Code non trouvé' };
        
        const currentGrants = code.granted_org_ids || [];
        return updateCodeGrants(codeId, currentGrants.filter(id => id !== orgId));
    }, [codes, updateCodeGrants]);

    // ========================================================================
    // SYNCHRONISATION
    // ========================================================================

    const triggerSync = useCallback(async (codeId, syncType = 'full', targetVerticals = null, triggeredBy = null) => {
        try {
            setSyncing(true);
            setError(null);

            // Récupérer la session
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                throw new Error('Session expirée. Veuillez vous reconnecter.');
            }

            const payload = {
                code_id: codeId,
                sync_type: syncType,
                target_verticals: targetVerticals,
                triggered_by: triggeredBy
            };

            const response = await fetch(SYNC_FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || `Erreur ${response.status}`);
            }

            // Recharger les données après un court délai
            setTimeout(() => {
                loadCodes();
                loadSyncJobs(codeId);
            }, 2000);

            return { success: true, jobId: result.job_id };
        } catch (err) {
            console.error('Erreur déclenchement sync:', err);
            setError(err.message);
            return { success: false, error: err.message };
        } finally {
            setSyncing(false);
        }
    }, [loadCodes, loadSyncJobs]);

    // ========================================================================
    // UTILITAIRES
    // ========================================================================

    // Rechercher des organisations
    const searchOrganizations = useCallback((searchTerm) => {
        if (!searchTerm || searchTerm.length < 2) return organizations;
        
        const term = searchTerm.toLowerCase();
        return organizations.filter(org => 
            org.name?.toLowerCase().includes(term)
        );
    }, [organizations]);

    // Obtenir une organisation par ID
    const getOrganizationById = useCallback((orgId) => {
        return organizations.find(org => org.id === orgId);
    }, [organizations]);

    // Obtenir un domaine par ID
    const getDomainById = useCallback((domainId) => {
        return domains.find(d => d.id === domainId);
    }, [domains]);

    // Obtenir les codes d'un domaine
    const getCodesByDomain = useCallback((domainId) => {
        return codes.filter(c => c.domain_id === domainId);
    }, [codes]);

    // Codes groupés par domaine (mémorisé)
    const codesGroupedByDomain = useMemo(() => {
        const grouped = {};
        
        domains.forEach(domain => {
            grouped[domain.id] = {
                ...domain,
                codes: codes.filter(c => c.domain_id === domain.id)
            };
        });
        
        // Ajouter les codes sans domaine
        const orphanCodes = codes.filter(c => !c.domain_id);
        if (orphanCodes.length > 0) {
            grouped['_other'] = {
                id: '_other',
                name: 'Autres',
                icon: 'folder',
                color: '#64748b',
                codes: orphanCodes
            };
        }
        
        return grouped;
    }, [domains, codes]);

    // Rafraîchir toutes les données
    const refresh = useCallback(async () => {
        setLoading(true);
        await Promise.all([
            loadVerticals(),
            loadDomains(),
            loadCodes(),
            loadSyncJobs(),
            loadOrganizations()
        ]);
        setLoading(false);
    }, [loadVerticals, loadDomains, loadCodes, loadSyncJobs, loadOrganizations]);

    // ========================================================================
    // RETURN
    // ========================================================================

    return {
        // Données
        codes,
        domains,
        verticals,
        syncJobs,
        organizations,
        
        // États
        loading,
        error,
        syncing,
        
        // Actions codes
        loadCodes,
        loadSyncJobs,
        updateCode,
        toggleCodeEnabled,
        updateCodeVerticals,
        updateCodeGrants,
        addOrgGrant,
        removeOrgGrant,
        triggerSync,
        
        // Utilitaires
        searchOrganizations,
        getOrganizationById,
        getDomainById,
        getCodesByDomain,
        codesGroupedByDomain,
        refresh
    };
}

export default useLegifrance;
