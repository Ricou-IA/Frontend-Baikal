/**
 * AppRoleBadge - Baikal Console
 * ============================================================================
 * Badge affichant le rôle application d'un utilisateur.
 * ============================================================================
 */

import React from 'react';
import { getAppRoleConfig } from '../config';

/**
 * Badge de rôle app
 * @param {Object} props
 * @param {string} props.role - Valeur du rôle (user, team_leader, org_admin, super_admin)
 */
export default function AppRoleBadge({ role }) {
    const config = getAppRoleConfig(role);
    return (
        <span className={`text-xs font-mono uppercase ${config.color}`}>
            {config.label}
        </span>
    );
}
