import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { applyEvalOverrides } from "./eval-overrides.ts"
import type { FeatureFlags, LibrarianConfig } from "./types.ts"

const BASE = { llm_model: 'gpt-4o-mini', temperature: 0.3, gemini_thinking_budget: 0 } as LibrarianConfig
const FEATURES = { enable_reranking: false, cohere_top_n: 10, cohere_candidates: 24 } as FeatureFlags

Deno.test("service_role : llm_model surcharge, la config d'origine n'est pas mutee", () => {
  const r = applyEvalOverrides(BASE, FEATURES, { llm_model: 'gemini-2.5-flash' }, 'service')
  assertEquals(r.librarian.llm_model, 'gemini-2.5-flash')
  assertEquals(r.applied, ['llm_model'])
  assertEquals(BASE.llm_model, 'gpt-4o-mini')
})

Deno.test("service_role : gemini_thinking_budget entier 0..24576, sinon ignore", () => {
  assertEquals(applyEvalOverrides(BASE, FEATURES, { gemini_thinking_budget: 256 }, 'service').librarian.gemini_thinking_budget, 256)
  assertEquals(applyEvalOverrides(BASE, FEATURES, { gemini_thinking_budget: 256 }, 'service').applied, ['gemini_thinking_budget'])
  assertEquals(applyEvalOverrides(BASE, FEATURES, { gemini_thinking_budget: 0 }, 'service').applied, ['gemini_thinking_budget'])
  assertEquals(applyEvalOverrides(BASE, FEATURES, { gemini_thinking_budget: 30000 }, 'service').ignored, ['gemini_thinking_budget'])
  assertEquals(applyEvalOverrides(BASE, FEATURES, { gemini_thinking_budget: 12.5 }, 'service').ignored, ['gemini_thinking_budget'])
  assertEquals(applyEvalOverrides(BASE, FEATURES, { gemini_thinking_budget: '256' }, 'service').ignored, ['gemini_thinking_budget'])
})

Deno.test("service_role : enable_reranking booleen, les features d'origine ne sont pas mutees", () => {
  const r = applyEvalOverrides(BASE, FEATURES, { enable_reranking: true }, 'service')
  assertEquals(r.features.enable_reranking, true)
  assertEquals(r.features.cohere_candidates, 24)
  assertEquals(r.applied, ['enable_reranking'])
  assertEquals(FEATURES.enable_reranking, false)
  assertEquals(applyEvalOverrides(BASE, FEATURES, { enable_reranking: 'oui' }, 'service').ignored, ['enable_reranking'])
})

Deno.test("plusieurs surcharges : applied dans l'ordre llm_model, gemini_thinking_budget, enable_reranking", () => {
  const r = applyEvalOverrides(BASE, FEATURES, { enable_reranking: true, llm_model: 'gemini-2.5-flash', gemini_thinking_budget: 256 }, 'service')
  assertEquals(r.applied, ['llm_model', 'gemini_thinking_budget', 'enable_reranking'])
})

Deno.test("utilisateur / anonyme : toutes les surcharges ignorees et signalees", () => {
  const r = applyEvalOverrides(BASE, FEATURES, { llm_model: 'gemini-2.5-flash', gemini_thinking_budget: 256, enable_reranking: true }, 'user')
  assertEquals(r.librarian, BASE)
  assertEquals(r.features, FEATURES)
  assertEquals(r.ignored, ['llm_model', 'gemini_thinking_budget', 'enable_reranking'])
  assertEquals(applyEvalOverrides(BASE, FEATURES, { llm_model: 'x' }, 'anonymous').ignored, ['llm_model'])
})

Deno.test("valeur invalide de llm_model (espace, injection, trop longue) : ignoree meme en service_role", () => {
  assertEquals(applyEvalOverrides(BASE, FEATURES, { llm_model: 'gpt 4' }, 'service').ignored, ['llm_model'])
  assertEquals(applyEvalOverrides(BASE, FEATURES, { llm_model: 'a/../b' }, 'service').ignored, ['llm_model'])
  assertEquals(applyEvalOverrides(BASE, FEATURES, { llm_model: 'x'.repeat(70) }, 'service').ignored, ['llm_model'])
  assertEquals(applyEvalOverrides(BASE, FEATURES, { llm_model: 42 }, 'service').ignored, ['llm_model'])
})

Deno.test("absent ou non-objet : rien", () => {
  assertEquals(applyEvalOverrides(BASE, FEATURES, undefined, 'service'), { librarian: BASE, features: FEATURES, applied: [], ignored: [] })
  assertEquals(applyEvalOverrides(BASE, FEATURES, 'oui', 'service').applied, [])
})
