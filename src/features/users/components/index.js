/**
 * Users Feature - Components
 * ============================================================================
 * Export centralisé des composants de la feature Users.
 *
 * @example
 * import {
 *   UserAvatar,
 *   UserRow,
 *   CreateUserModal,
 * } from '@features/users/components';
 * ============================================================================
 */

// Composants de base
export { default as UserAvatar } from './UserAvatar';
export { default as AppRoleBadge } from './AppRoleBadge';

// Composants de tableau
export { default as UserRow } from './UserRow';
export { default as PendingUserRow } from './PendingUserRow';

// Modales
export { default as CreateUserModal } from './CreateUserModal';
export { default as AssignOrgModal } from './AssignOrgModal';
export { default as EditRoleModal } from './EditRoleModal';
export { default as RemoveUserModal } from './RemoveUserModal';
