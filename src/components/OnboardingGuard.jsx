/**
 * OnboardingGuard.jsx - Baikal Console
 * ============================================================================
 * Guards de protection des routes avec gestion des redirections.
 * 
 * Guards disponibles :
 * - ProtectedRoute : Auth + Onboarding requis
 * - OnboardingRoute : Auth requis, redirige si déjà onboardé
 * - PublicRoute : Redirige si déjà connecté
 * - AdminRoute : Auth + Onboarding + Rôle admin requis
 * ============================================================================
 */

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Loader2, AlertTriangle, ShieldX } from 'lucide-react';

// ============================================================================
// ÉCRANS DE CHARGEMENT ET D'ERREUR
// ============================================================================

/**
 * Écran de chargement
 */
function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <Loader2 className="w-12 h-12 animate-spin text-indigo-600 mx-auto" />
        <p className="mt-4 text-slate-600">Chargement...</p>
      </div>
    </div>
  );
}

/**
 * Écran d'erreur de profil
 */
function ProfileErrorScreen({ onRetry, onSignOut }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-8 h-8 text-amber-600" />
        </div>
        <h2 className="text-xl font-semibold text-slate-900 mb-2">
          Profil non trouvé
        </h2>
        <p className="text-slate-600 mb-6">
          Votre compte a été créé mais le profil n'a pas été initialisé correctement. 
          Cela peut arriver si le trigger de base de données n'a pas fonctionné.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={onRetry}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Réessayer
          </button>
          <button
            onClick={onSignOut}
            className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors"
          >
            Se déconnecter
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Écran d'accès refusé (pour les non-admins)
 */
function AccessDeniedScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <ShieldX className="w-8 h-8 text-red-600" />
        </div>
        <h2 className="text-xl font-semibold text-slate-900 mb-2">
          Accès refusé
        </h2>
        <p className="text-slate-600 mb-6">
          Vous n'avez pas les droits d'accès à cette section.
          Contactez votre administrateur si vous pensez qu'il s'agit d'une erreur.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => window.location.href = '/login'}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Retour à la connexion
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// GUARDS DE ROUTES
// ============================================================================

/**
 * Guard pour les routes nécessitant une authentification
 * Vérifie également que l'onboarding est complété
 */
export function ProtectedRoute({ children }) {
  const { isAuthenticated, isOnboarded, hasProfile, loading, refreshProfile, signOut } = useAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!hasProfile) {
    return <ProfileErrorScreen onRetry={refreshProfile} onSignOut={signOut} />;
  }

  if (!isOnboarded) {
    return <Navigate to="/onboarding" replace />;
  }

  return children;
}

/**
 * Guard pour la route d'onboarding
 * Requiert auth, redirige vers /admin si déjà onboardé
 */
export function OnboardingRoute({ children }) {
  const { isAuthenticated, isOnboarded, hasProfile, loading, refreshProfile, signOut } = useAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!hasProfile) {
    return <ProfileErrorScreen onRetry={refreshProfile} onSignOut={signOut} />;
  }

  if (isOnboarded) {
    return <Navigate to="/admin" replace />;
  }

  return children;
}

/**
 * Guard pour les routes publiques (login, etc.)
 * Redirige vers /admin si déjà connecté et onboardé
 */
export function PublicRoute({ children }) {
  const { isAuthenticated, isOnboarded, hasProfile, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (isAuthenticated) {
    if (!hasProfile) {
      return children;
    }
    if (!isOnboarded) {
      return <Navigate to="/onboarding" replace />;
    }
    return <Navigate to="/admin" replace />;
  }

  return children;
}

/**
 * Guard pour les routes admin
 * Requiert auth + onboarding + rôle admin (org_admin ou super_admin)
 * Affiche un écran d'accès refusé si non admin
 */
export function AdminRoute({ children }) {
  const { isAuthenticated, isOnboarded, isOrgAdmin, hasProfile, loading, refreshProfile, signOut } = useAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!hasProfile) {
    return <ProfileErrorScreen onRetry={refreshProfile} onSignOut={signOut} />;
  }

  if (!isOnboarded) {
    return <Navigate to="/onboarding" replace />;
  }

  if (!isOrgAdmin) {
    return <AccessDeniedScreen />;
  }

  return children;
}

export default ProtectedRoute;
