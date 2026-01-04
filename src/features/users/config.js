/**
 * Users Feature - Configuration
 * ============================================================================
 * Configuration partagée pour la feature Users.
 * ============================================================================
 */

export const APP_ROLES = [
    { value: 'user', label: 'User', level: 4, color: 'text-gray-400' },
    { value: 'team_leader', label: 'Team Leader', level: 3, color: 'text-blue-400' },
    { value: 'org_admin', label: 'Org Admin', level: 2, color: 'text-violet-400' },
    { value: 'super_admin', label: 'Super Admin', level: 1, color: 'text-amber-400' },
];

/**
 * Obtient la config d'un rôle app
 * @param {string} role - Valeur du rôle
 * @returns {Object} Configuration du rôle
 */
export function getAppRoleConfig(role) {
    return APP_ROLES.find(r => r.value === role) || APP_ROLES[0];
}
