import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

interface DeleteUserRequest {
  userId: string
}

function errorResponse(message: string, status: number = 400) {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  )
}

function successResponse(data: unknown, status: number = 200) {
  return new Response(
    JSON.stringify(data),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  )
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    if (req.method !== "POST") {
      return errorResponse("Method not allowed", 405)
    }

    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return errorResponse("Missing authorization header", 401)
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

    // Client avec le token de l'appelant (pour vérifier ses droits)
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user: caller }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !caller) {
      return errorResponse("Unauthorized", 401)
    }

    // Vérifier que l'appelant est super_admin
    const { data: callerProfile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("app_role, org_id, email")
      .eq("id", caller.id)
      .single()

    if (profileError || !callerProfile) {
      return errorResponse("Caller profile not found", 403)
    }

    if (callerProfile.app_role !== "super_admin") {
      return errorResponse("Seuls les super_admin peuvent supprimer des comptes", 403)
    }

    const body: DeleteUserRequest = await req.json()
    const { userId } = body

    if (!userId) {
      return errorResponse("userId is required", 400)
    }

    // Interdiction de se supprimer soi-même
    if (userId === caller.id) {
      return errorResponse("Vous ne pouvez pas supprimer votre propre compte", 400)
    }

    // Client admin (service role) pour les opérations privilégiées
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Récupérer les infos de l'utilisateur cible
    const { data: targetProfile, error: targetError } = await supabaseAdmin
      .from("profiles")
      .select("email, app_role, org_id, full_name")
      .eq("id", userId)
      .single()

    if (targetError || !targetProfile) {
      return errorResponse("Utilisateur non trouvé", 404)
    }

    // Interdire la suppression d'un autre super_admin
    if (targetProfile.app_role === "super_admin") {
      return errorResponse("Impossible de supprimer un super_admin", 403)
    }

    // Logger le changement AVANT la suppression
    await supabaseAdmin.from("role_changes_log").insert({
      target_user_id: userId,
      target_user_email: targetProfile.email,
      change_type: "account_deletion",
      old_app_role: targetProfile.app_role,
      new_app_role: null,
      old_org_id: targetProfile.org_id,
      new_org_id: null,
      changed_by: caller.id,
      changed_by_email: callerProfile.email,
      changed_by_role: callerProfile.app_role,
      reason: "Suppression de compte par super_admin",
    })

    // Supprimer de organization_members si existant
    if (targetProfile.org_id) {
      await supabaseAdmin
        .from("organization_members")
        .delete()
        .eq("user_id", userId)
    }

    // Supprimer le profil
    await supabaseAdmin
      .from("profiles")
      .delete()
      .eq("id", userId)

    // Supprimer le compte auth
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)

    if (deleteError) {
      return errorResponse(`Erreur lors de la suppression auth: ${deleteError.message}`, 500)
    }

    return successResponse({
      success: true,
      message: "Compte supprimé définitivement",
      deletedUserId: userId,
      deletedEmail: targetProfile.email,
    })

  } catch (error) {
    console.error("[delete-user] Error:", error)
    return errorResponse("Internal server error", 500)
  }
})
