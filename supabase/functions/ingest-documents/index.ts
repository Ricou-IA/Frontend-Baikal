// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  INGEST-DOCUMENTS - Edge Function Supabase                                   ║
// ║  Version: 4.0.0 - Support rag.document_tables                                ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  Changements v4.0.0:                                                         ║
// ║  - Support double destination via _DESTINATION                               ║
// ║  - rag.documents : chunks texte + tableaux (avec embedding)                  ║
// ║  - rag.document_tables : tableaux bruts (sans embedding)                     ║
// ║  - Propagation source_file_id                                                ║
// ║  - Support layer, status, quality_level                                      ║
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
    
    // ════════════════════════════════════════════════════════════════════════════
    // SÉPARATION PAR DESTINATION
    // ════════════════════════════════════════════════════════════════════════════
    
    const docsForRagDocuments: any[] = []
    const docsForRagTables: any[] = []
    const errors: any[] = []

    for (const doc of documents) {
      const destination = doc._DESTINATION || 'rag.documents'
      
      if (destination === 'rag.document_tables') {
        // ──────────────────────────────────────────────────────────────────────
        // Destination: rag.document_tables (tableaux bruts, sans embedding)
        // ──────────────────────────────────────────────────────────────────────
        if (!doc.content_markdown || doc.content_markdown.trim().length < 10) {
          errors.push({ error: 'content_markdown manquant ou trop court', doc })
          continue
        }
        
        docsForRagTables.push({
          source_file_id: parseUUID(doc.source_file_id),
          content_markdown: doc.content_markdown.trim(),
          content_json: doc.content_json || null,
          document_title: doc.document_title || null,
          section_title: doc.section_title || null,
          preceding_text: doc.preceding_text || null,
          table_index: doc.table_index ?? 0,
          row_count: doc.row_count || 0,
          column_count: doc.column_count || 0,
          headers: doc.headers || [],
          org_id: parseUUID(doc.org_id),
          created_by: parseUUID(doc.created_by),
        })
        
      } else {
        // ──────────────────────────────────────────────────────────────────────
        // Destination: rag.documents (chunks avec embedding)
        // ──────────────────────────────────────────────────────────────────────
        const content = doc.pageContent || doc.content
        
        if (!content || content.trim().length < 30) {
          errors.push({ error: 'Contenu trop court', filename: doc.metadata?.filename })
          continue
        }

        // Enrichissement depuis le profil Supabase
        let orgId = parseUUID(doc.org_id) || parseUUID(doc.metadata?.org_id)
        let targetApps = normalizeArray(doc.target_apps || doc.metadata?.target_apps || [])
        const userId = parseUUID(doc.created_by) || parseUUID(doc.metadata?.user_id)
        
        // Si on a un user_id mais pas org_id ou target_apps, on enrichit depuis le profil
        if (userId && (!orgId || targetApps.length === 0)) {
          const { data: profile, error: profileError } = await supabase
            .schema('core')
            .from('profiles')
            .select('org_id, app_id, app_role')
            .eq('id', userId)
            .single()
          
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
        
        if (targetApps.length === 0) {
          targetApps = ['default']
        }

        const targetProjects = normalizeUUIDArray(doc.target_projects || doc.metadata?.target_projects)

        docsForRagDocuments.push({
          content: content.trim(),
          target_apps: targetApps,
          target_projects: targetProjects,
          org_id: orgId,
          created_by: userId,
          layer: doc.layer || null,
          status: doc.status || null,
          quality_level: doc.quality_level || null,
          metadata: {
            ...doc.metadata,
            source_file_id: doc.source_file_id || doc.metadata?.source_file_id || null,
          },
        })
      }
    }

    // ════════════════════════════════════════════════════════════════════════════
    // INSERTION rag.documents (avec embedding)
    // ════════════════════════════════════════════════════════════════════════════
    
    let insertedDocs: any[] = []
    
    if (docsForRagDocuments.length > 0) {
      const texts = docsForRagDocuments.map(d => d.content)
      const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: texts,
        }),
      })

      if (!embeddingResponse.ok) {
        const errorData = await embeddingResponse.json()
        throw new Error(`OpenAI API error: ${JSON.stringify(errorData)}`)
      }

      const embeddingData = await embeddingResponse.json()
      const embeddings = embeddingData.data.map((d: any) => d.embedding)

      const rowsToInsert = docsForRagDocuments.map((doc, idx) => ({
        content: doc.content,
        embedding: embeddings[idx],
        target_apps: doc.target_apps,
        target_projects: doc.target_projects,
        org_id: doc.org_id,
        created_by: doc.created_by,
        layer: doc.layer,
        status: doc.status,
        quality_level: doc.quality_level,
        metadata: doc.metadata,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }))

      const { data, error } = await supabase
        .schema('rag')
        .from('documents')
        .insert(rowsToInsert)
        .select('id')

      if (error) {
        throw new Error(`Supabase insert rag.documents error: ${error.message}`)
      }
      
      insertedDocs = data || []
      console.log(`[ingest-documents] rag.documents: ${insertedDocs.length} insérés`)
    }

    // ════════════════════════════════════════════════════════════════════════════
    // INSERTION rag.document_tables (sans embedding)
    // ════════════════════════════════════════════════════════════════════════════
    
    let insertedTables: any[] = []
    
    if (docsForRagTables.length > 0) {
      const tablesToInsert = docsForRagTables.map(doc => ({
        source_file_id: doc.source_file_id,
        content_markdown: doc.content_markdown,
        content_json: doc.content_json,
        document_title: doc.document_title,
        section_title: doc.section_title,
        preceding_text: doc.preceding_text,
        table_index: doc.table_index,
        row_count: doc.row_count,
        column_count: doc.column_count,
        headers: doc.headers,
        org_id: doc.org_id,
        created_by: doc.created_by,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }))

      const { data, error } = await supabase
        .schema('rag')
        .from('document_tables')
        .insert(tablesToInsert)
        .select('id')

      if (error) {
        throw new Error(`Supabase insert rag.document_tables error: ${error.message}`)
      }
      
      insertedTables = data || []
      console.log(`[ingest-documents] rag.document_tables: ${insertedTables.length} insérés`)
    }

    // ════════════════════════════════════════════════════════════════════════════
    // RÉPONSE
    // ════════════════════════════════════════════════════════════════════════════

    const totalInserted = insertedDocs.length + insertedTables.length
    
    if (totalInserted === 0 && errors.length > 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Aucun document valide', errors }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        inserted: {
          total: totalInserted,
          rag_documents: insertedDocs.length,
          rag_document_tables: insertedTables.length,
        },
        ids: {
          documents: insertedDocs.map((d: any) => d.id),
          tables: insertedTables.map((d: any) => d.id),
        },
        failed: errors.length,
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

// ════════════════════════════════════════════════════════════════════════════════
// UTILS
// ════════════════════════════════════════════════════════════════════════════════

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
