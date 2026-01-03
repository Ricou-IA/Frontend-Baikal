/**
 * Page ResetPassword - Core RAG Engine
 * ============================================================================
 * Page de réinitialisation de mot de passe après clic sur le lien email
 * ============================================================================
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { 
  Lock, 
  Eye, 
  EyeOff, 
  Loader2,
  AlertCircle,
  CheckCircle2,
  Sparkles
} from 'lucide-react'

export default function ResetPassword() {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [formError, setFormError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isValidToken, setIsValidToken] = useState(false)
  const [isCheckingToken, setIsCheckingToken] = useState(true)
  const navigate = useNavigate()

  const { updatePassword, loading, error, clearError } = useAuth()

  useEffect(() => {
    let isMounted = true
    let timeoutId = null

    const checkToken = async () => {
      setIsCheckingToken(true)

      try {
        const hash = window.location.hash
        const hashParams = new URLSearchParams(hash.substring(1))
        const type = hashParams.get('type')
        const accessToken = hashParams.get('access_token')

        if (type === 'recovery' && accessToken) {
          // Utiliser une promesse avec timeout au lieu de setTimeout avec async
          await new Promise((resolve) => {
            timeoutId = setTimeout(resolve, 500)
          })

          if (!isMounted) return

          const { data: { session: currentSession } } = await supabase.auth.getSession()

          if (!isMounted) return

          if (currentSession) {
            setIsValidToken(true)
            window.history.replaceState(null, '', window.location.pathname)
          } else {
            setFormError('Lien de réinitialisation invalide ou expiré.')
          }
          setIsCheckingToken(false)
        } else {
          const { data: { session: currentSession } } = await supabase.auth.getSession()

          if (!isMounted) return

          if (currentSession) {
            setIsValidToken(true)
          } else {
            setFormError('Lien de réinitialisation invalide ou expiré.')
          }
          setIsCheckingToken(false)
        }
      } catch (err) {
        if (isMounted) {
          setFormError('Lien de réinitialisation invalide ou expiré.')
          setIsCheckingToken(false)
        }
      }
    }

    checkToken()

    return () => {
      isMounted = false
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (isSubmitting) {
      return
    }
    
    setIsSubmitting(true)
    setFormError('')
    setSuccessMessage('')
    clearError()

    if (!newPassword || !confirmPassword) {
      setFormError('Veuillez remplir tous les champs.')
      setIsSubmitting(false)
      return
    }

    if (newPassword.length < 6) {
      setFormError('Le mot de passe doit contenir au moins 6 caractères.')
      setIsSubmitting(false)
      return
    }

    if (newPassword !== confirmPassword) {
      setFormError('Les mots de passe ne correspondent pas.')
      setIsSubmitting(false)
      return
    }

    try {
      const { error } = await updatePassword(newPassword)
      
      if (error) {
        setFormError(error.message || 'Une erreur est survenue lors de la mise à jour du mot de passe.')
      } else {
        setSuccessMessage('Votre mot de passe a été mis à jour avec succès !')
        // Rediriger vers le login après 2 secondes
        setTimeout(() => {
          navigate('/login')
        }, 2000)
      }
    } catch (err) {
      setFormError(err?.message || 'Une erreur inattendue s\'est produite.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-pattern">
      {/* Panneau gauche - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary-600 to-primary-800 p-12 flex-col justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold text-white">Core RAG</span>
          </div>
        </div>
        
        <div className="space-y-6">
          <h1 className="text-4xl font-bold text-white leading-tight">
            Réinitialisation
            <br />
            de mot de passe
          </h1>
          <p className="text-primary-100 text-lg max-w-md">
            Définissez un nouveau mot de passe sécurisé pour accéder à votre compte.
          </p>
        </div>

        <div className="text-primary-200 text-sm">
          © 2025 Core RAG Engine. Tous droits réservés.
        </div>
      </div>

      {/* Panneau droit - Formulaire */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Header mobile */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold text-secondary-900">Core RAG</span>
          </div>

          {/* Titre */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-secondary-900">
              Nouveau mot de passe
            </h2>
            <p className="text-secondary-600 mt-2">
              Saisissez votre nouveau mot de passe ci-dessous.
            </p>
          </div>

          {/* Message de succès */}
          {successMessage && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <p className="text-green-800 text-sm">{successMessage}</p>
            </div>
          )}

          {/* Message d'erreur */}
          {(formError || error) && (
            <div className="mb-6 p-4 bg-red-50 border-2 border-red-300 rounded-lg flex items-start gap-3 shadow-md" role="alert">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-red-900 text-sm font-semibold mb-1">Erreur</p>
                <p className="text-red-800 text-sm">{formError || error}</p>
              </div>
            </div>
          )}

          {/* Chargement de la vérification du token */}
          {isCheckingToken && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
              <p className="text-blue-800 text-sm">Vérification du lien de réinitialisation...</p>
            </div>
          )}

          {/* Formulaire */}
          {!isCheckingToken && isValidToken && (
            <form onSubmit={handleSubmit} className="space-y-4">
            {/* Nouveau mot de passe */}
            <div>
              <label htmlFor="newPassword" className="label">
                Nouveau mot de passe
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
                <input
                  id="newPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="input pl-10 pr-10"
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary-400 hover:text-secondary-600"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Confirmation du mot de passe */}
            <div>
              <label htmlFor="confirmPassword" className="label">
                Confirmer le mot de passe
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input pl-10 pr-10"
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary-400 hover:text-secondary-600"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Bouton submit */}
            <button
              type="submit"
              disabled={loading || isSubmitting}
              className="btn-primary w-full py-3"
            >
              {loading || isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Mise à jour...
                </>
              ) : (
                'Mettre à jour le mot de passe'
              )}
            </button>
          </form>
          )}

          {/* Lien retour */}
          {!isCheckingToken && (
            <p className="mt-6 text-center text-secondary-600">
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                Retour à la connexion
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

