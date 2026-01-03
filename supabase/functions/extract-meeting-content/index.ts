import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ============================================================================
// TYPES
// ============================================================================

interface Participant {
  name: string;
  role?: string;
}

interface MeetingItem {
  item_type: "decision" | "action" | "issue" | "info";
  subject: string;
  content: string;
  context?: string;
  lot_reference?: string;
  responsible?: string;
  due_date?: string;
}

interface ExtractionResult {
  meeting_date?: string;
  meeting_title?: string;
  participants: Participant[];
  summary?: string;
  next_meeting_date?: string;
  items: MeetingItem[];
}

interface RequestBody {
  transcript_path: string;
  project_id: string;
  org_id: string;
  meeting_date?: string;
  meeting_title?: string;
  source_type: "recording" | "uploaded_cr" | "manual";
  audio_url?: string;
  duration_minutes?: number;
  created_by: string;
  // Enrichissement depuis le frontend
  participants_hint?: string;
  agenda?: string;
}

interface MeetingRecord {
  id: string;
  org_id: string;
  project_id: string;
  meeting_date: string;
  meeting_title: string;
  duration_minutes: number | null;
  participants: Participant[];
  summary: string | null;
  formatted_report: string | null;
  transcript_path: string;
  created_by: string;
}

interface MeetingItemRecord {
  id: string;
  item_type: string;
  subject: string;
  content: string;
  context: string | null;
  lot_reference: string | null;
  responsible: string | null;
  due_date: string | null;
}

interface MeetingStats {
  total_items: number;
  decisions: number;
  actions: number;
  issues: number;
  infos: number;
}

// ============================================================================
// PROMPTS
// ============================================================================

function buildExtractionPrompt(transcript: string, participantsHint?: string, agenda?: string): string {
  let contextSection = "";
  
  if (participantsHint || agenda) {
    contextSection = `
CONTEXTE FOURNI PAR L'UTILISATEUR :
`;
    if (participantsHint) {
      contextSection += `- Participants attendus : ${participantsHint}\n`;
    }
    if (agenda) {
      contextSection += `- Ordre du jour prévu : ${agenda}\n`;
    }
    contextSection += `
Utilise ces informations pour enrichir ton analyse. Si le transcript mentionne des noms, associe-les aux rôles indiqués ci-dessus.

`;
  }

  return `Tu es un assistant spécialisé dans l'analyse de comptes-rendus de réunions de chantier BTP.
${contextSection}
TRANSCRIPT À ANALYSER :
${transcript}

INSTRUCTIONS :
1. Extrais la DATE de la réunion (format YYYY-MM-DD)
2. Propose un TITRE court et descriptif pour cette réunion
3. Liste les PARTICIPANTS avec leurs rôles si mentionnés
4. Rédige un RÉSUMÉ de 2-3 phrases des points clés
5. Identifie la date de la PROCHAINE RÉUNION si mentionnée

6. Pour chaque point abordé, identifie s'il s'agit de :
   - DECISION : engagement ferme pris (ex: "on décide de...", "il est convenu que...")
   - ACTION : tâche à réaliser avec responsable (ex: "X doit faire...", "à faire pour...")
   - ISSUE : problème identifié nécessitant attention (ex: "problème de...", "retard sur...")
   - INFO : information importante partagée (ex: "à noter que...", "pour information...")

7. Pour chaque item extrait, fournis :
   - subject : titre court (max 100 caractères)
   - content : description complète
   - context : pourquoi cette décision/action (si pertinent)
   - lot_reference : lot concerné si identifiable (ex: "Lot 4 - Étanchéité", "Lot 2 - Gros œuvre")
   - responsible : nom du responsable si mentionné
   - due_date : échéance au format YYYY-MM-DD si mentionnée

FORMAT DE SORTIE : JSON strict, sans commentaires, sans markdown.

{
  "meeting_date": "YYYY-MM-DD ou null",
  "meeting_title": "Titre de la réunion",
  "participants": [
    {"name": "Nom", "role": "Rôle si connu"}
  ],
  "summary": "Résumé en 2-3 phrases",
  "next_meeting_date": "YYYY-MM-DDTHH:MM:SS ou null",
  "items": [
    {
      "item_type": "decision|action|issue|info",
      "subject": "Titre court",
      "content": "Description complète",
      "context": "Contexte si pertinent",
      "lot_reference": "Lot X - Description ou null",
      "responsible": "Nom ou null",
      "due_date": "YYYY-MM-DD ou null"
    }
  ]
}

RÈGLES IMPORTANTES :
- Réponds UNIQUEMENT avec le JSON, sans texte avant ou après
- Si une information n'est pas disponible, utilise null
- Sois précis sur les dates et les responsables
- Distingue bien les DÉCISIONS (engagement) des ACTIONS (tâche)
- Un même sujet peut générer plusieurs items (ex: une décision ET une action associée)`;
}

// ============================================================================
// HELPER: Parse participants hint string to Participant array
// Accepte plusieurs séparateurs : virgule, point-virgule, retour ligne
// ============================================================================
function parseParticipantsHint(hint: string): Participant[] {
  if (!hint || hint.trim() === "") return [];
  
  // Accepter virgule, point-virgule, ou retour à la ligne comme séparateurs
  const separatorRegex = /[,;\n]+/;
  
  return hint.split(separatorRegex).map((p) => {
    const trimmed = p.trim();
    if (!trimmed) return null;
    
    // Format attendu : "M. Martin (OPC)" ou juste "Martin"
    const match = trimmed.match(/^(.+?)\s*\((.+)\)$/);
    if (match) {
      return { name: match[1].trim(), role: match[2].trim() };
    }
    return { name: trimmed, role: undefined };
  }).filter((p): p is Participant => p !== null && p.name.length > 0);
}

// ============================================================================
// HELPER: Merge participants from hint and GPT extraction
// Priorité : hint d'abord (avec rôles), puis ajout des participants GPT non présents
// ============================================================================
function mergeParticipants(hintParticipants: Participant[], gptParticipants: Participant[]): Participant[] {
  const merged: Participant[] = [...hintParticipants];
  const existingNames = new Set(hintParticipants.map((p) => p.name.toLowerCase()));
  
  // Ajouter les participants GPT qui ne sont pas déjà dans le hint
  for (const gptParticipant of gptParticipants) {
    const nameLower = gptParticipant.name.toLowerCase();
    
    // Vérifier si ce nom (ou un nom similaire) existe déjà
    let exists = existingNames.has(nameLower);
    
    // Vérification supplémentaire : nom partiel (ex: "Paul" vs "M. Paul Durand")
    if (!exists) {
      for (const existingName of existingNames) {
        if (existingName.includes(nameLower) || nameLower.includes(existingName)) {
          exists = true;
          break;
        }
      }
    }
    
    if (!exists) {
      merged.push(gptParticipant);
      existingNames.add(nameLower);
    } else {
      // Si le participant existe dans hint sans rôle, mais GPT a trouvé un rôle, mettre à jour
      const hintIndex = merged.findIndex((p) => p.name.toLowerCase() === nameLower);
      if (hintIndex !== -1 && !merged[hintIndex].role && gptParticipant.role) {
        merged[hintIndex].role = gptParticipant.role;
      }
    }
  }
  
  return merged;
}

// ============================================================================
// HELPER: Download transcript from bucket
// ============================================================================
async function downloadTranscriptFromBucket(
  supabase: ReturnType<typeof createClient>,
  transcriptPath: string
): Promise<string> {
  const { data, error } = await supabase.storage
    .from("meeting-transcripts")
    .download(transcriptPath);

  if (error) {
    throw new Error(`Failed to download transcript from bucket: ${error.message}`);
  }

  const transcript = await data.text();
  return transcript;
}

// ============================================================================
// HELPER: Generate formatted report (CR structuré)
// Version: 1.1.0 - Ajout header "RÉUNION DE CHANTIER" pour meilleur matching RAG
// ============================================================================
function generateFormattedReport(
  meeting: { meeting_title: string; meeting_date: string; participants: Participant[]; summary: string | null },
  items: MeetingItemRecord[]
): string {
  const decisions = items.filter((i) => i.item_type === "decision");
  const actions = items.filter((i) => i.item_type === "action");
  const issues = items.filter((i) => i.item_type === "issue");
  const infos = items.filter((i) => i.item_type === "info");

  const participantsList = meeting.participants
    ?.map((p: Participant) => (p.role ? `${p.name} (${p.role})` : p.name))
    .join(", ") || "Non spécifiés";

  // Header enrichi pour meilleur matching RAG
  let report = `RÉUNION DE CHANTIER - ${meeting.meeting_date}
Titre : ${meeting.meeting_title}
Participants : ${participantsList}

COMPTE-RENDU :
`;

  if (meeting.summary) {
    report += `
RÉSUMÉ :
${meeting.summary}
`;
  }

  if (decisions.length > 0) {
    report += `
DÉCISIONS :
${decisions.map((d) => `• ${d.subject} : ${d.content}`).join("\n")}
`;
  }

  if (actions.length > 0) {
    report += `
ACTIONS :
${actions.map((a) => `• ${a.subject} (${a.responsible || "À définir"}) : ${a.content}${a.due_date ? ` - Échéance: ${a.due_date}` : ""}`).join("\n")}
`;
  }

  if (issues.length > 0) {
    report += `
POINTS D'ATTENTION :
${issues.map((i) => `• ${i.subject} : ${i.content}`).join("\n")}
`;
  }

  if (infos.length > 0) {
    report += `
INFORMATIONS :
${infos.map((i) => `• ${i.subject} : ${i.content}`).join("\n")}
`;
  }

  return report.trim();
}

// ============================================================================
// HELPER: Send to RAG via N8N webhook (fire & forget)
// Version: 1.1.0 - Ajout target_apps + source_meeting_id
// ============================================================================
async function sendToRAG(
  meeting: MeetingRecord,
  items: MeetingItemRecord[],
  formattedReport: string,
  stats: MeetingStats
): Promise<void> {
  const webhookUrl = Deno.env.get("N8N_MEETING_WEBHOOK_URL");
  
  if (!webhookUrl) {
    console.warn("[extract-meeting-content] N8N_MEETING_WEBHOOK_URL not configured - skipping RAG vectorization");
    return;
  }

  // Extract unique lots discussed
  const lotsDiscussed = [...new Set(
    items
      .map((i) => i.lot_reference)
      .filter((lot): lot is string => lot !== null && lot !== undefined)
  )];

  // Extract unique topics (subjects)
  const topics = [...new Set(items.map((i) => i.subject))];

  // Build the payload
  const payload = {
    // Content for vectorization (formatted report, not raw transcript)
    content: formattedReport,
    
    // Metadata
    metadata: {
      source_type: "meeting_transcript",
      document_type: "hot",
      meeting_id: meeting.id,
      meeting_title: meeting.meeting_title,
      meeting_date: meeting.meeting_date,
      duration_minutes: meeting.duration_minutes,
      participants: meeting.participants,
      lots_discussed: lotsDiscussed,
      decisions_count: stats.decisions,
      actions_count: stats.actions,
      issues_count: stats.issues,
      topics: topics,
      transcript_path: meeting.transcript_path,
      project_id: meeting.project_id,
      org_id: meeting.org_id,
      created_by: meeting.created_by,
    },
    
    // For N8N routing
    project_id: meeting.project_id,
    org_id: meeting.org_id,
    source_file_id: null,
    source_meeting_id: meeting.id,  // Lien vers la réunion source
    target_apps: ["arpet"],          // Cibler ARPET
  };

  console.log(`[extract-meeting-content] Sending to RAG webhook: ${webhookUrl}`);
  console.log(`[extract-meeting-content] Payload size: ${JSON.stringify(payload).length} chars`);

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`N8N webhook returned ${response.status}: ${errorText}`);
  }

  console.log(`[extract-meeting-content] RAG webhook responded: ${response.status}`);
}

// ============================================================================
// HELPER: Extract with GPT-4o-mini
// ============================================================================
async function extractWithGPT(
  transcript: string, 
  openaiApiKey: string,
  participantsHint?: string,
  agenda?: string
): Promise<ExtractionResult> {
  const prompt = buildExtractionPrompt(transcript, participantsHint, agenda);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Tu es un assistant spécialisé dans l'analyse de comptes-rendus de chantier BTP. Tu réponds uniquement en JSON valide.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 4000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Empty response from OpenAI");
  }

  // Parse JSON response (handle potential markdown code blocks)
  let jsonContent = content.trim();
  if (jsonContent.startsWith("```json")) {
    jsonContent = jsonContent.slice(7);
  }
  if (jsonContent.startsWith("```")) {
    jsonContent = jsonContent.slice(3);
  }
  if (jsonContent.endsWith("```")) {
    jsonContent = jsonContent.slice(0, -3);
  }
  jsonContent = jsonContent.trim();

  try {
    const parsed = JSON.parse(jsonContent) as ExtractionResult;
    return parsed;
  } catch (parseError) {
    console.error("Failed to parse GPT response:", jsonContent);
    throw new Error(`Failed to parse extraction result: ${parseError.message}`);
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================
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

    // Parse request body
    const body: RequestBody = await req.json();
    const {
      transcript_path,
      project_id,
      org_id,
      meeting_date,
      meeting_title,
      source_type,
      audio_url,
      duration_minutes,
      created_by,
      participants_hint,
      agenda,
    } = body;

    // Validate required fields
    if (!transcript_path || !project_id || !org_id || !created_by) {
      return new Response(
        JSON.stringify({ 
          error: "Missing required fields",
          required: ["transcript_path", "project_id", "org_id", "created_by"]
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[extract-meeting-content] Processing transcript for project ${project_id}`);
    console.log(`[extract-meeting-content] Transcript path: ${transcript_path}`);
    if (participants_hint) {
      console.log(`[extract-meeting-content] Participants hint: ${participants_hint}`);
    }
    if (agenda) {
      console.log(`[extract-meeting-content] Agenda: ${agenda}`);
    }

    // Create Supabase client with service role (bypass RLS)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Step 1: Download transcript from bucket
    console.log("[extract-meeting-content] Downloading transcript from bucket...");
    const downloadStartTime = Date.now();
    const transcriptText = await downloadTranscriptFromBucket(supabase, transcript_path);
    const downloadDuration = Date.now() - downloadStartTime;
    console.log(`[extract-meeting-content] Downloaded in ${downloadDuration}ms, length: ${transcriptText.length} chars`);

    // Step 2: Parse participants hint
    const hintParticipants = parseParticipantsHint(participants_hint || "");
    if (hintParticipants.length > 0) {
      console.log(`[extract-meeting-content] Parsed ${hintParticipants.length} participants from hint:`, hintParticipants);
    }

    // Step 3: Extract structured content with GPT-4o-mini
    console.log("[extract-meeting-content] Calling GPT-4o-mini for extraction...");
    const extractionStartTime = Date.now();
    const extraction = await extractWithGPT(transcriptText, openaiApiKey, participants_hint, agenda);
    const extractionDuration = Date.now() - extractionStartTime;
    console.log(`[extract-meeting-content] Extracted ${extraction.items?.length || 0} items in ${extractionDuration}ms`);

    // Step 4: Merge participants (hint + GPT)
    const gptParticipants = extraction.participants || [];
    const finalParticipants = mergeParticipants(hintParticipants, gptParticipants);
    console.log(`[extract-meeting-content] Final participants (${finalParticipants.length}):`, finalParticipants);

    // Step 5: Prepare meeting data
    const meetingData = {
      org_id,
      project_id,
      meeting_date: extraction.meeting_date || meeting_date || new Date().toISOString().split("T")[0],
      meeting_title: extraction.meeting_title || meeting_title || "Réunion de chantier",
      duration_minutes: duration_minutes || null,
      participants: finalParticipants,
      source_type,
      audio_url: audio_url || null,
      transcript_path,
      summary: extraction.summary || null,
      formatted_report: null,
      next_meeting_date: extraction.next_meeting_date || null,
      extraction_status: "done",
      model_used: "gpt-4o-mini",
      created_by,
    };

    // Step 6: Insert meeting into arpet.meetings
    const { data: meeting, error: meetingError } = await supabase
      .schema("arpet")
      .from("meetings")
      .insert(meetingData)
      .select()
      .single();

    if (meetingError) {
      console.error("[extract-meeting-content] Error inserting meeting:", meetingError);
      throw new Error(`Failed to insert meeting: ${meetingError.message}`);
    }

    console.log(`[extract-meeting-content] Created meeting ${meeting.id}`);

    // Step 7: Insert meeting items into arpet.meeting_items
    const items = extraction.items || [];
    let insertedItems: MeetingItemRecord[] = [];

    if (items.length > 0) {
      const itemsData = items.map((item, index) => ({
        meeting_id: meeting.id,
        item_type: item.item_type || "info",
        subject: item.subject || "Sans titre",
        content: item.content || item.subject || "Contenu non spécifié",
        context: item.context || null,
        lot_reference: item.lot_reference || null,
        responsible: item.responsible || null,
        due_date: item.due_date || null,
        // CORRECTION: toujours fournir un status valide
        status: item.item_type === "action" ? "open" : "done",
        display_order: index + 1,
      }));

      const { data: itemsResult, error: itemsError } = await supabase
        .schema("arpet")
        .from("meeting_items")
        .insert(itemsData)
        .select();

      if (itemsError) {
        console.error("[extract-meeting-content] Error inserting items:", itemsError);
        // Don't throw - meeting was created, just log the error
      } else {
        insertedItems = itemsResult || [];
        console.log(`[extract-meeting-content] Inserted ${insertedItems.length} items`);
      }
    }

    // Step 8: Generate and update formatted_report
    const formattedReport = generateFormattedReport(
      {
        meeting_title: meeting.meeting_title,
        meeting_date: meeting.meeting_date,
        participants: meeting.participants,
        summary: meeting.summary,
      },
      insertedItems
    );

    const { error: updateError } = await supabase
      .schema("arpet")
      .from("meetings")
      .update({ formatted_report: formattedReport })
      .eq("id", meeting.id);

    if (updateError) {
      console.error("[extract-meeting-content] Error updating formatted_report:", updateError);
    } else {
      console.log(`[extract-meeting-content] Updated formatted_report (${formattedReport.length} chars)`);
    }

    // Build stats
    const stats: MeetingStats = {
      total_items: insertedItems.length,
      decisions: insertedItems.filter((i) => i.item_type === "decision").length,
      actions: insertedItems.filter((i) => i.item_type === "action").length,
      issues: insertedItems.filter((i) => i.item_type === "issue").length,
      infos: insertedItems.filter((i) => i.item_type === "info").length,
    };

    // Step 9: Send to RAG via N8N webhook (fire & forget)
    const meetingWithReport: MeetingRecord = {
      ...meeting,
      formatted_report: formattedReport,
    };

    sendToRAG(meetingWithReport, insertedItems, formattedReport, stats).catch((err) => {
      console.error("[extract-meeting-content] RAG webhook failed (non-blocking):", err.message);
    });

    // Step 10: Return complete meeting with items
    const result = {
      success: true,
      meeting: {
        ...meeting,
        formatted_report: formattedReport,
        items: insertedItems,
      },
      stats,
      timing: {
        download_ms: downloadDuration,
        extraction_ms: extractionDuration,
      },
    };

    console.log("[extract-meeting-content] Extraction complete:", result.stats);

    return new Response(
      JSON.stringify(result),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error) {
    console.error("[extract-meeting-content] Error:", error);
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message || "Internal server error" 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
