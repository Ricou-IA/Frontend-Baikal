import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface Concept {
  id: string
  slug: string
  label: string
  description: string | null
  parent_id: string | null
}

interface RequestBody {
  app_id?: string
  dry_run?: boolean
  batch_size?: number
}

function buildEmbeddingText(concept: Concept): string {
  const parts: string[] = [concept.label]
  if (concept.description) {
    parts.push(concept.description)
  }
  return parts.join(' : ')
}

async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
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

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`OpenAI API error: ${JSON.stringify(error)}`)
  }

  const data = await response.json()
  return data.data.map((d: { embedding: number[] }) => d.embedding)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body: RequestBody = await req.json().catch(() => ({}))
    const appId = body.app_id || 'arpet'
    const dryRun = body.dry_run ?? false
    const batchSize = body.batch_size || 20

    console.log(`[INFO] Démarrage génération embeddings pour app: ${appId}`)
    console.log(`[INFO] Mode: ${dryRun ? 'DRY RUN' : 'PRODUCTION'}`)

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: concepts, error: fetchError } = await supabase
      .schema('config')
      .from('concepts')
      .select('id, slug, label, description, parent_id')
      .contains('target_apps', [appId])
      .is('embedding', null)
      .order('parent_id', { nullsFirst: true })
      .order('label')

    if (fetchError) {
      throw new Error(`Erreur fetch concepts: ${fetchError.message}`)
    }

    if (!concepts || concepts.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'Tous les concepts ont déjà un embedding', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[INFO] ${concepts.length} concepts à traiter`)

    const textsToEmbed = concepts.map(buildEmbeddingText)

    if (dryRun) {
      const preview = concepts.slice(0, 5).map((c, i) => ({
        id: c.id,
        slug: c.slug,
        type: c.parent_id ? 'concept' : 'domaine',
        text_to_embed: textsToEmbed[i],
      }))

      return new Response(
        JSON.stringify({
          success: true,
          dry_run: true,
          total_concepts: concepts.length,
          preview: preview,
          message: `${concepts.length} concepts seraient traités.`,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const results: { id: string; success: boolean; error?: string }[] = []
    
    for (let i = 0; i < concepts.length; i += batchSize) {
      const batchConcepts = concepts.slice(i, i + batchSize)
      const batchTexts = textsToEmbed.slice(i, i + batchSize)

      console.log(`[INFO] Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(concepts.length / batchSize)}`)

      try {
        const embeddings = await generateEmbeddings(batchTexts)

        for (let j = 0; j < batchConcepts.length; j++) {
          const concept = batchConcepts[j]
          const embedding = embeddings[j]

          const { error: updateError } = await supabase
            .schema('config')
            .from('concepts')
            .update({ 
              embedding: embedding,
              updated_at: new Date().toISOString()
            })
            .eq('id', concept.id)

          if (updateError) {
            console.error(`[ERROR] ${concept.slug}: ${updateError.message}`)
            results.push({ id: concept.id, success: false, error: updateError.message })
          } else {
            console.log(`[OK] ${concept.slug}`)
            results.push({ id: concept.id, success: true })
          }
        }
      } catch (batchError) {
        console.error(`[ERROR] Batch failed: ${batchError}`)
        batchConcepts.forEach(c => {
          results.push({ id: c.id, success: false, error: String(batchError) })
        })
      }

      if (i + batchSize < concepts.length) {
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    }

    const successCount = results.filter(r => r.success).length
    const failCount = results.filter(r => !r.success).length

    console.log(`[DONE] ${successCount}/${concepts.length} OK`)

    return new Response(
      JSON.stringify({
        success: failCount === 0,
        processed: concepts.length,
        success_count: successCount,
        fail_count: failCount,
        failures: results.filter(r => !r.success),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[FATAL]', error)
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
