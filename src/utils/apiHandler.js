/**
 * apiHandler.js - Baikal Console
 * ============================================================================
 * Utilitaires pour standardiser la gestion des appels API et des erreurs.
 *
 * @version 1.0.0
 * ============================================================================
 */

/**
 * Wrapper pour les appels API avec gestion d'erreurs standardisée.
 * Retourne toujours un objet { data, error }.
 *
 * @param {Function} fn - Fonction async à exécuter
 * @param {string} context - Contexte pour le logging (ex: '[documentsService]')
 * @returns {Promise<{data: any, error: Error|null}>}
 *
 * @example
 * const { data, error } = await apiCall(
 *   () => supabase.from('documents').select('*'),
 *   '[documentsService.getAll]'
 * );
 */
export async function apiCall(fn, context = '[apiCall]') {
  try {
    const result = await fn();

    // Si le résultat est une réponse Supabase avec une erreur
    if (result && result.error) {
      console.error(`${context} Supabase error:`, result.error);
      return { data: null, error: result.error };
    }

    // Si le résultat est une réponse Supabase avec data
    if (result && 'data' in result) {
      return { data: result.data, error: null };
    }

    // Sinon, retourner le résultat directement
    return { data: result, error: null };
  } catch (error) {
    console.error(`${context} Exception:`, error);
    return { data: null, error };
  }
}

/**
 * Wrapper pour les appels API avec comptage (pagination).
 * Retourne { data, count, error }.
 *
 * @param {Function} fn - Fonction async à exécuter
 * @param {string} context - Contexte pour le logging
 * @returns {Promise<{data: any, count: number|null, error: Error|null}>}
 */
export async function apiCallWithCount(fn, context = '[apiCall]') {
  try {
    const result = await fn();

    if (result && result.error) {
      console.error(`${context} Supabase error:`, result.error);
      return { data: null, count: null, error: result.error };
    }

    return {
      data: result.data || null,
      count: result.count || null,
      error: null
    };
  } catch (error) {
    console.error(`${context} Exception:`, error);
    return { data: null, count: null, error };
  }
}

/**
 * Extrait le message d'erreur d'un objet erreur de manière sûre.
 *
 * @param {unknown} error - L'erreur à analyser
 * @returns {string} Le message d'erreur
 */
export function getErrorMessage(error) {
  if (!error) return 'Une erreur inconnue est survenue';

  if (typeof error === 'string') return error;

  if (error instanceof Error) return error.message;

  if (typeof error === 'object') {
    // Supabase error format
    if (error.message) return error.message;
    if (error.error_description) return error.error_description;
    if (error.details) return error.details;
  }

  return 'Une erreur inconnue est survenue';
}

/**
 * Vérifie si une erreur est une erreur de duplication (code 23505).
 *
 * @param {unknown} error - L'erreur à vérifier
 * @returns {boolean}
 */
export function isDuplicateError(error) {
  if (!error) return false;

  if (typeof error === 'object') {
    return error.code === '23505' ||
           error.message?.includes('duplicate') ||
           error.message?.includes('already exists');
  }

  return false;
}

/**
 * Vérifie si une erreur est une erreur de permission.
 *
 * @param {unknown} error - L'erreur à vérifier
 * @returns {boolean}
 */
export function isPermissionError(error) {
  if (!error) return false;

  if (typeof error === 'object') {
    return error.code === '42501' ||
           error.code === '403' ||
           error.message?.includes('permission') ||
           error.message?.includes('denied') ||
           error.message?.includes('unauthorized');
  }

  return false;
}

/**
 * Vérifie si une erreur est une erreur de réseau.
 *
 * @param {unknown} error - L'erreur à vérifier
 * @returns {boolean}
 */
export function isNetworkError(error) {
  if (!error) return false;

  if (error instanceof TypeError && error.message === 'Failed to fetch') {
    return true;
  }

  if (typeof error === 'object') {
    return error.message?.includes('network') ||
           error.message?.includes('fetch') ||
           error.message?.includes('connection');
  }

  return false;
}

/**
 * Retry une fonction avec backoff exponentiel.
 *
 * @param {Function} fn - Fonction async à exécuter
 * @param {Object} options - Options de retry
 * @param {number} options.maxRetries - Nombre max de retries (défaut: 3)
 * @param {number} options.baseDelay - Délai de base en ms (défaut: 1000)
 * @param {Function} options.shouldRetry - Fonction pour décider si on retry (défaut: isNetworkError)
 * @returns {Promise<any>}
 */
export async function withRetry(fn, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    shouldRetry = isNetworkError
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries && shouldRetry(error)) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.warn(`[withRetry] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

export default {
  apiCall,
  apiCallWithCount,
  getErrorMessage,
  isDuplicateError,
  isPermissionError,
  isNetworkError,
  withRetry,
};
