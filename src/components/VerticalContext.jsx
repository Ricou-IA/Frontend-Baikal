// ============================================================================
// VerticalContext - Gestion globale de la verticale active
// Version 2 : Chargement depuis Supabase uniquement
// ============================================================================

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

// Création du context
const VerticalContext = createContext(undefined);

// Hook personnalisé pour utiliser le context
export const useVertical = () => {
    const context = useContext(VerticalContext);
    if (context === undefined) {
        throw new Error('useVertical doit être utilisé à l\'intérieur d\'un VerticalProvider');
    }
    return context;
};

// Provider Component
export const VerticalProvider = ({ 
    children, 
    supabaseClient = null,
    defaultVertical = null,
    persistKey = 'baikal-vertical',
}) => {
    // State principal
    const [currentVertical, setCurrentVerticalState] = useState(() => {
        // Récupérer depuis localStorage au premier rendu
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem(persistKey);
            if (stored) return stored;
        }
        return defaultVertical;
    });

    const [availableVerticals, setAvailableVerticals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Charger les verticales depuis Supabase
    useEffect(() => {
        const fetchVerticals = async () => {
            if (!supabaseClient) {
                setLoading(false);
                return;
            }

            try {
                const { data, error: fetchError } = await supabaseClient
                    .from('verticals')
                    .select('id, name, description, icon, color, sort_order')
                    .eq('is_active', true)
                    .order('sort_order', { ascending: true });

                if (fetchError) throw fetchError;

                if (data && data.length > 0) {
                    setAvailableVerticals(data);
                    
                    // Si pas de verticale sélectionnée, prendre la première
                    if (!currentVertical) {
                        setCurrentVerticalState(data[0].id);
                    } else {
                        // Vérifier que la verticale actuelle existe toujours
                        const currentExists = data.some(v => v.id === currentVertical);
                        if (!currentExists) {
                            setCurrentVerticalState(data[0].id);
                        }
                    }
                }
            } catch (err) {
                console.warn('Impossible de charger les verticales:', err.message);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchVerticals();
    }, [supabaseClient, currentVertical]);

    // Setter avec persistance
    const setCurrentVertical = useCallback((verticalId) => {
        setCurrentVerticalState(verticalId);
        if (typeof window !== 'undefined') {
            localStorage.setItem(persistKey, verticalId);
        }
    }, [persistKey]);

    // Obtenir la verticale active (alias)
    const getActiveVertical = useCallback(() => {
        return availableVerticals.find(v => v.id === currentVertical) || availableVerticals[0] || null;
    }, [availableVerticals, currentVertical]);

    // Récupérer les infos de la verticale courante (compatibilité)
    const getCurrentVerticalInfo = useCallback(() => {
        return availableVerticals.find(v => v.id === currentVertical) || availableVerticals[0] || null;
    }, [currentVertical, availableVerticals]);

    // Vérifier si une verticale est valide
    const isValidVertical = useCallback((verticalId) => {
        return availableVerticals.some(v => v.id === verticalId);
    }, [availableVerticals]);

    // Headers pour les appels API
    const getVerticalHeaders = useCallback(() => {
        return {
            'x-vertical-id': currentVertical,
        };
    }, [currentVertical]);

    // Valeur du context
    const value = {
        // État
        currentVertical,
        availableVerticals,
        loading,
        error,
        
        // Actions
        setCurrentVertical,
        
        // Helpers
        getActiveVertical,
        getCurrentVerticalInfo,
        isValidVertical,
        getVerticalHeaders,
    };

    return (
        <VerticalContext.Provider value={value}>
            {children}
        </VerticalContext.Provider>
    );
};

export default VerticalContext;
