import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { agentThinkingCandidates, fetchGeminiWithThinking, thinkingCandidates, withThinking } from "./gemini-thinking.ts"

Deno.test("agentThinkingCandidates : reflexion basse sur 3.x, rien sur 2.x", () => {
  assertEquals(agentThinkingCandidates('gemini-3.8-flash'), [{ thinkingLevel: 'low' }, { thinkingBudget: 512 }])
  assertEquals(agentThinkingCandidates('gemini-2.5-flash'), [undefined])
})

Deno.test("thinkingCandidates : 2.5-flash-lite garde le budget 0 ; 3.x lite → minimal d'abord ; 3.x flash → budget 0 d'abord", () => {
  assertEquals(thinkingCandidates('gemini-2.5-flash-lite'), [{ thinkingBudget: 0 }])
  assertEquals(thinkingCandidates('gemini-3.5-flash-lite'), [{ thinkingLevel: 'minimal' }, { thinkingBudget: 0 }, { thinkingLevel: 'low' }])
  assertEquals(thinkingCandidates('gemini-3.8-flash'), [{ thinkingBudget: 0 }, { thinkingLevel: 'minimal' }, { thinkingLevel: 'low' }])
})

Deno.test("withThinking : ajoute thinkingConfig seulement s'il est defini", () => {
  assertEquals(withThinking({ temperature: 0 }, undefined), { temperature: 0 })
  assertEquals(withThinking({ temperature: 0 }, { thinkingBudget: 0 }), { temperature: 0, thinkingConfig: { thinkingBudget: 0 } })
})

Deno.test("fetchGeminiWithThinking : 400 → reglage suivant ; succes rendu tel quel", async () => {
  const seen: unknown[] = []
  const fetchFn = ((_u: string, init?: RequestInit) => {
    const tc = JSON.parse(String(init?.body)).generationConfig.thinkingConfig
    seen.push(tc)
    return Promise.resolve(new Response(tc?.thinkingLevel === 'low' ? '{"ok":1}' : '{"error":{"code":400}}', { status: tc?.thinkingLevel === 'low' ? 200 : 400 }))
  }) as unknown as typeof fetch
  const r = await fetchGeminiWithThinking('u', tc => ({ generationConfig: withThinking({}, tc) }),
    [{ thinkingBudget: 0 }, { thinkingLevel: 'minimal' }, { thinkingLevel: 'low' }], () => undefined, fetchFn)
  assertEquals(r.status, 200)
  assertEquals(seen, [{ thinkingBudget: 0 }, { thinkingLevel: 'minimal' }, { thinkingLevel: 'low' }])
})

Deno.test("fetchGeminiWithThinking : erreur non 400 rendue sans nouvel essai, dernier 400 rendu", async () => {
  let calls = 0
  const f503 = (() => { calls++; return Promise.resolve(new Response('x', { status: 503 })) }) as unknown as typeof fetch
  const r = await fetchGeminiWithThinking('u', () => ({}), [{ thinkingBudget: 0 }, { thinkingLevel: 'low' }], () => undefined, f503)
  assertEquals([r.status, calls], [503, 1])
  calls = 0
  const f400 = (() => { calls++; return Promise.resolve(new Response('x', { status: 400 })) }) as unknown as typeof fetch
  const r2 = await fetchGeminiWithThinking('u', () => ({}), [{ thinkingBudget: 0 }, { thinkingLevel: 'low' }], () => undefined, f400)
  assertEquals([r2.status, calls], [400, 2])
})
