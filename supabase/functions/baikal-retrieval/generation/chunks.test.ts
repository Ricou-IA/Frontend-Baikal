import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { generateChunksStream } from "./chunks.ts"
import type { LibrarianConfig } from "../types.ts"

const cfg = (model: string) => ({ llm_model: model, temperature: 0.3, max_tokens: 100 } as LibrarianConfig)
const KEYS = { openai: 'OA', gemini: 'GM' }

async function* fake(tokens: string[], failBefore = false, failAfter = false): AsyncGenerator<string, string, undefined> {
  if (failBefore) throw new Error('boom avant')
  let out = ''
  for (const t of tokens) { out += t; yield t }
  if (failAfter) throw new Error('boom apres')
  return out
}
async function collect(gen: AsyncGenerator<string, string, undefined>): Promise<string> {
  let out = ''
  for await (const t of gen) out += t
  return out
}

Deno.test("gpt-* → OpenAI, onModel recoit le modele", async () => {
  const models: string[] = []
  const deps = { openai: () => fake(['a', 'b']), gemini: () => fake(['G']) } as any
  const out = await collect(generateChunksStream('q', 'c', 's', cfg('gpt-4.1-mini'), KEYS, { onModel: (m) => models.push(m) }, deps))
  assertEquals(out, 'ab')
  assertEquals(models, ['gpt-4.1-mini'])
})

Deno.test("gemini-* → Gemini extraits", async () => {
  const deps = { openai: () => fake(['a']), gemini: () => fake(['G', 'M']) } as any
  assertEquals(await collect(generateChunksStream('q', 'c', 's', cfg('gemini-2.5-flash'), KEYS, {}, deps)), 'GM')
})

Deno.test("Gemini en erreur avant le premier token → repli OpenAI gpt-4o-mini, onModel appele deux fois", async () => {
  const models: string[] = []
  let openaiModel = ''
  const deps = {
    openai: (_q: string, _c: string, _s: string, config: LibrarianConfig) => { openaiModel = config.llm_model; return fake(['repli']) },
    gemini: () => fake([], true),
  } as any
  const out = await collect(generateChunksStream('q', 'c', 's', cfg('gemini-2.5-flash'), KEYS, { onModel: (m) => models.push(m) }, deps))
  assertEquals(out, 'repli')
  assertEquals(openaiModel, 'gpt-4o-mini')
  assertEquals(models, ['gemini-2.5-flash', 'gpt-4o-mini'])
})

Deno.test("Gemini en erreur apres un token → l'erreur remonte (pas de double reponse)", async () => {
  const deps = { openai: () => fake(['x']), gemini: () => fake(['G'], false, true) } as any
  await assertRejects(() => collect(generateChunksStream('q', 'c', 's', cfg('gemini-2.5-flash'), KEYS, {}, deps)), Error, 'boom apres')
})

Deno.test("Gemini ne rend aucun token (reponse vide) → repli OpenAI gpt-4o-mini, onModel appele deux fois", async () => {
  const models: string[] = []
  let openaiModel = ''
  const deps = {
    openai: (_q: string, _c: string, _s: string, config: LibrarianConfig) => { openaiModel = config.llm_model; return fake(['repli vide']) },
    gemini: () => fake([]),
  } as any
  const out = await collect(generateChunksStream('q', 'c', 's', cfg('gemini-2.5-flash'), KEYS, { onModel: (m) => models.push(m) }, deps))
  assertEquals(out, 'repli vide')
  assertEquals(openaiModel, 'gpt-4o-mini')
  assertEquals(models, ['gemini-2.5-flash', 'gpt-4o-mini'])
})

Deno.test("cle Gemini absente → OpenAI direct avec le modele de repli", async () => {
  let openaiModel = ''
  const deps = { openai: (_q: string, _c: string, _s: string, config: LibrarianConfig) => { openaiModel = config.llm_model; return fake(['o']) }, gemini: () => fake(['G']) } as any
  assertEquals(await collect(generateChunksStream('q', 'c', 's', cfg('gemini-2.5-flash'), { openai: 'OA', gemini: '' }, {}, deps)), 'o')
  assertEquals(openaiModel, 'gpt-4o-mini')
})
