import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { buildGeminiChunksBody, thinkingConfigFor, generateWithGeminiChunksStream, whitespaceRun, MAX_WHITESPACE_RUN } from "./gemini-chunks.ts"
import type { LibrarianConfig } from "../types.ts"

const CFG = { llm_model: 'gemini-2.5-flash', temperature: 0.3, max_tokens: 6400 } as LibrarianConfig

Deno.test("buildGeminiChunksBody : prompt systeme + contexte en systemInstruction, question en user, reflexion coupee", () => {
  const body = buildGeminiChunksBody("Quel delai ?", "=== CHUNK 1 ===\ntexte", "REGLES", CFG) as Record<string, any>
  assertStringIncludes(body.systemInstruction.parts[0].text, "REGLES")
  assertStringIncludes(body.systemInstruction.parts[0].text, "=== CHUNK 1 ===")
  assertEquals(body.contents, [{ role: 'user', parts: [{ text: "Quel delai ?" }] }])
  assertEquals(body.generationConfig, { temperature: 0.3, maxOutputTokens: 6400, thinkingConfig: { thinkingBudget: 0 } })
})

Deno.test("buildGeminiChunksBody : regle de forme anti-alignement ajoutee a l'instruction systeme", () => {
  const body = buildGeminiChunksBody("Quel delai ?", "=== CHUNK 1 ===\ntexte", "REGLES", CFG) as Record<string, any>
  assertStringIncludes(body.systemInstruction.parts[0].text, "REGLE DE FORME (Gemini)")
  assertStringIncludes(body.systemInstruction.parts[0].text, "=== CHUNK 1 ===")
})

Deno.test("whitespaceRun : longueur de la sequence d'espaces en fin de texte, reportee depuis le morceau precedent", () => {
  assertEquals(whitespaceRun(0, 'abc  '), 2)
  assertEquals(whitespaceRun(5, '   '), 8)
  assertEquals(whitespaceRun(5, 'x'), 0)
  assertEquals(whitespaceRun(5, ''), 5)
})

Deno.test("MAX_WHITESPACE_RUN vaut 200", () => {
  assertEquals(MAX_WHITESPACE_RUN, 200)
})

Deno.test("thinkingConfigFor : budget 0 sur flash, absent sur pro (0 refuse par l'API)", () => {
  assertEquals(thinkingConfigFor('gemini-2.5-flash'), { thinkingBudget: 0 })
  assertEquals(thinkingConfigFor('gemini-2.5-flash-lite'), { thinkingBudget: 0 })
  assertEquals(thinkingConfigFor('gemini-2.5-pro'), undefined)
})

function sseResponse(events: unknown[]): Response {
  const text = events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('')
  return new Response(text, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

Deno.test("generateWithGeminiChunksStream : tokens streames, usage du dernier evenement, URL du modele", async () => {
  let calledUrl = ''
  const fetchFn = ((url: string, _init?: RequestInit) => {
    calledUrl = url
    return Promise.resolve(sseResponse([
      { candidates: [{ content: { parts: [{ text: 'Le ' }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 1 } },
      { candidates: [{ content: { parts: [{ text: 'delai' }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 2, thoughtsTokenCount: 0 } },
    ]))
  }) as unknown as typeof fetch
  const seen: unknown[] = []
  const gen = generateWithGeminiChunksStream("q", "ctx", "sys", CFG, "KEY", u => seen.push(u), fetchFn)
  let out = ''
  for await (const t of gen) out += t
  assertEquals(out, 'Le delai')
  assertEquals(seen, [{ input_tokens: 100, output_tokens: 2, calls: 1 }])
  assertStringIncludes(calledUrl, 'models/gemini-2.5-flash:streamGenerateContent?alt=sse')
})

Deno.test("generateWithGeminiChunksStream : HTTP non-2xx → erreur avec le statut", async () => {
  const fetchFn = (() => Promise.resolve(new Response('quota', { status: 429 }))) as unknown as typeof fetch
  const gen = generateWithGeminiChunksStream("q", "ctx", "sys", CFG, "KEY", undefined, fetchFn)
  let message = ''
  try { for await (const _ of gen) { /* rien */ } } catch (e) { message = (e as Error).message }
  assertStringIncludes(message, '429')
})

Deno.test("generateWithGeminiChunksStream : boucle d'espaces detectee → flux coupe, dernier morceau abandonne, onRunaway appele une fois", async () => {
  const fetchFn = (() => Promise.resolve(sseResponse([
    { candidates: [{ content: { parts: [{ text: '| A |' }] } }] },
    { candidates: [{ content: { parts: [{ text: ' '.repeat(150) }] } }] },
    { candidates: [{ content: { parts: [{ text: ' '.repeat(100) }] } }] },
    { candidates: [{ content: { parts: [{ text: 'fin' }] } }] },
  ]))) as unknown as typeof fetch
  let runawayCalls = 0
  const gen = generateWithGeminiChunksStream("q", "ctx", "sys", CFG, "KEY", undefined, fetchFn, () => { runawayCalls++ })
  let out = ''
  for await (const t of gen) out += t
  assertEquals(out, '| A |' + ' '.repeat(150) + '\n')
  assertEquals(runawayCalls, 1)
})

Deno.test("generateWithGeminiChunksStream : morceau d'espaces normal (50) transmis sans coupure", async () => {
  const fetchFn = (() => Promise.resolve(sseResponse([
    { candidates: [{ content: { parts: [{ text: '| A |' }] } }] },
    { candidates: [{ content: { parts: [{ text: ' '.repeat(50) }] } }] },
    { candidates: [{ content: { parts: [{ text: 'fin' }] } }] },
  ]))) as unknown as typeof fetch
  let runawayCalls = 0
  const gen = generateWithGeminiChunksStream("q", "ctx", "sys", CFG, "KEY", undefined, fetchFn, () => { runawayCalls++ })
  let out = ''
  for await (const t of gen) out += t
  assertEquals(out, '| A |' + ' '.repeat(50) + 'fin')
  assertEquals(runawayCalls, 0)
})
