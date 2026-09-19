import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { buildFallbackAnalysis } from "./analyzer.ts"

const DOCS = [{ slug: 'cctp', label: 'CCTP' }, { slug: 'ccap', label: 'CCAP' }]

Deno.test("question de comparaison avec « ? » → intent comparison conservé, format tableau", () => {
  const a = buildFallbackAnalysis("Est-ce qu'il y a des incohérences entre le mémoire technique et le CCTP ?", DOCS)
  assertEquals(a.intent, 'comparison')
  assertEquals(a.requires_search, true)
  assertEquals(a.answer_format, 'table')
})

Deno.test("impératif « Compare … » → comparison (QUESTION_PATTERNS ne rétrograde plus)", () => {
  assertEquals(buildFallbackAnalysis("Compare la garantie entre le CCAP et la NFP 03-001", DOCS).intent, 'comparison')
})

Deno.test("synthèse et citation conservées", () => {
  assertEquals(buildFallbackAnalysis("Peux-tu me résumer le CCTP ?", DOCS).intent, 'synthesis')
  const c = buildFallbackAnalysis("Cite l'article sur les pénalités de retard", DOCS)
  assertEquals(c.intent, 'citation')
  assertEquals(c.answer_format, 'quote')
})

Deno.test("question factuelle → factual", () => {
  assertEquals(buildFallbackAnalysis("Où se trouve le terrain de pétanque ?", DOCS).intent, 'factual')
})

Deno.test("salutation → conversational sans recherche", () => {
  const s = buildFallbackAnalysis("Bonjour", DOCS)
  assertEquals(s.intent, 'conversational')
  assertEquals(s.requires_search, false)
})

Deno.test("documents clés détectés et cross-ref fusionnés", () => {
  const a = buildFallbackAnalysis("Vérifier la conformité du CCTP au DTU 43.1", DOCS)
  assertEquals(a.detected_documents.includes('CCTP'), true)
  assertEquals(a.cross_ref?.is_cross_ref, true)
  assertEquals(a.requires_search, true)
})
