/**
 * _shared/utils.ts - Baikal Edge Functions
 * ============================================================================
 * Utilitaires partagés entre toutes les Edge Functions.
 *
 * Contient:
 * - corsHeaders: Headers CORS standards
 * - Fonctions de réponse HTTP (errorResponse, successResponse, jsonResponse)
 * - Création de client Supabase
 * - Récupération et validation des variables d'environnement
 * - Génération d'embeddings OpenAI
 *
 * @version 1.0.0
 * ============================================================================
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

// ============================================================================
// CORS HEADERS
// ============================================================================

/**
 * Headers CORS standards pour toutes les Edge Functions
 */
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

/**
 * Headers pour les réponses SSE (Server-Sent Events)
 */
export const sseHeaders = {
  ...corsHeaders,
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  "Connection": "keep-alive",
}

// ============================================================================
// RESPONSE HELPERS
// ============================================================================

/**
 * Crée une réponse d'erreur JSON
 */
export function errorResponse(message: string, status: number = 400): Response {
  return new Response(
    JSON.stringify({ success: false, error: message }),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    }
  )
}

/**
 * Crée une réponse de succès JSON
 */
export function successResponse<T>(data: T, status: number = 200): Response {
  return new Response(
    JSON.stringify({ success: true, ...data }),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    }
  )
}

/**
 * Crée une réponse JSON générique
 */
export function jsonResponse<T>(data: T, status: number = 200): Response {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    }
  )
}

/**
 * Gère la requête OPTIONS pour CORS preflight
 */
export function handleCorsPreFlight(): Response {
  return new Response("ok", { headers: corsHeaders })
}

// ============================================================================
// ENVIRONMENT VARIABLES
// ============================================================================

/**
 * Configuration des variables d'environnement requises
 */
export interface EnvConfig {
  supabaseUrl: string
  supabaseServiceKey: string
  openaiApiKey?: string
  geminiApiKey?: string
}

/**
 * Récupère et valide les variables d'environnement essentielles
 * @throws {Error} Si une variable requise est manquante
 */
export function getEnvConfig(options: {
  requireOpenAI?: boolean
  requireGemini?: boolean
} = {}): EnvConfig {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

  if (!supabaseUrl) {
    throw new Error("Missing required environment variable: SUPABASE_URL")
  }
  if (!supabaseServiceKey) {
    throw new Error("Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY")
  }

  const config: EnvConfig = {
    supabaseUrl,
    supabaseServiceKey,
  }

  if (options.requireOpenAI) {
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY")
    if (!openaiApiKey) {
      throw new Error("Missing required environment variable: OPENAI_API_KEY")
    }
    config.openaiApiKey = openaiApiKey
  } else {
    config.openaiApiKey = Deno.env.get("OPENAI_API_KEY")
  }

  if (options.requireGemini) {
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY")
    if (!geminiApiKey) {
      throw new Error("Missing required environment variable: GEMINI_API_KEY")
    }
    config.geminiApiKey = geminiApiKey
  } else {
    config.geminiApiKey = Deno.env.get("GEMINI_API_KEY")
  }

  return config
}

// ============================================================================
// SUPABASE CLIENT
// ============================================================================

/**
 * Crée un client Supabase avec le service role key
 */
export function createSupabaseClient(
  url?: string,
  serviceKey?: string
): SupabaseClient {
  const supabaseUrl = url || Deno.env.get("SUPABASE_URL")
  const supabaseServiceKey = serviceKey || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase configuration")
  }

  return createClient(supabaseUrl, supabaseServiceKey)
}

// ============================================================================
// OPENAI HELPERS
// ============================================================================

const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small"

/**
 * Génère un embedding via l'API OpenAI
 */
export async function generateEmbedding(
  text: string,
  apiKey?: string,
  model: string = DEFAULT_EMBEDDING_MODEL
): Promise<number[]> {
  const openaiApiKey = apiKey || Deno.env.get("OPENAI_API_KEY")

  if (!openaiApiKey) {
    throw new Error("OpenAI API key not configured")
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: text.trim(),
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`Embedding error: ${JSON.stringify(error)}`)
  }

  const data = await response.json()
  return data.data[0].embedding
}

// ============================================================================
// LOGGING HELPERS
// ============================================================================

/**
 * Préfixe de log pour une fonction
 */
export function createLogger(functionName: string) {
  return {
    info: (message: string, ...args: unknown[]) => {
      console.log(`[${functionName}] ${message}`, ...args)
    },
    warn: (message: string, ...args: unknown[]) => {
      console.warn(`[${functionName}] ${message}`, ...args)
    },
    error: (message: string, ...args: unknown[]) => {
      console.error(`[${functionName}] ${message}`, ...args)
    },
    debug: (message: string, ...args: unknown[]) => {
      console.log(`[${functionName}] [DEBUG] ${message}`, ...args)
    },
  }
}

// ============================================================================
// SSE HELPERS
// ============================================================================

/**
 * Envoie un événement SSE
 */
export function sendSSE(
  controller: ReadableStreamDefaultController,
  event: string,
  data: unknown
): void {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  controller.enqueue(new TextEncoder().encode(message))
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Extrait le message d'erreur de manière sûre
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return 'Unknown error'
}

/**
 * Wrapper try-catch pour les handlers async
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  functionName: string
): Promise<Response> {
  try {
    const result = await fn()
    return successResponse(result as Record<string, unknown>)
  } catch (error) {
    console.error(`[${functionName}] Error:`, error)
    return errorResponse(getErrorMessage(error), 500)
  }
}
