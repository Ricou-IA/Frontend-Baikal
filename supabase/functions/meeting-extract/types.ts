// meeting-extract/types.ts — Types V3

export interface RequestBody {
  meeting_id: string;
}

export type SourceType =
  | "recording"
  | "uploaded_audio"
  | "visio_bot"
  | "memo";

export interface Participant {
  name: string;
  role?: string;
}

export interface MeetingItem {
  item_type: "decision" | "action" | "issue" | "info";
  subject: string;
  content: string;
  context?: string;
  lot_reference?: string;
  responsible?: string;
  due_date?: string;
  location?: string;
  topic_tags: string[];
  related_documents?: string[];
}

export interface ExtractionResult {
  summary: string;
  key_points: string[];
  items: MeetingItem[];
  formatted_report: string;
  next_meeting?: {
    date?: string;
    agenda_items?: string[];
  };
  qqoqccp: {
    qui?: string[];
    quoi?: string[];
    ou?: string[];
    quand?: string[];
    comment?: string[];
    combien?: string[];
    pourquoi?: string[];
  };
}

export interface MemoExtractionResult {
  summary: string;
  subject: string;
  topic_tags: string[];
  items: MeetingItem[];
}

export interface MeetingRecord {
  id: string;
  org_id: string;
  project_id: string;
  meeting_date: string;
  meeting_title: string;
  duration_minutes: number | null;
  participants: Participant[];
  source_type: string;
  audio_url: string | null;
  transcript_path: string;
  summary: string | null;
  formatted_report: string | null;
  next_meeting_date: string | null;
  extraction_status: string;
  model_used: string | null;
  created_by: string;
}

export interface MeetingStats {
  total_items: number;
  decisions: number;
  actions: number;
  issues: number;
  infos: number;
}
