/**
 * Configuration des routes - Baikal Console
 * ============================================================================
 * Chemins de navigation centralisés.
 * Console d'administration RAG multi-couches.
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
  ADMIN: '/admin',
  SETTINGS: '/settings',
  ONBOARDING: '/onboarding',
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
  // Après connexion réussie → Admin (page principale)
  AFTER_LOGIN: PROTECTED_ROUTES.ADMIN,
  
  // Après déconnexion
  AFTER_LOGOUT: PUBLIC_ROUTES.LOGIN,
  
  // Si non authentifié
  UNAUTHENTICATED: PUBLIC_ROUTES.LOGIN,
  
  // Si pas onboardé
  NOT_ONBOARDED: PROTECTED_ROUTES.ONBOARDING,
  
  // Si déjà onboardé mais sur /onboarding
  ALREADY_ONBOARDED: PROTECTED_ROUTES.ADMIN,
  
  // Route par défaut (404)
  NOT_FOUND: PROTECTED_ROUTES.ADMIN,
  
  // Callback OAuth (Google)
  OAUTH_CALLBACK: PROTECTED_ROUTES.ADMIN,
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
  OAUTH_GOOGLE_CALLBACK: `${typeof window !== 'undefined' ? window.location.origin : ''}/admin`,
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
// NAVIGATION TABS - Console Admin
// ============================================

/**
 * Onglets de la console Admin
 * Visibilité contrôlée par rôle dans Admin.jsx
 * 
 * @type {Array}
 */
export const ADMIN_TABS = Object.freeze([
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: 'LayoutDashboard',
    description: 'Vue d\'ensemble et statistiques',
    roles: ['super_admin', 'org_admin'],
  },
  {
    id: 'users',
    label: 'Utilisateurs',
    icon: 'Users',
    description: 'Gérer les utilisateurs',
    roles: ['super_admin', 'org_admin'], // super_admin voit tous, org_admin voit son org
  },
  {
    id: 'organization',
    label: 'Organisation',
    icon: 'Building2',
    description: 'Paramètres de l\'organisation',
    roles: ['super_admin', 'org_admin'],
  },
  {
    id: 'knowledge',
    label: 'Connaissances',
    icon: 'BookOpen',
    description: 'Base documentaire RAG',
    roles: ['super_admin', 'org_admin'], // super_admin voit toutes couches + Légifrance
  },
  {
    id: 'prompts',
    label: 'Prompts',
    icon: 'MessageSquareCode',
    description: 'Configuration des prompts RAG',
    roles: ['super_admin'], // super_admin uniquement
  },
]);

/**
 * Filtre les onglets selon le rôle utilisateur
 * @param {string} role - Rôle de l'utilisateur ('super_admin' | 'org_admin')
 * @returns {Array} Onglets filtrés
 */
export const getAdminTabsByRole = (role) => {
  return ADMIN_TABS.filter(tab => tab.roles.includes(role));
};
