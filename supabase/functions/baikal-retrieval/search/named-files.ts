// ============================================================================
// baikal-retrieval - Search: fichiers des documents nommés (Sprint 2, T7)
// ============================================================================
// Bouton « Approfondir » d'ARPET : la question est renvoyée avec
// generation_mode='gemini'. Les fichiers lus en entier sont alors ceux que la
// question nomme (résolus par T4), pas les mieux classés par la recherche.
// ============================================================================

import type { Supabase, FileInfo } from "../types.ts"

export async function fetchFileInfosByIds(supabase: Supabase, fileIds: string[]): Promise<FileInfo[]> {
  if (fileIds.length === 0) return []
  let data: Record<string, unknown>[] | null = null
  try {
    const res = await supabase
      .schema('sources')
      .from('files')
      .select('id, storage_path, storage_bucket, original_filename, display_name, mime_type, total_pages, layer')
      .in('id', fileIds)
      .eq('processing_status', 'completed')
    if (res.error) {
      console.warn('[named-files] sources.files:', res.error.message)
      return []
    }
    data = res.data as Record<string, unknown>[] | null
  } catch (err) {
    console.warn('[named-files] sources.files:', err instanceof Error ? err.message : err)
    return []
  }
  const byId = new Map<string, Record<string, unknown>>()
  for (const row of data || []) byId.set(row.id as string, row as Record<string, unknown>)
  const files: FileInfo[] = []
  for (const id of fileIds) {                    // ordre des mentions conservé
    const f = byId.get(id)
    if (!f || typeof f.storage_path !== 'string') continue
    files.push({
      file_id: id,
      storage_path: f.storage_path,
      storage_bucket: (f.storage_bucket as string) || 'documents',
      original_filename: (f.original_filename as string) || (f.display_name as string) || 'Document',
      mime_type: (f.mime_type as string) || 'application/pdf',
      total_pages: (f.total_pages as number) || 1,
      max_similarity: 1, avg_similarity: 1, chunk_count: 0,
      layer: (f.layer as string) || 'project',
      score: 1, is_boosted: true,
    })
  }
  return files
}

/** Garde l'ordre ; s'arrête au premier fichier qui dépasserait maxFiles ou le cumul maxPages. */
export function selectNamedFiles(files: FileInfo[], maxFiles: number, maxPages: number): FileInfo[] {
  const kept: FileInfo[] = []
  let pages = 0
  for (const f of files) {
    if (kept.length >= maxFiles) break
    if (pages + f.total_pages > maxPages) break
    kept.push(f)
    pages += f.total_pages
  }
  return kept
}
