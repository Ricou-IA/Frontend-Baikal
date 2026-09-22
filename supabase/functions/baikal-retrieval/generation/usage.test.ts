import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { EMPTY_USAGE, addUsage, usageFromOpenAI, usageFromGemini } from "./usage.ts"

Deno.test("usageFromOpenAI lit prompt_tokens / completion_tokens du dernier événement du flux", () => {
  assertEquals(usageFromOpenAI({ choices: [], usage: { prompt_tokens: 1200, completion_tokens: 340 } }),
    { input_tokens: 1200, output_tokens: 340, calls: 1 })
  assertEquals(usageFromOpenAI({ choices: [{ delta: { content: 'x' } }] }), null)
  assertEquals(usageFromOpenAI(null), null)
})

Deno.test("usageFromGemini additionne les tokens de réflexion à la sortie (facturés en sortie)", () => {
  assertEquals(usageFromGemini({ usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 200, thoughtsTokenCount: 50 } }),
    { input_tokens: 900, output_tokens: 250, calls: 1 })
  assertEquals(usageFromGemini({ usageMetadata: { promptTokenCount: 900 } }), { input_tokens: 900, output_tokens: 0, calls: 1 })
  assertEquals(usageFromGemini({ candidates: [] }), null)
})

Deno.test("addUsage cumule et ignore null", () => {
  const a = addUsage(EMPTY_USAGE, { input_tokens: 10, output_tokens: 5, calls: 1 })
  assertEquals(addUsage(a, { input_tokens: 1, output_tokens: 1, calls: 1 }), { input_tokens: 11, output_tokens: 6, calls: 2 })
  assertEquals(addUsage(a, null), a)
})
