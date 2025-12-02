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
        bg-white border-r border-slate-200
        flex flex-col
        transition-all duration-300 overflow-hidden
        flex-shrink-0
      `}
    >
      {/* Header Sidebar */}
      <div className="p-4 border-b border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <h1
            className="text-lg font-bold"
            style={{ color: primaryColor }}
          >
            {verticalInfo?.name || 'Core RAG'}
          </h1>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-lg lg:hidden"
            aria-label="Fermer le menu"
          >
            <XIcon className="w-5 h-5 text-slate-500" />
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
            const activeColor = tab.activeColor || 'indigo';

            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`
                  w-full flex items-center gap-3 px-4 py-3 rounded-xl 
                  transition-colors duration-200
                  ${isActive
                    ? `bg-${activeColor}-50 text-${activeColor}-700`
                    : 'text-slate-600 hover:bg-slate-50'
                  }
                `}
                style={isActive ? {
                  backgroundColor: `${tab.activeColorHex || primaryColor}15`,
                  color: tab.activeColorHex || primaryColor,
                } : undefined}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Footer - Profil utilisateur */}
      <div className="p-4 border-t border-slate-100">
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold"
            style={{ backgroundColor: primaryColor }}
          >
            {user?.email?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate">
              {profile?.full_name || user?.email}
            </p>
            <p className="text-xs text-slate-500 truncate">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="w-full px-4 py-2 text-sm text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          Se déconnecter
        </button>
      </div>
    </aside>
  );
}
