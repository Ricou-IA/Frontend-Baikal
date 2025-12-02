/**
 * Page Login - Core RAG Engine
 * ============================================================================
 * Page d'authentification avec:
 * - Formulaire Email/Password
 * - Option Google SSO
 * - Toggle Connexion/Inscription
 * ============================================================================
 */

import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { 
  Mail, 
  Lock, 
  User, 
  Eye, 
  EyeOff, 
  Loader2,
  AlertCircle,
  Sparkles
} from 'lucide-react'

export default function Login() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [isResetPassword, setIsResetPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [resetEmail, setResetEmail] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRedirecting, setIsRedirecting] = useState(false)
  const wasAuthenticatedRef = useRef(false)

  const { signIn, signUp, signInWithGoogle, resetPassword, loading, error, clearError, isAuthenticated, hasProfile, isOnboarded } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (isAuthenticated && !wasAuthenticatedRef.current) {
      setIsRedirecting(true)
      // Redirection explicite après un court délai pour laisser le profil se charger
      setTimeout(() => {
        if (hasProfile) {
          if (!isOnboarded) {
            navigate('/onboarding', { replace: true })
          } else {
            navigate('/dashboard', { replace: true })
          }
        }
      }, 500)
    }
    wasAuthenticatedRef.current = isAuthenticated
  }, [isAuthenticated, hasProfile, isOnboarded, navigate])
  
  useEffect(() => {
    if (!isAuthenticated && isRedirecting) {
      setIsRedirecting(false)
    }
  }, [isAuthenticated, isRedirecting])

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (isSubmitting) {
      return
    }
    
    setIsSubmitting(true)
    setFormError('')
    setSuccessMessage('')

    if (!email || !password) {
      setFormError('Veuillez remplir tous les champs obligatoires.')
      setIsSubmitting(false)
      return
    }

    if (password.length < 6) {
      setFormError('Le mot de passe doit contenir au moins 6 caractères.')
      setIsSubmitting(false)
      return
    }

    try {
      if (isSignUp) {
        const result = await signUp(email, password, { full_name: fullName })
        const { data, error } = result || {}
        
        if (error) {
          const errorMessage = error?.message || error?.toString() || 'Une erreur est survenue lors de l\'inscription.'
          setFormError(errorMessage)
        } else {
          setSuccessMessage('Compte créé avec succès ! Vérifiez votre email pour confirmer votre inscription.')
        }
      } else {
        const { error } = await signIn(email, password)
        if (error) {
          setFormError(translateError(error.message))
          setIsSubmitting(false)
        } else {
          setIsRedirecting(true)
        }
      }
    } catch (err) {
      setFormError(err?.message || 'Une erreur inattendue s\'est produite.')
      setIsSubmitting(false)
      setIsRedirecting(false)
    } finally {
      if (!isRedirecting) {
        setIsSubmitting(false)
      }
    }
  }

  /**
   * Connexion avec Google
   */
  const handleGoogleSignIn = async () => {
    setFormError('')
    const { error } = await signInWithGoogle()
    if (error) {
      setFormError(error.message)
    }
  }

  const handleResetPassword = async (e) => {
    e.preventDefault()
    
    if (isSubmitting) {
      return
    }
    
    setIsSubmitting(true)
    setFormError('')
    setSuccessMessage('')

    if (!resetEmail) {
      setFormError('Veuillez saisir votre adresse email.')
      setIsSubmitting(false)
      return
    }

    try {
      const { error } = await resetPassword(resetEmail)
      if (error) {
        setFormError(error.message || 'Une erreur est survenue lors de l\'envoi de l\'email.')
      } else {
        setSuccessMessage('Un email de réinitialisation a été envoyé. Vérifiez votre boîte de réception.')
        setResetEmail('')
      }
    } catch (err) {
      setFormError(err?.message || 'Une erreur inattendue s\'est produite.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const translateError = (message) => {
    const errors = {
      'Invalid login credentials': 'Email ou mot de passe incorrect.',
      'Email not confirmed': 'Veuillez confirmer votre email avant de vous connecter.',
      'User already registered': 'Un compte existe déjà avec cet email.',
    }
    return errors[message] || message
  }

  if (isRedirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary-50">
        <div className="text-center">
          <Loader2 className="w-16 h-16 animate-spin text-primary-600 mx-auto mb-4" />
          <p className="text-secondary-900 text-lg font-semibold">Connexion réussie !</p>
          <p className="text-secondary-600 text-sm mt-2">Redirection en cours...</p>
        </div>
      </div>
    )
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
            Moteur d'IA Contextuelle
            <br />
            Multi-Verticales
          </h1>
          <p className="text-primary-100 text-lg max-w-md">
            Propulsez votre expertise avec une intelligence artificielle qui comprend 
            votre métier et vos documents.
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
              {isResetPassword 
                ? 'Réinitialiser le mot de passe' 
                : isSignUp 
                  ? 'Créer un compte' 
                  : 'Bienvenue'}
            </h2>
            <p className="text-secondary-600 mt-2">
              {isResetPassword
                ? 'Saisissez votre adresse email et nous vous enverrons un lien pour réinitialiser votre mot de passe.'
                : isSignUp 
                  ? 'Commencez votre essai gratuit dès aujourd\'hui.' 
                  : 'Connectez-vous pour accéder à votre espace.'}
            </p>
          </div>

          {/* Message de succès */}
          {successMessage && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <p className="text-green-800 text-sm">{successMessage}</p>
            </div>
          )}

          {/* Message d'erreur */}
          {(formError || error) && !isRedirecting && (
            <div className="mb-6 p-4 bg-red-50 border-2 border-red-300 rounded-lg flex items-start gap-3 shadow-md" role="alert">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-red-900 text-sm font-semibold mb-1">Erreur</p>
                <p className="text-red-800 text-sm">{formError || error}</p>
              </div>
            </div>
          )}

          {/* Écran de chargement plein écran pendant la redirection */}
          {isRedirecting && (
            <div className="fixed inset-0 bg-white z-50 flex items-center justify-center">
              <div className="text-center">
                <Loader2 className="w-16 h-16 animate-spin text-primary-600 mx-auto mb-4" />
                <p className="text-secondary-900 text-lg font-semibold">Connexion réussie !</p>
                <p className="text-secondary-600 text-sm mt-2">Redirection en cours...</p>
              </div>
            </div>
          )}

          {/* Bouton Google (masqué en mode réinitialisation ou redirection) */}
          {!isResetPassword && !isRedirecting && (
            <>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-secondary-300 rounded-lg text-secondary-700 font-medium hover:bg-secondary-50 transition-colors disabled:opacity-50"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continuer avec Google
              </button>

              {/* Séparateur */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-secondary-200"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-secondary-50 text-secondary-500">ou</span>
                </div>
              </div>
            </>
          )}

          {/* Formulaire de réinitialisation de mot de passe */}
          {!isRedirecting && isResetPassword ? (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label htmlFor="resetEmail" className="label">
                  Adresse email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
                  <input
                    id="resetEmail"
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="input pl-10"
                    placeholder="vous@exemple.com"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || isSubmitting}
                className="btn-primary w-full py-3"
              >
                {loading || isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Envoi en cours...
                  </>
                ) : (
                  'Envoyer l\'email de réinitialisation'
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsResetPassword(false)
                  setResetEmail('')
                  setFormError('')
                  setSuccessMessage('')
                  clearError()
                }}
                className="w-full text-center text-sm text-secondary-600 hover:text-secondary-700 font-medium"
              >
                Retour à la connexion
              </button>
            </form>
          ) : !isRedirecting ? (
            /* Formulaire de connexion/inscription */
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Nom complet (inscription uniquement) */}
              {isSignUp && (
                <div>
                  <label htmlFor="fullName" className="label">
                    Nom complet
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
                    <input
                      id="fullName"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="input pl-10"
                      placeholder="Jean Dupont"
                    />
                  </div>
                </div>
              )}

              {/* Email */}
              <div>
                <label htmlFor="email" className="label">
                  Adresse email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input pl-10"
                    placeholder="vous@exemple.com"
                    required
                  />
                </div>
              </div>

              {/* Mot de passe */}
              <div>
                <label htmlFor="password" className="label">
                  Mot de passe
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
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
                {/* Lien mot de passe oublié (connexion uniquement) */}
                {!isSignUp && (
                  <div className="mt-2 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setIsResetPassword(true)
                        setFormError('')
                        setSuccessMessage('')
                        clearError()
                      }}
                      className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                    >
                      Mot de passe oublié ?
                    </button>
                  </div>
                )}
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
                    Chargement...
                  </>
                ) : isSignUp ? (
                  'Créer mon compte'
                ) : (
                  'Se connecter'
                )}
              </button>
            </form>
          ) : null}

          {/* Toggle Connexion/Inscription (masqué en mode réinitialisation ou redirection) */}
          {!isResetPassword && !isRedirecting && (
            <p className="mt-6 text-center text-secondary-600">
              {isSignUp ? 'Déjà un compte ?' : 'Pas encore de compte ?'}{' '}
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp)
                  setFormError('')
                  setSuccessMessage('')
                  setEmail('')
                  setPassword('')
                  setFullName('')
                  setShowPassword(false)
                  if (clearError) {
                    clearError()
                  }
                }}
                className="link"
              >
                {isSignUp ? 'Se connecter' : 'S\'inscrire'}
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
