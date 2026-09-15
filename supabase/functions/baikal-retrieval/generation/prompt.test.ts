import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { buildSystemPrompt } from "./prompt.ts"
import type { AgentContext, FeatureFlags, NamedDocumentResolution } from "../types.ts"

const features: FeatureFlags = {
  enable_reranking: false, cohere_model: "rerank-v3.5", cohere_top_n: 10,
  adaptive_threshold_enabled: false, adaptive_threshold_ratio: 0.55, no_results_min_similarity: 0.15,
  use_response_format_json: true, inject_conversation_in_generation: false,
}

function ctx(namedDocuments: NamedDocumentResolution[], documentsCles: { slug: string; label: string }[] = []): AgentContext {
  return {
    effectiveOrgId: null, effectiveAppId: "arpet", systemPrompt: null, geminiSystemPrompt: null,
    parameters: {}, configSource: "test", projectIdentity: null, conversationId: "c",
    conversationSummary: null, conversationFirstMessage: null, recentMessages: [], messageCount: 0,
    previousSourceFileIds: [], documentsCles, namedDocuments,
  }
}

Deno.test("regle 8 : document nomme absent → refus explicite, s'appuie sur le bloc, sans liste des documents du projet", () => {
  const p = buildSystemPrompt(null, ctx([]), [], "factual", "paragraph", [], false, features)
  assertStringIncludes(p, "8. DOCUMENT NOMME PAR L'UTILISATEUR")
  assertStringIncludes(p, "n'existe pas dans le projet")
  assertStringIncludes(p, "DOCUMENTS NOMMES DANS LA QUESTION")
  assert(!p.includes("liste des documents du projet"))
})

Deno.test("bloc des documents nommes injecte quand il y a des resolutions, absent sinon", () => {
  const avec = buildSystemPrompt(null, ctx([
    { phrase: "CCTP du gros œuvre", type: "cctp", found: [], similar: ["CCTP - Lot N°07 PLÂTRERIE.pdf"], status: "not_found", total: 1 },
  ]), [], "factual", "paragraph", [], false, features)
  assertStringIncludes(avec, "DOCUMENTS NOMMES DANS LA QUESTION (resolus")
  assertStringIncludes(avec, "- « CCTP du gros œuvre » → AUCUN fichier correspondant dans le projet ; fichiers proches : CCTP - Lot N°07 PLÂTRERIE.pdf")
  const sans = buildSystemPrompt(null, ctx([]), [], "factual", "paragraph", [], false, features)
  assert(!sans.includes("DOCUMENTS NOMMES DANS LA QUESTION (resolus"))
  assert(!sans.includes("DOCUMENTS DU PROJET"))
})

Deno.test("liste de concepts (documentsCles) ne doit jamais etre presentee comme des fichiers du projet", () => {
  const p = buildSystemPrompt(null, ctx([], [{ slug: "cctp", label: "CCTP" }]), [], "factual", "paragraph", [], false, features)
  assert(!p.includes("DOCUMENTS DU PROJET"))
  assert(!p.includes("- « CCTP »"))
})
