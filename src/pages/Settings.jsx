/**
 * Settings.jsx - Baikal Console
 * ============================================================================
 * Page des paramètres utilisateur.
 * ============================================================================
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  ArrowLeft,
  User,
  Building2,
  Globe,
  Moon,
  Sun,
  Bell,
  Lock,
  Sparkles,
  Shield,
  Mail
} from 'lucide-react';

export default function Settings() {
  const navigate = useNavigate();
  const { user, profile, organization, signOut, isOrgAdmin, isSuperAdmin } = useAuth();
  const [darkMode, setDarkMode] = useState(false);
  const [language, setLanguage] = useState('fr');
  const [notifications, setNotifications] = useState(true);

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="min-h-screen bg-baikal-bg">
      {/* Header */}
      <header className="bg-baikal-surface border-b border-baikal-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            <button
              onClick={() => navigate('/admin')}
              className="flex items-center gap-2 text-baikal-text hover:text-white transition-colors font-mono"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>RETOUR</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Titre */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-baikal-cyan rounded-md flex items-center justify-center">
              <User className="w-5 h-5 text-black" />
            </div>
            <div>
              <h1 className="text-2xl font-mono font-bold text-white">PARAMÈTRES</h1>
              <p className="text-baikal-text font-sans">Gérez votre profil et vos préférences</p>
            </div>
          </div>
        </div>

        {/* Sections */}
        <div className="space-y-6">
          {/* Profil */}
          <div className="bg-baikal-surface rounded-md border border-baikal-border overflow-hidden">
            <div className="px-6 py-4 border-b border-baikal-border">
              <h2 className="text-lg font-mono font-semibold text-white flex items-center gap-2">
                <User className="w-5 h-5 text-baikal-text" />
                PROFIL
              </h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-baikal-cyan rounded-full flex items-center justify-center">
                  <span className="text-2xl font-bold font-mono text-black">
                    {profile?.full_name?.charAt(0) || user?.email?.charAt(0) || '?'}
                  </span>
                </div>
                <div>
                  <p className="font-medium text-white font-sans">
                    {profile?.full_name || 'Utilisateur'}
                  </p>
                  <p className="text-sm text-baikal-text font-mono">{user?.email}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`
                      inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md border
                      ${isSuperAdmin 
                        ? 'bg-violet-900/20 text-violet-300 border-violet-500/50' 
                        : isOrgAdmin 
                          ? 'bg-baikal-cyan/20 text-baikal-cyan border-baikal-cyan/50' 
                          : 'bg-baikal-bg text-baikal-text border-baikal-border'
                      }
                    `}>
                      <Shield className="w-3 h-3" />
                      {isSuperAdmin ? 'SUPER_ADMIN' : isOrgAdmin ? 'ADMIN' : 'MEMBRE'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Organisation */}
          <div className="bg-baikal-surface rounded-md border border-baikal-border overflow-hidden">
            <div className="px-6 py-4 border-b border-baikal-border">
              <h2 className="text-lg font-mono font-semibold text-white flex items-center gap-2">
                <Building2 className="w-5 h-5 text-baikal-text" />
                ORGANISATION
              </h2>
            </div>
            <div className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-baikal-bg rounded-md flex items-center justify-center border border-baikal-border">
                  <Building2 className="w-6 h-6 text-baikal-text" />
                </div>
                <div>
                  <p className="font-medium text-white font-sans">
                    {organization?.name || 'Aucune organisation'}
                  </p>
                  <p className="text-sm text-baikal-text font-mono">
                    {organization?.slug || '-'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Préférences */}
          <div className="bg-baikal-surface rounded-md border border-baikal-border overflow-hidden">
            <div className="px-6 py-4 border-b border-baikal-border">
              <h2 className="text-lg font-mono font-semibold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-baikal-text" />
                PRÉFÉRENCES
              </h2>
            </div>
            <div className="p-6 space-y-4">
              {/* Langue */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Globe className="w-5 h-5 text-baikal-text" />
                  <div>
                    <p className="font-medium text-white font-sans">Langue</p>
                    <p className="text-sm text-baikal-text font-sans">Langue de l'interface</p>
                  </div>
                </div>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="px-3 py-2 bg-black border border-baikal-border rounded-md text-sm text-white focus:outline-none focus:ring-2 focus:ring-baikal-cyan"
                >
                  <option value="fr">Français</option>
                  <option value="en">English</option>
                </select>
              </div>

              {/* Notifications */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bell className="w-5 h-5 text-baikal-text" />
                  <div>
                    <p className="font-medium text-white font-sans">Notifications</p>
                    <p className="text-sm text-baikal-text font-sans">Recevoir des notifications</p>
                  </div>
                </div>
                <button
                  onClick={() => setNotifications(!notifications)}
                  className={`
                    relative w-12 h-6 rounded-full transition-colors
                    ${notifications ? 'bg-baikal-cyan' : 'bg-baikal-bg border border-baikal-border'}
                  `}
                >
                  <span className={`
                    absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform
                    ${notifications ? 'translate-x-6' : 'translate-x-0'}
                  `} />
                </button>
              </div>

              {/* Mode sombre (désactivé pour l'instant) */}
              <div className="flex items-center justify-between opacity-50">
                <div className="flex items-center gap-3">
                  {darkMode ? (
                    <Moon className="w-5 h-5 text-baikal-text" />
                  ) : (
                    <Sun className="w-5 h-5 text-baikal-text" />
                  )}
                  <div>
                    <p className="font-medium text-white font-sans">Mode sombre</p>
                    <p className="text-sm text-baikal-text font-sans">Bientôt disponible</p>
                  </div>
                </div>
                <button
                  disabled
                  className="relative w-12 h-6 rounded-full bg-baikal-bg border border-baikal-border cursor-not-allowed"
                >
                  <span className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full" />
                </button>
              </div>
            </div>
          </div>

          {/* Sécurité */}
          <div className="bg-baikal-surface rounded-md border border-baikal-border overflow-hidden">
            <div className="px-6 py-4 border-b border-baikal-border">
              <h2 className="text-lg font-mono font-semibold text-white flex items-center gap-2">
                <Lock className="w-5 h-5 text-baikal-text" />
                SÉCURITÉ
              </h2>
            </div>
            <div className="p-6 space-y-4">
              <button
                onClick={handleSignOut}
                className="w-full px-4 py-3 text-left text-red-400 hover:bg-red-900/20 border border-red-500/50 hover:border-red-500 rounded-md transition-colors flex items-center gap-3"
              >
                <Lock className="w-5 h-5" />
                <div>
                  <p className="font-medium font-mono">SE_DÉCONNECTER</p>
                  <p className="text-sm text-red-400 font-sans">Fermer votre session</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
