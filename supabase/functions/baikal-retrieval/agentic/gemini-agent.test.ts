import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { appendToolCallToHistory, callGeminiAgent, splitForStreaming } from "./gemini-agent.ts"
import type { AgenticConfig } from "../types.ts"

Deno.test("splitForStreaming coupe sur les espaces et reconstitue le texte exact", () => {
  const text = "Le CCAP prévoit des pénalités de 100 € par jour calendaire de retard [CCAP, Page 19]."
  const parts = splitForStreaming(text, 24)
  assertEquals(parts.join(''), text)
  assertEquals(parts.every(p => p.length <= 24 + 20), true)
  assertEquals(parts.length > 2, true)
})

Deno.test("splitForStreaming : texte vide → aucun morceau ; mot long → un seul morceau", () => {
  assertEquals(splitForStreaming(""), [])
  assertEquals(splitForStreaming("abcdefghijklmnopqrstuvwxyz0123456789", 8), ["abcdefghijklmnopqrstuvwxyz0123456789"])
})

Deno.test("appendToolCallToHistory : rend la part d'origine avec sa thoughtSignature (Gemini 3), sinon la reconstruit", () => {
  const part = { functionCall: { name: 'search_documents', args: { query: 'x' } }, thoughtSignature: 'SIG' }
  const avec = appendToolCallToHistory([], 'search_documents', { query: 'x' }, part)
  assertEquals(avec, [{ role: 'model', parts: [part] }])
  const sans = appendToolCallToHistory([], 'search_documents', { query: 'x' })
  assertEquals(sans, [{ role: 'model', parts: [{ functionCall: { name: 'search_documents', args: { query: 'x' } } }] }])
})

Deno.test("callGeminiAgent : la part d'appel d'outil est rendue telle quelle (thoughtSignature comprise)", async () => {
  const original = globalThis.fetch
  globalThis.fetch = (() => Promise.resolve(new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ functionCall: { name: 'search_documents', args: { query: 'q' } }, thoughtSignature: 'SIG' }] } }],
  }), { status: 200 }))) as typeof fetch
  try {
    const turn = await callGeminiAgent('q', [], { model: 'gemini-3.8-flash', temperature: 0.2 } as AgenticConfig, 'KEY')
    assertEquals(turn.type, 'tool_call')
    assertEquals(turn.callPart, { functionCall: { name: 'search_documents', args: { query: 'q' } }, thoughtSignature: 'SIG' })
  } finally {
    globalThis.fetch = original
  }
})
