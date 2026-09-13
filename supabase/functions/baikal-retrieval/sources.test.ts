import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { buildSourcesFromChunks } from "./sources.ts"
import type { ChunkResult } from "./types.ts"

function chunk(id: number, metadata: Record<string, unknown>): ChunkResult {
  return { chunk_id: id, content: "x", similarity: 0.6, metadata, layer: "project",
    source_file_id: `file-${id}`, matched_concepts: [], rank_score: 0, match_source: "vector", filter_applied: false,
    file_storage_path: "p", file_storage_bucket: "b", file_original_filename: "CCTP TCE", file_mime_type: "application/pdf",
    file_total_pages: 172, file_max_similarity: null, file_chunk_count: null, hierarchy_level: 1,
    parent_chunk_id: null, retrieval_role: "primary", section_title: "2.3.9" }
}

Deno.test("page lue depuis page_start quand page est absent (pipeline v5.x)", () => {
  const [s] = buildSourcesFromChunks([chunk(1, { page_start: "56", page_end: "57" })])
  assertEquals(s.page, 56)
  assertEquals(s.page_end, 57)
})

Deno.test("page explicite prioritaire, valeurs non numériques ignorées", () => {
  const [a] = buildSourcesFromChunks([chunk(2, { page: 12, page_start: "3" })])
  assertEquals(a.page, 12)
  const [b] = buildSourcesFromChunks([chunk(3, { page_start: "n/a" })])
  assertEquals(b.page, undefined)
})
