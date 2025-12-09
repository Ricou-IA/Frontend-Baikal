// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  INGEST-DOCUMENTS - Edge Function Supabase                                   ║
// ║  Version: 3.0.0 - Migration schémas (core, config, rag)                      ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  Changements v3.0.0:                                                         ║
// ║  - profiles → core.profiles                                                  ║
// ║  - documents → rag.documents                                                 ║
// ║  - vertical_id → app_id                                                      ║
// ║  - target_verticals → target_apps                                            ║
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
      // MIGRATION: target_verticals → target_apps
      let targetApps = normalizeArray(doc.target_apps || doc.target_verticals || doc.metadata?.target_apps || doc.metadata?.target_verticals || [])
      const userId = parseUUID(doc.created_by) || parseUUID(doc.metadata?.user_id)
      
      // Si on a un user_id mais pas org_id ou target_apps, on enrichit depuis le profil
      if (userId && (!orgId || targetApps.length === 0)) {
        // MIGRATION: profiles → core.profiles
        const { data: profile, error: profileError } = await supabase
          .schema('core')
          .from('profiles')
          .select('org_id, app_id, app_role')
          .eq('id', userId)
          .single()
        
        if (profile && !profileError) {
          // Récupère org_id depuis le profil si non fourni
          if (!orgId) {
            orgId = profile.org_id
          }
          
          // MIGRATION: Récupère app_id depuis le profil si non fourni (anciennement vertical_id)
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

      // MIGRATION: target_verticals → target_apps
      validDocs.push({
        content: content.trim(),
        target_apps: targetApps,
        target_projects: targetProjects,
        org_id: orgId,
        created_by: userId,
        metadata: doc.metadata || {},
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

    // INSERTION BATCH
    // MIGRATION: target_verticals → target_apps
    const rowsToInsert = validDocs.map((doc, idx) => ({
      content: doc.content,
      embedding: embeddings[idx],
      target_apps: doc.target_apps,
      target_projects: doc.target_projects,
      org_id: doc.org_id,
      created_by: doc.created_by,
      metadata: doc.metadata,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }))

    // MIGRATION: documents → rag.documents
    const { data, error } = await supabase
      .schema('rag')
      .from('documents')
      .insert(rowsToInsert)
      .select('id')

    if (error) {
      throw new Error(`Supabase insert error: ${error.message}`)
    }

    return new Response(
      JSON.stringify({
        success: true,
        inserted: data.length,
        failed: errors.length,
        ids: data.map((d: any) => d.id),
        errors: errors.length > 0 ? errors : undefined,
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
