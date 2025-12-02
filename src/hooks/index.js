/**
 * Hooks personnalisés - Core RAG Engine
 * ============================================================================
 * Export centralisé de tous les hooks personnalisés.
 * ============================================================================
 */

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

// Chat RAG
export { useRAG } from './useRAG';

// Gestion des erreurs
export { useErrorHandler, useErrorToast } from './useErrorHandler';

// Impersonation (super_admin)
export { useImpersonation } from './useImpersonation';
