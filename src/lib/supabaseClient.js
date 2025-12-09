/**
 * supabaseClient.js - Baikal Console
 * ============================================================================
 * Client Supabase et helpers d'authentification.
 * Version: 2.0.0 - Nettoyé (callRagBrain supprimé, dette technique)
 * ============================================================================
 */

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

/**
 * Complète l'onboarding d'un utilisateur
 * @param {string} businessRole - Rôle métier sélectionné
 * @param {string|null} bio - Bio optionnelle
 */
export async function completeOnboarding(businessRole, bio = null) {
  const { data, error } = await supabase.rpc('complete_onboarding', {
    p_business_role: businessRole,
    p_bio: bio,
  })
  if (error) throw error
  return data
}

/**
 * Vérifie si un email existe déjà
 * @param {string} email - Email à vérifier
 * @returns {Promise<boolean>}
 */
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

/**
 * Upload un enregistrement audio pour analyse
 * @param {File} file - Le fichier audio
 * @param {string} title - Titre de la réunion
 */
export async function uploadMeetingAudio(file, title = 'Réunion Audio') {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Non connecté')

    const formData = new FormData()
    formData.append('audio', file)
    formData.append('title', title)

    const response = await fetch(
      `${supabaseUrl}/functions/v1/process-audio`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': supabaseAnonKey,
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
