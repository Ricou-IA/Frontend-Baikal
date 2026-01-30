// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  INGEST-DOCUMENTS - Edge Function Supabase                                   ║
// ║  Version: 7.0.0 - Support hiérarchie chunks (parent/enfant)                  ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  Changements v7.0.0:                                                         ║
// ║  - Ajout colonne hierarchy_level (0=section, 1=contenu)                      ║
// ║  - Stockage _chunk_local_id dans metadata pour résolution liens              ║
// ║  - Appel rag.resolve_chunk_hierarchy() après insertion                       ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  Changements v6.0.2:                                                         ║
// ║  - UPSERT au lieu de INSERT sur document_concepts (évite duplicate key)      ║
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
// TYPES
// ════════════════════════════════════════════════════════════════════════════════

interface ConceptEntry {
  slug?: string
  concept_id?: string
  source: 'category' | 'llm' | 'manual'
  relevance_score: number
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
    // V6.0.0 : Charger le mapping category_slug → concept_id
    // ════════════════════════════════════════════════════════════════════════════
    
    const categorySlugs = new Set<string>()
    for (const doc of documents) {
      const metadata = parseMetadata(doc.metadata)
      const categorySlug = doc.category_slug || metadata.category_slug
      if (categorySlug) categorySlugs.add(categorySlug)
    }
    
    const categoryToConceptId = new Map<string, string>()
    
    if (categorySlugs.size > 0) {
      const { data: categoriesData, error: categoriesError } = await supabase
        .schema('config')
        .from('document_categories')
        .select('slug, linked_concept_id')
        .in('slug', Array.from(categorySlugs))
      
      if (!categoriesError && categoriesData) {
        categoriesData.forEach((cat: any) => {
          if (cat.linked_concept_id) {
            categoryToConceptId.set(cat.slug, cat.linked_concept_id)
          }
        })
        console.log(`[ingest-documents] Categories mappées: ${categoryToConceptId.size}`)
      }
    }
    
    // ════════════════════════════════════════════════════════════════════════════
    // SÉPARATION PAR DESTINATION
    // ════════════════════════════════════════════════════════════════════════════
    
    const docsForRagDocuments: any[] = []
    const docsForRagTables: any[] = []
    const errors: any[] = []
    
    // v6.0.0 : Stocker les concepts avec leur source
    const conceptsByDocIndex: Map<number, ConceptEntry[]> = new Map()
    
    // v7.0.0 : Tracker les source_file_id pour résolution hiérarchie
    const sourceFileIdsToResolve = new Set<string>()

    for (const doc of documents) {
      const destination = doc._DESTINATION || 'rag.documents'
      const metadata = parseMetadata(doc.metadata)
      
      // v6.0.0 : Extraire category_slug
      const categorySlug = doc.category_slug || metadata.category_slug || null
      
      // v7.0.0 : Extraire hierarchy_level et chunk_local_id
      const hierarchyLevel = doc.hierarchy_level ?? metadata.enrichment?.hierarchy?.level ?? 1
      const chunkLocalId = doc._chunk_local_id || metadata.chunk_local_id || null
      const parentLocalId = doc._parent_local_id || metadata.enrichment?.hierarchy?.parent_local_id || null
      
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
        
        // v6.0.0 : Concepts avec source
        const conceptEntries: ConceptEntry[] = []
        
        // Concept primaire depuis catégorie (ajouté EN PREMIER = prioritaire)
        if (categorySlug && categoryToConceptId.has(categorySlug)) {
          conceptEntries.push({
            concept_id: categoryToConceptId.get(categorySlug)!,
            source: 'category',
            relevance_score: 1.0
          })
        }
        
        // Concepts secondaires depuis LLM
        const llmConcepts = normalizeArray(metadata.concepts || [])
        llmConcepts.forEach(slug => {
          conceptEntries.push({
            slug: slug,
            source: 'llm',
            relevance_score: 0.85
          })
        })
        
        const docIndex = docsForRagDocuments.length
        if (conceptEntries.length > 0) {
          conceptsByDocIndex.set(docIndex, conceptEntries)
        }
        
        // v7.0.0 : Tracker pour résolution hiérarchie
        if (sourceFileId) {
          sourceFileIdsToResolve.add(sourceFileId)
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
          hierarchy_level: hierarchyLevel,  // v7.0.0
          metadata: {
            source_file_id: sourceFileId,
            content_type: 'table_chunk',
            document_title: doc.document_title || null,
            category_slug: categorySlug,
            section_title: doc.section_title || null,
            table_index: doc.table_index ?? 0,
            row_count: doc.row_count || 0,
            column_count: doc.column_count || 0,
            chunk_local_id: chunkLocalId,  // v7.0.0
            enrichment: {
              ...metadata.enrichment,
              hierarchy: {
                level: hierarchyLevel,
                parent_local_id: parentLocalId,
              }
            }
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

      // v6.0.0 : Concepts avec source
      const conceptEntries: ConceptEntry[] = []
      
      // Concept primaire depuis catégorie (ajouté EN PREMIER = prioritaire)
      if (categorySlug && categoryToConceptId.has(categorySlug)) {
        conceptEntries.push({
          concept_id: categoryToConceptId.get(categorySlug)!,
          source: 'category',
          relevance_score: 1.0
        })
      }
      
      // Concepts secondaires depuis LLM
      const llmConcepts = normalizeArray(metadata.concepts || [])
      llmConcepts.forEach(slug => {
        conceptEntries.push({
          slug: slug,
          source: 'llm',
          relevance_score: 0.85
        })
      })
      
      const docIndex = docsForRagDocuments.length
      if (conceptEntries.length > 0) {
        conceptsByDocIndex.set(docIndex, conceptEntries)
      }
      
      // v7.0.0 : Tracker pour résolution hiérarchie
      if (sourceFileId) {
        sourceFileIdsToResolve.add(sourceFileId)
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
        hierarchy_level: hierarchyLevel,  // v7.0.0
        metadata: {
          ...metadata,
          source_file_id: sourceFileId,
          category_slug: categorySlug,
          chunk_local_id: chunkLocalId,  // v7.0.0
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
        hierarchy_level: doc.hierarchy_level,  // v7.0.0
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
    // v7.0.0 : RÉSOLUTION HIÉRARCHIE (parent_chunk_id)
    // ════════════════════════════════════════════════════════════════════════════
    
    let hierarchyResolved = { updated: 0, errors: 0 }
    
    if (insertedDocs.length > 0 && sourceFileIdsToResolve.size > 0) {
      console.log(`[ingest-documents] Résolution hiérarchie pour ${sourceFileIdsToResolve.size} fichier(s)...`)
      
      for (const sourceFileId of sourceFileIdsToResolve) {
        try {
          const { data: resolveResult, error: resolveError } = await supabase
            .rpc('resolve_chunk_hierarchy', { p_source_file_id: sourceFileId })
          
          if (resolveError) {
            console.error(`[ingest-documents] Erreur résolution hiérarchie ${sourceFileId}: ${resolveError.message}`)
            hierarchyResolved.errors++
          } else if (resolveResult && resolveResult.length > 0) {
            hierarchyResolved.updated += resolveResult[0].updated_count || 0
            hierarchyResolved.errors += resolveResult[0].error_count || 0
            console.log(`[ingest-documents] Hiérarchie ${sourceFileId}: ${resolveResult[0].updated_count} liens résolus`)
          }
        } catch (e) {
          console.error(`[ingest-documents] Exception résolution hiérarchie: ${e.message}`)
          hierarchyResolved.errors++
        }
      }
    }

    // ════════════════════════════════════════════════════════════════════════════
    // INSERTION rag.document_concepts (GraphRAG v6.0.2 - UPSERT avec déduplication)
    // ════════════════════════════════════════════════════════════════════════════
    
    let insertedConcepts = 0
    
    if (insertedDocs.length > 0 && conceptsByDocIndex.size > 0) {
      // Collecter tous les slugs à résoudre
      const slugsToResolve = new Set<string>()
      conceptsByDocIndex.forEach(entries => {
        entries.forEach(entry => {
          if (entry.slug) slugsToResolve.add(entry.slug)
        })
      })
      
      // Résoudre slugs → concept_id
      const slugToId = new Map<string, string>()
      
      if (slugsToResolve.size > 0) {
        const { data: conceptsData, error: conceptsError } = await supabase
          .schema('config')
          .from('concepts')
          .select('id, slug')
          .in('slug', Array.from(slugsToResolve))
        
        if (!conceptsError && conceptsData) {
          conceptsData.forEach((c: any) => slugToId.set(c.slug, c.id))
        }
      }
      
      // Construire les lignes à insérer (avec déduplication)
      const conceptRows: any[] = []
      
      conceptsByDocIndex.forEach((entries, docIndex) => {
        const documentId = insertedDocs[docIndex]?.id
        if (!documentId) return
        
        // Déduplication : Map concept_id → entry (premier ajouté gagne)
        const uniqueForDoc = new Map<string, ConceptEntry>()
        
        entries.forEach(entry => {
          let conceptId = entry.concept_id
          
          // Résoudre le slug si pas de concept_id direct
          if (!conceptId && entry.slug) {
            conceptId = slugToId.get(entry.slug)
          }
          
          // Ajouter seulement si concept_id valide et pas déjà présent
          if (conceptId && !uniqueForDoc.has(conceptId)) {
            uniqueForDoc.set(conceptId, { ...entry, concept_id: conceptId })
          }
        })
        
        // Convertir en lignes à insérer
        uniqueForDoc.forEach((entry, conceptId) => {
          conceptRows.push({
            document_id: documentId,
            concept_id: conceptId,
            relevance_score: entry.relevance_score,
            source: entry.source,
            created_at: new Date().toISOString(),
          })
        })
      })
      
      // v6.0.2 : UPSERT au lieu de INSERT (évite duplicate key error)
      if (conceptRows.length > 0) {
        const { error: insertConceptsError } = await supabase
          .schema('rag')
          .from('document_concepts')
          .upsert(conceptRows, { 
            onConflict: 'document_id,concept_id',
            ignoreDuplicates: true 
          })
        
        if (insertConceptsError) {
          console.error(`[ingest-documents] Erreur insertion document_concepts: ${insertConceptsError.message}`)
          errors.push({ error: 'Insertion concepts échouée', details: insertConceptsError.message })
        } else {
          insertedConcepts = conceptRows.length
          console.log(`[ingest-documents] rag.document_concepts: ${insertedConcepts} relations insérées`)
        }
      }
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
        hierarchy: hierarchyResolved,  // v7.0.0
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
