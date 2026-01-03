import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RequestBody {
  audio_base64?: string;
  audio_url?: string;
  file_name?: string;
  project_id: string;
  org_id: string;
  meeting_date?: string;
  meeting_title?: string;
  duration_minutes?: number;
  created_by: string;
  // Enrichissement depuis le frontend
  participants_hint?: string;
  agenda?: string;
}

// Generate UUID v4
function generateUUID(): string {
  return crypto.randomUUID();
}

// Detect audio format from base64 header or file name
function detectAudioFormat(base64?: string, fileName?: string): string {
  if (fileName) {
    const ext = fileName.split(".").pop()?.toLowerCase();
    const formatMap: Record<string, string> = {
      mp3: "mp3",
      mp4: "mp4",
      m4a: "m4a",
      wav: "wav",
      webm: "webm",
      ogg: "ogg",
      flac: "flac",
    };
    if (ext && formatMap[ext]) {
      return formatMap[ext];
    }
  }

  if (base64) {
    // Check magic bytes in base64
    if (base64.startsWith("SUQz") || base64.startsWith("/+M")) return "mp3";
    if (base64.startsWith("UklGR")) return "wav";
    if (base64.startsWith("T2dnU")) return "ogg";
    if (base64.startsWith("ZkxhQ")) return "flac";
    if (base64.startsWith("AAAA")) return "m4a";
    if (base64.startsWith("GkXf")) return "webm";
  }

  // Default to webm (common for browser recordings)
  return "webm";
}

// Convert base64 to Blob
function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

// Fetch audio from URL and return as Blob
async function fetchAudioFromUrl(url: string): Promise<{ blob: Blob; format: string }> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch audio from URL: ${response.status}`);
  }
  
  const contentType = response.headers.get("content-type") || "audio/webm";
  const blob = await response.blob();
  
  // Extract format from content-type
  let format = "webm";
  if (contentType.includes("mp3") || contentType.includes("mpeg")) format = "mp3";
  else if (contentType.includes("wav")) format = "wav";
  else if (contentType.includes("m4a") || contentType.includes("mp4")) format = "m4a";
  else if (contentType.includes("ogg")) format = "ogg";
  else if (contentType.includes("flac")) format = "flac";
  else if (contentType.includes("webm")) format = "webm";
  
  return { blob, format };
}

// Transcribe audio using OpenAI Whisper
async function transcribeWithWhisper(
  audioBlob: Blob,
  format: string,
  openaiApiKey: string
): Promise<string> {
  const formData = new FormData();
  formData.append("file", audioBlob, `audio.${format}`);
  formData.append("model", "whisper-1");
  formData.append("language", "fr");
  formData.append("response_format", "text");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openaiApiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Whisper API error: ${response.status} - ${error}`);
  }

  const transcript = await response.text();
  return transcript.trim();
}

// Upload transcript to bucket
async function uploadTranscriptToBucket(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  transcriptId: string,
  transcript: string
): Promise<string> {
  const path = `${orgId}/${transcriptId}.txt`;
  
  const { error } = await supabase.storage
    .from("meeting-transcripts")
    .upload(path, transcript, {
      contentType: "text/plain",
      upsert: false,
    });

  if (error) {
    throw new Error(`Failed to upload transcript to bucket: ${error.message}`);
  }

  return path;
}

// Call extract-meeting-content Edge Function
async function callExtractMeetingContent(
  transcriptPath: string,
  projectId: string,
  orgId: string,
  meetingDate: string | undefined,
  meetingTitle: string | undefined,
  audioUrl: string | undefined,
  durationMinutes: number | undefined,
  createdBy: string,
  participantsHint: string | undefined,
  agenda: string | undefined,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<any> {
  const extractUrl = `${supabaseUrl}/functions/v1/extract-meeting-content`;

  console.log(`[meeting-transcribe] Calling extract-meeting-content at ${extractUrl}`);

  const requestBody = {
    transcript_path: transcriptPath,
    project_id: projectId,
    org_id: orgId,
    meeting_date: meetingDate,
    meeting_title: meetingTitle,
    source_type: "recording",
    audio_url: audioUrl,
    duration_minutes: durationMinutes,
    created_by: createdBy,
    // Enrichissement
    participants_hint: participantsHint,
    agenda: agenda,
  };

  console.log("[meeting-transcribe] Request body:", JSON.stringify(requestBody));

  const response = await fetch(extractUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${supabaseServiceKey}`,
      "apikey": supabaseServiceKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  // Read response as text first
  const responseText = await response.text();
  console.log(`[meeting-transcribe] extract-meeting-content response status: ${response.status}`);
  console.log(`[meeting-transcribe] extract-meeting-content response (first 500 chars): ${responseText.substring(0, 500)}`);

  if (!response.ok) {
    throw new Error(`extract-meeting-content error: ${response.status} - ${responseText}`);
  }

  // Try to parse as JSON
  try {
    return JSON.parse(responseText);
  } catch (parseError) {
    throw new Error(`extract-meeting-content returned invalid JSON. Status: ${response.status}, Response: ${responseText.substring(0, 1000)}`);
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // Get environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }
    if (!openaiApiKey) {
      throw new Error("Missing OpenAI API key");
    }

    // Create Supabase client with service role
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
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
      participants_hint,
      agenda,
    } = body;

    // Validate required fields
    if (!project_id || !org_id || !created_by) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields",
          required: ["project_id", "org_id", "created_by", "audio_base64 OR audio_url"],
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!audio_base64 && !audio_url) {
      return new Response(
        JSON.stringify({
          error: "Missing audio data",
          message: "Provide either audio_base64 or audio_url",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[meeting-transcribe] Starting transcription for project ${project_id}`);
    if (participants_hint) {
      console.log(`[meeting-transcribe] Participants hint: ${participants_hint}`);
    }
    if (agenda) {
      console.log(`[meeting-transcribe] Agenda: ${agenda}`);
    }

    // Step 1: Get audio blob
    let audioBlob: Blob;
    let audioFormat: string;
    let finalAudioUrl = audio_url;

    if (audio_base64) {
      // Decode base64 audio
      console.log("[meeting-transcribe] Processing base64 audio...");
      audioFormat = detectAudioFormat(audio_base64, file_name);
      const mimeType = `audio/${audioFormat}`;
      audioBlob = base64ToBlob(audio_base64, mimeType);
      console.log(`[meeting-transcribe] Audio format: ${audioFormat}, size: ${audioBlob.size} bytes`);
    } else if (audio_url) {
      // Fetch audio from URL
      console.log(`[meeting-transcribe] Fetching audio from URL: ${audio_url}`);
      const result = await fetchAudioFromUrl(audio_url);
      audioBlob = result.blob;
      audioFormat = result.format;
      console.log(`[meeting-transcribe] Audio format: ${audioFormat}, size: ${audioBlob.size} bytes`);
    } else {
      throw new Error("No audio data provided");
    }

    // Step 2: Transcribe with Whisper
    console.log("[meeting-transcribe] Calling Whisper API...");
    const whisperStartTime = Date.now();
    const transcript = await transcribeWithWhisper(audioBlob, audioFormat, openaiApiKey);
    const whisperDuration = Date.now() - whisperStartTime;
    console.log(`[meeting-transcribe] Whisper completed in ${whisperDuration}ms`);
    console.log(`[meeting-transcribe] Transcript length: ${transcript.length} chars`);

    if (!transcript || transcript.length < 10) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Transcription failed or audio is too short/silent",
          transcript: transcript || "",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 3: Upload transcript to bucket (SOURCE DE VÉRITÉ)
    console.log("[meeting-transcribe] Uploading transcript to bucket...");
    const transcriptId = generateUUID();
    const uploadStartTime = Date.now();
    const transcriptPath = await uploadTranscriptToBucket(
      supabase,
      org_id,
      transcriptId,
      transcript
    );
    const uploadDuration = Date.now() - uploadStartTime;
    console.log(`[meeting-transcribe] Transcript uploaded to ${transcriptPath} in ${uploadDuration}ms`);

    // Step 4: Call extract-meeting-content for structured extraction
    console.log("[meeting-transcribe] Calling extract-meeting-content...");
    const extractionStartTime = Date.now();
    const extractionResult = await callExtractMeetingContent(
      transcriptPath,
      project_id,
      org_id,
      meeting_date,
      meeting_title,
      finalAudioUrl,
      duration_minutes,
      created_by,
      participants_hint,
      agenda,
      supabaseUrl,
      supabaseServiceKey
    );
    const extractionDuration = Date.now() - extractionStartTime;
    console.log(`[meeting-transcribe] Extraction completed in ${extractionDuration}ms`);

    // Step 5: Return complete result (include transcript for frontend display)
    const result = {
      success: true,
      transcript_path: transcriptPath,
      transcript_length: transcript.length,
      transcript: transcript,  // Ajout du transcript pour affichage frontend
      meeting: extractionResult.meeting,
      stats: extractionResult.stats,
      timing: {
        whisper_ms: whisperDuration,
        upload_ms: uploadDuration,
        extraction_ms: extractionDuration,
        total_ms: whisperDuration + uploadDuration + extractionDuration,
      },
    };

    console.log("[meeting-transcribe] Complete:", {
      transcript_path: transcriptPath,
      transcript_length: transcript.length,
      items_count: extractionResult.stats?.total_items || 0,
      total_time_ms: result.timing.total_ms,
    });

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[meeting-transcribe] Error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Internal server error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
