import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { applyEvalOverrides } from "./eval-overrides.ts"
import type { LibrarianConfig } from "./types.ts"

const BASE = { llm_model: 'gpt-4o-mini', temperature: 0.3 } as LibrarianConfig

Deno.test("service_role : llm_model surcharge, la config d'origine n'est pas mutee", () => {
  const r = applyEvalOverrides(BASE, { llm_model: 'gemini-2.5-flash' }, 'service')
  assertEquals(r.librarian.llm_model, 'gemini-2.5-flash')
  assertEquals(r.applied, ['llm_model'])
  assertEquals(BASE.llm_model, 'gpt-4o-mini')
})

Deno.test("utilisateur : surcharge ignoree et signalee", () => {
  const r = applyEvalOverrides(BASE, { llm_model: 'gemini-2.5-flash' }, 'user')
  assertEquals(r.librarian.llm_model, 'gpt-4o-mini')
  assertEquals(r.ignored, ['llm_model'])
})

Deno.test("valeur invalide (espace, injection, trop longue) : ignoree meme en service_role", () => {
  assertEquals(applyEvalOverrides(BASE, { llm_model: 'gpt 4' }, 'service').ignored, ['llm_model'])
  assertEquals(applyEvalOverrides(BASE, { llm_model: 'a/../b' }, 'service').ignored, ['llm_model'])
  assertEquals(applyEvalOverrides(BASE, { llm_model: 'x'.repeat(70) }, 'service').ignored, ['llm_model'])
  assertEquals(applyEvalOverrides(BASE, { llm_model: 42 }, 'service').ignored, ['llm_model'])
})

Deno.test("absent ou non-objet : rien", () => {
  assertEquals(applyEvalOverrides(BASE, undefined, 'service'), { librarian: BASE, applied: [], ignored: [] })
  assertEquals(applyEvalOverrides(BASE, 'oui', 'service').applied, [])
})
