/**
 * Services - Baikal Console
 * ============================================================================
 * MIGRATION PHASE 3 - Export centralisé de tous les services API.
 * 
 * MODIFICATIONS:
 * - Ajout des exports pour les nouveaux noms (apps vs verticals)
 * - Aliases de compatibilité conservés
 * - Ajout services Administration (invitations, users, projects, admin)
 * - Refactorisation organizationService pour utiliser les RPC
 * 
 * Tous les services retournent un objet { data, error } pour une gestion
 * d'erreur uniforme.
 * 
 * @example
 * // Import groupé (nouveau nommage)
 * import { documentsService, profileService, adminService } from '@/services';
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

// Service Organisations (refactorisé pour utiliser les RPC)
// MIGRATION: Utilise maintenant les RPC core.create_organization, etc.
export { organizationService, ORGANIZATION_PLANS } from './organization.service';

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

// ============================================================================
// SERVICES ADMINISTRATION (Gestion Users/Orgs/Projets via RPC)
// ============================================================================

// Service Invitations (codes d'invitation par organisation)
// Utilise les RPC: create_invitation, validate_invitation_code, get_invitations, revoke_invitation
export { 
  invitationsService,
  INVITATION_APP_ROLES,
  INVITATION_BUSINESS_ROLES,
} from './invitations.service';

// Service Utilisateurs Admin (gestion des users par super_admin/org_admin)
// Utilise les RPC: get_pending_users, get_users_for_admin, assign_user_to_org, update_user_role, remove_user_from_org
// ⚠️ Les modifications de rôle impactent les permissions sur les Layers RAG
export { 
  usersService,
  APP_ROLES,
  BUSINESS_ROLES,
} from './users.service';

// Service Projets (gestion des projets et membres)
// Utilise les RPC: create_project, update_project, delete_project, get_projects, assign_user_to_project, etc.
// ⚠️ Les membres de projet ont accès aux documents de la couche PROJECT
export { 
  projectsService,
  PROJECT_STATUSES,
  PROJECT_ROLES,
} from './projects.service';

// Service Admin (statistiques et dashboard)
// Utilise la vue: core.admin_users_stats
export { adminService } from './admin.service';
