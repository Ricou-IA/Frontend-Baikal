/**
 * AuthContext.jsx - Baikal Console
 * ============================================================================
 * MIGRATION PHASE 3 - Schémas explicites
 * 
 * MODIFICATIONS:
 * - profiles → core.profiles (schéma)
 * - organizations → core.organizations (schéma)
 * ============================================================================
 */

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useImpersonation } from '../hooks/useImpersonation';

// ============================================================================
// CONTEXT
// ============================================================================

const AuthContext = createContext({});

/**
 * Hook pour utiliser le contexte d'authentification
 * @returns {Object} - Contexte d'authentification
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth doit être utilisé dans un AuthProvider');
  }
  return context;
};

// ============================================================================
// PROVIDER
// ============================================================================

export function AuthProvider({ children }) {
  // ========================================================================
  // ÉTATS PRINCIPAUX
  // ========================================================================
  
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [organization, setOrganization] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Refs pour éviter les appels multiples
  const profileLoadedRef = useRef(false);
  const loadingProfileRef = useRef(false);
  const signingUpRef = useRef(false);

  // ========================================================================
  // HOOK D'IMPERSONATION (externe)
  // ========================================================================
  
  const {
    isImpersonating,
    impersonatedProfile,
    impersonatedOrganization,
    impersonatedUser,
    impersonateUser,
    stopImpersonating,
  } = useImpersonation(profile);

  // ========================================================================
  // VALEURS EFFECTIVES (impersonation ou réelles)
  // ========================================================================
  
  const effectiveProfile = impersonatedProfile || profile;
  const effectiveOrganization = impersonatedOrganization || organization;
  const effectiveUser = impersonatedUser || user;

  // ========================================================================
  // CHARGEMENT DU PROFIL
  // ========================================================================

  const loadUserProfile = useCallback(async (userId) => {
    if (loadingProfileRef.current) {
      return;
    }

    loadingProfileRef.current = true;

    try {
      // MIGRATION: profiles → core.profiles
      const { data: profileData, error: profileError } = await supabase
        .schema('core')
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError) {
        // DEBUG: Log complet de l'erreur pour diagnostic 406
        console.error('[AuthContext] Profile error details:', {
          code: profileError.code,
          message: profileError.message,
          details: profileError.details,
          hint: profileError.hint,
          status: profileError.status,
          full: profileError
        });

        // PGRST116 = No rows found (profil non créé)
        if (profileError.code === 'PGRST116') {
          setProfile(null);
          setOrganization(null);
          profileLoadedRef.current = true;
          return;
        }
        throw profileError;
      }

      setProfile(profileData);

      // Charger l'organisation si présente
      if (profileData?.org_id) {
        // MIGRATION: organizations → core.organizations
        const { data: orgData, error: orgError } = await supabase
          .schema('core')
          .from('organizations')
          .select('*')
          .eq('id', profileData.org_id)
          .single();

        if (!orgError) {
          setOrganization(orgData);
        }
      } else {
        setOrganization(null);
      }

      profileLoadedRef.current = true;
    } catch (err) {
      setError(err.message);
      profileLoadedRef.current = true;
    } finally {
      loadingProfileRef.current = false;
    }
  }, []);

  /**
   * Rafraîchit le profil depuis la base de données
   */
  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      profileLoadedRef.current = false;
      loadingProfileRef.current = false;
      await loadUserProfile(user.id);
    }
  }, [user?.id, loadUserProfile]);

  // ========================================================================
  // INITIALISATION DE LA SESSION
  // ========================================================================

  useEffect(() => {
    let mounted = true;

    const initSession = async () => {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();

        if (!mounted) return;

        setSession(initialSession);
        setUser(initialSession?.user ?? null);

        if (initialSession?.user) {
          await loadUserProfile(initialSession.user.id);
        }
      } catch (err) {
        if (mounted) setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initSession();

    // Écouter les changements d'état d'authentification
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (!mounted) return;

        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (event === 'SIGNED_IN' && newSession?.user) {
          profileLoadedRef.current = false;
          loadingProfileRef.current = false;

          if (mounted) {
            loadUserProfile(newSession.user.id)
              .then(() => {
                if (mounted) setLoading(false);
              })
              .catch(() => {
                if (mounted) setLoading(false);
              });
          }
        } else if (event === 'SIGNED_OUT') {
          setProfile(null);
          setOrganization(null);
          profileLoadedRef.current = false;
          loadingProfileRef.current = false;
          setLoading(false);
          
          // Arrêter l'impersonation si active
          if (isImpersonating) {
            stopImpersonating();
          }
        } else {
          setLoading(false);
        }
      }
    );

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, [loadUserProfile, isImpersonating, stopImpersonating]);

  // ========================================================================
  // MÉTHODES D'AUTHENTIFICATION
  // ========================================================================

  /**
   * Inscription avec email/password
   */
  const signUp = async (email, password, metadata = {}) => {
    if (signingUpRef.current) {
      return { data: null, error: { message: 'Une inscription est déjà en cours.' } };
    }

    signingUpRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: metadata,
        },
      });

      if (signUpError) throw signUpError;

      return { data, error: null };
    } catch (err) {
      setError(err.message);
      return { data: null, error: err };
    } finally {
      setLoading(false);
      signingUpRef.current = false;
    }
  };

  /**
   * Connexion avec email/password
   */
  const signIn = async (email, password) => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) throw signInError;

      return { data, error: null };
    } catch (err) {
      setError(err.message);
      return { data: null, error: err };
    } finally {
      setLoading(false);
    }
  };

  /**
   * Connexion avec Google OAuth
   */
  const signInWithGoogle = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
        },
      });

      if (oauthError) throw oauthError;

      return { data, error: null };
    } catch (err) {
      setError(err.message);
      return { data: null, error: err };
    } finally {
      setLoading(false);
    }
  };

  /**
   * Déconnexion
   */
  const signOut = async () => {
    setLoading(true);
    setError(null);

    try {
      // Arrêter l'impersonation si active
      if (isImpersonating) {
        stopImpersonating();
      }

      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;

      setUser(null);
      setSession(null);
      setProfile(null);
      setOrganization(null);
      profileLoadedRef.current = false;

      return { error: null };
    } catch (err) {
      setError(err.message);
      return { error: err };
    } finally {
      setLoading(false);
    }
  };

  /**
   * Réinitialisation du mot de passe
   */
  const resetPassword = async (email) => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (resetError) throw resetError;

      return { data, error: null };
    } catch (err) {
      setError(err.message);
      return { data: null, error: err };
    } finally {
      setLoading(false);
    }
  };

  /**
   * Mise à jour du mot de passe
   */
  const updatePassword = async (newPassword) => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) throw updateError;

      return { data, error: null };
    } catch (err) {
      setError(err.message);
      return { data: null, error: err };
    } finally {
      setLoading(false);
    }
  };

  /**
   * Effacer l'erreur
   */
  const clearError = () => {
    setError(null);
  };

  // ========================================================================
  // VALEURS DÉRIVÉES
  // ========================================================================

  // L'onboarding est bypassé si on est en impersonation
  const isOnboarded = isImpersonating ? true : !!effectiveProfile?.business_role;

  // isSuperAdmin est TOUJOURS basé sur le profil RÉEL (pas impersoné)
  const isSuperAdmin = profile?.app_role === 'super_admin';

  // isOrgAdmin est basé sur le profil effectif
  const isOrgAdmin = effectiveProfile?.app_role === 'org_admin' || effectiveProfile?.app_role === 'super_admin';

  // ========================================================================
  // VALEUR DU CONTEXTE
  // ========================================================================

  const value = {
    // Données (effectives - impersonation ou réelles)
    user: effectiveUser,
    session,
    profile: effectiveProfile,
    organization: effectiveOrganization,

    // États
    loading,
    error,

    // Flags booléens
    isAuthenticated: !!session,
    isOnboarded,
    isOrgAdmin,
    isSuperAdmin, // Toujours basé sur le profil réel
    hasProfile: !!effectiveProfile,

    // Impersonation
    isImpersonating,
    realProfile: profile, // Profil réel du super_admin
    impersonateUser,
    stopImpersonating,

    // Méthodes d'authentification
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    refreshProfile,
    resetPassword,
    updatePassword,
    clearError,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthContext;
