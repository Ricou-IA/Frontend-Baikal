// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  INGEST-DOCUMENTS - Edge Function Supabase                                   ║
// ║  Version: 3.2.0 - Utilisation RPC pour schémas rag/core                      ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  Changements v3.2.0:                                                         ║
// ║  - Utilise rpc_insert_rag_document() au lieu de .schema('rag')               ║
// ║  - Utilise rpc_get_profile() au lieu de .schema('core')                      ║
// ║  - Contourne la limitation PostgREST sur les schémas exposés                 ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY manquant')
    if (!SUPABASE_URL) throw new Error('SUPABASE_URL manquant')
    if (!SUPABASE_SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY manquant')

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const payload = await req.json()
    const documents = Array.isArray(payload) ? payload : [payload]
    
    const validDocs: any[] = []
    const errors: any[] = []

    for (const doc of documents) {
      const content = doc.pageContent || doc.content
      
      if (!content || content.trim().length < 30) {
        errors.push({ error: 'Contenu trop court', filename: doc.metadata?.filename })
        continue
      }

      // ============================================
      // ENRICHISSEMENT DEPUIS LE PROFIL SUPABASE
      // ============================================
      let orgId = parseUUID(doc.org_id) || parseUUID(doc.metadata?.org_id)
      let targetApps = normalizeArray(doc.target_apps || doc.target_verticals || doc.metadata?.target_apps || doc.metadata?.target_verticals || [])
      const userId = parseUUID(doc.created_by) || parseUUID(doc.metadata?.user_id)
      
      // Extraction layer, status, quality_level depuis payload
      const layer = doc.layer || doc.metadata?.layer || 'project'
      const status = doc.status || doc.metadata?.status || 'approved'
      const qualityLevel = doc.quality_level || doc.metadata?.quality_level || 'premium'
      
      // Si on a un user_id mais pas org_id ou target_apps, on enrichit depuis le profil
      if (userId && (!orgId || targetApps.length === 0)) {
        // UTILISE RPC au lieu de .schema('core')
        const { data: profiles, error: profileError } = await supabase
          .rpc('rpc_get_profile', { p_user_id: userId })
        
        const profile = profiles?.[0]
        
        if (profile && !profileError) {
          if (!orgId) {
            orgId = profile.org_id
          }
          
          if (targetApps.length === 0) {
            if (profile.app_role === 'super_admin') {
              targetApps = ['all']
            } else if (profile.app_id) {
              targetApps = [profile.app_id]
            } else {
              targetApps = ['default']
            }
          }
        }
      }
      
      // Fallback si toujours vide
      if (targetApps.length === 0) {
        targetApps = ['default']
      }

      const targetProjects = normalizeUUIDArray(doc.target_projects || doc.metadata?.target_projects)

      validDocs.push({
        content: content.trim(),
        target_apps: targetApps,
        target_projects: targetProjects.length > 0 ? targetProjects : null,
        org_id: orgId,
        created_by: userId,
        metadata: doc.metadata || {},
        layer,
        status,
        quality_level: qualityLevel,
      })
    }

    if (validDocs.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Aucun document valide', errors }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // BATCH EMBEDDING
    const texts = validDocs.map(d => d.content)
    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-ada-002',
        input: texts,
      }),
    })

    if (!embeddingResponse.ok) {
      const errorData = await embeddingResponse.json()
      throw new Error(`OpenAI API error: ${JSON.stringify(errorData)}`)
    }

    const embeddingData = await embeddingResponse.json()
    const embeddings = embeddingData.data.map((d: any) => d.embedding)

    // INSERTION VIA RPC (contourne la limitation PostgREST)
    const insertedIds: string[] = []
    const insertErrors: any[] = []

    for (let idx = 0; idx < validDocs.length; idx++) {
      const doc = validDocs[idx]
      const embedding = embeddings[idx]

      const { data: docId, error: insertError } = await supabase.rpc('rpc_insert_rag_document', {
        p_content: doc.content,
        p_embedding: embedding,
        p_target_apps: doc.target_apps,
        p_target_projects: doc.target_projects,
        p_org_id: doc.org_id,
        p_created_by: doc.created_by,
        p_metadata: doc.metadata,
        p_layer: doc.layer,
        p_status: doc.status,
        p_quality_level: doc.quality_level,
      })

      if (insertError) {
        console.error(`Erreur insertion doc ${idx}:`, insertError.message)
        insertErrors.push({ index: idx, error: insertError.message })
      } else if (docId) {
        insertedIds.push(docId)
      }
    }

    return new Response(
      JSON.stringify({
        success: insertErrors.length === 0,
        inserted: insertedIds.length,
        failed: errors.length + insertErrors.length,
        ids: insertedIds,
        errors: [...errors, ...insertErrors].length > 0 ? [...errors, ...insertErrors] : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    console.error('ERREUR:', error.message)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

// ============================================
// UTILS
// ============================================
function isValidUUID(str: any): boolean {
  if (typeof str !== 'string') return false
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(str)
}

function parseUUID(value: any): string | null {
  return isValidUUID(value) ? value : null
}

function normalizeArray(value: any): string[] {
  if (Array.isArray(value)) return value.filter(v => v && typeof v === 'string')
  if (typeof value === 'string' && value) return [value]
  return []
}

function normalizeUUIDArray(value: any): string[] {
  if (Array.isArray(value)) return value.filter(v => isValidUUID(v))
  if (isValidUUID(value)) return [value]
  return []
}
