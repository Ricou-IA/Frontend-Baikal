/**
 * Composants Admin - Baikal Console
 * ============================================================================
 * Export centralisé des composants d'administration.
 *
 * NOTE: Les composants utilisateurs ont été migrés vers @features/users/
 * - MembersList → @features/users (supprimé - code mort)
 * - UsersList → @features/users (supprimé - code mort)
 * - InviteMemberModal → @features/users (supprimé - deprecated)
 *
 * @example
 * import {
 *   AdminDashboard,
 *   OrganizationSettings,
 *   LegifranceAdmin,
 *   IndexationSettings,
 * } from '@/components/admin';
 * ============================================================================
 */

// ============================================================================
// DASHBOARD
// ============================================================================

// Dashboard d'administration (stats, actions rapides)
export { default as AdminDashboard } from './AdminDashboard';

// ============================================================================
// GESTION DE L'ORGANISATION
// ============================================================================

// Paramètres de l'organisation (nom, plan, crédits)
export { default as OrganizationSettings } from './OrganizationSettings';

// ============================================================================
// SUPER ADMIN
// ============================================================================

// Switcher de profil (impersonation)
export { default as ProfileSwitcher } from './ProfileSwitcher';

// Administration Légifrance (super_admin)
export { default as LegifranceAdmin } from './LegifranceAdmin';

// ============================================================================
// INDEXATION (CONCEPTS & CATÉGORIES)
// ============================================================================

// Interface de gestion des concepts et catégories par application
export { default as IndexationSettings } from './IndexationSettings';

// ============================================================================
// SOUS-COMPOSANTS LÉGIFRANCE
// ============================================================================

// Re-export des composants Légifrance
export {
  LegifranceCodesList,
  SyncModal,
  SyncHistoryModal
} from './legifrance';
