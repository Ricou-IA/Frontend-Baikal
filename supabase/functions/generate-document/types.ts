// ============================================================================
// generate-document v2 — Types locaux
// ============================================================================

// --- Request / Response ---

export interface RequestBody {
  project_id: string;
  document_type: "memo_chantier" | "fiche_lot";
  lot_filter?: string | null;
}

export interface GenerateResponse {
  file_id: string;
  file_name: string;
  download_url: string;
  doc_type: "memo_chantier" | "fiche_lot";
}

// --- RAG Enrichment ---

export interface RagContext {
  source_file_name: string;
  page_start: number | null;
  page_end: number | null;
  excerpt: string;
  similarity: number;
  section_title: string | null;
}

// --- Meeting Items ---

export interface MeetingItem {
  id: string;
  meeting_id: string;
  item_type: "decision" | "action" | "issue" | "info";
  subject: string;
  content: string | null;
  context: string | null;
  lot_reference: string | null;
  responsible: string | null;
  due_date: string | null;
  status: string;
  location: string | null;
  topic_tags: string[] | null;
  display_order: number | null;
}

export interface EnrichedMeetingItem extends MeetingItem {
  rag_context: RagContext[];
}

// --- Collected Data ---

export interface ProjectContext {
  project_name: string;
  project_description: string | null;
  org_name: string;
  org_settings: Record<string, unknown> | null;
  market_type?: string;
  project_type?: string;
}

export interface MeetingContext {
  id: string;
  meeting_date: string;
  meeting_title: string | null;
  summary: string | null;
  participants: unknown[];
  items: EnrichedMeetingItem[];
}

export interface IntervenantContext {
  name: string;
  company: string | null;
  role: string | null;
  specialty: string | null;
  lot_reference: string | null;
  role_in_project: string | null;
}

export interface RagDocumentChunk {
  content: string;
  metadata: Record<string, unknown>;
  source_file_name: string | null;
}

export interface CollectedData {
  project: ProjectContext;
  meetings: MeetingContext[];
  intervenants: IntervenantContext[];
  lot_filter: string | null;
  lot_rag_chunks: RagDocumentChunk[];
}

// --- LLM Output ---

export interface LLMOutput {
  markdown_content: string;
  title: string;
}

// --- Storage Result ---

export interface StorageResult {
  file_id: string;
  file_name: string;
  download_url: string;
}
