/**
 * MobileHeader - Header mobile quand la sidebar est fermée
 * ============================================================================
 * Affiche un bouton menu et le nom de la verticale sur mobile.
 * 
 * @example
 * <MobileHeader
 *   show={!sidebarOpen}
 *   onMenuClick={() => setSidebarOpen(true)}
 *   verticalInfo={verticalInfo}
 * />
 * ============================================================================
 */

import React from 'react';
import { Menu } from 'lucide-react';

/**
 * @typedef {Object} MobileHeaderProps
 * @property {boolean} show - Afficher le header
 * @property {Function} onMenuClick - Callback pour ouvrir le menu
 * @property {Object} verticalInfo - Infos de la verticale
 */

export default function MobileHeader({
  show,
  onMenuClick,
  verticalInfo,
}) {
  if (!show) return null;

  const primaryColor = verticalInfo?.color || '#6366f1';

  return (
    <div className="p-4 border-b border-baikal-border bg-baikal-surface flex items-center gap-4 lg:hidden">
      <button
        onClick={onMenuClick}
        className="p-2 hover:bg-baikal-bg rounded-md"
        aria-label="Ouvrir le menu"
      >
        <Menu className="w-5 h-5 text-baikal-text" />
      </button>
      <span className="font-bold font-mono text-white">
        {verticalInfo?.name || 'BAÏKAL'}
      </span>
    </div>
  );
}
