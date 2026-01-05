// ============================================================================
// BAIKAL - Edge Function : trigger-ingestion
// Version: 1.5.0
// Date: 2026-01-04
// Description: Reçoit les appels de pg_net et envoie les fichiers à N8N
// NOUVEAU: Appelle la RPC complete_ingestion_job si N8N retourne success
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

// ============================================================================
// CONFIGURATION
// ============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// URL du webhook N8N pour l'ingestion
const N8N_INGEST_URL = Deno.env.get('N8N_INGEST_URL') || 'https://n8n.srv1102213.hstgr.cloud/webhook/ingest'

// Secret optionnel pour l'authentification
const N8N_WEBHOOK_SECRET = Deno.env.get('N8N_WEBHOOK_SECRET') || null

// Headers CORS
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ============================================================================
// INTERFACES
// ============================================================================

interface TriggerPayload {
  queue_id: string
  file_id: string
  filename: string
  storage_bucket: string
  storage_path: string
  mime_type: string
  layer: 'app' | 'org' | 'project' | 'user'
  org_id: string | null
  project_id: string | null
  created_by: string
  app_id: string
  metadata: Record<string, unknown> | null
}

// Payload format Baikal Console (pour FLUX 1 N8N)
interface N8NPayload {
  // Identifiants
  user_id: string
  org_id: string | null
  source_file_id: string

  // Fichier
  filename: string
  path: string
  storage_bucket: string

  // Layer à la racine
  layer: string

  // Ciblage RAG
  target_apps: string[] | null
  target_projects: string[] | null

  // V2 (optionnel)
  document_title: string | null
  category_slug: string | null
  filename_clean: string | null

  // Metadata enrichie
  metadata: {
    source_file_id: string
    mime_type: string
    file_size?: number
    layer: string
    quality_level: string
    document_title?: string | null
    category_slug?: string | null
    filename_clean?: string | null
    queue_id: string
    triggered_at: string
    [key: string]: unknown
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Génère un filename_clean depuis le titre ou le filename
 */
function generateFilenameClean(title: string | null, originalFilename: string): string {
  const source = title || originalFilename
  const ext = originalFilename.split('.').pop()?.toLowerCase() || ''
  
  const slug = source
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 100)
  
  return ext ? `${slug}.${ext}` : slug
}

/**
 * Met à jour le statut dans la queue (pour les cas intermédiaires ou erreurs)
 */
async function updateQueueStatus(
  supabase: ReturnType<typeof createClient>,
  queueId: string,
  status: 'sent' | 'failed',
  errorMessage?: string,
  n8nResponse?: Record<string, unknown>
): Promise<void> {
  const updateData: Record<string, unknown> = {
    status,
    last_attempt_at: new Date().toISOString(),
  }
  
  if (errorMessage) {
    updateData.error_message = errorMessage
  }
  
  if (n8nResponse) {
    updateData.n8n_response = n8nResponse
  }
  
  if (status === 'failed') {
    const { data: queue } = await supabase
      .schema('sources')
      .from('ingestion_queue')
      .select('attempts, max_attempts')
      .eq('id', queueId)
      .single()
    
    if (queue && queue.attempts < queue.max_attempts) {
      const delayMinutes = Math.pow(5, queue.attempts)
      const nextRetry = new Date(Date.now() + delayMinutes * 60 * 1000)
      updateData.next_retry_at = nextRetry.toISOString()
    }
  }
  
  await supabase
    .schema('sources')
    .from('ingestion_queue')
    .update(updateData)
    .eq('id', queueId)
}

/**
 * Met à jour le statut du fichier
 */
async function updateFileStatus(
  supabase: ReturnType<typeof createClient>,
  fileId: string,
  status: 'processing' | 'error',
  errorMessage?: string
): Promise<void> {
  const updateData: Record<string, unknown> = {
    processing_status: status,
    updated_at: new Date().toISOString(),
  }
  
  if (errorMessage) {
    updateData.processing_error = errorMessage
  }
  
  await supabase
    .schema('sources')
    .from('files')
    .update(updateData)
    .eq('id', fileId)
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  
  // Vérifier la méthode
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  
  console.log(`[trigger-ingestion] Starting - N8N URL: ${N8N_INGEST_URL}`)
  
  // Créer le client Supabase avec service role
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  })
  
  let payload: TriggerPayload
  
  try {
    payload = await req.json()
    console.log(`[trigger-ingestion] Received: ${payload.filename} (queue: ${payload.queue_id})`)
  } catch (error) {
    console.error('[trigger-ingestion] Invalid JSON:', error)
    return new Response(
      JSON.stringify({ error: 'Invalid JSON payload' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  
  // Valider le payload
  if (!payload.file_id || !payload.queue_id) {
    return new Response(
      JSON.stringify({ error: 'Missing file_id or queue_id' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  
  try {
    // Extraire les champs V2 depuis metadata si présents
    const documentTitle = (payload.metadata?.document_title as string) || 
                          (payload.metadata?.title as string) || 
                          null
    const categorySlug = (payload.metadata?.category_slug as string) || 
                         (payload.metadata?.category as string) || 
                         null
    const filenameClean = (payload.metadata?.filename_clean as string) || 
                          generateFilenameClean(documentTitle, payload.filename)
    
    // Construire target_projects depuis project_id ou metadata
    const targetProjects = payload.project_id 
      ? [payload.project_id] 
      : (payload.metadata?.target_project_ids as string[]) || null
    
    // =========================================================================
    // PAYLOAD FORMAT BAIKAL CONSOLE (pour FLUX 1 N8N)
    // =========================================================================
    const n8nPayload: N8NPayload = {
      // Identifiants
      user_id: payload.created_by,
      org_id: payload.org_id,
      source_file_id: payload.file_id,

      // Fichier
      filename: payload.filename,
      path: payload.storage_path,
      storage_bucket: payload.storage_bucket,

      // Layer à la racine
      layer: payload.layer,

      // Ciblage RAG
      target_apps: payload.app_id ? [payload.app_id] : null,
      target_projects: targetProjects,

      // V2
      document_title: documentTitle,
      category_slug: categorySlug,
      filename_clean: filenameClean,

      // Metadata enrichie (format Baikal Console)
      metadata: {
        ...(payload.metadata || {}),
        source_file_id: payload.file_id,
        mime_type: payload.mime_type,
        layer: payload.layer,
        quality_level: (payload.metadata?.quality_level as string) || 'standard',
        document_title: documentTitle,
        category_slug: categorySlug,
        filename_clean: filenameClean,
        queue_id: payload.queue_id,
        triggered_at: new Date().toISOString(),
      }
    }
    
    console.log(`[trigger-ingestion] Payload for N8N:`, JSON.stringify(n8nPayload, null, 2))
    
    // Construire les headers pour N8N
    const n8nHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    
    if (N8N_WEBHOOK_SECRET) {
      n8nHeaders['X-Baikal-Secret'] = N8N_WEBHOOK_SECRET
      console.log('[trigger-ingestion] Using webhook secret')
    }
    
    // Appeler le webhook N8N
    const n8nResponse = await fetch(N8N_INGEST_URL, {
      method: 'POST',
      headers: n8nHeaders,
      body: JSON.stringify(n8nPayload)
    })
    
    console.log(`[trigger-ingestion] N8N response status: ${n8nResponse.status}`)
    
    const n8nData = await n8nResponse.json().catch(() => ({}))
    
    if (!n8nResponse.ok) {
      throw new Error(`N8N responded with ${n8nResponse.status}: ${JSON.stringify(n8nData)}`)
    }
    
    console.log(`[trigger-ingestion] N8N accepted file: ${payload.file_id}`)
    
    // =========================================================================
    // NOUVEAU v1.5: Callback automatique si N8N retourne success
    // =========================================================================
    if (n8nData.success === true) {
        const chunksCount = n8nData.total_chunks || n8nData.inserted?.rag_documents || 0
      
      console.log(`[trigger-ingestion] N8N success - calling complete_ingestion_job (${chunksCount} chunks)`)
      
      // Appeler la RPC pour marquer comme completed (atomique)
      const { error: rpcError } = await supabase.rpc('complete_ingestion_job', {
        p_file_id: payload.file_id,
        p_success: true,
        p_error_message: null,
        p_chunks_count: chunksCount
      })
      
      if (rpcError) {
        console.error(`[trigger-ingestion] RPC error: ${rpcError.message}`)
        // Fallback: marquer comme sent avec la réponse N8N
        await updateQueueStatus(supabase, payload.queue_id, 'sent', undefined, n8nData)
        await updateFileStatus(supabase, payload.file_id, 'processing')
      } else {
        console.log(`[trigger-ingestion] ✅ Marked as completed: ${chunksCount} chunks`)
      }
      
    } else if (n8nData.success === false) {
      // N8N a retourné une erreur explicite
      const errorMsg = n8nData.error || n8nData.message || 'N8N processing failed'
      console.error(`[trigger-ingestion] N8N returned error: ${errorMsg}`)
      
      // Appeler la RPC pour marquer comme failed
      const { error: rpcError } = await supabase.rpc('complete_ingestion_job', {
        p_file_id: payload.file_id,
        p_success: false,
        p_error_message: errorMsg,
        p_chunks_count: 0
      })
      
      if (rpcError) {
        console.error(`[trigger-ingestion] RPC error: ${rpcError.message}`)
        await updateQueueStatus(supabase, payload.queue_id, 'failed', errorMsg, n8nData)
        await updateFileStatus(supabase, payload.file_id, 'error', errorMsg)
      }
      
    } else {
      // Réponse N8N sans champ success explicite - marquer comme sent
      console.log(`[trigger-ingestion] N8N response without success field - marking as sent`)
      await updateQueueStatus(supabase, payload.queue_id, 'sent', undefined, n8nData)
      await updateFileStatus(supabase, payload.file_id, 'processing')
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        message: n8nData.success === true ? 'Completed' : 'Sent to N8N',
        file_id: payload.file_id,
        chunks_count: n8nData.inserted?.rag_documents || n8nData.total_chunks || 0
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[trigger-ingestion] Error: ${errorMessage}`)
    
    // Mettre à jour la queue (échec)
    await updateQueueStatus(supabase, payload.queue_id, 'failed', errorMessage)
    
    // Mettre à jour le fichier (erreur)
    await updateFileStatus(supabase, payload.file_id, 'error', errorMessage)
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        file_id: payload.file_id
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
