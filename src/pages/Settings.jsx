import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
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
  Shield
} from 'lucide-react'

export default function Settings() {
  const navigate = useNavigate()
  const { user, profile, organization, signOut, isOrgAdmin, isSuperAdmin } = useAuth()
  const [darkMode, setDarkMode] = useState(false)
  const [language, setLanguage] = useState('fr')
  const [notifications, setNotifications] = useState(true)

  const handleSignOut = async () => {
    await signOut()
  }

  return (
    <div className="min-h-screen bg-secondary-50">
      {/* Header */}
      <header className="bg-white border-b border-secondary-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-2 text-secondary-600 hover:text-secondary-900 transition-colors"
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
            <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-secondary-900">Paramètres</h1>
          </div>
          <p className="text-secondary-600">Gérez les paramètres de votre compte et de votre organisation</p>
        </div>

        {/* Sections */}
        <div className="space-y-6">
          {/* Informations personnelles */}
          <div className="bg-white rounded-xl shadow-sm border border-secondary-200 p-6">
            <h2 className="text-lg font-semibold text-secondary-900 mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-secondary-500" />
              Informations personnelles
            </h2>
            <dl className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-secondary-100">
                <dt className="text-secondary-500">Nom complet</dt>
                <dd className="text-secondary-900 font-medium">
                  {profile?.full_name || '-'}
                </dd>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-secondary-100">
                <dt className="text-secondary-500">Email</dt>
                <dd className="text-secondary-900">{user?.email}</dd>
              </div>
              <div className="flex justify-between items-center py-2">
                <dt className="text-secondary-500">Rôle</dt>
                <dd className="text-secondary-900 capitalize">
                  {profile?.business_role || '-'}
                </dd>
              </div>
            </dl>
            <button className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">
              Modifier le profil
            </button>
          </div>

          {/* Organisation */}
          <div className="bg-white rounded-xl shadow-sm border border-secondary-200 p-6">
            <h2 className="text-lg font-semibold text-secondary-900 mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-secondary-500" />
              Organisation
            </h2>
            <dl className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-secondary-100">
                <dt className="text-secondary-500">Nom</dt>
                <dd className="text-secondary-900 font-medium">
                  {organization?.name || '-'}
                </dd>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-secondary-100">
                <dt className="text-secondary-500">Plan</dt>
                <dd className="text-secondary-900 capitalize">
                  {organization?.plan || 'free'}
                </dd>
              </div>
              <div className="flex justify-between items-center py-2">
                <dt className="text-secondary-500">Crédits disponibles</dt>
                <dd className="text-secondary-900 font-semibold">
                  {organization?.credits_balance ?? 0}
                </dd>
              </div>
            </dl>
            {(isOrgAdmin || isSuperAdmin) ? (
              <button 
                onClick={() => navigate('/admin')}
                className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-2"
              >
                <Shield className="w-4 h-4" />
                Gérer l'organisation
              </button>
            ) : (
              <button className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">
                Gérer l'organisation
              </button>
            )}
          </div>

          {/* Sécurité */}
          <div className="bg-white rounded-xl shadow-sm border border-secondary-200 p-6">
            <h2 className="text-lg font-semibold text-secondary-900 mb-4 flex items-center gap-2">
              <Lock className="w-5 h-5 text-secondary-500" />
              Sécurité
            </h2>
            <div className="space-y-4">
              <button className="w-full flex items-center justify-between p-4 border border-secondary-200 rounded-lg hover:bg-secondary-50 transition-colors">
                <div className="flex items-center gap-3">
                  <Lock className="w-5 h-5 text-secondary-500" />
                  <div className="text-left">
                    <p className="font-medium text-secondary-900">Changer le mot de passe</p>
                    <p className="text-sm text-secondary-500">Mettez à jour votre mot de passe régulièrement</p>
                  </div>
                </div>
                <span className="text-secondary-400">→</span>
              </button>
            </div>
          </div>

          {/* Préférences */}
          <div className="bg-white rounded-xl shadow-sm border border-secondary-200 p-6">
            <h2 className="text-lg font-semibold text-secondary-900 mb-4 flex items-center gap-2">
              <Bell className="w-5 h-5 text-secondary-500" />
              Préférences
            </h2>
            <div className="space-y-4">
              {/* Mode sombre */}
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  {darkMode ? (
                    <Moon className="w-5 h-5 text-secondary-500" />
                  ) : (
                    <Sun className="w-5 h-5 text-secondary-500" />
                  )}
                  <div>
                    <p className="font-medium text-secondary-900">Mode sombre</p>
                    <p className="text-sm text-secondary-500">Activer le thème sombre</p>
                  </div>
                </div>
                <button
                  onClick={() => setDarkMode(!darkMode)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    darkMode ? 'bg-primary-600' : 'bg-secondary-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      darkMode ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Notifications */}
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  <Bell className="w-5 h-5 text-secondary-500" />
                  <div>
                    <p className="font-medium text-secondary-900">Notifications</p>
                    <p className="text-sm text-secondary-500">Recevoir des notifications par email</p>
                  </div>
                </div>
                <button
                  onClick={() => setNotifications(!notifications)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    notifications ? 'bg-primary-600' : 'bg-secondary-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      notifications ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Langue */}
              <div className="py-2">
                <div className="flex items-center gap-3 mb-3">
                  <Globe className="w-5 h-5 text-secondary-500" />
                  <div>
                    <p className="font-medium text-secondary-900">Langue</p>
                    <p className="text-sm text-secondary-500">Sélectionnez votre langue préférée</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setLanguage('fr')}
                    className={`px-4 py-2 rounded-lg transition-colors ${
                      language === 'fr'
                        ? 'bg-primary-600 text-white'
                        : 'bg-secondary-100 text-secondary-700 hover:bg-secondary-200'
                    }`}
                  >
                    Français FR
                  </button>
                  <button
                    onClick={() => setLanguage('en')}
                    className={`px-4 py-2 rounded-lg transition-colors ${
                      language === 'en'
                        ? 'bg-primary-600 text-white'
                        : 'bg-secondary-100 text-secondary-700 hover:bg-secondary-200'
                    }`}
                  >
                    English GB
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Zone de danger */}
          <div className="bg-red-50 rounded-xl shadow-sm border border-red-200 p-6">
            <h2 className="text-lg font-semibold text-red-900 mb-4">Zone de danger</h2>
            <p className="text-red-700 mb-4">
              Les actions ci-dessous sont irréversibles. Veuillez agir avec prudence.
            </p>
            <button
              onClick={handleSignOut}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Se déconnecter
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}

