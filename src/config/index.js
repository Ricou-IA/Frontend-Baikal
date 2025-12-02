/**
 * Configuration - Core RAG Engine
 * ============================================================================
 * Barrel export pour centraliser tous les imports de configuration.
 * 
 * Usage:
 * import { APP_ROLES, ROUTES, ERROR_MESSAGES } from '@/config';
 * // ou
 * import { APP_ROLES } from '@/config/constants';
 * ============================================================================
 */

// Constantes (rôles, plans, verticales, limites)
export * from './constants';

// Routes et navigation
export * from './routes';

// Configuration API (Supabase, webhooks, endpoints)
export * from './api';

// Messages (erreurs, succès, textes UI)
export * from './messages';