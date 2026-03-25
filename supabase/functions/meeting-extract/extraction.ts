// meeting-extract/extraction.ts — GPT-4o extraction V3
// Prompt structuré + parsing JSON pour réunions et mémos

import type {
  ExtractionResult,
  MemoExtractionResult,
  Participant,
} from "./types.ts";

// ---------------------------------------------------------------------------
// Prompt pour extraction complète (réunion)
// ---------------------------------------------------------------------------

function buildFullExtractionPrompt(
  transcript: string,
  participants: Participant[],
  meetingTitle: string,
  meetingDate: string,
  agenda?: string,
): string {
  let context = "";
  if (participants.length > 0) {
    const list = participants.map((p) => p.role ? `${p.name} (${p.role})` : p.name).join(", ");
    context += `Participants connus : ${list}\n`;
  }
  if (agenda) {
    context += `Ordre du jour : ${agenda}\n`;
  }

  return `Tu es un assistant expert en analyse de comptes-rendus de chantier BTP (ARPET).

CONTEXTE :
Titre : ${meetingTitle}
Date : ${meetingDate}
${context}
TRANSCRIPT :
${transcript}

INSTRUCTIONS :
Analyse ce transcript et produis un JSON structuré contenant :

1. "summary" : résumé concis (3-5 phrases) des points clés de la réunion
2. "key_points" : liste des points principaux (5-10 bullet points)
3. "items" : tableau d'items extraits, chacun avec :
   - "item_type" : "decision" | "action" | "issue" | "info"
   - "subject" : titre court (max 100 chars)
   - "content" : description complète
   - "context" : pourquoi (si pertinent, sinon null)
   - "lot_reference" : lot concerné (ex: "Lot 4 - Étanchéité", sinon null)
   - "responsible" : nom du responsable (si identifiable, sinon null)
   - "due_date" : échéance au format YYYY-MM-DD (si mentionnée, sinon null)
   - "location" : lieu/zone concernée dans le bâtiment (si pertinent, sinon null)
   - "topic_tags" : tags thématiques (ex: ["sécurité", "planning", "finitions"])
   - "related_documents" : documents mentionnés (ex: ["CCTP lot 4", "Plan RDC"], sinon [])

4. "formatted_report" : laisser vide ("") — sera généré côté serveur

5. "next_meeting" : si mentionnée
   - "date" : date au format YYYY-MM-DD (ou null)
   - "agenda_items" : points prévus pour la prochaine réunion (ou [])

6. "qqoqccp" : grille d'analyse
   - "qui" : personnes/entités impliquées
   - "quoi" : sujets/objets traités
   - "ou" : lieux/zones concernés
   - "quand" : dates/échéances mentionnées
   - "comment" : méthodes/moyens évoqués
   - "combien" : chiffres/quantités/montants
   - "pourquoi" : raisons/justifications

RÈGLES :
- Réponds UNIQUEMENT avec le JSON, sans texte avant/après, sans markdown
- Distingue DÉCISION (engagement pris) vs ACTION (tâche à faire)
- Un même sujet peut générer plusieurs items
- Sois précis sur les dates, responsables, lots
- Les topic_tags doivent être en français, lowercase
- Si information non disponible, utilise null ou []`;
}

// ---------------------------------------------------------------------------
// Prompt pour extraction allégée (mémo vocal)
// ---------------------------------------------------------------------------

function buildMemoExtractionPrompt(transcript: string): string {
  return `Tu es un assistant qui analyse des mémos vocaux de chantier BTP.

MÉMO VOCAL :
${transcript}

INSTRUCTIONS :
Analyse ce mémo vocal et produis un JSON structuré contenant :

1. "summary" : résumé concis du mémo (1-2 phrases)
2. "subject" : sujet principal du mémo (titre court)
3. "topic_tags" : tags thématiques en français, lowercase (ex: ["sécurité", "plancher"])
4. "items" : tableau d'items si pertinents (actions à faire, points à noter)
   Chaque item :
   - "item_type" : "action" | "info" (pas de "decision" ni "issue" pour un mémo)
   - "subject" : titre court
   - "content" : description
   - "context" : null
   - "lot_reference" : lot concerné ou null
   - "responsible" : responsable ou null
   - "due_date" : échéance YYYY-MM-DD ou null
   - "location" : lieu/zone ou null
   - "topic_tags" : tags thématiques
   - "related_documents" : []

RÈGLES :
- Réponds UNIQUEMENT avec le JSON, sans texte ni markdown
- Un mémo est court et informel — extraction légère
- Si aucune action identifiable, renvoyer items: []`;
}

// ---------------------------------------------------------------------------
// GPT-4o call
// ---------------------------------------------------------------------------

export async function extractWithGPT4o(
  transcript: string,
  participants: Participant[],
  meetingTitle: string,
  meetingDate: string,
  sourceType: string,
  openaiApiKey: string,
  agenda?: string,
): Promise<ExtractionResult | MemoExtractionResult> {
  const isMemo = sourceType === "memo";

  const userPrompt = isMemo
    ? buildMemoExtractionPrompt(transcript)
    : buildFullExtractionPrompt(transcript, participants, meetingTitle, meetingDate, agenda);

  const systemPrompt = isMemo
    ? "Tu es un assistant d'analyse de mémos vocaux BTP. Tu réponds uniquement en JSON valide."
    : "Tu es un assistant expert en analyse de comptes-rendus de chantier BTP. Tu réponds uniquement en JSON valide.";

  console.log(`[extraction] Calling GPT-4o (mode=${isMemo ? "memo" : "full"}, transcript=${transcript.length} chars)`);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 8000,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Empty response from GPT-4o");
  }

  // Parse JSON (json_object mode devrait garantir du JSON valide)
  let parsed: ExtractionResult | MemoExtractionResult;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Fallback: nettoyer les éventuels markdown code blocks
    let cleaned = content.trim();
    if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
    if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
    if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
    parsed = JSON.parse(cleaned.trim());
  }

  // Validation minimale
  if (isMemo) {
    const memo = parsed as MemoExtractionResult;
    if (!memo.summary) memo.summary = "";
    if (!memo.subject) memo.subject = "Mémo vocal";
    if (!memo.topic_tags) memo.topic_tags = [];
    if (!memo.items) memo.items = [];
  } else {
    const full = parsed as ExtractionResult;
    if (!full.summary) full.summary = "";
    if (!full.key_points) full.key_points = [];
    if (!full.items) full.items = [];
    if (!full.formatted_report) full.formatted_report = "";
    if (!full.qqoqccp) {
      full.qqoqccp = { qui: [], quoi: [], ou: [], quand: [], comment: [], combien: [], pourquoi: [] };
    }
  }

  const itemCount = (parsed as { items?: unknown[] }).items?.length || 0;
  console.log(`[extraction] GPT-4o returned ${itemCount} items`);

  return parsed;
}
