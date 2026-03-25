// meeting-extract/index.ts — V3: LLM extraction (GPT-4o) + vectorisation directe
// Pipeline : meeting_id → read transcript → GPT-4o → items + CR → DB update → vectorize RAG
// Gère 2 modes : full (réunion) et allégé (mémo vocal)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { extractWithGPT4o } from "./extraction.ts";
import { lookupCRTemplate, generateFormattedReport } from "./templates.ts";
import { vectorizeMeeting } from "./vectorize.ts";
import type {
  RequestBody,
  MeetingRecord,
  ExtractionResult,
  MemoExtractionResult,
  MeetingItem,
  MeetingStats,
} from "./types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    // Env vars
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }
    if (!openaiApiKey) {
      throw new Error("Missing OPENAI_API_KEY");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse body
    const body: RequestBody = await req.json();
    const { meeting_id } = body;

    if (!meeting_id) {
      return jsonResponse({ error: "Missing required field: meeting_id" }, 400);
    }

    console.log(`[meeting-extract] Start meeting_id=${meeting_id}`);
    const totalStart = Date.now();

    // -----------------------------------------------------------------------
    // Step 1 — Fetch meeting record
    // -----------------------------------------------------------------------
    const { data: meeting, error: meetingErr } = await supabase
      .schema("arpet")
      .from("meetings")
      .select("*")
      .eq("id", meeting_id)
      .single();

    if (meetingErr || !meeting) {
      return jsonResponse({
        error: `Meeting not found: ${meetingErr?.message || "no record"}`,
      }, 404);
    }

    const meetingRecord = meeting as MeetingRecord;
    console.log(`[meeting-extract] Meeting: ${meetingRecord.meeting_title} (${meetingRecord.source_type})`);

    // -----------------------------------------------------------------------
    // Step 2 — Download transcript from Storage
    // -----------------------------------------------------------------------
    const { data: transcriptBlob, error: dlErr } = await supabase.storage
      .from("meeting-transcripts")
      .download(meetingRecord.transcript_path);

    if (dlErr || !transcriptBlob) {
      throw new Error(`Failed to download transcript: ${dlErr?.message || "no data"}`);
    }

    const transcript = await transcriptBlob.text();
    console.log(`[meeting-extract] Transcript: ${transcript.length} chars`);

    if (transcript.length < 20) {
      return jsonResponse({
        error: "Transcript too short for extraction",
        transcript_length: transcript.length,
      }, 400);
    }

    // -----------------------------------------------------------------------
    // Step 3 — Lookup CR template (org layer)
    // -----------------------------------------------------------------------
    const customTemplate = await lookupCRTemplate(supabase, meetingRecord.org_id);

    // -----------------------------------------------------------------------
    // Step 4 — GPT-4o extraction
    // -----------------------------------------------------------------------
    const extractionStart = Date.now();
    const isMemo = meetingRecord.source_type === "memo";

    const extraction = await extractWithGPT4o(
      transcript,
      meetingRecord.participants || [],
      meetingRecord.meeting_title,
      meetingRecord.meeting_date,
      meetingRecord.source_type,
      openaiApiKey,
      undefined, // agenda not stored on meeting record; hint was used during transcription
    );
    const extractionMs = Date.now() - extractionStart;

    // -----------------------------------------------------------------------
    // Step 5 — Process extraction result
    // -----------------------------------------------------------------------
    let summary: string;
    let formattedReport: string | null = null;
    let items: MeetingItem[] = [];
    let nextMeeting: ExtractionResult["next_meeting"] | undefined;
    let qqoqccp: ExtractionResult["qqoqccp"] | null = null;

    if (isMemo) {
      // Extraction allégée mémo
      const memoResult = extraction as MemoExtractionResult;
      summary = memoResult.summary;
      items = memoResult.items || [];
      // Pas de CR formel pour un mémo
      formattedReport = `## Mémo vocal\n\n**Sujet** : ${memoResult.subject}\n**Tags** : ${(memoResult.topic_tags || []).join(", ")}\n\n${memoResult.summary}`;
    } else {
      // Extraction complète
      const fullResult = extraction as ExtractionResult;
      summary = fullResult.summary;
      items = fullResult.items || [];
      nextMeeting = fullResult.next_meeting;
      qqoqccp = fullResult.qqoqccp || null;

      // Séparer les items par type pour le CR
      const decisions = items.filter((i) => i.item_type === "decision");
      const actions = items.filter((i) => i.item_type === "action");
      const issues = items.filter((i) => i.item_type === "issue");
      const infos = items.filter((i) => i.item_type === "info");

      formattedReport = generateFormattedReport({
        meeting_title: meetingRecord.meeting_title,
        meeting_date: meetingRecord.meeting_date,
        participants: meetingRecord.participants || [],
        summary,
        decisions: decisions.map((d) => ({
          subject: d.subject,
          content: d.content,
          lot_reference: d.lot_reference,
        })),
        actions: actions.map((a) => ({
          subject: a.subject,
          content: a.content,
          responsible: a.responsible,
          due_date: a.due_date,
          lot_reference: a.lot_reference,
        })),
        issues: issues.map((i) => ({
          subject: i.subject,
          content: i.content,
          lot_reference: i.lot_reference,
        })),
        infos: infos.map((i) => ({
          subject: i.subject,
          content: i.content,
        })),
        next_meeting: nextMeeting,
        customTemplate,
      });
    }

    // -----------------------------------------------------------------------
    // Step 6 — Merge participants from extraction
    // -----------------------------------------------------------------------
    let updatedParticipants = meetingRecord.participants || [];
    if (!isMemo) {
      const extractedNames = new Set<string>();
      for (const item of items) {
        if (item.responsible) extractedNames.add(item.responsible);
      }
      const existingNames = new Set(
        updatedParticipants.map((p) => p.name.toLowerCase()),
      );
      for (const name of extractedNames) {
        if (!existingNames.has(name.toLowerCase())) {
          updatedParticipants.push({ name });
          existingNames.add(name.toLowerCase());
        }
      }
    }

    // -----------------------------------------------------------------------
    // Step 7 — Insert meeting_items
    // -----------------------------------------------------------------------
    let insertedItems: {
      id: string;
      item_type: string;
      subject: string;
      content: string;
      lot_reference?: string | null;
      responsible?: string | null;
      due_date?: string | null;
    }[] = [];

    if (items.length > 0) {
      const itemsData = items.map((item, index) => ({
        meeting_id,
        item_type: item.item_type || "info",
        subject: item.subject || "Sans titre",
        content: item.content || item.subject || "",
        context: item.context || null,
        lot_reference: item.lot_reference || null,
        responsible: item.responsible || null,
        due_date: item.due_date || null,
        location: item.location || null,
        topic_tags: item.topic_tags || [],
        related_documents: item.related_documents || [],
        status: item.item_type === "action" ? "open" : "done",
        display_order: index + 1,
      }));

      const { data: itemsResult, error: itemsErr } = await supabase
        .schema("arpet")
        .from("meeting_items")
        .insert(itemsData)
        .select("id, item_type, subject, content, lot_reference, responsible, due_date");

      if (itemsErr) {
        console.error("[meeting-extract] Items insert error:", itemsErr);
      } else {
        insertedItems = itemsResult || [];
        console.log(`[meeting-extract] Inserted ${insertedItems.length} items`);
      }
    }

    // -----------------------------------------------------------------------
    // Step 8 — Update meeting record
    // -----------------------------------------------------------------------
    const updateData: Record<string, unknown> = {
      summary,
      formatted_report: formattedReport,
      extraction_status: "done",
      model_used: "gpt-4o",
      participants: updatedParticipants,
    };

    if (nextMeeting?.date) {
      updateData.next_meeting_date = nextMeeting.date;
    }

    const { error: updateErr } = await supabase
      .schema("arpet")
      .from("meetings")
      .update(updateData)
      .eq("id", meeting_id);

    if (updateErr) {
      console.error("[meeting-extract] Meeting update error:", updateErr);
      throw new Error(`Failed to update meeting: ${updateErr.message}`);
    }

    // -----------------------------------------------------------------------
    // Stats
    // -----------------------------------------------------------------------
    const stats: MeetingStats = {
      total_items: insertedItems.length,
      decisions: insertedItems.filter((i) => i.item_type === "decision").length,
      actions: insertedItems.filter((i) => i.item_type === "action").length,
      issues: insertedItems.filter((i) => i.item_type === "issue").length,
      infos: insertedItems.filter((i) => i.item_type === "info").length,
    };

    // -----------------------------------------------------------------------
    // Step 9 — Vectorisation directe dans rag.documents
    // Stratégie : L0 (résumé) + L1 (1 chunk par item)
    // Remplace le webhook N8N — plus rapide, moins de dépendances
    // -----------------------------------------------------------------------
    let vectorizeResult = { chunks_inserted: 0, vectorize_ms: 0 };

    if (formattedReport && !isMemo && insertedItems.length > 0) {
      try {
        // On met à jour meetingRecord avec les données fraîches pour la vectorisation
        const meetingForVectorize: MeetingRecord = {
          ...meetingRecord,
          summary,
          formatted_report: formattedReport,
          participants: updatedParticipants,
        };

        vectorizeResult = await vectorizeMeeting(
          supabase,
          meetingForVectorize,
          formattedReport,
          insertedItems,
          stats,
          openaiApiKey,
          qqoqccp,
        );
      } catch (vecErr) {
        // Non-bloquant : l'extraction est réussie même si la vectorisation échoue
        console.error("[meeting-extract] Vectorization failed (non-blocking):", (vecErr as Error).message);
      }
    }

    // -----------------------------------------------------------------------
    // Response
    // -----------------------------------------------------------------------
    const totalMs = Date.now() - totalStart;
    console.log(`[meeting-extract] Done meeting=${meeting_id} items=${stats.total_items} chunks=${vectorizeResult.chunks_inserted} total=${totalMs}ms`);

    return jsonResponse({
      success: true,
      meeting_id,
      summary,
      formatted_report: formattedReport,
      items: insertedItems,
      stats,
      vectorization: {
        chunks_inserted: vectorizeResult.chunks_inserted,
        vectorize_ms: vectorizeResult.vectorize_ms,
      },
      timing: {
        extraction_ms: extractionMs,
        vectorize_ms: vectorizeResult.vectorize_ms,
        total_ms: totalMs,
      },
    });

  } catch (error) {
    console.error("[meeting-extract] Error:", error);
    return jsonResponse(
      { success: false, error: (error as Error).message || "Internal server error" },
      500,
    );
  }
});
