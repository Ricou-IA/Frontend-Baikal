import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { buildOpenAIBody, generateWithOpenAIStream } from "./openai.ts"
import type { LibrarianConfig } from "../types.ts"

const CFG = { llm_model: 'gpt-4o-mini', temperature: 0.3, max_tokens: 6400 } as LibrarianConfig

function sse(lines: unknown[]): Response {
  const text = lines.map(l => `data: ${JSON.stringify(l)}\n\n`).join('') + 'data: [DONE]\n\n'
  return new Response(text, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

Deno.test("buildOpenAIBody : max_completion_tokens (accepte par tous les modeles de chat), temperature, streaming avec usage", () => {
  const b = buildOpenAIBody("q", "ctx", "sys", CFG) as Record<string, any>
  assertEquals(b.model, 'gpt-4o-mini')
  assertEquals(b.max_completion_tokens, 6400)
  assertEquals('max_tokens' in b, false)
  assertEquals(b.temperature, 0.3)
  assertEquals(b.stream, true)
  assertEquals(b.messages, [{ role: 'system', content: 'sys\n\nctx' }, { role: 'user', content: 'q' }])
})

Deno.test("buildOpenAIBody : sans temperature quand le modele la refuse", () => {
  const b = buildOpenAIBody("q", "ctx", "sys", CFG, { withTemperature: false }) as Record<string, any>
  assertEquals('temperature' in b, false)
})

Deno.test("generateWithOpenAIStream : 400 sur temperature → second essai sans temperature", async () => {
  const bodies: Record<string, unknown>[] = []
  const fetchFn = ((_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body))
    bodies.push(body)
    if ('temperature' in body) {
      return Promise.resolve(new Response(JSON.stringify({ error: { message: "Unsupported value: 'temperature' does not support 0.3 with this model.", param: 'temperature', code: 'unsupported_value' } }), { status: 400 }))
    }
    return Promise.resolve(sse([{ choices: [{ delta: { content: 'OK' } }] }]))
  }) as unknown as typeof fetch
  let out = ''
  for await (const t of generateWithOpenAIStream("q", "ctx", "sys", { ...CFG, llm_model: 'gpt-6-luna' } as LibrarianConfig, "KEY", undefined, fetchFn)) out += t
  assertEquals(out, 'OK')
  assertEquals(bodies.length, 2)
  assertEquals('temperature' in bodies[1], false)
})

Deno.test("generateWithOpenAIStream : autre 400 → erreur, pas de second essai", async () => {
  let calls = 0
  const fetchFn = (() => { calls++; return Promise.resolve(new Response('{"error":{"message":"model not found"}}', { status: 400 })) }) as unknown as typeof fetch
  await assertRejects(async () => {
    for await (const _ of generateWithOpenAIStream("q", "ctx", "sys", CFG, "KEY", undefined, fetchFn)) { /* rien */ }
  }, Error, 'OpenAI error')
  assertEquals(calls, 1)
})
