/**
 * Contexts React - Baikal Console
 * ============================================================================
 * Export centralisé de tous les contextes React.
 * 
 * @example
 * import { useAuth, useVertical, ToastProvider } from '@/contexts';
 * ============================================================================
 */

// ============================================================================
// AUTHENTIFICATION
// ============================================================================

// Contexte d'authentification principal
export { 
    default as AuthContext,
    AuthProvider, 
    useAuth 
  } from './AuthContext';
  
  // ============================================================================
  // NOTIFICATIONS
  // ============================================================================
  
  // Contexte des notifications toast
  export { 
    default as ToastContext,
    ToastProvider, 
    useToastContext 
  } from './ToastContext';
  
  // ============================================================================
  // VERTICALES MÉTIER
  // ============================================================================
  
  // Contexte de gestion des verticales
  export { 
    VerticalProvider, 
    useVertical 
  } from './VerticalContext';
  