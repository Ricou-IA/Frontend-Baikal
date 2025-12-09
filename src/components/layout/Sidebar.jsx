/**
 * Sidebar - Composant de navigation latérale
 * ============================================================================
 * Sidebar avec navigation par onglets, sélecteur de verticale et profil user.
 * 
 * @example
 * <Sidebar
 *   isOpen={sidebarOpen}
 *   onClose={() => setSidebarOpen(false)}
 *   activeTab={activeTab}
 *   onTabChange={setActiveTab}
 *   tabs={tabs}
 *   verticalInfo={verticalInfo}
 *   user={user}
 *   profile={profile}
 *   onLogout={handleLogout}
 * />
 * ============================================================================
 */

import React from 'react';
import { LogOut, X as XIcon } from 'lucide-react';
import VerticalSelector from '../VerticalSelector';

/**
 * @typedef {Object} Tab
 * @property {string} id - ID unique de l'onglet
 * @property {string} label - Label affiché
 * @property {React.ComponentType} icon - Composant icône Lucide
 * @property {string} [activeColor] - Couleur quand actif (défaut: indigo)
 */

/**
 * @typedef {Object} SidebarProps
 * @property {boolean} isOpen - Sidebar ouverte ou fermée
 * @property {Function} onClose - Callback pour fermer la sidebar
 * @property {string} activeTab - ID de l'onglet actif
 * @property {Function} onTabChange - Callback pour changer d'onglet
 * @property {Tab[]} tabs - Liste des onglets
 * @property {Object} verticalInfo - Infos de la verticale courante
 * @property {string} currentVertical - ID de la verticale courante
 * @property {Function} onVerticalChange - Callback pour changer de verticale
 * @property {Object} supabaseClient - Client Supabase pour VerticalSelector
 * @property {Object} user - Utilisateur connecté
 * @property {Object} profile - Profil utilisateur
 * @property {Function} onLogout - Callback pour déconnexion
 */

export default function Sidebar({
  isOpen,
  onClose,
  activeTab,
  onTabChange,
  tabs = [],
  verticalInfo,
  currentVertical,
  onVerticalChange,
  supabaseClient,
  user,
  profile,
  onLogout,
}) {
  const primaryColor = verticalInfo?.color || '#6366f1';

  return (
    <aside
      className={`
        ${isOpen ? 'w-72' : 'w-0'}
        bg-baikal-surface border-r border-baikal-border
        flex flex-col
        transition-all duration-300 overflow-hidden
        flex-shrink-0
      `}
    >
      {/* Header Sidebar */}
      <div className="p-4 border-b border-baikal-border">
        <div className="flex items-center justify-between mb-4">
          <h1
            className="text-lg font-mono font-bold text-white"
          >
            {verticalInfo?.name || 'BAÏKAL'}
          </h1>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-baikal-bg rounded-md lg:hidden"
            aria-label="Fermer le menu"
          >
            <XIcon className="w-5 h-5 text-baikal-text" />
          </button>
        </div>

        {/* Sélecteur de verticale */}
        {supabaseClient && (
          <VerticalSelector
            currentVertical={currentVertical}
            onVerticalChange={onVerticalChange}
            supabaseClient={supabaseClient}
            showLabel={true}
          />
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 overflow-y-auto">
        <div className="space-y-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`
                  w-full flex items-center gap-3 px-4 py-3 rounded-md 
                  transition-colors duration-200 border
                  ${isActive
                    ? 'bg-transparent text-baikal-cyan border-baikal-cyan'
                    : 'text-baikal-text hover:bg-baikal-bg border-transparent'
                  }
                `}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium font-sans">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Footer - Profil utilisateur */}
      <div className="p-4 border-t border-baikal-border">
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-black font-semibold font-mono bg-baikal-cyan"
          >
            {user?.email?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate font-sans">
              {profile?.full_name || user?.email}
            </p>
            <p className="text-xs text-baikal-text truncate font-mono">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="w-full px-4 py-2 text-sm text-baikal-text hover:text-red-400 hover:bg-red-900/20 border border-baikal-border hover:border-red-500/50 rounded-md transition-colors flex items-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          <span className="font-sans">Se déconnecter</span>
        </button>
      </div>
    </aside>
  );
}
