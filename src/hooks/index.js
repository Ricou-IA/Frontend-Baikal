/**
 * Hooks personnalisés - Baikal Console
 * ============================================================================
 * Export centralisé de tous les hooks personnalisés.
 * 
 * @example
 * // Import groupé
 * import { useAsync, useForm, useToast } from '@/hooks';
 * 
 * // Import individuel (pour tree-shaking)
 * import { useAsync } from '@/hooks/useAsync';
 * ============================================================================
 */

// ============================================================================
// HOOKS UTILITAIRES
// ============================================================================

// Gestion des états asynchrones
export { useAsync } from './useAsync';

// Persistance localStorage
export { useLocalStorage } from './useLocalStorage';

// Debounce et throttle
export { 
  useDebounce, 
  useDebouncedCallback, 
  useThrottle 
} from './useDebounce';

// ============================================================================
// HOOKS FORMULAIRES & UI
// ============================================================================

// Gestion de formulaires
export { useForm } from './useForm';

// Notifications toast
export { 
  useToast, 
  useToastContext, 
  ToastContext,
  TOAST_TYPES,
  TOAST_DURATIONS 
} from './useToast';

// ============================================================================
// HOOKS MÉTIER
// ============================================================================

// Chat RAG
export { useRAG } from './useRAG';

// Gestion des erreurs
export { useErrorHandler, useErrorToast } from './useErrorHandler';

// Impersonation (super_admin)
export { useImpersonation } from './useImpersonation';

// Gestion de l'organisation et membres
export { useOrganization } from './useOrganization';

// Administration Légifrance (super_admin)
export { useLegifrance } from './useLegifrance';
