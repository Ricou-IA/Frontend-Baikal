// ═══════════════════════════════════════════════════════════════════════════════
// Edge Function: get-concepts
// Version: 1.2.1
// Description: Récupère les concepts associés à une ou plusieurs apps via RPC
// ═══════════════════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Helper: JSON Response
// ─────────────────────────────────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400) {
  return jsonResponse({ success: false, error: message }, status);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Handler
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // 1. Parse input (GET query params or POST body)
    // ─────────────────────────────────────────────────────────────────────────
    
    let appIds: string[] = [];

    if (req.method === "GET") {
      const url = new URL(req.url);
      const appId = url.searchParams.get("app_id");
      const appIdsParam = url.searchParams.get("app_ids");
      
      if (appId) {
        appIds = [appId];
      } else if (appIdsParam) {
        appIds = appIdsParam.split(",").map(s => s.trim()).filter(Boolean);
      }
    } else if (req.method === "POST") {
      const body = await req.json();
      
      if (body.app_id) {
        appIds = [body.app_id];
      } else if (body.app_ids) {
        appIds = Array.isArray(body.app_ids) ? body.app_ids : [body.app_ids];
      }
    }

    // Validation
    if (appIds.length === 0) {
      return errorResponse("Missing required parameter: app_id or app_ids");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Initialize Supabase client
    // ─────────────────────────────────────────────────────────────────────────

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Call RPC function
    // ─────────────────────────────────────────────────────────────────────────

    const { data, error } = await supabase.rpc("get_app_concepts", {
      p_app_ids: appIds
    });

    if (error) {
      console.error("[get-concepts] RPC error:", error);
      return errorResponse(`Database error: ${error.message}`, 500);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. Return response
    // ─────────────────────────────────────────────────────────────────────────

    return jsonResponse(data);

  } catch (error) {
    console.error("[get-concepts] Unexpected error:", error);
    return errorResponse(`Internal error: ${error.message}`, 500);
  }
});
