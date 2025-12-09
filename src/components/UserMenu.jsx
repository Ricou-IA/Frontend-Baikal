import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Settings,
  Users,
  Sun,
  Moon,
  LogOut,
  Check,
  Globe,
  Shield,
  Building2
} from 'lucide-react'

export default function UserMenu({ user, profile, organization, onSignOut, isOrgAdmin = false }) {
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const [darkMode, setDarkMode] = useState(false)
  const [language, setLanguage] = useState('fr')
  const menuRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const getInitials = () => {
    if (profile?.full_name) {
      const names = profile.full_name.split(' ')
      if (names.length >= 2) {
        return (names[0][0] + names[names.length - 1][0]).toUpperCase()
      }
      return names[0][0].toUpperCase()
    }
    if (user?.email) {
      return user.email[0].toUpperCase()
    }
    return 'U'
  }

  const getAvatarColor = () => {
    const colors = [
      'bg-red-500',
      'bg-blue-500',
      'bg-green-500',
      'bg-purple-500',
      'bg-pink-500',
      'bg-indigo-500',
      'bg-yellow-500',
      'bg-teal-500'
    ]
    const hash = user?.id?.charCodeAt(0) || 0
    return colors[hash % colors.length]
  }

  const handleToggleDarkMode = () => {
    setDarkMode(!darkMode)
  }

  const handleLanguageChange = (lang) => {
    setLanguage(lang)
  }

  return (
    <div className="relative" ref={menuRef}>
      {/* Bouton avatar */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1 rounded-lg hover:bg-secondary-100 transition-colors"
      >
        <div className={`w-10 h-10 ${getAvatarColor()} rounded-full flex items-center justify-center text-white font-semibold text-sm`}>
          {profile?.avatar_url ? (
            <img 
              src={profile.avatar_url} 
              alt="Avatar" 
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            getInitials()
          )}
        </div>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-white rounded-lg shadow-lg border border-secondary-200 z-50">
          {/* Informations utilisateur */}
          <div className="p-4 border-b border-secondary-200">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 ${getAvatarColor()} rounded-full flex items-center justify-center text-white font-semibold`}>
                {profile?.avatar_url ? (
                  <img 
                    src={profile.avatar_url} 
                    alt="Avatar" 
                    className="w-12 h-12 rounded-full object-cover"
                  />
                ) : (
                  getInitials()
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-secondary-900 truncate">
                  {profile?.full_name || user?.email?.split('@')[0] || 'Utilisateur'}
                </p>
                <p className="text-sm text-secondary-500 truncate">
                  {user?.email}
                </p>
                {organization && (
                  <p className="text-xs text-indigo-600 truncate flex items-center gap-1 mt-0.5">
                    <Building2 className="w-3 h-3" />
                    {organization.name}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Options */}
          <div className="p-2">
            <button
              onClick={() => {
                setIsOpen(false)
                navigate('/settings')
              }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-secondary-700 hover:bg-secondary-50 rounded-lg transition-colors"
            >
              <Settings className="w-4 h-4" />
              <span>Paramètres</span>
            </button>

            {/* Lien Administration - visible uniquement pour les admins */}
            {isOrgAdmin && (
              <button
                onClick={() => {
                  setIsOpen(false)
                  navigate('/admin')
                }}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors"
              >
                <Shield className="w-4 h-4" />
                <span>Administration</span>
                <span className="ml-auto text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full">
                  Admin
                </span>
              </button>
            )}

            <button
              onClick={() => setIsOpen(false)}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-secondary-700 hover:bg-secondary-50 rounded-lg transition-colors"
            >
              <Users className="w-4 h-4" />
              <span>Passez sur Ordalie Pro</span>
            </button>

            <button
              onClick={handleToggleDarkMode}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-secondary-700 hover:bg-secondary-50 rounded-lg transition-colors"
            >
              {darkMode ? (
                <Moon className="w-4 h-4" />
              ) : (
                <Sun className="w-4 h-4" />
              )}
              <span>Mode sombre</span>
            </button>
          </div>

          {/* Sélection de langue */}
          <div className="p-2 border-t border-secondary-200">
            <div className="px-3 py-2 text-xs font-medium text-secondary-500 uppercase tracking-wide">
              Langue
            </div>
            <button
              onClick={() => handleLanguageChange('fr')}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors ${
                language === 'fr' 
                  ? 'bg-secondary-100 text-secondary-900' 
                  : 'text-secondary-700 hover:bg-secondary-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4" />
                <span>Français FR</span>
              </div>
              {language === 'fr' && (
                <Check className="w-4 h-4 text-primary-600" />
              )}
            </button>
            <button
              onClick={() => handleLanguageChange('en')}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors ${
                language === 'en' 
                  ? 'bg-secondary-100 text-secondary-900' 
                  : 'text-secondary-700 hover:bg-secondary-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4" />
                <span>English GB</span>
              </div>
              {language === 'en' && (
                <Check className="w-4 h-4 text-primary-600" />
              )}
            </button>
          </div>

          {/* Déconnexion */}
          <div className="p-2 border-t border-secondary-200">
            <button
              onClick={() => {
                setIsOpen(false)
                onSignOut()
              }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Déconnexion</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
