/**
 * Configuration API - Baikal Console
 * ============================================================================
 * Configuration Supabase, endpoints et paramètres API.
 * Version: 2.0.0 - Nettoyé (RAG_BRAIN supprimé, dette technique)
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
  PROCESS_AUDIO: 'process-audio',
  INGEST_DOCUMENTS: 'ingest-documents',
  TRIGGER_LEGIFRANCE_SYNC: 'trigger-legifrance-sync',
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
  return !!N8N_WEBHOOKS[webhookKey];
};

// ============================================
// TIMEOUTS ET LIMITES
// ============================================

/**
 * Configuration des timeouts (en ms)
 * @type {Object}
 */
export const TIMEOUTS = Object.freeze({
  DEFAULT: 30000,
  UPLOAD: 120000,
  PROCESSING: 300000,
});

/**
 * Limites de taille de fichier (en bytes)
 * @type {Object}
 */
export const FILE_LIMITS = Object.freeze({
  MAX_DOCUMENT_SIZE: 20 * 1024 * 1024, // 20 MB
  MAX_AUDIO_SIZE: 100 * 1024 * 1024,   // 100 MB
  MAX_IMAGE_SIZE: 5 * 1024 * 1024,     // 5 MB
});
