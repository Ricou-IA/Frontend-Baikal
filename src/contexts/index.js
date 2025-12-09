/**
 * Contexts - Baikal Console
 * ============================================================================
 * MIGRATION PHASE 3 - Export centralisé de tous les contextes React.
 * 
 * MODIFICATIONS:
 * - Ajout de AppContext (remplace VerticalContext)
 * - Aliases de compatibilité pour VerticalContext
 * 
 * @example
 * // Import recommandé (nouveau nommage)
 * import { useApp, AppProvider } from '@/contexts';
 * 
 * // Import pour compatibilité (deprecated)
 * import { useVertical, VerticalProvider } from '@/contexts';
 * ============================================================================
 */

// ============================================================================
// CONTEXTE AUTHENTIFICATION
// ============================================================================

export { AuthProvider, useAuth } from './AuthContext';

// ============================================================================
// CONTEXTE NOTIFICATIONS
// ============================================================================

export { ToastProvider, useToast } from './ToastContext';

// ============================================================================
// CONTEXTE APPLICATION (anciennement Verticale)
// ============================================================================

// Exports principaux (nouveau nommage - RECOMMANDÉ)
export { 
  AppProvider,
  useApp,
  default as AppContext,
} from './AppContext';

// Aliases pour compatibilité ascendante (DEPRECATED)
// Ces exports seront supprimés dans une future version
export { 
  VerticalProvider,  // Alias de AppProvider
  useVertical,       // Alias de useApp
} from './AppContext';

// ============================================================================
// NOTE DE MIGRATION
// ============================================================================
/*
 * MIGRATION vertical → app:
 * 
 * Les imports suivants sont DEPRECATED et seront supprimés:
 * - useVertical → utiliser useApp
 * - VerticalProvider → utiliser AppProvider
 * - VerticalContext → utiliser AppContext
 * 
 * Les propriétés suivantes sont aussi DEPRECATED:
 * - currentVertical → utiliser currentApp
 * - availableVerticals → utiliser availableApps
 * - setCurrentVertical → utiliser setCurrentApp
 * - getActiveVertical → utiliser getActiveApp
 * - getCurrentVerticalInfo → utiliser getCurrentAppInfo
 * - isValidVertical → utiliser isValidApp
 * - getVerticalHeaders → utiliser getAppHeaders
 * 
 * Exemple de migration:
 * 
 * // AVANT
 * import { useVertical } from '@/contexts';
 * const { currentVertical, setCurrentVertical } = useVertical();
 * 
 * // APRÈS
 * import { useApp } from '@/contexts';
 * const { currentApp, setCurrentApp } = useApp();
 */
