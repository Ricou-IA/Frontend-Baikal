/**
 * Users Feature - Baikal Console
 * ============================================================================
 * Export centralisé de la feature Users.
 * Préparation pour l'Option B (architecture par feature).
 *
 * @example
 * import { UserAvatar, APP_ROLES } from '@features/users';
 * ============================================================================
 */

// Configuration
export { APP_ROLES, getAppRoleConfig } from './config';

// Composants
export {
    UserAvatar,
    AppRoleBadge,
    UserRow,
    PendingUserRow,
    CreateUserModal,
    AssignOrgModal,
    EditRoleModal,
    RemoveUserModal,
} from './components';
