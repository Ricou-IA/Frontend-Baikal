import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { buildSystemPrompt } from "./prompt.ts"
import type { AgentContext, FeatureFlags } from "../types.ts"

const features: FeatureFlags = {
  enable_reranking: false, cohere_model: "rerank-v3.5", cohere_top_n: 10,
  adaptive_threshold_enabled: false, adaptive_threshold_ratio: 0.55, no_results_min_similarity: 0.15,
  use_response_format_json: true, inject_conversation_in_generation: false,
}

function ctx(projectDocuments: string[], documentsCles: { slug: string; label: string }[] = []): AgentContext {
  return {
    effectiveOrgId: null, effectiveAppId: "arpet", systemPrompt: null, geminiSystemPrompt: null,
    parameters: {}, configSource: "test", projectIdentity: null, conversationId: "c",
    conversationSummary: null, conversationFirstMessage: null, recentMessages: [], messageCount: 0,
    previousSourceFileIds: [], documentsCles, projectDocuments,
  }
}

Deno.test("regle 8 : document nomme inexistant presente dans le prompt", () => {
  const p = buildSystemPrompt(null, ctx([]), [], "factual", "paragraph", [], false, features)
  assertStringIncludes(p, "8. DOCUMENT NOMME PAR L'UTILISATEUR")
  assertStringIncludes(p, "n'existe pas dans le projet")
})

Deno.test("liste des documents du projet injectee quand elle existe, absente sinon", () => {
  const avec = buildSystemPrompt(null, ctx(["2139_CCAP.pdf", "CCTP - Lot N°07 PLÂTRERIE.pdf"]), [], "factual", "paragraph", [], false, features)
  assertStringIncludes(avec, "DOCUMENTS DU PROJET (les seuls qui existent) :")
  assertStringIncludes(avec, "- 2139_CCAP.pdf")
  assertStringIncludes(avec, "- CCTP - Lot N°07 PLÂTRERIE.pdf")
  const sans = buildSystemPrompt(null, ctx([]), [], "factual", "paragraph", [], false, features)
  assert(!sans.includes("DOCUMENTS DU PROJET"))
})

Deno.test("liste de concepts (documentsCles) non vide ne doit jamais etre presentee comme la liste des documents du projet", () => {
  const p = buildSystemPrompt(null, ctx([], [{ slug: "cctp", label: "CCTP" }]), [], "factual", "paragraph", [], false, features)
  assert(!p.includes("DOCUMENTS DU PROJET"))
})
