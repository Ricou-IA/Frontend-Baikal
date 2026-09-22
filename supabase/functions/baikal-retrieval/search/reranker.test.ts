import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { keepTargetedFirst, candidateCount, rerankIfEnabled } from "./reranker.ts"
import type { ChunkResult, FeatureFlags, SearchResult } from "../types.ts"

const c = (id: number, sim: number, targeted = false, role: 'primary' | 'child' = 'primary', parent: number | null = null): ChunkResult =>
  ({ chunk_id: id, content: `c${id}`, similarity: sim, retrieval_role: role, parent_chunk_id: parent, targeted, hierarchy_level: role === 'child' ? 1 : 0 } as unknown as ChunkResult)

Deno.test("keepTargetedFirst : les cibles tronquées par Cohere sont réinjectées, cibles d'abord", () => {
  const original = [c(1, 0.9, true), c(2, 0.8, true), c(3, 0.7), c(4, 0.6), c(5, 0.5)]
  const reranked = [c(4, 0.95), c(1, 0.9, true), c(3, 0.4)]     // top 3 Cohere : le cible 2 a disparu
  assertEquals(keepTargetedFirst(reranked, original, 3).map(x => x.chunk_id), [1, 2, 4, 3])
})

Deno.test("keepTargetedFirst sans cible = ordre Cohere tronqué", () => {
  const original = [c(1, 0.9), c(2, 0.8), c(3, 0.7)]
  assertEquals(keepTargetedFirst([c(3, 0.9), c(1, 0.5)], original, 2).map(x => x.chunk_id), [3, 1])
})

Deno.test("candidateCount : flag off = match_count ; flag on = max(match_count, cohere_candidates)", () => {
  const f = { enable_reranking: false, cohere_candidates: 24 } as FeatureFlags
  assertEquals(candidateCount(8, f), 8)
  assertEquals(candidateCount(8, { ...f, enable_reranking: true }), 24)
  assertEquals(candidateCount(30, { ...f, enable_reranking: true }), 30)
})

Deno.test("rerankIfEnabled : appel Cohere injecte, enfants héritent, cibles préservés, reranked=true", async () => {
  const chunks = [c(1, 0.9, true), c(2, 0.8), c(3, 0.7), c(30, 0.7, false, 'child', 3)]
  const sr = { chunks, files: [], meetingChunks: [], totalPages: 0, filterApplied: false, fallbackUsed: false, reranked: false } as SearchResult
  let body: Record<string, unknown> = {}
  const fetchFn = ((_url: string, init: RequestInit) => {
    body = JSON.parse(init.body as string)
    return Promise.resolve(new Response(JSON.stringify({ results: [{ index: 2, relevance_score: 0.99 }, { index: 1, relevance_score: 0.5 }] }), { status: 200 }))
  }) as unknown as typeof fetch
  Deno.env.set('COHERE_API_KEY', 'test')
  const features = { enable_reranking: true, cohere_model: 'rerank-v3.5', cohere_top_n: 2, cohere_candidates: 24 } as FeatureFlags
  const out = await rerankIfEnabled(sr, 'q', features, fetchFn)
  assertEquals(body.top_n, 2)
  assertEquals((body.documents as string[]).length, 3)                 // primaires seulement
  assertEquals(out.reranked, true)
  assertEquals(out.chunks.map(x => x.chunk_id), [1, 3, 30, 2])         // cible 1 réinjectée en tête, enfant 30 juste après son parent 3
  assertEquals(out.chunks.find(x => x.chunk_id === 30)!.similarity, 0.99)
})

Deno.test("rerankIfEnabled : flag off → inchangé ; erreur Cohere → ordre d'origine, reranked=false", async () => {
  const sr = { chunks: [c(1, 0.9)], files: [], meetingChunks: [], totalPages: 0, filterApplied: false, fallbackUsed: false, reranked: false } as SearchResult
  assertEquals(await rerankIfEnabled(sr, 'q', { enable_reranking: false } as FeatureFlags), sr)
  Deno.env.set('COHERE_API_KEY', 'test')
  const boom = (() => Promise.resolve(new Response('nope', { status: 500 }))) as unknown as typeof fetch
  const out = await rerankIfEnabled(sr, 'q', { enable_reranking: true, cohere_model: 'm', cohere_top_n: 5, cohere_candidates: 24 } as FeatureFlags, boom)
  assertEquals(out.reranked, false)
  assertEquals(out.chunks.map(x => x.chunk_id), [1])
})
