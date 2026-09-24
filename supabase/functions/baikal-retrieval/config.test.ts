import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { getIntentStrategy, parseLibrarianConfig, parseFeatureFlags, providerFor } from "./config.ts"

// Sprint 2 hotfix : 4 documents Bessières (dont le Mémoire Technique, 171 chunks L1)
// n'ont aucun chunk L0 (ingérés avant v5). En cherchant L0 seul, comparison/synthesis
// ne pouvaient jamais les atteindre : targeted_chunks = 0, document absent de la
// réponse. L0+L1 les rend de nouveau joignables sans rien retirer aux documents qui
// ont un L0.
Deno.test("getIntentStrategy('comparison').hierarchy_levels vaut [0, 1]", () => {
  assertEquals(getIntentStrategy('comparison').hierarchy_levels, [0, 1])
})

Deno.test("getIntentStrategy('synthesis').hierarchy_levels vaut [0, 1]", () => {
  assertEquals(getIntentStrategy('synthesis').hierarchy_levels, [0, 1])
})

Deno.test("getIntentStrategy('factual').hierarchy_levels reste [1] (texte exact pour sourçage)", () => {
  assertEquals(getIntentStrategy('factual').hierarchy_levels, [1])
})

// Sprint 3 (S3.1) : le modèle de génération sur extraits se lit en base.
Deno.test("parseLibrarianConfig lit parameters.generation.llm_model", () => {
  const cfg = parseLibrarianConfig({ parameters: { generation: { llm_model: 'gpt-4.1-mini' } } })
  assertEquals(cfg.llm_model, 'gpt-4.1-mini')
})

Deno.test("parseLibrarianConfig sans llm_model garde le repli gpt-4o-mini", () => {
  assertEquals(parseLibrarianConfig({ parameters: { generation: { max_tokens: 100 } } }).llm_model, 'gpt-4o-mini')
  assertEquals(parseLibrarianConfig(null).llm_model, 'gpt-4o-mini')
})

// Sprint 4 : budget de réflexion Gemini sur extraits, repli 0.
Deno.test("parseLibrarianConfig : gemini_thinking_budget lu en base, repli 0", () => {
  const avec = parseLibrarianConfig({ parameters: { generation: { gemini_thinking_budget: 256 } } } as any)
  assertEquals(avec.gemini_thinking_budget, 256)
  const sans = parseLibrarianConfig({ parameters: { generation: {} } } as any)
  assertEquals(sans.gemini_thinking_budget, 0)
})

Deno.test("providerFor : gemini-* → gemini, sinon openai", () => {
  assertEquals(providerFor('gemini-2.5-flash'), 'gemini')
  assertEquals(providerFor('gpt-4.1-mini'), 'openai')
  assertEquals(providerFor('gpt-4o-mini'), 'openai')
  assertEquals(providerFor(''), 'openai')
})

// Sprint 3 (S3.3) : pool de candidats Cohere — repli 24, jamais lu si absent.
Deno.test("parseFeatureFlags : cohere_candidates lu, repli 24", () => {
  assertEquals(parseFeatureFlags({ cohere_candidates: 30 }).cohere_candidates, 30)
  assertEquals(parseFeatureFlags(null).cohere_candidates, 24)
  assertEquals(parseFeatureFlags({}).enable_reranking, false)
})
