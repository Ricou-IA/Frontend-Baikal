/**
 * Services - Baikal Console
 * ============================================================================
 * Export centralisé de tous les services API.
 * 
 * Tous les services retournent un objet { data, error } pour une gestion
 * d'erreur uniforme.
 * 
 * @example
 * // Import groupé
 * import { documentsService, ragService, profileService } from '@/services';
 * 
 * // Import individuel
 * import { documentsService } from '@/services/documents.service';
 * ============================================================================
 */

// ============================================================================
// SERVICES RAG & DOCUMENTS
// ============================================================================

// Service RAG (chat, conversations)
export { ragService } from './rag.service';

// Service Documents (gestion documents RAG multi-couches)
export { documentsService } from './documents.service';

// Service Référentiels (verticales, catégories, domaines)
export { referentielsService } from './referentiels.service';

// ============================================================================
// SERVICES AUTHENTIFICATION & UTILISATEURS
// ============================================================================

// Service Authentification
export { authService } from './auth.service';

// Service Profils utilisateurs
export { profileService } from './profile.service';

// Service Organisations
export { organizationService } from './organization.service';

// ============================================================================
// SERVICES STOCKAGE & FICHIERS
// ============================================================================

// Service Storage (upload, téléchargement fichiers)
export { storageService, STORAGE_BUCKETS } from './storage.service';

// ============================================================================
// SERVICES CONFIGURATION
// ============================================================================

// Service Prompts (gestion prompts agents RAG)
export { default as promptsService } from './prompts.service';
export { 
  getPrompts,
  getPromptById,
  createPrompt,
  updatePrompt,
  deletePrompt,
  duplicatePrompt,
  togglePromptStatus,
  getVerticals,
} from './prompts.service';
