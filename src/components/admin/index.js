/**
 * Composants Admin - Baikal Console
 * ============================================================================
 * Export centralisé des composants d'administration.
 * 
 * @example
 * import { 
 *   AdminDashboard,
 *   MembersList, 
 *   OrganizationSettings, 
 *   LegifranceAdmin 
 * } from '@/components/admin';
 * ============================================================================
 */

// ============================================================================
// DASHBOARD
// ============================================================================

// Dashboard d'administration (stats, actions rapides)
export { default as AdminDashboard } from './AdminDashboard';

// ============================================================================
// GESTION DES MEMBRES
// ============================================================================

// Liste des membres de l'organisation
export { default as MembersList } from './MembersList';

// Modal d'invitation de membre (ancien système - deprecated)
// TODO: Remplacer par le nouveau système d'invitations par code
export { default as InviteMemberModal } from './InviteMemberModal';

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

// Liste de tous les utilisateurs (super_admin)
export { default as UsersList } from './UsersList';

// Administration Légifrance (super_admin)
export { default as LegifranceAdmin } from './LegifranceAdmin';

// ============================================================================
// SOUS-COMPOSANTS LÉGIFRANCE
// ============================================================================

// Re-export des composants Légifrance
export { 
  LegifranceCodesList, 
  SyncModal, 
  SyncHistoryModal 
} from './legifrance';
