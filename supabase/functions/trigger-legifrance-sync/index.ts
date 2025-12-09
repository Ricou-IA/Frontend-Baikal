// ============================================================================
// Edge Function : trigger-legifrance-sync
// Proxy sécurisé pour déclencher le workflow n8n Légifrance
// Version: 2.0.0 - Migration schémas
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Configuration
const N8N_WEBHOOK_URL = Deno.env.get('N8N_LEGIFRANCE_WEBHOOK_URL') || 'https://n8n.srv1102213.hstgr.cloud/webhook/legifrance-sync'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Headers CORS
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  // Gérer les requêtes CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Vérifier que c'est une requête POST
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    console.log('[trigger-legifrance-sync] v2.0.0 - Migration Schemas')

    // 1. Vérifier l'authentification
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      console.error('[trigger-legifrance-sync] No authorization header')
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Créer le client Supabase avec le token de l'utilisateur
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    
    // Extraire le token JWT
    const token = authHeader.replace('Bearer ', '')
    
    // Vérifier le token et récupérer l'utilisateur
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      console.error('[trigger-legifrance-sync] Auth error:', authError)
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('[trigger-legifrance-sync] User authenticated:', user.email)

    // 3. Vérifier que l'utilisateur est super_admin
    // MIGRATION: profiles → core.profiles
    const { data: profile, error: profileError } = await supabase
      .schema('core')
      .from('profiles')
      .select('app_role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      console.error('[trigger-legifrance-sync] Profile error:', profileError)
      return new Response(
        JSON.stringify({ error: 'Profile not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (profile.app_role !== 'super_admin') {
      console.error('[trigger-legifrance-sync] Access denied for role:', profile.app_role)
      return new Response(
        JSON.stringify({ error: 'Access denied. Super admin role required.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('[trigger-legifrance-sync] User is super_admin, proceeding...')

    // 4. Récupérer le payload
    const payload = await req.json()
    
    // Valider le payload
    if (!payload.code_id) {
      return new Response(
        JSON.stringify({ error: 'code_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Ajouter l'ID de l'utilisateur si non fourni
    if (!payload.triggered_by) {
      payload.triggered_by = user.id
    }

    console.log('[trigger-legifrance-sync] Payload:', JSON.stringify(payload))

    // 5. Appeler le webhook n8n
    const n8nResponse = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    })

    // 6. Gérer la réponse de n8n
    if (!n8nResponse.ok) {
      const errorText = await n8nResponse.text()
      console.error('[trigger-legifrance-sync] n8n error:', n8nResponse.status, errorText)
      return new Response(
        JSON.stringify({ 
          error: 'Webhook failed', 
          status: n8nResponse.status,
          details: errorText 
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Essayer de parser la réponse JSON
    let result
    try {
      result = await n8nResponse.json()
    } catch {
      // Si ce n'est pas du JSON, retourner un succès simple
      result = { success: true, message: 'Sync triggered successfully' }
    }

    console.log('[trigger-legifrance-sync] Success:', JSON.stringify(result))

    // 7. Retourner la réponse
    return new Response(
      JSON.stringify({
        success: true,
        ...result
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('[trigger-legifrance-sync] Unexpected error:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        message: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
