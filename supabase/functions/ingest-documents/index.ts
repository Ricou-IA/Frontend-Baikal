// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  INGEST-DOCUMENTS - Edge Function Supabase                                   ║
// ║  Version: 5.0.3 - Fix source_file_id au niveau racine                        ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  Changements v5.0.3:                                                         ║
// ║  - Fix: source_file_id ajouté au niveau racine de l'insertion                ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  Changements v5.0.2:                                                         ║
// ║  - Fix: Parse metadata si c'est une string JSON                              ║
// ║  - Debug amélioré pour diagnostic                                            ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  Changements v5.0.0:                                                         ║
// ║  - Lecture metadata.concepts[] pour chaque chunk                             ║
// ║  - INSERT rag.document_concepts après insertion documents                    ║
// ║  - Résolution concept_id depuis config.concepts (par slug)                   ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  Destinations supportées:                                                    ║
// ║  - 'rag.documents' (défaut) : chunks texte avec embedding                    ║
// ║  - 'rag.document_tables'    : tableaux bruts sans embedding                  ║
// ║  - 'table_chunk'            : DOUBLE insertion (documents + tables)          ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ════════════════════════════════════════════════════════════════════════════════
// HELPER: Parse metadata (peut être string ou object)
// ════════════════════════════════════════════════════════════════════════════════
function parseMetadata(metadata: any): Record<string, any> {
  if (!metadata) return {}
  if (typeof metadata === 'object') return metadata
  if (typeof metadata === 'string') {
    try {
      return JSON.parse(metadata)
    } catch (e) {
      console.log('[DEBUG] metadata parse error:', e.message)
      return {}
    }
  }
  return {}
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
    
    console.log(`[ingest-documents] Reçu ${documents.length} document(s)`)
    
    // ════════════════════════════════════════════════════════════════════════════
    // SÉPARATION PAR DESTINATION
    // ════════════════════════════════════════════════════════════════════════════
    
    const docsForRagDocuments: any[] = []
    const docsForRagTables: any[] = []
    const errors: any[] = []
    
    // v5.0.0 : Stocker les concepts par index pour insertion ultérieure
    const conceptsByDocIndex: Map<number, string[]> = new Map()

    for (const doc of documents) {
      // DEBUG v5.0.2
      console.log(`[DEBUG] doc keys: ${Object.keys(doc).join(', ')}`)
      console.log(`[DEBUG] doc.metadata type: ${typeof doc.metadata}`)
      console.log(`[DEBUG] doc.source_file_id: ${doc.source_file_id}`)
      
      const destination = doc._DESTINATION || 'rag.documents'
      
      // v5.0.2: Parser metadata si c'est une string
      const metadata = parseMetadata(doc.metadata)
      console.log(`[DEBUG] parsed metadata keys: ${Object.keys(metadata).join(', ')}`)
      console.log(`[DEBUG] metadata.concepts: ${JSON.stringify(metadata.concepts)}`)
      
      // ════════════════════════════════════════════════════════════════════════
      // CAS 1: table_chunk → Double insertion
      // ════════════════════════════════════════════════════════════════════════
      
      if (destination === 'table_chunk') {
        
        if (!doc.content || doc.content.trim().length < 10) {
          errors.push({ error: 'content manquant pour table_chunk', doc: doc.document_title })
          continue
        }
        if (!doc.content_markdown || doc.content_markdown.trim().length < 10) {
          errors.push({ error: 'content_markdown manquant pour table_chunk', doc: doc.document_title })
          continue
        }
        
        let orgId = parseUUID(doc.org_id)
        let targetApps = normalizeArray(doc.target_apps || [])
        const userId = parseUUID(doc.created_by)
        const sourceFileId = parseUUID(doc.source_file_id)
        
        if (userId && (!orgId || targetApps.length === 0)) {
          const { data: profile, error: profileError } = await supabase
            .schema('core')
            .from('profiles')
            .select('org_id, app_id, app_role')
            .eq('id', userId)
            .single()
          
          if (profile && !profileError) {
            if (!orgId) orgId = profile.org_id
            if (targetApps.length === 0) {
              targetApps = profile.app_role === 'super_admin' 
                ? ['all'] 
                : profile.app_id ? [profile.app_id] : ['default']
            }
          }
        }
        
        if (targetApps.length === 0) targetApps = ['default']
        
        const targetProjects = normalizeUUIDArray(doc.target_projects)
        
        // v5.0.2 : Extraire les concepts depuis metadata parsé
        const concepts = normalizeArray(metadata.concepts || [])
        console.log(`[DEBUG] table_chunk concepts: ${JSON.stringify(concepts)}`)
        
        const docIndex = docsForRagDocuments.length
        if (concepts.length > 0) {
          conceptsByDocIndex.set(docIndex, concepts)
        }
        
        docsForRagDocuments.push({
          content: doc.content.trim(),
          target_apps: targetApps,
          target_projects: targetProjects,
          org_id: orgId,
          created_by: userId,
          source_file_id: sourceFileId,
          layer: doc.layer || null,
          status: doc.status || null,
          quality_level: doc.quality_level || null,
          metadata: {
            source_file_id: sourceFileId,
            content_type: 'table_chunk',
            document_title: doc.document_title || null,
            section_title: doc.section_title || null,
            table_index: doc.table_index ?? 0,
            row_count: doc.row_count || 0,
            column_count: doc.column_count || 0,
            concepts: concepts,
          },
        })
        
        docsForRagTables.push({
          source_file_id: sourceFileId,
          content_markdown: doc.content_markdown.trim(),
          content_json: doc.content_json || null,
          document_title: doc.document_title || null,
          section_title: doc.section_title || null,
          preceding_text: doc.preceding_text || null,
          table_index: doc.table_index ?? 0,
          row_count: doc.row_count || 0,
          column_count: doc.column_count || 0,
          headers: doc.headers || [],
          org_id: orgId,
          created_by: userId,
        })
        
        continue
      }
      
      // ════════════════════════════════════════════════════════════════════════
      // CAS 2: rag.document_tables (tableaux bruts, sans embedding)
      // ════════════════════════════════════════════════════════════════════════
      
      if (destination === 'rag.document_tables') {
        
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
        
        continue
      }
      
      // ════════════════════════════════════════════════════════════════════════
      // CAS 3: rag.documents (défaut - chunks texte avec embedding)
      // ════════════════════════════════════════════════════════════════════════
      
      const content = doc.pageContent || doc.content
      
      if (!content || content.trim().length < 30) {
        errors.push({ error: 'Contenu trop court', filename: metadata.filename })
        continue
      }

      let orgId = parseUUID(doc.org_id) || parseUUID(metadata.org_id)
      let targetApps = normalizeArray(doc.target_apps || metadata.target_apps || [])
      const userId = parseUUID(doc.created_by) || parseUUID(metadata.user_id)
      const sourceFileId = parseUUID(doc.source_file_id) || parseUUID(metadata.source_file_id)
      
      console.log(`[DEBUG] sourceFileId resolved: ${sourceFileId}`)
      
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

      const targetProjects = normalizeUUIDArray(doc.target_projects || metadata.target_projects)

      // v5.0.2 : Extraire les concepts depuis metadata parsé
      const concepts = normalizeArray(metadata.concepts || [])
      console.log(`[DEBUG] rag.documents concepts: ${JSON.stringify(concepts)}`)
      
      const docIndex = docsForRagDocuments.length
      if (concepts.length > 0) {
        conceptsByDocIndex.set(docIndex, concepts)
        console.log(`[DEBUG] Added concepts for docIndex ${docIndex}: ${JSON.stringify(concepts)}`)
      }

      docsForRagDocuments.push({
        content: content.trim(),
        target_apps: targetApps,
        target_projects: targetProjects,
        org_id: orgId,
        created_by: userId,
        source_file_id: sourceFileId,
        layer: doc.layer || null,
        status: doc.status || null,
        quality_level: doc.quality_level || null,
        metadata: {
          ...metadata,
          source_file_id: sourceFileId,
          concepts: concepts,
        },
      })
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
        source_file_id: doc.source_file_id,
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
    // INSERTION rag.document_concepts (GraphRAG v5.0.0)
    // ════════════════════════════════════════════════════════════════════════════
    
    let insertedConcepts = 0
    
    console.log(`[DEBUG] insertedDocs.length: ${insertedDocs.length}`)
    console.log(`[DEBUG] conceptsByDocIndex.size: ${conceptsByDocIndex.size}`)
    
    if (insertedDocs.length > 0 && conceptsByDocIndex.size > 0) {
      const allSlugs = new Set<string>()
      conceptsByDocIndex.forEach(slugs => slugs.forEach(s => allSlugs.add(s)))
      
      console.log(`[DEBUG] allSlugs: ${JSON.stringify(Array.from(allSlugs))}`)
      
      const { data: conceptsData, error: conceptsError } = await supabase
        .schema('config')
        .from('concepts')
        .select('id, slug')
        .in('slug', Array.from(allSlugs))
      
      console.log(`[DEBUG] conceptsData count: ${conceptsData?.length || 0}`)
      console.log(`[DEBUG] conceptsError: ${conceptsError?.message || 'null'}`)
      
      if (conceptsError) {
        console.error(`[ingest-documents] Erreur récupération concepts: ${conceptsError.message}`)
      } else if (conceptsData && conceptsData.length > 0) {
        const slugToId = new Map<string, string>()
        conceptsData.forEach((c: any) => slugToId.set(c.slug, c.id))
        
        const conceptRows: any[] = []
        
        conceptsByDocIndex.forEach((slugs, docIndex) => {
          const documentId = insertedDocs[docIndex]?.id
          console.log(`[DEBUG] docIndex ${docIndex}, documentId: ${documentId}`)
          
          if (!documentId) return
          
          slugs.forEach(slug => {
            const conceptId = slugToId.get(slug)
            if (conceptId) {
              conceptRows.push({
                document_id: documentId,
                concept_id: conceptId,
                relevance_score: 1.0,
                created_at: new Date().toISOString(),
              })
            }
          })
        })
        
        console.log(`[DEBUG] conceptRows to insert: ${conceptRows.length}`)
        
        if (conceptRows.length > 0) {
          const { error: insertConceptsError } = await supabase
            .schema('rag')
            .from('document_concepts')
            .insert(conceptRows)
          
          if (insertConceptsError) {
            console.error(`[ingest-documents] Erreur insertion document_concepts: ${insertConceptsError.message}`)
            errors.push({ error: 'Insertion concepts échouée', details: insertConceptsError.message })
          } else {
            insertedConcepts = conceptRows.length
            console.log(`[ingest-documents] rag.document_concepts: ${insertedConcepts} relations insérées`)
          }
        }
      } else {
        console.log(`[DEBUG] No conceptsData returned`)
      }
    } else {
      console.log(`[DEBUG] Skipping concept insertion`)
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
          rag_document_concepts: insertedConcepts,
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
