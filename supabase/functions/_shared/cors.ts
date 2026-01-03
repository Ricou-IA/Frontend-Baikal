/**
 * _shared/cors.ts - Baikal Edge Functions
 * ============================================================================
 * Headers CORS partagés entre toutes les Edge Functions.
 * Utiliser ces headers pour garantir la cohérence des réponses CORS.
 *
 * @version 2.0.0
 * ============================================================================
 */

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Headers pour les réponses SSE (Server-Sent Events)
 */
export const sseHeaders = {
  ...corsHeaders,
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
}

/**
 * Gère la requête OPTIONS pour CORS preflight
 */
export function handleCorsPreFlight(): Response {
  return new Response('ok', { headers: corsHeaders })
}
