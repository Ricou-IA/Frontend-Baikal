/**
 * useDebounce - Hook pour debounce de valeurs
 * ============================================================================
 * Retarde la mise à jour d'une valeur jusqu'à ce qu'elle soit stable.
 * Utile pour les champs de recherche, validation en temps réel, etc.
 * 
 * @example
 * const [searchTerm, setSearchTerm] = useState('');
 * const debouncedSearch = useDebounce(searchTerm, 300);
 * 
 * useEffect(() => {
 *   if (debouncedSearch) {
 *     fetchResults(debouncedSearch);
 *   }
 * }, [debouncedSearch]);
 * ============================================================================
 */

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Hook pour debouncer une valeur
 * 
 * @template T
 * @param {T} value - Valeur à debouncer
 * @param {number} delay - Délai en millisecondes (défaut: 300ms)
 * @returns {T} - Valeur debouncée
 */
export function useDebounce(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    // Crée un timer qui met à jour la valeur après le délai
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Cleanup: annule le timer si la valeur change avant le délai
    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Hook pour debouncer une fonction callback
 * 
 * @param {Function} callback - Fonction à debouncer
 * @param {number} delay - Délai en millisecondes (défaut: 300ms)
 * @param {Array} deps - Dépendances pour le callback
 * @returns {Function} - Fonction debouncée
 * 
 * @example
 * const debouncedSave = useDebouncedCallback(
 *   (value) => saveToServer(value),
 *   500,
 *   []
 * );
 */
export function useDebouncedCallback(callback, delay = 300, deps = []) {
  const timeoutRef = useRef(null);
  const callbackRef = useRef(callback);

  // Met à jour la ref du callback
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Cleanup au démontage
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const debouncedCallback = useCallback((...args) => {
    // Annule le timer précédent
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Crée un nouveau timer
    timeoutRef.current = setTimeout(() => {
      callbackRef.current(...args);
    }, delay);
  }, [delay, ...deps]);

  // Permet d'annuler manuellement
  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Permet d'exécuter immédiatement
  const flush = useCallback((...args) => {
    cancel();
    callbackRef.current(...args);
  }, [cancel]);

  return {
    callback: debouncedCallback,
    cancel,
    flush,
  };
}

/**
 * Hook pour throttle une valeur (limite la fréquence de mise à jour)
 * 
 * @template T
 * @param {T} value - Valeur à throttler
 * @param {number} interval - Intervalle minimum en millisecondes
 * @returns {T} - Valeur throttlée
 * 
 * @example
 * const throttledPosition = useThrottle(mousePosition, 100);
 */
export function useThrottle(value, interval = 300) {
  const [throttledValue, setThrottledValue] = useState(value);
  const lastExecuted = useRef(Date.now());

  useEffect(() => {
    const now = Date.now();
    const elapsed = now - lastExecuted.current;

    if (elapsed >= interval) {
      // Assez de temps écoulé, mise à jour immédiate
      lastExecuted.current = now;
      setThrottledValue(value);
    } else {
      // Planifie une mise à jour pour la fin de l'intervalle
      const timer = setTimeout(() => {
        lastExecuted.current = Date.now();
        setThrottledValue(value);
      }, interval - elapsed);

      return () => clearTimeout(timer);
    }
  }, [value, interval]);

  return throttledValue;
}

export default useDebounce;
