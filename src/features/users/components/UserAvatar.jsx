/**
 * UserAvatar - Baikal Console
 * ============================================================================
 * Avatar utilisateur avec initiales.
 * ============================================================================
 */

import React from 'react';

/**
 * Avatar utilisateur
 * @param {Object} props
 * @param {Object} props.user - Utilisateur (full_name, email)
 * @param {'sm'|'md'|'lg'} props.size - Taille de l'avatar
 */
export default function UserAvatar({ user, size = 'md' }) {
    const sizeClasses = {
        sm: 'w-8 h-8 text-xs',
        md: 'w-10 h-10 text-sm',
        lg: 'w-12 h-12 text-base',
    };

    const initials = user.full_name
        ? user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
        : user.email?.slice(0, 2).toUpperCase() || '??';

    return (
        <div className={`
            ${sizeClasses[size]}
            bg-baikal-cyan/20 text-baikal-cyan
            rounded-full flex items-center justify-center font-mono font-bold
        `}>
            {initials}
        </div>
    );
}
