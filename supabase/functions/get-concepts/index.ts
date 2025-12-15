// ═══════════════════════════════════════════════════════════════════════════════
// Edge Function: get-concepts
// Version: 1.0.0
// Description: Récupère les concepts associés à une ou plusieurs apps
// ═══════════════════════════════════════════════════════════════════════════════
//
// ENDPOINTS:
//   GET  /get-concepts?app_id=arpet
//   GET  /get-concepts?app_ids=arpet,perfec
//   POST /get-concepts { "app_id": "arpet" }
//   POST /get-concepts { "app_ids": ["arpet", "perfec"] }
//
// RESPONSE:
// {
//   "success": true,
//   "concepts": [
//     { "id": "uuid", "slug": "paiement_marche", "label": "Paiement des marchés", "description": "..." },
//     ...
//   ],
//   "count": 21,
//   "app_ids": ["arpet"]
// }
//
// ═══════════════════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─────────────────────────────────────────────────────────────────────────────
// CORS Headers
// ─────────────────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

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
    // 3. Fetch concepts for the given app(s)
    // ─────────────────────────────────────────────────────────────────────────

    // Get concept_ids from config.apps for each app_id
    const { data: apps, error: appsError } = await supabase
      .from("apps")
      .select("id, concept_ids")
      .in("id", appIds);

    if (appsError) {
      console.error("[get-concepts] Error fetching apps:", appsError);
      return errorResponse(`Database error: ${appsError.message}`, 500);
    }

    if (!apps || apps.length === 0) {
      return errorResponse(`No apps found for: ${appIds.join(", ")}`, 404);
    }

    // Collect all unique concept_ids
    const allConceptIds: string[] = [];
    apps.forEach(app => {
      if (app.concept_ids && Array.isArray(app.concept_ids)) {
        app.concept_ids.forEach((id: string) => {
          if (!allConceptIds.includes(id)) {
            allConceptIds.push(id);
          }
        });
      }
    });

    if (allConceptIds.length === 0) {
      return jsonResponse({
        success: true,
        concepts: [],
        count: 0,
        app_ids: appIds,
        message: "No concepts associated with these apps"
      });
    }

    // Fetch concept details
    const { data: concepts, error: conceptsError } = await supabase
      .from("concepts")
      .select("id, slug, label, description")
      .in("id", allConceptIds)
      .eq("status", "active")
      .order("label");

    if (conceptsError) {
      console.error("[get-concepts] Error fetching concepts:", conceptsError);
      return errorResponse(`Database error: ${conceptsError.message}`, 500);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. Format response
    // ─────────────────────────────────────────────────────────────────────────

    // Format for LLM consumption (compact)
    const conceptsForLLM = concepts?.map(c => ({
      slug: c.slug,
      label: c.label,
      description: c.description
    })) || [];

    return jsonResponse({
      success: true,
      concepts: conceptsForLLM,
      count: conceptsForLLM.length,
      app_ids: appIds
    });

  } catch (error) {
    console.error("[get-concepts] Unexpected error:", error);
    return errorResponse(`Internal error: ${error.message}`, 500);
  }
});
