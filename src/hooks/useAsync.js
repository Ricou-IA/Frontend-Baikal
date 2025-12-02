/**
 * useAsync - Hook pour gérer les états asynchrones
 * ============================================================================
 * Gère automatiquement les états loading, error et data pour les opérations async.
 * 
 * @example
 * const { data, loading, error, execute } = useAsync(fetchUserData);
 * 
 * // Exécution manuelle
 * const handleClick = () => execute(userId);
 * 
 * // Exécution immédiate
 * const { data, loading, error } = useAsync(fetchUserData, { immediate: true });
 * ============================================================================
 */

import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * @typedef {Object} UseAsyncState
 * @property {any} data - Les données retournées par la fonction async
 * @property {boolean} loading - État de chargement
 * @property {Error|null} error - Erreur éventuelle
 */

/**
 * @typedef {Object} UseAsyncOptions
 * @property {boolean} [immediate=false] - Exécuter immédiatement au montage
 * @property {any[]} [initialData=null] - Données initiales
 * @property {Function} [onSuccess] - Callback appelé en cas de succès
 * @property {Function} [onError] - Callback appelé en cas d'erreur
 */

/**
 * Hook pour gérer les opérations asynchrones
 * 
 * @param {Function} asyncFunction - Fonction asynchrone à exécuter
 * @param {UseAsyncOptions} options - Options de configuration
 * @returns {UseAsyncState & { execute: Function, reset: Function }}
 */
export function useAsync(asyncFunction, options = {}) {
  const {
    immediate = false,
    initialData = null,
    onSuccess = null,
    onError = null,
  } = options;

  const [state, setState] = useState({
    data: initialData,
    loading: immediate,
    error: null,
  });

  // Ref pour éviter les updates sur composants démontés
  const mountedRef = useRef(true);
  
  // Ref pour la fonction async (évite les re-renders)
  const asyncFunctionRef = useRef(asyncFunction);
  asyncFunctionRef.current = asyncFunction;

  /**
   * Exécute la fonction asynchrone
   * @param {...any} args - Arguments à passer à la fonction
   * @returns {Promise<any>} - Résultat de la fonction
   */
  const execute = useCallback(async (...args) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const result = await asyncFunctionRef.current(...args);
      
      if (mountedRef.current) {
        setState({ data: result, loading: false, error: null });
        onSuccess?.(result);
      }
      
      return result;
    } catch (error) {
      if (mountedRef.current) {
        setState(prev => ({ ...prev, loading: false, error }));
        onError?.(error);
      }
      
      throw error;
    }
  }, [onSuccess, onError]);

  /**
   * Réinitialise l'état
   */
  const reset = useCallback(() => {
    setState({
      data: initialData,
      loading: false,
      error: null,
    });
  }, [initialData]);

  /**
   * Met à jour les données manuellement
   * @param {any} newData - Nouvelles données
   */
  const setData = useCallback((newData) => {
    setState(prev => ({
      ...prev,
      data: typeof newData === 'function' ? newData(prev.data) : newData,
    }));
  }, []);

  // Exécution immédiate si demandé
  useEffect(() => {
    if (immediate) {
      execute();
    }
  }, [immediate, execute]);

  // Cleanup au démontage
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return {
    ...state,
    execute,
    reset,
    setData,
    isIdle: !state.loading && !state.error && state.data === initialData,
    isSuccess: !state.loading && !state.error && state.data !== initialData,
    isError: !state.loading && state.error !== null,
  };
}

export default useAsync;