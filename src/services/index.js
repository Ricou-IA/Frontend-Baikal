/**
 * Services - Core RAG Engine
 * ============================================================================
 * Export centralisé de tous les services.
 * 
 * @example
 * import { authService, profileService, ragService } from '@/services';
 * 
 * // Authentification
 * const { data, error } = await authService.signIn(email, password);
 * 
 * // Profil
 * const { data: profile } = await profileService.getProfile(userId);
 * 
 * // RAG
 * const { response, sources } = await ragService.sendMessage(query, 'audit');
 * ============================================================================
 */

// Service d'authentification
export { authService } from './auth.service';

// Service de profils
export { profileService } from './profile.service';

// Service d'organisations
export { organizationService } from './organization.service';

// Service RAG
export { ragService } from './rag.service';

// Service de stockage
export { storageService, STORAGE_BUCKETS } from './storage.service';
