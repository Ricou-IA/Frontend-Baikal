// ============================================================================
// AppContext - Gestion globale de l'app active (anciennement VerticalContext)
// MIGRATION PHASE 3 - Base de données Baikal v2
// 
// MODIFICATIONS APPORTÉES:
// - VerticalContext → AppContext (renommé)
// - useVertical → useApp (hook renommé)
// - VerticalProvider → AppProvider (provider renommé)
// - currentVertical → currentApp (state renommé)
// - verticals → config.apps (table renommée, schéma changé)
// - vertical_id → app_id (colonne renommée dans la DB)
// - persistKey changé: 'baikal-vertical' → 'baikal-app'
// ============================================================================

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

// Création du context
const AppContext = createContext(undefined);

// ============================================================================
// HOOK PERSONNALISÉ
// ============================================================================

/**
 * Hook personnalisé pour utiliser le context App
 * 
 * MIGRATION: useVertical → useApp
 */
export const useApp = () => {
    const context = useContext(AppContext);
    if (context === undefined) {
        throw new Error('useApp doit être utilisé à l\'intérieur d\'un AppProvider');
    }
    return context;
};

/**
 * Alias pour compatibilité ascendante
 * @deprecated Utiliser useApp() à la place
 */
export const useVertical = useApp;

// ============================================================================
// PROVIDER COMPONENT
// ============================================================================

/**
 * Provider Component pour la gestion des apps
 * 
 * MIGRATION:
 * - VerticalProvider → AppProvider
 * - defaultVertical → defaultApp
 * - persistKey: 'baikal-vertical' → 'baikal-app'
 */
export const AppProvider = ({ 
    children, 
    supabaseClient = null,
    defaultApp = null,                           // ← CHANGÉ: defaultVertical → defaultApp
    persistKey = 'baikal-app',                   // ← CHANGÉ: baikal-vertical → baikal-app
}) => {
    // State principal
    const [currentApp, setCurrentAppState] = useState(() => {
        // Récupérer depuis localStorage au premier rendu
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem(persistKey);
            if (stored) return stored;
            
            // Migration: vérifier l'ancien clé
            const oldKey = 'baikal-vertical';
            const oldStored = localStorage.getItem(oldKey);
            if (oldStored) {
                localStorage.setItem(persistKey, oldStored);
                localStorage.removeItem(oldKey);
                return oldStored;
            }
        }
        return defaultApp;
    });

    const [availableApps, setAvailableApps] = useState([]);  // ← CHANGÉ: availableVerticals → availableApps
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Charger les apps depuis Supabase
    // MIGRATION: verticals → config.apps
    useEffect(() => {
        const fetchApps = async () => {
            if (!supabaseClient) {
                setLoading(false);
                return;
            }

            try {
                const { data, error: fetchError } = await supabaseClient
                    .from('apps')                        // Tables dans search_path
                    .select('id, name, description, icon, color, sort_order')
                    .eq('is_active', true)
                    .order('sort_order', { ascending: true });

                if (fetchError) throw fetchError;

                if (data && data.length > 0) {
                    setAvailableApps(data);
                    
                    // Si pas d'app sélectionnée, prendre la première
                    if (!currentApp) {
                        setCurrentAppState(data[0].id);
                    } else {
                        // Vérifier que l'app actuelle existe toujours
                        const currentExists = data.some(v => v.id === currentApp);
                        if (!currentExists) {
                            setCurrentAppState(data[0].id);
                        }
                    }
                }
            } catch (err) {
                console.warn('Impossible de charger les apps:', err.message);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchApps();
    }, [supabaseClient, currentApp]);

    // Setter avec persistance
    const setCurrentApp = useCallback((appId) => {
        setCurrentAppState(appId);
        if (typeof window !== 'undefined') {
            localStorage.setItem(persistKey, appId);
        }
    }, [persistKey]);

    // Obtenir l'app active
    const getActiveApp = useCallback(() => {
        return availableApps.find(v => v.id === currentApp) || availableApps[0] || null;
    }, [availableApps, currentApp]);

    // Récupérer les infos de l'app courante (compatibilité)
    const getCurrentAppInfo = useCallback(() => {
        return availableApps.find(v => v.id === currentApp) || availableApps[0] || null;
    }, [currentApp, availableApps]);

    // Vérifier si une app est valide
    const isValidApp = useCallback((appId) => {
        return availableApps.some(v => v.id === appId);
    }, [availableApps]);

    // Headers pour les appels API
    // MIGRATION: x-vertical-id → x-app-id
    const getAppHeaders = useCallback(() => {
        return {
            'x-app-id': currentApp,              // ← CHANGÉ: x-vertical-id → x-app-id
        };
    }, [currentApp]);

    // ========================================================================
    // ALIASES POUR COMPATIBILITÉ ASCENDANTE (deprecated)
    // ========================================================================
    
    /** @deprecated Utiliser currentApp */
    const currentVertical = currentApp;
    /** @deprecated Utiliser setCurrentApp */
    const setCurrentVertical = setCurrentApp;
    /** @deprecated Utiliser availableApps */
    const availableVerticals = availableApps;
    /** @deprecated Utiliser getActiveApp */
    const getActiveVertical = getActiveApp;
    /** @deprecated Utiliser getCurrentAppInfo */
    const getCurrentVerticalInfo = getCurrentAppInfo;
    /** @deprecated Utiliser isValidApp */
    const isValidVertical = isValidApp;
    /** @deprecated Utiliser getAppHeaders */
    const getVerticalHeaders = getAppHeaders;

    // Valeur du context
    const value = {
        // État (nouveau nommage)
        currentApp,
        availableApps,
        loading,
        error,
        
        // Actions (nouveau nommage)
        setCurrentApp,
        
        // Helpers (nouveau nommage)
        getActiveApp,
        getCurrentAppInfo,
        isValidApp,
        getAppHeaders,
        
        // Aliases pour compatibilité (deprecated)
        currentVertical,
        setCurrentVertical,
        availableVerticals,
        getActiveVertical,
        getCurrentVerticalInfo,
        isValidVertical,
        getVerticalHeaders,
    };

    return (
        <AppContext.Provider value={value}>
            {children}
        </AppContext.Provider>
    );
};

/**
 * Alias pour compatibilité ascendante
 * @deprecated Utiliser AppProvider à la place
 */
export const VerticalProvider = AppProvider;

export default AppContext;
