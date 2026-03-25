// meeting-transcribe/types.ts — Types partagés V3

export interface RequestBody {
  audio_base64?: string;
  audio_url?: string;
  file_name?: string;
  project_id: string;
  org_id: string;
  meeting_date?: string;
  meeting_title?: string;
  duration_minutes?: number;
  created_by: string;
  source_type: SourceType;
  participants_hint?: string;
  agenda?: string;
}

export type SourceType =
  | "recording"
  | "uploaded_audio"
  | "visio_bot"
  | "memo";

export interface GladiaInitResponse {
  id: string;
  result_url: string;
}

export interface GladiaWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
}

export interface GladiaUtterance {
  start: number;
  end: number;
  confidence: number;
  channel: number;
  speaker: number;
  words: GladiaWord[];
  text: string;
  language: string;
}

export interface GladiaTranscriptionResult {
  metadata: {
    audio_duration: number;
    number_of_distinct_channels: number;
    billing_time: number;
    transcription_time: number;
  };
  transcription: {
    full_transcript: string;
    languages: string[];
    utterances: GladiaUtterance[];
  };
}

export interface GladiaResultResponse {
  id: string;
  request_id: string;
  version: number;
  status: "queued" | "processing" | "done" | "error";
  created_at: string;
  completed_at?: string;
  error_code?: number | null;
  result?: GladiaTranscriptionResult;
}

export interface GladiaUploadResponse {
  audio_url: string;
  audio_metadata: {
    id: string;
    filename: string;
    extension: string;
    size: number;
    audio_duration: number;
    number_of_channels: number;
  };
}

export interface VocabularyItem {
  value: string;
  intensity?: number;
  language?: string;
}

export interface TranscribeResult {
  success: boolean;
  meeting_id?: string;
  transcript_path?: string;
  transcript_txt?: string;
  transcript_json_path?: string;
  duration_seconds?: number;
  speakers_count?: number;
  timing?: {
    upload_ms: number;
    transcription_ms: number;
    storage_ms: number;
    total_ms: number;
  };
  error?: string;
}
