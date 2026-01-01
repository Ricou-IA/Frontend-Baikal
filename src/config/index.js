/**
 * Configuration - Core RAG Engine
 * ============================================================================
 * Barrel export pour centraliser tous les imports de configuration.
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

// Prompts (configuration des prompts d'agents RAG)
export * from './prompts';