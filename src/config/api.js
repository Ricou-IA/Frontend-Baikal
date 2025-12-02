/**
 * Configuration API - Core RAG Engine
 * ============================================================================
 * Configuration Supabase, endpoints et paramètres API.
 * ============================================================================
 */

// ============================================
// CONFIGURATION SUPABASE
// ============================================

/**
 * URL Supabase (depuis variables d'environnement)
 * @type {string}
 */
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';

/**
 * Clé anonyme Supabase (depuis variables d'environnement)
 * @type {string}
 */
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

/**
 * Options de configuration du client Supabase
 * @type {Object}
 */
export const SUPABASE_OPTIONS = Object.freeze({
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// ============================================
// EDGE FUNCTIONS
// ============================================

/**
 * Endpoints des Edge Functions Supabase
 * @type {Object}
 */
export const EDGE_FUNCTIONS = Object.freeze({
  RAG_BRAIN: 'rag-brain',
  PROCESS_AUDIO: 'process-audio',
  INGEST_DOCUMENTS: 'ingest-documents',
});

/**
 * Construit l'URL complète d'une Edge Function
 * @param {string} functionName - Nom de la fonction
 * @returns {string}
 */
export const getEdgeFunctionUrl = (functionName) => {
  return `${SUPABASE_URL}/functions/v1/${functionName}`;
};

// ============================================
// WEBHOOKS N8N
// ============================================

/**
 * URLs des webhooks N8N (depuis variables d'environnement)
 * @type {Object}
 */
export const N8N_WEBHOOKS = Object.freeze({
  // Webhook pour l'ingestion de documents standards
  INGEST_DOCUMENTS: import.meta.env.VITE_N8N_INGEST_WEBHOOK_URL || '',
  
  // Webhook pour le traitement des factures
  INGEST_INVOICES: import.meta.env.VITE_N8N_INVOICE_WEBHOOK_URL || '',
});

/**
 * Vérifie si un webhook N8N est configuré
 * @param {string} webhookKey - Clé du webhook
 * @returns {boolean}
 */
export const isWebhookConfigured = (webhookKey) => {
  return !!N8N_WEBHOOKS[webhookKey]?.trim();
};

// ============================================
// STORAGE BUCKETS
// ============================================

/**
 * Noms des buckets Supabase Storage
 * @type {Object}
 */
export const STORAGE_BUCKETS = Object.freeze({
  DOCUMENTS: 'documents',
  INVOICES: 'invoices',
  RECORDINGS: 'project-recordings',
  AVATARS: 'avatars',
});

// ============================================
// TABLES SUPABASE
// ============================================

/**
 * Noms des tables Supabase
 * @type {Object}
 */
export const TABLES = Object.freeze({
  PROFILES: 'profiles',
  ORGANIZATIONS: 'organizations',
  ORGANIZATION_MEMBERS: 'organization_members',
  DOCUMENTS: 'documents',
  MEETINGS: 'meetings',
  VERTICALS: 'verticals',
});

// ============================================
// RPC FUNCTIONS
// ============================================

/**
 * Noms des fonctions RPC Supabase
 * @type {Object}
 */
export const RPC_FUNCTIONS = Object.freeze({
  COMPLETE_ONBOARDING: 'complete_onboarding',
  CHECK_EMAIL_EXISTS: 'check_email_exists',
  GET_MY_PROFILE: 'get_my_profile',
  MATCH_DOCUMENTS: 'match_documents',
});

// ============================================
// PARAMÈTRES RAG
// ============================================

/**
 * Configuration par défaut pour les appels RAG
 * @type {Object}
 */
export const RAG_CONFIG = Object.freeze({
  // Seuil de similarité (0-1)
  DEFAULT_MATCH_THRESHOLD: 0.5,
  
  // Nombre de documents à retourner
  DEFAULT_MATCH_COUNT: 5,
  
  // Modèle d'embedding
  EMBEDDING_MODEL: 'text-embedding-3-small',
  
  // Dimensions des embeddings
  EMBEDDING_DIMENSIONS: 768,
  
  // Modèle de génération
  GENERATION_MODEL: 'gpt-4o-mini',
  
  // Température pour la génération
  GENERATION_TEMPERATURE: 0.3,
});

// ============================================
// PARAMÈTRES AUDIO
// ============================================

/**
 * Configuration pour le traitement audio
 * @type {Object}
 */
export const AUDIO_CONFIG = Object.freeze({
  // Modèle Whisper
  TRANSCRIPTION_MODEL: 'whisper-1',
  
  // Langue par défaut
  DEFAULT_LANGUAGE: 'fr',
  
  // Modèle pour l'analyse
  ANALYSIS_MODEL: 'gpt-4o',
});

// ============================================
// HEADERS HTTP
// ============================================

/**
 * Headers par défaut pour les appels API
 * @param {string} accessToken - Token d'accès (optionnel)
 * @returns {Object}
 */
export const getApiHeaders = (accessToken = null) => {
  const headers = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
  };
  
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  
  return headers;
};

// ============================================
// VALIDATION
// ============================================

/**
 * Vérifie que les variables d'environnement Supabase sont configurées
 * @throws {Error} Si les variables sont manquantes
 */
export const validateSupabaseConfig = () => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      '❌ Variables Supabase manquantes!\n' +
      'Assurez-vous de créer un fichier .env.local avec:\n' +
      '- VITE_SUPABASE_URL\n' +
      '- VITE_SUPABASE_ANON_KEY\n' +
      'Consultez .env.example pour plus de détails.'
    );
  }
};

// ============================================
// MODE DEMO
// ============================================

/**
 * Configuration du mode démo
 * @type {Object}
 */
export const DEMO_CONFIG = Object.freeze({
  // Mode démo activé
  ENABLED: import.meta.env.VITE_DEMO_MODE === 'true',
  
  // Délai simulé pour les réponses (ms)
  SIMULATED_DELAY: 1200,
});