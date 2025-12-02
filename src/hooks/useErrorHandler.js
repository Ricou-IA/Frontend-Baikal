/**
 * useErrorHandler - Hook pour gérer les erreurs
 * ============================================================================
 * Simplifie la gestion des erreurs en affichant automatiquement des toasts.
 * 
 * @example
 * const { handleError, clearError, error } = useErrorHandler();
 * 
 * try {
 *   await saveData();
 * } catch (err) {
 *   handleError(err);
 * }
 * ============================================================================
 */

import { useState, useCallback } from 'react';
import { useToast } from '../contexts/ToastContext';
import { handleError as processError, logError } from '../utils/errors';

/**
 * Hook pour gérer les erreurs avec intégration toast
 */
export function useErrorHandler(options = {}) {
  const {
    showToast = true,
    logErrors = true,
    onError = null,
  } = options;

  const [error, setError] = useState(null);
  const [errorHistory, setErrorHistory] = useState([]);
  
  // Toast peut ne pas être disponible si pas dans ToastProvider
  let toast = null;
  try {
    toast = useToast();
  } catch {
    // Toast non disponible
  }

  const handleError = useCallback((err, context = {}) => {
    const processed = processError(err);

    setError({
      ...processed,
      originalError: err,
      context,
      timestamp: new Date().toISOString(),
    });

    setErrorHistory(prev => [...prev.slice(-9), {
      ...processed,
      timestamp: new Date().toISOString(),
    }]);

    if (logErrors) {
      logError(err, context);
    }

    if (showToast && toast) {
      toast.error(processed.message);
    }

    onError?.(err, processed);

    return processed;
  }, [showToast, logErrors, onError, toast]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearHistory = useCallback(() => {
    setErrorHistory([]);
  }, []);

  const withErrorHandling = useCallback(async (fn, context = {}) => {
    try {
      clearError();
      return await fn();
    } catch (err) {
      handleError(err, context);
      throw err;
    }
  }, [handleError, clearError]);

  const createErrorHandler = useCallback((fn, context = {}) => {
    return async (...args) => {
      return withErrorHandling(() => fn(...args), context);
    };
  }, [withErrorHandling]);

  return {
    error,
    errorHistory,
    hasError: !!error,
    handleError,
    clearError,
    clearHistory,
    withErrorHandling,
    createErrorHandler,
  };
}

export function useErrorToast() {
  let toast = null;
  try {
    toast = useToast();
  } catch {
    // Toast non disponible
  }

  const showError = useCallback((message) => {
    if (toast) {
      toast.error(message);
    } else {
      console.error(message);
    }
  }, [toast]);

  const showSuccess = useCallback((message) => {
    if (toast) {
      toast.success(message);
    }
  }, [toast]);

  return { showError, showSuccess };
}

export default useErrorHandler;
