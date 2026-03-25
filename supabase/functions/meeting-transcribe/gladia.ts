// meeting-transcribe/gladia.ts — Client Gladia API V3
// Transcription async pre-recorded avec diarisation conditionnelle

import type {
  GladiaInitResponse,
  GladiaResultResponse,
  GladiaUploadResponse,
  SourceType,
  VocabularyItem,
} from "./types.ts";

const GLADIA_BASE_URL = "https://api.gladia.io/v2";
const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_ATTEMPTS = 200; // ~10 min max

// Types qui justifient la diarisation (plusieurs interlocuteurs)
const DIARIZATION_SOURCE_TYPES: SourceType[] = [
  "recording",
  "uploaded_audio",
  "visio_bot",
];

/**
 * Upload un fichier audio (depuis un Blob) vers Gladia.
 * Retourne l'URL Gladia à utiliser dans la requête de transcription.
 */
export async function uploadAudioToGladia(
  audioBlob: Blob,
  fileName: string,
  apiKey: string,
): Promise<string> {
  const formData = new FormData();
  formData.append("audio", audioBlob, fileName);

  const response = await fetch(`${GLADIA_BASE_URL}/upload`, {
    method: "POST",
    headers: { "x-gladia-key": apiKey },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gladia upload failed (${response.status}): ${errorText}`);
  }

  const data: GladiaUploadResponse = await response.json();
  console.log(`[gladia] Uploaded audio: ${data.audio_url} (${data.audio_metadata.audio_duration}s)`);
  return data.audio_url;
}

/**
 * Lance une transcription async Gladia.
 * - Langue forcée FR
 * - Diarisation conditionnelle selon source_type
 * - Custom vocabulary optionnel
 */
export async function initTranscription(
  audioUrl: string,
  sourceType: SourceType,
  vocabulary: VocabularyItem[],
  apiKey: string,
): Promise<GladiaInitResponse> {
  const enableDiarization = DIARIZATION_SOURCE_TYPES.includes(sourceType);

  const body: Record<string, unknown> = {
    audio_url: audioUrl,
    language_config: {
      languages: ["fr"],
      code_switching: false,
    },
    diarization: enableDiarization,
  };

  if (enableDiarization) {
    body.diarization_config = {
      min_speakers: 2,
      max_speakers: 15,
    };
  }

  if (vocabulary.length > 0) {
    body.custom_vocabulary = true;
    body.custom_vocabulary_config = {
      vocabulary: vocabulary,
      default_intensity: 0.5,
    };
  }

  console.log(`[gladia] Initiating transcription (diarization=${enableDiarization}, vocab=${vocabulary.length} terms)`);

  const response = await fetch(`${GLADIA_BASE_URL}/pre-recorded`, {
    method: "POST",
    headers: {
      "x-gladia-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gladia init failed (${response.status}): ${errorText}`);
  }

  const data: GladiaInitResponse = await response.json();
  console.log(`[gladia] Transcription initiated: ${data.id}`);
  return data;
}

/**
 * Polling du résultat de transcription Gladia.
 * Attend jusqu'à status=done ou erreur.
 */
export async function pollTranscriptionResult(
  resultUrl: string,
  apiKey: string,
): Promise<GladiaResultResponse> {
  let attempts = 0;

  while (attempts < MAX_POLL_ATTEMPTS) {
    attempts++;

    const response = await fetch(resultUrl, {
      method: "GET",
      headers: { "x-gladia-key": apiKey },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gladia poll failed (${response.status}): ${errorText}`);
    }

    const data: GladiaResultResponse = await response.json();

    if (data.status === "done") {
      console.log(`[gladia] Transcription done after ${attempts} polls`);
      return data;
    }

    if (data.status === "error") {
      throw new Error(`Gladia transcription error (code: ${data.error_code})`);
    }

    // queued ou processing → attendre
    if (attempts % 5 === 0) {
      console.log(`[gladia] Status: ${data.status} (poll #${attempts})`);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(`Gladia transcription timed out after ${MAX_POLL_ATTEMPTS} polls`);
}

/**
 * Formatte le transcript Gladia en texte lisible.
 * Avec diarisation : "Speaker 0 : texte\nSpeaker 1 : texte"
 * Sans diarisation : texte brut concaténé
 */
export function formatTranscriptAsText(result: GladiaResultResponse): string {
  if (!result.result?.transcription?.utterances) {
    return result.result?.transcription?.full_transcript || "";
  }

  const utterances = result.result.transcription.utterances;
  if (utterances.length === 0) {
    return result.result.transcription.full_transcript || "";
  }

  // Vérifier si la diarisation est active (speakers distincts > 1)
  const speakers = new Set(utterances.map((u) => u.speaker));
  const hasDiarization = speakers.size > 1;

  if (!hasDiarization) {
    return utterances.map((u) => u.text).join(" ");
  }

  // Avec diarisation : regrouper les utterances consécutives du même speaker
  const lines: string[] = [];
  let currentSpeaker = -1;
  let currentText = "";

  for (const u of utterances) {
    if (u.speaker !== currentSpeaker) {
      if (currentText) {
        lines.push(`Intervenant ${currentSpeaker + 1} : ${currentText.trim()}`);
      }
      currentSpeaker = u.speaker;
      currentText = u.text;
    } else {
      currentText += " " + u.text;
    }
  }
  if (currentText) {
    lines.push(`Intervenant ${currentSpeaker + 1} : ${currentText.trim()}`);
  }

  return lines.join("\n\n");
}
