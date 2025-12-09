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
import PlatformLayout from '../layouts/PlatformLayout';
import { 
  Mail, 
  Lock, 
  User, 
  Eye, 
  EyeOff, 
  Loader2,
  AlertCircle
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
      <PlatformLayout>
        <div className="h-screen w-full flex items-center justify-center bg-black">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-baikal-cyan mx-auto" />
            <p className="mt-4 text-baikal-text font-mono">
              {isRedirecting ? 'INITIALIZATION...' : 'LOADING...'}
            </p>
          </div>
        </div>
      </PlatformLayout>
    );
  }

  // Formulaire de réinitialisation
  if (isResetPassword) {
    return (
      <PlatformLayout>
        <div className="h-screen w-full flex items-center justify-center bg-black p-4">
          <div className="w-full max-w-md">
            <div className="bg-baikal-surface border border-baikal-border p-8">
              {/* Header */}
              <div className="text-center mb-8">
                <div className="font-mono text-baikal-cyan text-2xl mb-4">
                  BAÏKAL // CONSOLE
                </div>
                <h1 className="font-mono text-white text-xl mb-2">RESET PASSWORD</h1>
                <p className="text-baikal-text text-sm">
                  Enter your email to receive a reset link.
                </p>
              </div>

              {/* Messages */}
              {formError && (
                <div className="mb-6 p-4 bg-red-900/20 border border-red-500/50 rounded flex items-center gap-3 text-red-400 text-sm font-mono">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <p>{formError}</p>
                </div>
              )}

              {successMessage && (
                <div className="mb-6 p-4 bg-green-900/20 border border-green-500/50 rounded text-green-400 text-sm font-mono">
                  {successMessage}
                </div>
              )}

              {/* Formulaire */}
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-mono text-baikal-text mb-2 uppercase">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-baikal-text" />
                    <input
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-black border border-baikal-border text-white placeholder-baikal-text focus:outline-none focus:border-baikal-cyan transition-colors font-mono text-sm"
                      placeholder="user@example.com"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 bg-baikal-cyan text-black font-mono font-bold hover:opacity-80 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      SENDING...
                    </>
                  ) : (
                    'SEND RESET LINK'
                  )}
                </button>
              </form>

              {/* Retour */}
              <p className="text-center text-xs text-baikal-text mt-6 font-mono">
                <button
                  type="button"
                  onClick={() => {
                    setIsResetPassword(false);
                    setFormError('');
                    setSuccessMessage('');
                  }}
                  className="text-baikal-cyan hover:text-baikal-cyan/80 transition-colors"
                >
                  ← BACK TO LOGIN
                </button>
              </p>
            </div>
          </div>
        </div>
      </PlatformLayout>
    );
  }

  // Formulaire principal (Connexion / Inscription)
  return (
    <PlatformLayout>
      <div className="h-screen w-full flex items-center justify-center bg-black p-4">
        <div className="w-full max-w-md">
          <div className="bg-baikal-surface border border-baikal-border p-8">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="font-mono text-baikal-cyan text-2xl mb-4">
                BAÏKAL // CONSOLE
              </div>
              <h1 className="font-mono text-white text-xl mb-2">
                {isSignUp ? 'CREATE ACCOUNT' : 'AUTHENTICATION'}
              </h1>
              <p className="text-baikal-text text-sm font-mono">
                {isSignUp 
                  ? 'Initialize your session' 
                  : 'Access your console'
                }
              </p>
            </div>

            {/* Messages */}
            {(formError || error) && (
              <div className="mb-6 p-4 bg-red-900/20 border border-red-500/50 rounded flex items-center gap-3 text-red-400 text-sm font-mono">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <p>{formError || error}</p>
              </div>
            )}

            {successMessage && (
              <div className="mb-6 p-4 bg-green-900/20 border border-green-500/50 rounded text-green-400 text-sm font-mono">
                {successMessage}
              </div>
            )}

            {/* Formulaire */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Nom (inscription uniquement) */}
              {isSignUp && (
                <div>
                  <label className="block text-xs font-mono text-baikal-text mb-2 uppercase">
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-baikal-text" />
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-black border border-baikal-border text-white placeholder-baikal-text focus:outline-none focus:border-baikal-cyan transition-colors font-mono text-sm"
                      placeholder="John Doe"
                    />
                  </div>
                </div>
              )}

              {/* Email */}
              <div>
                <label className="block text-xs font-mono text-baikal-text mb-2 uppercase">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-baikal-text" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-black border border-baikal-border text-white placeholder-baikal-text focus:outline-none focus:border-baikal-cyan transition-colors font-mono text-sm"
                    placeholder="user@example.com"
                  />
                </div>
              </div>

              {/* Mot de passe */}
              <div>
                <label className="block text-xs font-mono text-baikal-text mb-2 uppercase">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-baikal-text" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-12 py-3 bg-black border border-baikal-border text-white placeholder-baikal-text focus:outline-none focus:border-baikal-cyan transition-colors font-mono text-sm"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-baikal-text hover:text-baikal-cyan transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
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
                    className="text-xs text-baikal-cyan hover:text-baikal-cyan/80 transition-colors font-mono"
                  >
                    FORGOT PASSWORD?
                  </button>
                </div>
              )}

              {/* Bouton submit */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 bg-baikal-cyan text-black font-mono font-bold hover:opacity-80 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {isSignUp ? 'CREATING...' : 'INITIALIZING...'}
                  </>
                ) : (
                  isSignUp ? 'CREATE ACCOUNT' : 'INITIALIZE SESSION'
                )}
              </button>
            </form>

            {/* Séparateur */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-baikal-border" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-4 bg-baikal-surface text-baikal-text font-mono">OR</span>
              </div>
            </div>

            {/* Google */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="w-full py-3 border border-baikal-border bg-black text-white font-mono text-sm hover:border-baikal-cyan hover:text-baikal-cyan transition-colors flex items-center justify-center gap-3"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              CONTINUE WITH GOOGLE
            </button>

            {/* Toggle */}
            <p className="text-center text-xs text-baikal-text mt-6 font-mono">
              {isSignUp ? 'Already have an account?' : 'No account yet?'}{' '}
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
                className="text-baikal-cyan hover:text-baikal-cyan/80 transition-colors"
              >
                {isSignUp ? 'LOGIN' : 'SIGN UP'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </PlatformLayout>
  );
}
