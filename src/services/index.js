/**
 * Services - Baikal Console
 * ============================================================================
 * MIGRATION PHASE 3 - Export centralisé de tous les services API.
 * 
 * MODIFICATIONS:
 * - Ajout des exports pour les nouveaux noms (apps vs verticals)
 * - Aliases de compatibilité conservés
 * 
 * Tous les services retournent un objet { data, error } pour une gestion
 * d'erreur uniforme.
 * 
 * @example
 * // Import groupé (nouveau nommage)
 * import { documentsService, ragService, profileService } from '@/services';
 * 
 * // Import individuel
 * import { documentsService } from '@/services/documents.service';
 * ============================================================================
 */

// ============================================================================
// SERVICES DOCUMENTS
// ============================================================================

// Service Documents (gestion documents RAG multi-couches)
// MIGRATION: Utilise maintenant rag.documents et sources.files
export { documentsService } from './documents.service';

// Service Référentiels (apps, catégories, domaines)
// MIGRATION: verticals → apps
export { 
  referentielsService,
  // Nouveaux exports (recommandés)
  getApps,
  getAppById,
  // Aliases deprecated pour compatibilité
  getVerticals,
  getVerticalById,
  // Catégories (inchangé)
  getDocumentCategories,
  getCategories,
  getCategoryBySlug,
  // Légifrance (inchangé)
  getLegifranceDomains,
  getLegifranceCodes,
  getLegifranceCodesGroupedByDomain,
} from './referentiels.service';

// ============================================================================
// SERVICES AUTHENTIFICATION & UTILISATEURS
// ============================================================================

// Service Authentification
export { authService } from './auth.service';

// Service Profils utilisateurs
// MIGRATION: Utilise maintenant core.profiles
export { profileService } from './profile.service';

// Service Organisations
// MIGRATION: Utilise maintenant core.organizations
export { organizationService } from './organization.service';

// ============================================================================
// SERVICES STOCKAGE & FICHIERS
// ============================================================================

// Service Storage (upload, téléchargement fichiers)
// MIGRATION: Nouveaux buckets (premium-sources, user-workspace)
export { storageService, STORAGE_BUCKETS } from './storage.service';

// ============================================================================
// SERVICES CONFIGURATION
// ============================================================================

// Service Prompts (gestion prompts agents RAG)
// MIGRATION: Utilise maintenant config.agent_prompts
export { default as promptsService } from './prompts.service';
export { 
  getPrompts,
  getPromptById,
  createPrompt,
  updatePrompt,
  deletePrompt,
  duplicatePrompt,
  togglePromptStatus,
} from './prompts.service';

// Re-export getVerticals depuis prompts.service pour compatibilité
// (ce service a sa propre fonction getVerticals qui devra aussi être migrée)
