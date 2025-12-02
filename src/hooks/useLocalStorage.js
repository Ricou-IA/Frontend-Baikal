/**
 * useLocalStorage - Hook pour persistance localStorage
 * ============================================================================
 * Persiste une valeur dans localStorage avec synchronisation entre onglets.
 * 
 * @example
 * const [theme, setTheme] = useLocalStorage('theme', 'light');
 * const [user, setUser] = useLocalStorage('user', null);
 * 
 * // Avec fonction de mise à jour
 * setTheme(prev => prev === 'light' ? 'dark' : 'light');
 * ============================================================================
 */

import { useState, useEffect, useCallback } from 'react';

/**
 * Hook pour persister une valeur dans localStorage
 * 
 * @template T
 * @param {string} key - Clé localStorage
 * @param {T} initialValue - Valeur par défaut si rien en storage
 * @param {Object} options - Options de configuration
 * @param {Function} [options.serialize] - Fonction de sérialisation (défaut: JSON.stringify)
 * @param {Function} [options.deserialize] - Fonction de désérialisation (défaut: JSON.parse)
 * @returns {[T, Function, Function]} - [value, setValue, removeValue]
 */
export function useLocalStorage(key, initialValue, options = {}) {
  const {
    serialize = JSON.stringify,
    deserialize = JSON.parse,
  } = options;

  // Fonction pour lire la valeur initiale
  const readValue = useCallback(() => {
    // SSR check
    if (typeof window === 'undefined') {
      return initialValue;
    }

    try {
      const item = window.localStorage.getItem(key);
      return item !== null ? deserialize(item) : initialValue;
    } catch (error) {
      console.warn(`Erreur lecture localStorage "${key}":`, error);
      return initialValue;
    }
  }, [key, initialValue, deserialize]);

  // State avec valeur initiale du localStorage
  const [storedValue, setStoredValue] = useState(readValue);

  /**
   * Met à jour la valeur dans le state et localStorage
   * @param {T | Function} value - Nouvelle valeur ou fonction de mise à jour
   */
  const setValue = useCallback((value) => {
    try {
      // Permet les fonctions de mise à jour comme useState
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      
      // Sauvegarde dans le state
      setStoredValue(valueToStore);
      
      // Sauvegarde dans localStorage
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, serialize(valueToStore));
        
        // Dispatch un événement custom pour la synchronisation entre onglets
        window.dispatchEvent(new StorageEvent('storage', {
          key,
          newValue: serialize(valueToStore),
        }));
      }
    } catch (error) {
      console.warn(`Erreur écriture localStorage "${key}":`, error);
    }
  }, [key, serialize, storedValue]);

  /**
   * Supprime la valeur du localStorage
   */
  const removeValue = useCallback(() => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(key);
        setStoredValue(initialValue);
        
        // Dispatch un événement pour la synchronisation
        window.dispatchEvent(new StorageEvent('storage', {
          key,
          newValue: null,
        }));
      }
    } catch (error) {
      console.warn(`Erreur suppression localStorage "${key}":`, error);
    }
  }, [key, initialValue]);

  // Synchronisation entre onglets
  useEffect(() => {
    const handleStorageChange = (event) => {
      if (event.key === key && event.newValue !== null) {
        try {
          setStoredValue(deserialize(event.newValue));
        } catch (error) {
          console.warn(`Erreur sync localStorage "${key}":`, error);
        }
      } else if (event.key === key && event.newValue === null) {
        setStoredValue(initialValue);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [key, initialValue, deserialize]);

  return [storedValue, setValue, removeValue];
}

export default useLocalStorage;