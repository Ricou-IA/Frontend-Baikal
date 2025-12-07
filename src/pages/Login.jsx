/**
 * Login.jsx - Baikal Console
 * ============================================================================
 * Page d'authentification avec:
 * - Formulaire Email/Password
 * - Option Google SSO
 * - Toggle Connexion/Inscription
 * - Réinitialisation mot de passe
 * ============================================================================
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  Mail, 
  Lock, 
  User, 
  Eye, 
  EyeOff, 
  Loader2,
  AlertCircle,
  Layers
} from 'lucide-react';

/**
 * Traduit les messages d'erreur Supabase
 */
function translateError(message) {
  const translations = {
    'Invalid login credentials': 'Email ou mot de passe incorrect.',
    'Email not confirmed': 'Veuillez confirmer votre email avant de vous connecter.',
    'User already registered': 'Un compte existe déjà avec cet email.',
    'Password should be at least 6 characters': 'Le mot de passe doit contenir au moins 6 caractères.',
    'Unable to validate email address: invalid format': 'Format d\'email invalide.',
  };
  return translations[message] || message;
}

export default function Login() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [isResetPassword, setIsResetPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const wasAuthenticatedRef = useRef(false);

  const { signIn, signUp, signInWithGoogle, resetPassword, loading, error, clearError, isAuthenticated, hasProfile, isOnboarded } = useAuth();
  const navigate = useNavigate();

  // Redirection après authentification
  useEffect(() => {
    if (isAuthenticated && !wasAuthenticatedRef.current) {
      setIsRedirecting(true);
      setTimeout(() => {
        if (hasProfile) {
          if (!isOnboarded) {
            navigate('/onboarding', { replace: true });
          } else {
            navigate('/admin', { replace: true }); // ← Changé de /dashboard vers /admin
          }
        }
      }, 500);
    }
    wasAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated, hasProfile, isOnboarded, navigate]);
  
  useEffect(() => {
    if (!isAuthenticated && isRedirecting) {
      setIsRedirecting(false);
    }
  }, [isAuthenticated, isRedirecting]);

  /**
   * Soumission du formulaire
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (isSubmitting) return;
    
    setIsSubmitting(true);
    setFormError('');
    setSuccessMessage('');

    if (!email || !password) {
      setFormError('Veuillez remplir tous les champs obligatoires.');
      setIsSubmitting(false);
      return;
    }

    if (password.length < 6) {
      setFormError('Le mot de passe doit contenir au moins 6 caractères.');
      setIsSubmitting(false);
      return;
    }

    try {
      if (isSignUp) {
        const result = await signUp(email, password, { full_name: fullName });
        const { data, error } = result || {};
        
        if (error) {
          const errorMessage = error?.message || error?.toString() || 'Une erreur est survenue lors de l\'inscription.';
          setFormError(errorMessage);
        } else {
          setSuccessMessage('Compte créé avec succès ! Vérifiez votre email pour confirmer votre inscription.');
        }
      } else {
        const { error } = await signIn(email, password);
        if (error) {
          setFormError(translateError(error.message));
          setIsSubmitting(false);
        } else {
          setIsRedirecting(true);
        }
      }
    } catch (err) {
      setFormError(err?.message || 'Une erreur inattendue s\'est produite.');
      setIsSubmitting(false);
      setIsRedirecting(false);
    } finally {
      if (!isRedirecting) {
        setIsSubmitting(false);
      }
    }
  };

  /**
   * Connexion avec Google
   */
  const handleGoogleSignIn = async () => {
    setFormError('');
    const { error } = await signInWithGoogle();
    if (error) {
      setFormError(error.message);
    }
  };

  /**
   * Réinitialisation du mot de passe
   */
  const handleResetPassword = async (e) => {
    e.preventDefault();
    
    if (isSubmitting) return;
    
    setIsSubmitting(true);
    setFormError('');
    setSuccessMessage('');

    if (!resetEmail) {
      setFormError('Veuillez saisir votre adresse email.');
      setIsSubmitting(false);
      return;
    }

    try {
      const { error } = await resetPassword(resetEmail);
      if (error) {
        setFormError(error.message || 'Une erreur est survenue lors de l\'envoi de l\'email.');
      } else {
        setSuccessMessage('Un email de réinitialisation a été envoyé. Vérifiez votre boîte de réception.');
      }
    } catch (err) {
      setFormError('Une erreur inattendue s\'est produite.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading state
  if (loading || isRedirecting) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-indigo-600 mx-auto" />
          <p className="mt-4 text-slate-600">
            {isRedirecting ? 'Connexion réussie, redirection...' : 'Chargement...'}
          </p>
        </div>
      </div>
    );
  }

  // Formulaire de réinitialisation
  if (isResetPassword) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Lock className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900">Mot de passe oublié</h1>
              <p className="text-slate-500 mt-2">
                Entrez votre email pour recevoir un lien de réinitialisation.
              </p>
            </div>

            {/* Messages */}
            {formError && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-700">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p className="text-sm">{formError}</p>
              </div>
            )}

            {successMessage && (
              <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                {successMessage}
              </div>
            )}

            {/* Formulaire */}
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="vous@exemple.com"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Envoi en cours...
                  </>
                ) : (
                  'Envoyer le lien'
                )}
              </button>
            </form>

            {/* Retour */}
            <p className="text-center text-sm text-slate-500 mt-6">
              <button
                type="button"
                onClick={() => {
                  setIsResetPassword(false);
                  setFormError('');
                  setSuccessMessage('');
                }}
                className="text-indigo-600 hover:text-indigo-700 font-medium"
              >
                Retour à la connexion
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Formulaire principal (Connexion / Inscription)
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Layers className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              {isSignUp ? 'Créer un compte' : 'Connexion'}
            </h1>
            <p className="text-slate-500 mt-2">
              {isSignUp 
                ? 'Rejoignez Baikal Console' 
                : 'Accédez à votre console d\'administration'
              }
            </p>
          </div>

          {/* Messages */}
          {(formError || error) && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-700">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm">{formError || error}</p>
            </div>
          )}

          {successMessage && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
              {successMessage}
            </div>
          )}

          {/* Formulaire */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Nom (inscription uniquement) */}
            {isSignUp && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nom complet
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="Jean Dupont"
                  />
                </div>
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="vous@exemple.com"
                />
              </div>
            </div>

            {/* Mot de passe */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Mot de passe
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-12 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Mot de passe oublié */}
            {!isSignUp && (
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => {
                    setIsResetPassword(true);
                    setFormError('');
                    setSuccessMessage('');
                  }}
                  className="text-sm text-indigo-600 hover:text-indigo-700"
                >
                  Mot de passe oublié ?
                </button>
              </div>
            )}

            {/* Bouton submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {isSignUp ? 'Création...' : 'Connexion...'}
                </>
              ) : (
                isSignUp ? 'Créer mon compte' : 'Se connecter'
              )}
            </button>
          </form>

          {/* Séparateur */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white text-slate-500">ou</span>
            </div>
          </div>

          {/* Google */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="w-full py-3 border border-slate-200 rounded-lg font-medium text-slate-700 hover:bg-slate-50 transition-colors flex items-center justify-center gap-3"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continuer avec Google
          </button>

          {/* Toggle */}
          <p className="text-center text-sm text-slate-500 mt-6">
            {isSignUp ? 'Déjà un compte ?' : 'Pas encore de compte ?'}{' '}
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setFormError('');
                setSuccessMessage('');
                setEmail('');
                setPassword('');
                setFullName('');
                setShowPassword(false);
                if (clearError) clearError();
              }}
              className="text-indigo-600 hover:text-indigo-700 font-medium"
            >
              {isSignUp ? 'Se connecter' : 'S\'inscrire'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
