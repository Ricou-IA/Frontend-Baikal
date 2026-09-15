import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { extractSearchTerms, buildFtsQuery } from "./keywords.ts"

Deno.test("numéro d'article conservé, mots-outils et mots-document écartés", () => {
  const t = extractSearchTerms("Que dit l'article 3.7 du CCAP CMP ?")
  assert(t.includes("3.7"), `attendu 3.7 dans ${t}`)
  assert(!t.includes("article"))
  assert(!t.includes("ccap"))
})

Deno.test("références légales L. 8221-3 à L. 8221-5", () => {
  const t = extractSearchTerms("Que disent les pièces du marché sur les articles L. 8221-3 à L. 8221-5 ?")
  assert(t.includes("8221-3"), `attendu 8221-3 dans ${t}`)
  assert(t.includes("8221-5"))
  assert(t.includes("pièces"))
})

Deno.test("normes multi-mots conservées comme phrase", () => {
  const t = extractSearchTerms("Que dit le CCTP sur la NF EN 1154 et le DTU 25.41 ?")
  assert(t.includes("nf en 1154"), `attendu 'nf en 1154' dans ${t}`)
  assert(t.includes("dtu 25.41"), `attendu 'dtu 25.41' dans ${t}`)
})

Deno.test("numéro de lot conservé", () => {
  const t = extractSearchTerms("Qu'est-ce qu'il y a dans le 3.6 du CCTP du lot 06 ?")
  assert(t.includes("3.6"))
  assert(t.includes("lot 06"), `attendu 'lot 06' dans ${t}`)
})

Deno.test("question ordinaire : mots significatifs, accents conservés", () => {
  const t = extractSearchTerms("Où se trouve le terrain de pétanque ?")
  assertEquals(t, ["terrain", "pétanque"])
})

Deno.test("plafond de 8 termes, codes en premier", () => {
  const t = extractSearchTerms("article 2.3.9 pénalités retard chantier résidence Dunant Ecoles Lassalle Presbytère Cannas Faubourg")
  assertEquals(t.length, 8)
  assertEquals(t[0], "2.3.9")
})

Deno.test("buildFtsQuery : termes entre guillemets joints par OR", () => {
  assertEquals(buildFtsQuery(["3.7", "nf en 1154", "pétanque"]), '"3.7" OR "nf en 1154" OR "pétanque"')
  assertEquals(buildFtsQuery([]), "")
})

Deno.test("« en » seul n'est pas une norme (préposition « en 2025 »)", () => {
  assertEquals(extractSearchTerms("Les travaux ont débuté en 2025 sur le chantier"), ["travaux", "débuté"])
})

Deno.test("pas de doublon sur un numéro pointé déjà capturé dans une norme", () => {
  assertEquals(extractSearchTerms("Que dit le CCTP sur la NF EN 1154 et le DTU 25.41 ?"), ["nf en 1154", "dtu 25.41"])
})

Deno.test("question composée uniquement de mots-outils : aucun terme", () => {
  assertEquals(extractSearchTerms("Quel est le point ?"), [])
  assertEquals(buildFtsQuery([]), "")
})

Deno.test("buildFtsQuery : guillemet intégré au terme retiré avant enrobage", () => {
  assertEquals(buildFtsQuery(['a"b']), '"ab"')
})
