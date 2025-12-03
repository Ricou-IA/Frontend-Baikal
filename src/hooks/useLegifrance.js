// ============================================================================
// Hook useLegifrance
// Gestion des données Légifrance pour le SuperAdmin
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

// URL de l'Edge Function Supabase (remplace l'appel direct à n8n)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SYNC_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/trigger-legifrance-sync`;

// Verticales disponibles
export const VERTICALS = [
    { id: 'legal', label: 'Juridique', color: 'emerald' },
    { id: 'finance', label: 'Finance', color: 'blue' },
    { id: 'hr', label: 'Ressources Humaines', color: 'pink' },
    { id: 'btp', label: 'BTP / Construction', color: 'amber' },
    { id: 'audit', label: 'Audit & Conformité', color: 'indigo' },
    { id: 'tax', label: 'Fiscalité', color: 'violet' },
];

/**
 * Hook principal pour la gestion Légifrance
 */
export function useLegifrance() {
    // États
    const [codes, setCodes] = useState([]);
    const [syncJobs, setSyncJobs] = useState([]);
    const [organizations, setOrganizations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [syncing, setSyncing] = useState(false);

    // Charger les codes juridiques
    const loadCodes = useCallback(async () => {
        try {
            setError(null);
            const { data, error: fetchError } = await supabase
                .schema('legifrance')
                .from('codes')
                .select('*')
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

    // Charger les organisations (pour les grants)
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
                loadCodes(),
                loadSyncJobs(),
                loadOrganizations()
            ]);
            setLoading(false);
        };
        loadAll();
    }, [loadCodes, loadSyncJobs, loadOrganizations]);

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
    const updateCodeVerticals = useCallback(async (codeId, verticals) => {
        return updateCode(codeId, { default_verticals: verticals });
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
            return { success: false, error: 'Organisation déjà autorisée' };
        }
        
        return updateCodeGrants(codeId, [...currentGrants, orgId]);
    }, [codes, updateCodeGrants]);

    // Retirer un grant organisation
    const removeOrgGrant = useCallback(async (codeId, orgId) => {
        const code = codes.find(c => c.id === codeId);
        if (!code) return { success: false, error: 'Code non trouvé' };
        
        const currentGrants = code.granted_org_ids || [];
        return updateCodeGrants(codeId, currentGrants.filter(id => id !== orgId));
    }, [codes, updateCodeGrants]);

    // Lancer une synchronisation via Edge Function
    const triggerSync = useCallback(async (codeId, syncType, targetVerticals, triggeredBy) => {
        try {
            setSyncing(true);
            setError(null);

            // Récupérer la session pour le token JWT
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            
            if (sessionError || !session) {
                throw new Error('Session expirée. Veuillez vous reconnecter.');
            }

            const payload = {
                code_id: codeId,
                sync_type: syncType,
                target_verticals: targetVerticals,
                triggered_by: triggeredBy
            };

            console.log('[useLegifrance] Triggering sync via Edge Function:', payload);

            // Appeler l'Edge Function avec le token JWT
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

            console.log('[useLegifrance] Sync triggered successfully:', result);

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

    // Rafraîchir toutes les données
    const refresh = useCallback(async () => {
        setLoading(true);
        await Promise.all([
            loadCodes(),
            loadSyncJobs(),
            loadOrganizations()
        ]);
        setLoading(false);
    }, [loadCodes, loadSyncJobs, loadOrganizations]);

    return {
        // Données
        codes,
        syncJobs,
        organizations,
        verticals: VERTICALS,
        
        // États
        loading,
        error,
        syncing,
        
        // Actions
        loadCodes,
        loadSyncJobs,
        updateCode,
        toggleCodeEnabled,
        updateCodeVerticals,
        updateCodeGrants,
        addOrgGrant,
        removeOrgGrant,
        triggerSync,
        searchOrganizations,
        getOrganizationById,
        refresh
    };
}

export default useLegifrance;
