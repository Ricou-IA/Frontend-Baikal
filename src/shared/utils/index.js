/**
 * Shared Utils - Baikal Console
 * ============================================================================
 * Export centralisé des utilitaires partagés.
 *
 * @example
 * import { formatDate, cn, apiCall } from '@shared/utils';
 * ============================================================================
 */

// Date formatting utilities
export {
  formatDate,
  formatDateTime,
  formatDateLong,
  formatRelative,
  formatDateISO,
} from './dateFormatter';

// Re-export from legacy utils (pour migration progressive)
// Ces imports seront mis à jour quand les fichiers seront déplacés
export { cn, clsx } from '../../utils/cn';
export { apiCall, getErrorMessage, isDuplicateError, isPermissionError, isNetworkError } from '../../utils/apiHandler';
