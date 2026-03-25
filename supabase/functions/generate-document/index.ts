// ============================================================================
// generate-document v2.0.0 — Génération de documents chantier enrichis RAG
// ============================================================================
//
// Pipeline en 6 étapes :
// 1. Auth JWT → user_id + org_id
// 2. Collecte données (projet, réunions, items, intervenants)
// 3. Enrichissement RAG (batch embed + match_documents_v14)
// 4. Construction prompt + appel GPT-4o (response_format: json_object)
// 5. Stockage Markdown → Storage + sources.files
// 6. Réponse JSON { file_id, file_name, download_url, doc_type }
//
// verify_jwt: true
// Pas d'ingestion RAG (catégorie documents_generes)
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import OpenAI from "npm:openai@^4.0.0";

import type { RequestBody, GenerateResponse, LLMOutput } from "./types.ts";
import { collectProjectData } from "./collect.ts";
import { enrichMeetingsWithRAG } from "./enrich.ts";
import { buildPrompt } from "./prompts.ts";
import { storeDocument } from "./storage.ts";

// ============================================================================
// CONFIGURATION
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OPENAI_MODEL = "gpt-4o";
const OPENAI_MAX_TOKENS = 4096;
const OPENAI_TEMPERATURE = 0.3;

// ============================================================================
// HELPERS
// ============================================================================

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ success: false, error: message }, status);
}

function log(step: string, message: string, data?: unknown): void {
  const prefix = `[generate-document] [${step}]`;
  if (data !== undefined) {
    console.log(`${prefix} ${message}`, JSON.stringify(data));
  } else {
    console.log(`${prefix} ${message}`);
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  const totalStart = Date.now();

  try {
    // ==================================================================
    // STEP 1 — Auth
    // ==================================================================
    log("1-auth", "Authenticating request");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }
    if (!openaiApiKey) {
      throw new Error("Missing OPENAI_API_KEY");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return errorResponse("Missing Authorization header", 401);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return errorResponse("Invalid or expired token", 401);
    }

    const userId = user.id;

    // Get org_id from profile
    const { data: profile } = await supabase
      .schema("core")
      .from("profiles")
      .select("org_id")
      .eq("id", userId)
      .single();

    if (!profile?.org_id) {
      return errorResponse("Could not determine org_id for user", 500);
    }

    const orgId = profile.org_id;
    log("1-auth", `User authenticated: ${userId}, org: ${orgId}`);

    // ==================================================================
    // PARSE & VALIDATE REQUEST
    // ==================================================================
    const body: RequestBody = await req.json();
    const { project_id, document_type, lot_filter } = body;

    if (!project_id) {
      return errorResponse("Missing required field: project_id");
    }

    const validTypes = ["memo_chantier", "fiche_lot"];
    if (!document_type || !validTypes.includes(document_type)) {
      return errorResponse(`Invalid document_type. Must be one of: ${validTypes.join(", ")}`);
    }

    if (document_type === "fiche_lot" && !lot_filter) {
      return errorResponse("lot_filter is required for document_type 'fiche_lot'");
    }

    log("1-auth", `Request: type=${document_type}, project=${project_id}, lot=${lot_filter || "none"}`);

    // ==================================================================
    // STEP 2 — Collecte des données
    // ==================================================================
    log("2-collect", "Collecting project data");
    const collectStart = Date.now();

    const collectedData = await collectProjectData(supabase, project_id, lot_filter || null);
    const collectMs = Date.now() - collectStart;

    const realMeetings = collectedData.meetings.filter(m => m.id !== "__older_actions__");
    const totalItems = collectedData.meetings.reduce((acc, m) => acc + m.items.length, 0);

    log("2-collect", `Collected in ${collectMs}ms`, {
      meetings: realMeetings.length,
      intervenants: collectedData.intervenants.length,
      items_total: totalItems,
      lot_rag_chunks: collectedData.lot_rag_chunks.length,
    });

    if (realMeetings.length === 0) {
      return errorResponse("Aucune réunion trouvée pour ce projet. Impossible de générer le document.");
    }

    // ==================================================================
    // STEP 2b — Enrichissement RAG à la volée
    // ==================================================================
    log("2b-enrich", "Enriching items with RAG context");
    const enrichStart = Date.now();

    const openai = new OpenAI({ apiKey: openaiApiKey });

    const enrichedMeetings = await enrichMeetingsWithRAG(
      collectedData.meetings,
      userId,
      orgId,
      project_id,
      supabase,
      openai,
    );

    // Update collected data with enriched meetings
    collectedData.meetings = enrichedMeetings;

    const enrichMs = Date.now() - enrichStart;
    const enrichedItemCount = enrichedMeetings
      .flatMap(m => m.items)
      .filter(i => i.rag_context.length > 0).length;

    log("2b-enrich", `Enriched in ${enrichMs}ms: ${enrichedItemCount} items with RAG context`);

    // ==================================================================
    // STEP 3 — Construction prompt
    // ==================================================================
    log("3-prompt", "Building LLM prompt");

    const { systemPrompt, userPrompt } = buildPrompt(document_type, collectedData);

    log("3-prompt", `Prompt built: system=${systemPrompt.length} chars, user=${userPrompt.length} chars`);

    // ==================================================================
    // STEP 4 — Appel GPT-4o
    // ==================================================================
    log("4-llm", `Calling ${OPENAI_MODEL}`);
    const llmStart = Date.now();

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: OPENAI_TEMPERATURE,
        max_tokens: OPENAI_MAX_TOKENS,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${errBody}`);
    }

    const llmData = await response.json();
    const choice = llmData.choices?.[0];

    if (!choice?.message?.content) {
      throw new Error("OpenAI returned empty response");
    }

    const llmMs = Date.now() - llmStart;

    // Parse JSON response
    let llmOutput: LLMOutput;
    try {
      llmOutput = JSON.parse(choice.message.content);
    } catch {
      // Fallback: treat the whole content as markdown
      llmOutput = {
        markdown_content: choice.message.content,
        title: document_type === "memo_chantier"
          ? `Mémo Chantier — ${collectedData.project.project_name}`
          : `Fiche Lot ${lot_filter} — ${collectedData.project.project_name}`,
      };
    }

    if (!llmOutput.markdown_content) {
      throw new Error("LLM output missing markdown_content field");
    }

    log("4-llm", `LLM response in ${llmMs}ms`, {
      content_length: llmOutput.markdown_content.length,
      title: llmOutput.title,
      prompt_tokens: llmData.usage?.prompt_tokens || 0,
      completion_tokens: llmData.usage?.completion_tokens || 0,
    });

    // ==================================================================
    // STEP 5 — Stockage
    // ==================================================================
    log("5-storage", "Storing generated document");
    const storeStart = Date.now();

    const storageResult = await storeDocument(
      supabase,
      llmOutput.markdown_content,
      project_id,
      orgId,
      userId,
      document_type,
      lot_filter || null,
    );

    const storeMs = Date.now() - storeStart;
    log("5-storage", `Stored in ${storeMs}ms: ${storageResult.file_name}`);

    // ==================================================================
    // STEP 6 — Réponse
    // ==================================================================
    const totalMs = Date.now() - totalStart;

    const result: GenerateResponse = {
      file_id: storageResult.file_id,
      file_name: storageResult.file_name,
      download_url: storageResult.download_url,
      doc_type: document_type,
    };

    log("6-response", `Document generated in ${totalMs}ms`, {
      file_id: result.file_id,
      collect_ms: collectMs,
      enrich_ms: enrichMs,
      llm_ms: llmMs,
      store_ms: storeMs,
    });

    return jsonResponse(result);

  } catch (error) {
    const totalMs = Date.now() - totalStart;
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[generate-document] FATAL ERROR after ${totalMs}ms:`, error);
    return errorResponse(message, 500);
  }
});
