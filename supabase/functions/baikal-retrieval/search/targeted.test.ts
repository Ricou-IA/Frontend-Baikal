import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { buildNamedTargets, mergeTargeted, targetLabel, annotateTargeted } from "./targeted.ts"
import type { ChunkResult, SearchResult, LibrarianConfig, SearchConfig, NamedDocumentResolution } from "../types.ts"

function chunk(id: number, file: string, sim = 0.5): ChunkResult {
  return {
    chunk_id: id, content: `c${id}`, similarity: sim, metadata: { page_start: 1 }, layer: 'project',
    source_file_id: file, matched_concepts: [], rank_score: sim, match_source: 'vector', filter_applied: false,
    file_storage_path: `${file}.pdf`, file_storage_bucket: 'documents', file_original_filename: `${file}.pdf`,
    file_mime_type: 'application/pdf', file_total_pages: 10, file_max_similarity: null, file_chunk_count: null,
    hierarchy_level: 1, parent_chunk_id: null, retrieval_role: 'primary', section_title: null,
  }
}
function resolution(over: Partial<NamedDocumentResolution>): NamedDocumentResolution {
  return { phrase: 'CCAP', type: 'ccap', qualifiers: [], found: ['CCAP.pdf'], found_file_ids: ['fa'], similar: [],
    status: 'found', total: 1, truncated: false, layer: 'project', ...over }
}
const CONFIG = { boost_on_mention: 1, boost_factor: 1, gemini_max_files: 5 } as unknown as LibrarianConfig
const SEARCH: SearchConfig = { scope: 'broad', max_files: 5, min_similarity: 0.35, boost_documents: [], file_filter: null }
const GLOBAL: SearchResult = { chunks: [chunk(1, 'fz', 0.9), chunk(2, 'fa', 0.8)], files: [], meetingChunks: [], totalPages: 0, filterApplied: false, fallbackUsed: false, reranked: false }

Deno.test("buildNamedTargets : seuls les found avec ids, dédoublonnés par ensemble de fichiers", () => {
  const t = buildNamedTargets([
    resolution({}),
    resolution({ phrase: 'ccap', found: ['CCAP.pdf'], found_file_ids: ['fa'] }),
    resolution({ phrase: 'CCTP du lot 07', type: 'cctp', found: ['Lot07.pdf'], found_file_ids: ['fb'] }),
    resolution({ phrase: 'DOE', type: 'doe', status: 'no_candidate', found: [], found_file_ids: [] }),
  ])
  assertEquals(t.map(x => x.fileIds), [['fa'], ['fb']])
  assertEquals(targetLabel(t[0]), 'CCAP.pdf')
  assertEquals(targetLabel({ phrase: 'CCTP', names: ['a', 'b'], fileIds: ['1', '2'], layer: 'project' }), 'CCTP')
})

Deno.test("mergeTargeted : extraits ciblés d'abord, globaux ensuite, sans doublon, fichiers recalculés", () => {
  const targeted = [{ target: { phrase: 'CCAP', names: ['CCAP.pdf'], fileIds: ['fa'], layer: 'project' as const }, chunks: [chunk(2, 'fa', 0.4), chunk(3, 'fa', 0.3)] }]
  const m = mergeTargeted(GLOBAL, targeted, CONFIG, SEARCH)
  assertEquals(m.chunks.map(c => c.chunk_id), [2, 3, 1])
  assertEquals(m.filterApplied, true)
  assertEquals(m.files.map(f => f.file_id).sort(), ['fa', 'fz'])
  assertEquals(m.totalPages, 20)
})

Deno.test("mergeTargeted sans résultat ciblé rend les extraits globaux inchangés", () => {
  const m = mergeTargeted(GLOBAL, [{ target: { phrase: 'CCAP', names: ['CCAP.pdf'], fileIds: ['fa'], layer: 'project' }, chunks: [] }], CONFIG, SEARCH)
  assertEquals(m.chunks.map(c => c.chunk_id), [1, 2])
})

Deno.test("annotateTargeted pose targeted_chunks sur la résolution correspondante", () => {
  const r = [resolution({})]
  annotateTargeted(r, [{ target: { phrase: 'CCAP', names: ['CCAP.pdf'], fileIds: ['fa'], layer: 'project' }, chunks: [chunk(2, 'fa')] }])
  assertEquals(r[0].targeted_chunks, 1)
})
