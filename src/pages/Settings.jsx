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
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            <button
              onClick={() => navigate('/admin')}
              className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Retour</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Titre */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
              <User className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Paramètres</h1>
              <p className="text-slate-500">Gérez votre profil et vos préférences</p>
            </div>
          </div>
        </div>

        {/* Sections */}
        <div className="space-y-6">
          {/* Profil */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <User className="w-5 h-5 text-slate-400" />
                Profil
              </h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl font-bold text-indigo-600">
                    {profile?.full_name?.charAt(0) || user?.email?.charAt(0) || '?'}
                  </span>
                </div>
                <div>
                  <p className="font-medium text-slate-800">
                    {profile?.full_name || 'Utilisateur'}
                  </p>
                  <p className="text-sm text-slate-500">{user?.email}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`
                      inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full
                      ${isSuperAdmin 
                        ? 'bg-purple-100 text-purple-700' 
                        : isOrgAdmin 
                          ? 'bg-indigo-100 text-indigo-700' 
                          : 'bg-slate-100 text-slate-700'
                      }
                    `}>
                      <Shield className="w-3 h-3" />
                      {isSuperAdmin ? 'Super Admin' : isOrgAdmin ? 'Admin' : 'Membre'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Organisation */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-slate-400" />
                Organisation
              </h2>
            </div>
            <div className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-slate-400" />
                </div>
                <div>
                  <p className="font-medium text-slate-800">
                    {organization?.name || 'Aucune organisation'}
                  </p>
                  <p className="text-sm text-slate-500">
                    {organization?.slug || '-'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Préférences */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-slate-400" />
                Préférences
              </h2>
            </div>
            <div className="p-6 space-y-4">
              {/* Langue */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Globe className="w-5 h-5 text-slate-400" />
                  <div>
                    <p className="font-medium text-slate-800">Langue</p>
                    <p className="text-sm text-slate-500">Langue de l'interface</p>
                  </div>
                </div>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="fr">Français</option>
                  <option value="en">English</option>
                </select>
              </div>

              {/* Notifications */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bell className="w-5 h-5 text-slate-400" />
                  <div>
                    <p className="font-medium text-slate-800">Notifications</p>
                    <p className="text-sm text-slate-500">Recevoir des notifications</p>
                  </div>
                </div>
                <button
                  onClick={() => setNotifications(!notifications)}
                  className={`
                    relative w-12 h-6 rounded-full transition-colors
                    ${notifications ? 'bg-indigo-600' : 'bg-slate-200'}
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
                    <Moon className="w-5 h-5 text-slate-400" />
                  ) : (
                    <Sun className="w-5 h-5 text-slate-400" />
                  )}
                  <div>
                    <p className="font-medium text-slate-800">Mode sombre</p>
                    <p className="text-sm text-slate-500">Bientôt disponible</p>
                  </div>
                </div>
                <button
                  disabled
                  className="relative w-12 h-6 rounded-full bg-slate-200 cursor-not-allowed"
                >
                  <span className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full" />
                </button>
              </div>
            </div>
          </div>

          {/* Sécurité */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <Lock className="w-5 h-5 text-slate-400" />
                Sécurité
              </h2>
            </div>
            <div className="p-6 space-y-4">
              <button
                onClick={handleSignOut}
                className="w-full px-4 py-3 text-left text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-3"
              >
                <Lock className="w-5 h-5" />
                <div>
                  <p className="font-medium">Se déconnecter</p>
                  <p className="text-sm text-red-400">Fermer votre session</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
