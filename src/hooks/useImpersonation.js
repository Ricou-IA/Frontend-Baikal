/**
 * useImpersonation - Hook pour gérer l'impersonation (super_admin uniquement)
 * ============================================================================
 * Permet à un super_admin de "se connecter en tant que" un autre utilisateur
 * pour tester et débugger.
 * 
 * @example
 * const { 
 *   isImpersonating, 
 *   impersonatedProfile,
 *   impersonateUser, 
 *   stopImpersonating 
 * } = useImpersonation(realProfile);
 * ============================================================================
 */

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

// Clés localStorage
const STORAGE_KEYS = {
  PROFILE: 'impersonated_profile',
  ORGANIZATION: 'impersonated_organization',
  USER: 'impersonated_user',
};

/**
 * Charge une valeur depuis localStorage de façon sécurisée
 */
function loadFromStorage(key) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

/**
 * Sauvegarde une valeur dans localStorage
 */
function saveToStorage(key, value) {
  if (value) {
    localStorage.setItem(key, JSON.stringify(value));
  } else {
    localStorage.removeItem(key);
  }
}

/**
 * Nettoie toutes les données d'impersonation du localStorage
 */
function clearImpersonationStorage() {
  localStorage.removeItem(STORAGE_KEYS.PROFILE);
  localStorage.removeItem(STORAGE_KEYS.ORGANIZATION);
  localStorage.removeItem(STORAGE_KEYS.USER);
}

/**
 * Hook pour gérer l'impersonation
 * 
 * @param {Object} realProfile - Le profil réel de l'utilisateur connecté
 * @returns {Object} - État et méthodes d'impersonation
 */
export function useImpersonation(realProfile) {
  // États - Restaurés depuis localStorage au montage
  const [impersonatedProfile, setImpersonatedProfile] = useState(() => 
    loadFromStorage(STORAGE_KEYS.PROFILE)
  );
  const [impersonatedOrganization, setImpersonatedOrganization] = useState(() => 
    loadFromStorage(STORAGE_KEYS.ORGANIZATION)
  );
  const [impersonatedUser, setImpersonatedUser] = useState(() => 
    loadFromStorage(STORAGE_KEYS.USER)
  );
  const [error, setError] = useState(null);

  // Vérifie si l'utilisateur est super_admin
  const isSuperAdmin = realProfile?.app_role === 'super_admin';

  /**
   * Nettoie l'impersonation si l'utilisateur n'est plus super_admin
   */
  useEffect(() => {
    if (realProfile && !isSuperAdmin && impersonatedProfile) {
      clearImpersonationStorage();
      setImpersonatedProfile(null);
      setImpersonatedOrganization(null);
      setImpersonatedUser(null);
    }
  }, [realProfile, isSuperAdmin, impersonatedProfile]);

  /**
   * Restaure l'impersonation depuis localStorage après le chargement du profil
   */
  useEffect(() => {
    if (isSuperAdmin && !impersonatedProfile) {
      const savedProfile = loadFromStorage(STORAGE_KEYS.PROFILE);
      const savedOrg = loadFromStorage(STORAGE_KEYS.ORGANIZATION);
      const savedUser = loadFromStorage(STORAGE_KEYS.USER);

      if (savedProfile) {
        setImpersonatedProfile(savedProfile);
        setImpersonatedOrganization(savedOrg);
        setImpersonatedUser(savedUser);
      }
    }
  }, [isSuperAdmin, impersonatedProfile]);

  /**
   * Emprunte l'identité d'un utilisateur
   * @param {string} targetUserId - ID de l'utilisateur cible
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  const impersonateUser = useCallback(async (targetUserId) => {
    if (!isSuperAdmin) {
      const errorMsg = 'Seul le super_admin peut emprunter l\'identité d\'un utilisateur';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }

    setError(null);

    try {
      // Charger le profil cible
      const { data: targetProfile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', targetUserId)
        .single();

      if (profileError) throw profileError;

      // Charger l'organisation si présente
      let targetOrg = null;
      if (targetProfile.org_id) {
        const { data: orgData, error: orgError } = await supabase
          .from('organizations')
          .select('*')
          .eq('id', targetProfile.org_id)
          .single();

        if (!orgError) {
          targetOrg = orgData;
        }
      }

      // Créer un objet user simulé
      const simulatedUser = {
        id: targetProfile.id,
        email: targetProfile.email,
        user_metadata: {
          full_name: targetProfile.full_name,
        },
      };

      // Sauvegarder dans localStorage
      saveToStorage(STORAGE_KEYS.PROFILE, targetProfile);
      saveToStorage(STORAGE_KEYS.ORGANIZATION, targetOrg);
      saveToStorage(STORAGE_KEYS.USER, simulatedUser);

      // Mettre à jour les états
      setImpersonatedProfile(targetProfile);
      setImpersonatedOrganization(targetOrg);
      setImpersonatedUser(simulatedUser);

      return { success: true };
    } catch (err) {
      const errorMsg = err.message || 'Erreur lors de l\'impersonation';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }
  }, [isSuperAdmin]);

  /**
   * Arrête l'impersonation et revient au profil réel
   */
  const stopImpersonating = useCallback(() => {
    clearImpersonationStorage();
    setImpersonatedProfile(null);
    setImpersonatedOrganization(null);
    setImpersonatedUser(null);
    setError(null);
  }, []);

  // Détermine si on est en mode impersonation
  const isImpersonating = !!impersonatedProfile;

  return {
    // État
    isImpersonating,
    impersonatedProfile,
    impersonatedOrganization,
    impersonatedUser,
    error,

    // Actions
    impersonateUser,
    stopImpersonating,

    // Helpers - Retourne les valeurs effectives (impersonated si actif, sinon null)
    getEffectiveProfile: (realProfile) => impersonatedProfile || realProfile,
    getEffectiveOrganization: (realOrg) => impersonatedOrganization || realOrg,
    getEffectiveUser: (realUser) => impersonatedUser || realUser,
  };
}

export default useImpersonation;
