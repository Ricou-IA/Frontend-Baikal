/**
 * useToast - Hook pour notifications toast
 * ============================================================================
 * Système de notifications toast simple et léger.
 * Peut être utilisé avec ou sans ToastProvider.
 * 
 * @example
 * // Utilisation simple (sans provider)
 * const { toasts, addToast, removeToast } = useToast();
 * addToast({ type: 'success', message: 'Sauvegardé !' });
 * 
 * // Utilisation avec provider (recommandé)
 * // Dans App.jsx: <ToastProvider><App /></ToastProvider>
 * // Dans le composant: const { success, error } = useToast();
 * ============================================================================
 */

import { useState, useCallback, useRef, createContext, useContext } from 'react';

// Types de toast
export const TOAST_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
};

// Durées par défaut (en ms)
export const TOAST_DURATIONS = {
  SHORT: 3000,
  NORMAL: 5000,
  LONG: 8000,
  PERSISTENT: null, // Ne se ferme pas automatiquement
};

/**
 * Génère un ID unique pour un toast
 */
const generateId = () => `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

/**
 * Hook de base pour gérer les toasts
 * 
 * @param {Object} options - Options de configuration
 * @param {number} [options.maxToasts=5] - Nombre maximum de toasts affichés
 * @param {number} [options.defaultDuration=5000] - Durée par défaut
 * @returns {Object} - État et méthodes des toasts
 */
export function useToast(options = {}) {
  const {
    maxToasts = 5,
    defaultDuration = TOAST_DURATIONS.NORMAL,
  } = options;

  const [toasts, setToasts] = useState([]);
  const timeoutsRef = useRef({});

  /**
   * Supprime un toast par son ID
   * @param {string} id - ID du toast à supprimer
   */
  const removeToast = useCallback((id) => {
    // Annule le timeout si présent
    if (timeoutsRef.current[id]) {
      clearTimeout(timeoutsRef.current[id]);
      delete timeoutsRef.current[id];
    }

    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  /**
   * Ajoute un nouveau toast
   * @param {Object} toast - Configuration du toast
   * @param {string} toast.type - Type: success, error, warning, info
   * @param {string} toast.message - Message à afficher
   * @param {string} [toast.title] - Titre optionnel
   * @param {number|null} [toast.duration] - Durée (null = persistent)
   * @param {Function} [toast.action] - Action optionnelle (bouton)
   * @param {string} [toast.actionLabel] - Label du bouton d'action
   * @returns {string} - ID du toast créé
   */
  const addToast = useCallback((toast) => {
    const id = generateId();
    const duration = toast.duration !== undefined ? toast.duration : defaultDuration;

    const newToast = {
      id,
      type: toast.type || TOAST_TYPES.INFO,
      message: toast.message,
      title: toast.title,
      action: toast.action,
      actionLabel: toast.actionLabel,
      createdAt: Date.now(),
    };

    setToasts(prev => {
      // Limite le nombre de toasts
      const updated = [...prev, newToast];
      if (updated.length > maxToasts) {
        // Supprime les plus anciens
        const toRemove = updated.slice(0, updated.length - maxToasts);
        toRemove.forEach(t => {
          if (timeoutsRef.current[t.id]) {
            clearTimeout(timeoutsRef.current[t.id]);
            delete timeoutsRef.current[t.id];
          }
        });
        return updated.slice(-maxToasts);
      }
      return updated;
    });

    // Auto-dismiss si durée définie
    if (duration !== null) {
      timeoutsRef.current[id] = setTimeout(() => {
        removeToast(id);
      }, duration);
    }

    return id;
  }, [defaultDuration, maxToasts, removeToast]);

  /**
   * Raccourci pour toast de succès
   */
  const success = useCallback((message, options = {}) => {
    return addToast({ type: TOAST_TYPES.SUCCESS, message, ...options });
  }, [addToast]);

  /**
   * Raccourci pour toast d'erreur
   */
  const error = useCallback((message, options = {}) => {
    return addToast({ 
      type: TOAST_TYPES.ERROR, 
      message, 
      duration: TOAST_DURATIONS.LONG, // Les erreurs restent plus longtemps
      ...options 
    });
  }, [addToast]);

  /**
   * Raccourci pour toast d'avertissement
   */
  const warning = useCallback((message, options = {}) => {
    return addToast({ type: TOAST_TYPES.WARNING, message, ...options });
  }, [addToast]);

  /**
   * Raccourci pour toast d'info
   */
  const info = useCallback((message, options = {}) => {
    return addToast({ type: TOAST_TYPES.INFO, message, ...options });
  }, [addToast]);

  /**
   * Supprime tous les toasts
   */
  const clearAll = useCallback(() => {
    // Annule tous les timeouts
    Object.values(timeoutsRef.current).forEach(timeout => {
      clearTimeout(timeout);
    });
    timeoutsRef.current = {};
    
    setToasts([]);
  }, []);

  /**
   * Met à jour un toast existant
   */
  const updateToast = useCallback((id, updates) => {
    setToasts(prev => prev.map(toast => 
      toast.id === id ? { ...toast, ...updates } : toast
    ));
  }, []);

  return {
    toasts,
    addToast,
    removeToast,
    clearAll,
    updateToast,
    // Raccourcis
    success,
    error,
    warning,
    info,
  };
}

// ============================================================================
// CONTEXT POUR USAGE GLOBAL (optionnel)
// ============================================================================

const ToastContext = createContext(null);

/**
 * Hook pour utiliser le contexte toast global
 */
export function useToastContext() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToastContext doit être utilisé dans un ToastProvider');
  }
  return context;
}

/**
 * Exporte le contexte pour créer le Provider
 */
export { ToastContext };

export default useToast;
