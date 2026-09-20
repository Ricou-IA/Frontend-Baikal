import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { getIntentStrategy } from "./config.ts"

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
