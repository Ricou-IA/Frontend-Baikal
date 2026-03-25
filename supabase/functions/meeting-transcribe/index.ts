// meeting-transcribe/index.ts — V3: Gladia async transcription
// Remplace Whisper par Gladia (async, FR, diarisation conditionnelle, custom vocabulary)
// Pipeline : audio → Gladia upload → Gladia transcribe → poll → storage → DB

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  uploadAudioToGladia,
  initTranscription,
  pollTranscriptionResult,
  formatTranscriptAsText,
} from "./gladia.ts";
import { buildCustomVocabulary } from "./vocabulary.ts";
import type { RequestBody, SourceType, TranscribeResult } from "./types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---------------------------------------------------------------------------
// Audio helpers
// ---------------------------------------------------------------------------

function detectAudioFormat(base64?: string, fileName?: string): string {
  if (fileName) {
    const ext = fileName.split(".").pop()?.toLowerCase();
    const map: Record<string, string> = {
      mp3: "mp3", mp4: "mp4", m4a: "m4a",
      wav: "wav", webm: "webm", ogg: "ogg", flac: "flac",
    };
    if (ext && map[ext]) return map[ext];
  }
  if (base64) {
    if (base64.startsWith("SUQz") || base64.startsWith("/+M")) return "mp3";
    if (base64.startsWith("UklGR")) return "wav";
    if (base64.startsWith("T2dnU")) return "ogg";
    if (base64.startsWith("ZkxhQ")) return "flac";
    if (base64.startsWith("AAAA")) return "m4a";
    if (base64.startsWith("GkXf")) return "webm";
  }
  return "webm";
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteChars = atob(base64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    bytes[i] = byteChars.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

async function fetchAudioFromUrl(
  url: string,
): Promise<{ blob: Blob; format: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch audio: ${res.status}`);
  const ct = res.headers.get("content-type") || "audio/webm";
  const blob = await res.blob();
  let format = "webm";
  if (ct.includes("mp3") || ct.includes("mpeg")) format = "mp3";
  else if (ct.includes("wav")) format = "wav";
  else if (ct.includes("m4a") || ct.includes("mp4")) format = "m4a";
  else if (ct.includes("ogg")) format = "ogg";
  else if (ct.includes("flac")) format = "flac";
  return { blob, format };
}

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
    const gladiaApiKey = Deno.env.get("GLADIA_API_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }
    if (!gladiaApiKey) {
      throw new Error("Missing GLADIA_API_KEY");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse body
    const body: RequestBody = await req.json();
    const {
      audio_base64,
      audio_url,
      file_name,
      project_id,
      org_id,
      meeting_date,
      meeting_title,
      duration_minutes,
      created_by,
      source_type = "recording",
      participants_hint,
      agenda,
    } = body;

    // Validate
    if (!project_id || !org_id || !created_by) {
      return jsonResponse({
        error: "Missing required fields",
        required: ["project_id", "org_id", "created_by", "audio_base64 OR audio_url"],
      }, 400);
    }
    if (!audio_base64 && !audio_url) {
      return jsonResponse({
        error: "Missing audio data — provide audio_base64 or audio_url",
      }, 400);
    }

    console.log(`[meeting-transcribe] Start project=${project_id} source=${source_type}`);

    const totalStart = Date.now();

    // -----------------------------------------------------------------------
    // Step 1 — Prepare audio & upload to Gladia
    // -----------------------------------------------------------------------
    const uploadStart = Date.now();
    let gladiaAudioUrl: string;

    if (audio_url && !audio_base64) {
      // External URL — Gladia peut le consommer directement
      gladiaAudioUrl = audio_url;
      console.log("[meeting-transcribe] Using external audio URL for Gladia");
    } else {
      // Base64 ou fetch → upload vers Gladia
      let audioBlob: Blob;
      let audioFormat: string;

      if (audio_base64) {
        audioFormat = detectAudioFormat(audio_base64, file_name);
        audioBlob = base64ToBlob(audio_base64, `audio/${audioFormat}`);
      } else {
        const fetched = await fetchAudioFromUrl(audio_url!);
        audioBlob = fetched.blob;
        audioFormat = fetched.format;
      }

      const fileName_ = file_name || `audio.${audioFormat}`;
      console.log(`[meeting-transcribe] Audio: ${audioFormat}, ${audioBlob.size} bytes`);
      gladiaAudioUrl = await uploadAudioToGladia(audioBlob, fileName_, gladiaApiKey);
    }
    const uploadMs = Date.now() - uploadStart;

    // -----------------------------------------------------------------------
    // Step 2 — Build custom vocabulary
    // -----------------------------------------------------------------------
    const vocabulary = await buildCustomVocabulary(
      supabase,
      project_id,
      org_id,
      participants_hint,
    );

    // -----------------------------------------------------------------------
    // Step 3 — Initiate Gladia transcription & poll
    // -----------------------------------------------------------------------
    const transcriptionStart = Date.now();
    const initResult = await initTranscription(
      gladiaAudioUrl,
      source_type as SourceType,
      vocabulary,
      gladiaApiKey,
    );

    const result = await pollTranscriptionResult(initResult.result_url, gladiaApiKey);
    const transcriptionMs = Date.now() - transcriptionStart;

    // Extraire le texte lisible
    const transcriptTxt = formatTranscriptAsText(result);

    if (!transcriptTxt || transcriptTxt.length < 10) {
      return jsonResponse({
        success: false,
        error: "Transcription vide ou audio trop court/silencieux",
        transcript: transcriptTxt || "",
      }, 400);
    }

    const audioDuration = result.result?.metadata?.audio_duration || null;
    const speakersCount = result.result?.transcription?.utterances
      ? new Set(result.result.transcription.utterances.map((u) => u.speaker)).size
      : null;

    console.log(`[meeting-transcribe] Gladia done: ${transcriptTxt.length} chars, ${speakersCount} speakers, ${audioDuration}s`);

    // -----------------------------------------------------------------------
    // Step 4 — Store transcripts in Storage bucket
    // -----------------------------------------------------------------------
    const storageStart = Date.now();
    const meetingId = crypto.randomUUID();

    // 4a. TXT lisible
    const txtPath = `${org_id}/${meetingId}.txt`;
    const { error: txtErr } = await supabase.storage
      .from("meeting-transcripts")
      .upload(txtPath, transcriptTxt, { contentType: "text/plain", upsert: true });
    if (txtErr) throw new Error(`Storage TXT upload failed: ${txtErr.message}`);

    // 4b. JSON complet (avec utterances, timestamps, speakers)
    const jsonPath = `${org_id}/${meetingId}.json`;
    const jsonPayload = JSON.stringify({
      gladia_id: result.id,
      metadata: result.result?.metadata,
      transcription: result.result?.transcription,
    });
    const { error: jsonErr } = await supabase.storage
      .from("meeting-transcripts")
      .upload(jsonPath, jsonPayload, { contentType: "application/json", upsert: true });
    if (jsonErr) {
      console.warn(`[meeting-transcribe] JSON upload failed (non-blocking): ${jsonErr.message}`);
    }

    const storageMs = Date.now() - storageStart;

    // -----------------------------------------------------------------------
    // Step 5 — Create meeting record (extraction_status = 'transcribed')
    // -----------------------------------------------------------------------
    const meetingData = {
      id: meetingId,
      org_id,
      project_id,
      meeting_date: meeting_date || new Date().toISOString().split("T")[0],
      meeting_title: meeting_title || "Réunion",
      duration_minutes: duration_minutes || (audioDuration ? Math.ceil(audioDuration / 60) : null),
      participants: participants_hint
        ? parseParticipantsHint(participants_hint)
        : [],
      source_type,
      audio_url: audio_url || null,
      transcript_path: txtPath,
      summary: null,
      formatted_report: null,
      next_meeting_date: null,
      extraction_status: "transcribed",
      model_used: "gladia-v2",
      created_by,
    };

    const { error: meetingErr } = await supabase
      .schema("arpet")
      .from("meetings")
      .insert(meetingData);

    if (meetingErr) {
      console.error("[meeting-transcribe] DB insert error:", meetingErr);
      throw new Error(`Failed to create meeting: ${meetingErr.message}`);
    }

    const totalMs = Date.now() - totalStart;

    console.log(`[meeting-transcribe] Done meeting=${meetingId} total=${totalMs}ms`);

    // -----------------------------------------------------------------------
    // Response
    // -----------------------------------------------------------------------
    const response: TranscribeResult = {
      success: true,
      meeting_id: meetingId,
      transcript_path: txtPath,
      transcript_txt: transcriptTxt,
      transcript_json_path: jsonErr ? undefined : jsonPath,
      duration_seconds: audioDuration,
      speakers_count: speakersCount,
      timing: {
        upload_ms: uploadMs,
        transcription_ms: transcriptionMs,
        storage_ms: storageMs,
        total_ms: totalMs,
      },
    };

    return jsonResponse(response);

  } catch (error) {
    console.error("[meeting-transcribe] Error:", error);
    return jsonResponse(
      { success: false, error: (error as Error).message || "Internal server error" },
      500,
    );
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseParticipantsHint(hint: string): { name: string; role?: string }[] {
  if (!hint?.trim()) return [];
  return hint
    .split(/[,;\n]+/)
    .map((p) => {
      const trimmed = p.trim();
      if (!trimmed) return null;
      const match = trimmed.match(/^(.+?)\s*\((.+)\)$/);
      if (match) return { name: match[1].trim(), role: match[2].trim() };
      return { name: trimmed };
    })
    .filter((p): p is { name: string; role?: string } => p !== null && p.name.length > 0);
}
