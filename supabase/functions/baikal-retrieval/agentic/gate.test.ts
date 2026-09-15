import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { evaluateAgenticGate } from "./gate.ts"
import type { ChunkResult, AgenticConfig } from "../types.ts"

const cfg: AgenticConfig = { enabled: true, model: "gemini-2.5-flash", max_iterations: 3, timeout_ms: 8000, temperature: 0.2, quality_threshold: 3, similarity_threshold: 0.45 }

function chunk(similarity: number, match_source: string): ChunkResult {
  return { chunk_id: Math.floor(Math.random() * 1e6), content: "", similarity, metadata: {}, layer: "project",
    source_file_id: null, matched_concepts: [], rank_score: 0, match_source, filter_applied: false,
    file_storage_path: null, file_storage_bucket: null, file_original_filename: null, file_mime_type: null,
    file_total_pages: 1, file_max_similarity: null, file_chunk_count: null, hierarchy_level: 1,
    parent_chunk_id: null, retrieval_role: "primary", section_title: null }
}

Deno.test("désactivé → jamais", () => {
  const d = evaluateAgenticGate([chunk(0.1, "vector")], { ...cfg, enabled: false })
  assertEquals(d.trigger, false); assertEquals(d.reason, "disabled")
})

Deno.test("trop peu de chunks vectoriels (les fulltext/child ne comptent pas)", () => {
  const d = evaluateAgenticGate([chunk(0.9, "vector"), chunk(0.9, "fulltext"), chunk(0.9, "child"), chunk(0.9, "graphrag")], cfg)
  assertEquals(d.trigger, true); assertEquals(d.reason, "too_few_vector_chunks"); assertEquals(d.n_vector, 1)
})

Deno.test("meilleure similarité sous le seuil → agentique, même si la moyenne serait trompeuse", () => {
  const d = evaluateAgenticGate([chunk(0.44, "vector"), chunk(0.43, "intersection"), chunk(0.42, "vector")], cfg)
  assertEquals(d.trigger, true); assertEquals(d.reason, "low_max_similarity"); assertEquals(d.max_sim, 0.44)
})

Deno.test("un seul excellent chunk + deux faibles → chemin rapide (max décide, pas la moyenne)", () => {
  const d = evaluateAgenticGate([chunk(0.71, "intersection"), chunk(0.30, "vector"), chunk(0.30, "vector")], cfg)
  assertEquals(d.trigger, false); assertEquals(d.reason, "fast_path_ok")
  assertEquals(Number(d.avg_sim.toFixed(3)), 0.437)
})
