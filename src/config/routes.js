/**
 * Configuration des routes - Core RAG Engine
 * ============================================================================
 * Chemins de navigation centralisés.
 * Permet de modifier les URLs en un seul endroit.
 * ============================================================================
 */

// ============================================
// ROUTES PUBLIQUES
// ============================================

/**
 * Routes accessibles sans authentification
 * @type {Object}
 */
export const PUBLIC_ROUTES = Object.freeze({
    LOGIN: '/login',
    RESET_PASSWORD: '/reset-password',
  });
  
  // ============================================
  // ROUTES PROTÉGÉES
  // ============================================
  
  /**
   * Routes nécessitant une authentification
   * @type {Object}
   */
  export const PROTECTED_ROUTES = Object.freeze({
    DASHBOARD: '/dashboard',
    SETTINGS: '/settings',
    ONBOARDING: '/onboarding',
    ADMIN: '/admin',
  });
  
  // ============================================
  // TOUTES LES ROUTES
  // ============================================
  
  /**
   * Toutes les routes de l'application
   * @type {Object}
   */
  export const ROUTES = Object.freeze({
    ...PUBLIC_ROUTES,
    ...PROTECTED_ROUTES,
    HOME: '/',
  });
  
  // ============================================
  // CONFIGURATION DES REDIRECTIONS
  // ============================================
  
  /**
   * Routes de redirection par défaut
   * @type {Object}
   */
  export const REDIRECT_ROUTES = Object.freeze({
    // Après connexion réussie
    AFTER_LOGIN: PROTECTED_ROUTES.DASHBOARD,
    
    // Après déconnexion
    AFTER_LOGOUT: PUBLIC_ROUTES.LOGIN,
    
    // Si non authentifié
    UNAUTHENTICATED: PUBLIC_ROUTES.LOGIN,
    
    // Si pas onboardé
    NOT_ONBOARDED: PROTECTED_ROUTES.ONBOARDING,
    
    // Si déjà onboardé mais sur /onboarding
    ALREADY_ONBOARDED: PROTECTED_ROUTES.DASHBOARD,
    
    // Route par défaut (404)
    NOT_FOUND: PROTECTED_ROUTES.DASHBOARD,
    
    // Callback OAuth (Google)
    OAUTH_CALLBACK: PROTECTED_ROUTES.DASHBOARD,
  });
  
  // ============================================
  // ROUTES EXTERNES
  // ============================================
  
  /**
   * URLs externes (OAuth, webhooks, etc.)
   * @type {Object}
   */
  export const EXTERNAL_URLS = Object.freeze({
    // Callback pour réinitialisation mot de passe
    PASSWORD_RESET_CALLBACK: `${typeof window !== 'undefined' ? window.location.origin : ''}/reset-password`,
    
    // Callback pour OAuth Google
    OAUTH_GOOGLE_CALLBACK: `${typeof window !== 'undefined' ? window.location.origin : ''}/dashboard`,
  });
  
  // ============================================
  // HELPERS
  // ============================================
  
  /**
   * Vérifie si une route est publique
   * @param {string} path - Chemin à vérifier
   * @returns {boolean}
   */
  export const isPublicRoute = (path) => {
    return Object.values(PUBLIC_ROUTES).includes(path);
  };
  
  /**
   * Vérifie si une route est protégée
   * @param {string} path - Chemin à vérifier
   * @returns {boolean}
   */
  export const isProtectedRoute = (path) => {
    return Object.values(PROTECTED_ROUTES).includes(path);
  };
  
  /**
   * Construit une URL avec des paramètres
   * @param {string} route - Route de base
   * @param {Object} params - Paramètres à ajouter
   * @returns {string}
   */
  export const buildUrl = (route, params = {}) => {
    const url = new URL(route, window.location.origin);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, value);
      }
    });
    return url.pathname + url.search;
  };
  
  // ============================================
  // NAVIGATION TABS (Dashboard)
  // ============================================
  
  /**
   * Onglets du Dashboard
   * @type {Array}
   */
  export const DASHBOARD_TABS = Object.freeze([
    {
      id: 'chat',
      label: 'Assistant IA',
      icon: 'MessageSquare',
    },
    {
      id: 'upload',
      label: 'Documents',
      icon: 'Upload',
    },
    {
      id: 'invoices',
      label: 'Factures',
      icon: 'Receipt',
    },
    {
      id: 'audio',
      label: 'Réunions',
      icon: 'Mic',
    },
  ]);
  
  /**
   * Onglets de la page Admin
   * @type {Array}
   */
  export const ADMIN_TABS = Object.freeze([
    {
      id: 'members',
      label: 'Membres',
      icon: 'Users',
      description: 'Gérer les membres de l\'équipe',
    },
    {
      id: 'settings',
      label: 'Organisation',
      icon: 'Building2',
      description: 'Paramètres de l\'organisation',
    },
    {
      id: 'users',
      label: 'Utilisateurs',
      icon: 'UserCog',
      description: 'Voir tous les utilisateurs',
      superAdminOnly: true,
    },
  ]);