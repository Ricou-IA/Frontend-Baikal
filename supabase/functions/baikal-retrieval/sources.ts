// ============================================================================
// baikal-retrieval - Sources Builder
// v1.1.1: EXACT copy of librarian-v4 logic (no previousSourceFileIds filtering)
// ============================================================================

import type { ChunkResult, FileInfo, SourceItem } from "./types.ts"

// ============================================================================
// FROM FILES (Gemini mode)
// ============================================================================

export function buildSourcesFromFiles(files: FileInfo[]): SourceItem[] {
  return files.map(file => ({
    id: file.file_id,
    type: 'document',
    source_file_id: file.file_id,
    document_name: file.original_filename,
    score: file.max_similarity,
    layer: file.layer || 'app',
    content_preview: null,
  }))
}

// ============================================================================
// FROM CHUNKS (RAG mode)
// v1.1.1: EXACT copy from librarian-v4 buildSourcesFromChunks
// ============================================================================

export function buildSourcesFromChunks(chunks: ChunkResult[]): SourceItem[] {
  const sourcesMap = new Map<string, SourceItem>()

  for (const chunk of chunks) {
    const key = chunk.source_file_id || chunk.chunk_id.toString()
    if (sourcesMap.has(key)) continue

    if (chunk.metadata?.source_type === 'meeting_transcript') {
      const meetingDate = chunk.metadata?.meeting_date || 'Date inconnue'
      const meetingTitle = chunk.metadata?.meeting_title || 'Reunion'
      sourcesMap.set(key, {
        id: chunk.chunk_id,
        type: 'meeting',
        source_file_id: null,
        document_name: `Reunion du ${meetingDate} - ${meetingTitle}`,
        score: chunk.similarity,
        layer: chunk.layer,
        content_preview: chunk.content?.substring(0, 200) || null,
      })
    } else {
      sourcesMap.set(key, {
        id: chunk.chunk_id,
        type: 'document',
        source_file_id: chunk.source_file_id,
        document_name: chunk.file_original_filename || 'Document',
        score: chunk.similarity,
        layer: chunk.layer,
        content_preview: chunk.content?.substring(0, 200) || null,
        // v4: Ajout des infos de sourçage
        section_title: chunk.section_title,
        hierarchy_level: chunk.hierarchy_level,
        page: chunk.metadata?.page as number | undefined,
      })
    }
  }

  return Array.from(sourcesMap.values())
}
