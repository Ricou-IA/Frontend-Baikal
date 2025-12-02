/**
 * Auth Service - Core RAG Engine
 * ============================================================================
 * Service centralisé pour toutes les opérations d'authentification.
 * Encapsule les appels Supabase Auth.
 * 
 * @example
 * import { authService } from '@/services';
 * 
 * const { data, error } = await authService.signIn('email@test.com', 'password');
 * ============================================================================
 */

import { supabase } from '../lib/supabaseClient';

/**
 * Service d'authentification
 */
export const authService = {
  /**
   * Connexion avec email et mot de passe
   * @param {string} email - Adresse email
   * @param {string} password - Mot de passe
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   */
  async signIn(email, password) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  /**
   * Inscription avec email et mot de passe
   * @param {string} email - Adresse email
   * @param {string} password - Mot de passe
   * @param {Object} metadata - Métadonnées utilisateur (full_name, etc.)
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   */
  async signUp(email, password, metadata = {}) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: metadata,
        },
      });

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  /**
   * Déconnexion
   * @returns {Promise<{error: Error|null}>}
   */
  async signOut() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      return { error: null };
    } catch (error) {
      return { error };
    }
  },

  /**
   * Connexion avec Google OAuth
   * @param {string} redirectTo - URL de redirection après connexion
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   */
  async signInWithGoogle(redirectTo = `${window.location.origin}/dashboard`) {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
        },
      });

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  /**
   * Demande de réinitialisation de mot de passe
   * @param {string} email - Adresse email
   * @param {string} redirectTo - URL de redirection
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   */
  async resetPassword(email, redirectTo = `${window.location.origin}/reset-password`) {
    try {
      const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  /**
   * Mise à jour du mot de passe
   * @param {string} newPassword - Nouveau mot de passe
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   */
  async updatePassword(newPassword) {
    try {
      const { data, error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  /**
   * Récupère la session courante
   * @returns {Promise<{session: Object|null, error: Error|null}>}
   */
  async getSession() {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;
      return { session, error: null };
    } catch (error) {
      return { session: null, error };
    }
  },

  /**
   * Récupère l'utilisateur courant
   * @returns {Promise<{user: Object|null, error: Error|null}>}
   */
  async getUser() {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      return { user, error: null };
    } catch (error) {
      return { user: null, error };
    }
  },

  /**
   * Écoute les changements d'état d'authentification
   * @param {Function} callback - Fonction appelée à chaque changement
   * @returns {Object} - Subscription (avec méthode unsubscribe)
   */
  onAuthStateChange(callback) {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        callback(event, session);
      }
    );
    return subscription;
  },

  /**
   * Vérifie si un email existe déjà
   * @param {string} email - Email à vérifier
   * @returns {Promise<boolean>}
   */
  async checkEmailExists(email) {
    try {
      const { data, error } = await supabase.rpc('check_email_exists', {
        email_to_check: email,
      });

      if (error) {
        // Si la fonction RPC n'existe pas, on retourne false
        console.warn('check_email_exists RPC not available:', error.message);
        return false;
      }

      return data === true;
    } catch (error) {
      console.warn('Error checking email:', error);
      return false;
    }
  },

  /**
   * Rafraîchit la session
   * @returns {Promise<{session: Object|null, error: Error|null}>}
   */
  async refreshSession() {
    try {
      const { data: { session }, error } = await supabase.auth.refreshSession();
      if (error) throw error;
      return { session, error: null };
    } catch (error) {
      return { session: null, error };
    }
  },
};

export default authService;
