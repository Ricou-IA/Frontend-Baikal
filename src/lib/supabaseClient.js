import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '❌ Variables Supabase manquantes!\n' +
    'Assurez-vous de créer un fichier .env.local avec:\n' +
    '- VITE_SUPABASE_URL\n' +
    '- VITE_SUPABASE_ANON_KEY\n' +
    'Consultez .env.example pour plus de détails.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

export async function completeOnboarding(businessRole, bio = null) {
  const { data, error } = await supabase.rpc('complete_onboarding', {
    p_business_role: businessRole,
    p_bio: bio,
  })
  if (error) throw error
  return data
}

export async function checkEmailExists(email) {
  if (!email) return false
  try {
    const { data, error } = await supabase.rpc('check_email_exists', {
      email_to_check: email
    })
    if (error) return false
    return data === true || data === 'true' || data === 1
  } catch (err) {
    return false
  }
}

export async function callRagBrain(query, verticalId, options = {}) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Utilisateur non authentifié')

    const requestBody = {
      query: query.trim(),
      vertical_id: verticalId.trim(),
      match_threshold: options.matchThreshold || 0.5,
      match_count: options.matchCount || 5
    }

    const response = await fetch(
      `${supabaseUrl}/functions/v1/rag-brain`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': supabaseAnonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      }
    )

    const data = await response.json()
    if (!response.ok) throw new Error(data.error || `Erreur HTTP: ${response.status}`)
    if (!data.success && !data.answer) throw new Error(data.error || 'Erreur inconnue')

    return {
      data: {
        answer: data.answer,
        sources: data.sources || [],
        processingTime: data.processing_time_ms
      },
      error: null
    }
  } catch (err) {
    console.error('Erreur RAG:', err)
    return { data: null, error: err }
  }
}

/**
 * Upload un enregistrement audio pour analyse (Compatible OpenAI)
 * @param {File} file - Le fichier audio avec le bon mime-type
 * @param {string} title - Titre de la réunion
 */
export async function uploadMeetingAudio(file, title = 'Réunion Audio') {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Non connecté')

    const formData = new FormData()
    formData.append('audio', file) // Envoi sous la clé 'audio' (le backend accepte 'file' aussi)
    formData.append('title', title)

    const response = await fetch(
      `${supabaseUrl}/functions/v1/process-audio`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': supabaseAnonKey,
          // Pas de Content-Type ici, fetch gère le boundary
        },
        body: formData,
      }
    )

    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Erreur upload audio')

    return result
  } catch (err) {
    console.error('Erreur process audio:', err)
    throw err
  }
}

export default supabase
