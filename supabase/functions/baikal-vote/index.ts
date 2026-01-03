// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  BAIKAL-VOTE v1.0.0 - Gestion des votes Q/A                                  ║
// ║  Edge Function Supabase                                                      ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  Actions disponibles:                                                        ║
// ║  - vote_up_new: Crée qa_memory + embedding + premier vote                    ║
// ║  - vote_up_existing: Incrémente trust_score sur qa_memory existante          ║
// ║  - vote_down: Décrémente trust_score                                         ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  Utilisé par: Arpet (frontend), autres apps futures                          ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"

// ============================================================================
// CONFIGURATION
// ============================================================================

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const EMBEDDING_MODEL = "text-embedding-3-small"

// ============================================================================
// TYPES
// ============================================================================

interface VoteRequest {
  action: 'vote_up_new' | 'vote_up_existing' | 'vote_down'
  user_id: string
  
  // Pour vote_up_new
  question?: string
  answer?: string
  source_file_ids?: string[]
  org_id?: string
  project_id?: string | null
  
  // Pour vote_up_existing / vote_down
  qa_id?: string
}

interface VoteResponse {
  success: boolean
  action: string
  qa_id: string | null
  trust_score: number
  message: string
  error?: string
}

// ============================================================================
// HELPERS
// ============================================================================

function errorResponse(message: string, status: number = 400): Response {
  return new Response(
    JSON.stringify({ success: false, error: message }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  )
}

function successResponse(data: VoteResponse): Response {
  return new Response(
    JSON.stringify(data),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  )
}

// ============================================================================
// EMBEDDING
// ============================================================================

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
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
// VOTE UP NEW - Créer qa_memory + premier vote
// ============================================================================

async function voteUpNew(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  question: string,
  answer: string,
  orgId: string,
  projectId: string | null,
  sourceFileIds: string[] | null
): Promise<VoteResponse> {
  try {
    console.log(`[baikal-vote] vote_up_new: "${question.substring(0, 50)}..."`)
    
    // 1. Générer embedding de la question
    const embedding = await generateEmbedding(question)
    console.log(`[baikal-vote] Embedding généré (${embedding.length} dimensions)`)
    
    // 2. Insérer dans qa_memory
    const { data, error } = await supabase
      .schema('rag')
      .from('qa_memory')
      .insert({
        question_text: question,
        answer_text: answer,
        embedding: embedding,
        org_id: orgId,
        project_id: projectId,
        source_file_ids: sourceFileIds,
        trust_score: 1,  // Premier vote
        validators_ids: [userId],  // L'utilisateur qui vote
        usage_count: 0,
        is_expert_faq: false,
        created_by: userId,
      })
      .select('id, trust_score')
      .single()

    if (error) {
      console.error('[baikal-vote] Insert error:', error)
      return {
        success: false,
        action: 'vote_up_new',
        qa_id: null,
        trust_score: 0,
        message: 'Erreur lors de la création',
        error: error.message,
      }
    }

    console.log(`[baikal-vote] qa_memory créée: ${data.id}`)
    
    return {
      success: true,
      action: 'vote_up_new',
      qa_id: data.id,
      trust_score: data.trust_score,
      message: 'Réponse validée et sauvegardée',
    }
  } catch (err) {
    console.error('[baikal-vote] Exception vote_up_new:', err)
    return {
      success: false,
      action: 'vote_up_new',
      qa_id: null,
      trust_score: 0,
      message: 'Erreur inattendue',
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ============================================================================
// VOTE UP EXISTING - Incrémenter trust_score
// ============================================================================

async function voteUpExisting(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  qaId: string
): Promise<VoteResponse> {
  try {
    console.log(`[baikal-vote] vote_up_existing: qa_id=${qaId}`)
    
    // 1. Récupérer qa_memory actuelle
    const { data: qa, error: fetchError } = await supabase
      .schema('rag')
      .from('qa_memory')
      .select('id, trust_score, validators_ids')
      .eq('id', qaId)
      .single()

    if (fetchError || !qa) {
      return {
        success: false,
        action: 'vote_up_existing',
        qa_id: qaId,
        trust_score: 0,
        message: 'Q/A non trouvée',
        error: fetchError?.message || 'Not found',
      }
    }

    // 2. Vérifier si l'utilisateur a déjà voté
    const validators = qa.validators_ids || []
    if (validators.includes(userId)) {
      return {
        success: false,
        action: 'vote_up_existing',
        qa_id: qaId,
        trust_score: qa.trust_score,
        message: 'Vous avez déjà voté pour cette réponse',
        error: 'ALREADY_VOTED',
      }
    }

    // 3. Mettre à jour
    const newTrustScore = qa.trust_score + 1
    const newValidators = [...validators, userId]

    const { error: updateError } = await supabase
      .schema('rag')
      .from('qa_memory')
      .update({
        trust_score: newTrustScore,
        validators_ids: newValidators,
        updated_at: new Date().toISOString(),
      })
      .eq('id', qaId)

    if (updateError) {
      return {
        success: false,
        action: 'vote_up_existing',
        qa_id: qaId,
        trust_score: qa.trust_score,
        message: 'Erreur lors du vote',
        error: updateError.message,
      }
    }

    console.log(`[baikal-vote] Vote enregistré: trust_score=${newTrustScore}`)
    
    return {
      success: true,
      action: 'vote_up_existing',
      qa_id: qaId,
      trust_score: newTrustScore,
      message: 'Vote enregistré',
    }
  } catch (err) {
    console.error('[baikal-vote] Exception vote_up_existing:', err)
    return {
      success: false,
      action: 'vote_up_existing',
      qa_id: qaId,
      trust_score: 0,
      message: 'Erreur inattendue',
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ============================================================================
// VOTE DOWN - Décrémenter trust_score
// ============================================================================

async function voteDown(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  qaId: string
): Promise<VoteResponse> {
  try {
    console.log(`[baikal-vote] vote_down: qa_id=${qaId}`)
    
    // 1. Récupérer qa_memory actuelle
    const { data: qa, error: fetchError } = await supabase
      .schema('rag')
      .from('qa_memory')
      .select('id, trust_score')
      .eq('id', qaId)
      .single()

    if (fetchError || !qa) {
      return {
        success: false,
        action: 'vote_down',
        qa_id: qaId,
        trust_score: 0,
        message: 'Q/A non trouvée',
        error: fetchError?.message || 'Not found',
      }
    }

    // 2. Décrémenter (pas de tracking des votes négatifs)
    const newTrustScore = qa.trust_score - 1

    const { error: updateError } = await supabase
      .schema('rag')
      .from('qa_memory')
      .update({
        trust_score: newTrustScore,
        updated_at: new Date().toISOString(),
      })
      .eq('id', qaId)

    if (updateError) {
      return {
        success: false,
        action: 'vote_down',
        qa_id: qaId,
        trust_score: qa.trust_score,
        message: 'Erreur lors du signalement',
        error: updateError.message,
      }
    }

    console.log(`[baikal-vote] Signalement enregistré: trust_score=${newTrustScore}`)
    
    return {
      success: true,
      action: 'vote_down',
      qa_id: qaId,
      trust_score: newTrustScore,
      message: 'Signalement enregistré',
    }
  } catch (err) {
    console.error('[baikal-vote] Exception vote_down:', err)
    return {
      success: false,
      action: 'vote_down',
      qa_id: qaId,
      trust_score: 0,
      message: 'Erreur inattendue',
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const body: VoteRequest = await req.json()
    const { action, user_id } = body

    // Validation de base
    if (!action) {
      return errorResponse("action is required (vote_up_new | vote_up_existing | vote_down)")
    }
    if (!user_id) {
      return errorResponse("user_id is required")
    }

    console.log(`[baikal-vote] v1.0.0 - Action: ${action}, User: ${user_id}`)

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Router les actions
    switch (action) {
      case 'vote_up_new': {
        const { question, answer, org_id, project_id, source_file_ids } = body
        
        if (!question || !answer) {
          return errorResponse("question and answer are required for vote_up_new")
        }
        if (!org_id) {
          return errorResponse("org_id is required for vote_up_new")
        }

        const result = await voteUpNew(
          supabase,
          user_id,
          question,
          answer,
          org_id,
          project_id || null,
          source_file_ids || null
        )
        return successResponse(result)
      }

      case 'vote_up_existing': {
        const { qa_id } = body
        
        if (!qa_id) {
          return errorResponse("qa_id is required for vote_up_existing")
        }

        const result = await voteUpExisting(supabase, user_id, qa_id)
        return successResponse(result)
      }

      case 'vote_down': {
        const { qa_id } = body
        
        if (!qa_id) {
          return errorResponse("qa_id is required for vote_down")
        }

        const result = await voteDown(supabase, user_id, qa_id)
        return successResponse(result)
      }

      default:
        return errorResponse(`Unknown action: ${action}`)
    }

  } catch (error) {
    console.error("[baikal-vote] Fatal error:", error)
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500)
  }
})
