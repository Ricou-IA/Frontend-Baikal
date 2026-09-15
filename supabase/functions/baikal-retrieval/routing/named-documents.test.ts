import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { extractNamedDocuments } from "./named-documents.ts"

Deno.test("extraction : CCTP avec qualifiant, arrêt sur le verbe de la question", () => {
  const r = extractNamedDocuments("Dans le CCTP du gros œuvre, aborde-t-on le nettoyage extérieur ?")
  assertEquals(r, [{ type: "cctp", phrase: "CCTP du gros œuvre", qualifiers: ["gros", "œuvre"] }])
})

Deno.test("extraction : compte rendu numéroté, mots-outils exclus, numéro conservé", () => {
  const r = extractNamedDocuments("Le dernier compte rendu de chantier, le 41, il date de quand ?")
  assertEquals(r.length, 1)
  assertEquals(r[0].type, "cr")
  assertEquals(r[0].phrase, "compte rendu de chantier, le 41")
  assert(r[0].qualifiers.includes("41"), `41 attendu dans ${r[0].qualifiers}`)
  assert(!r[0].qualifiers.includes("de") && !r[0].qualifiers.includes("le"))
})

Deno.test("extraction : document sans qualifiant (arrêt sur « sur »)", () => {
  assertEquals(extractNamedDocuments("Que dit le CCAP sur les pénalités ?"),
    [{ type: "ccap", phrase: "CCAP", qualifiers: [] }])
})

Deno.test("extraction : aucune mention", () => {
  assertEquals(extractNamedDocuments("Quel est le délai global des travaux ?"), [])
})

Deno.test("extraction : numéro de lot avec n° et virgule", () => {
  const r = extractNamedDocuments("Dans le CCTP du lot n°07, quelles sont les tolérances ?")
  assertEquals(r[0].phrase, "CCTP du lot n°07")
  assertEquals(r[0].qualifiers, ["lot", "07"])
})

Deno.test("extraction : deux mentions du même type restent distinctes", () => {
  const r = extractNamedDocuments("Compare le CCTP du lot 02 et le CCTP du lot 07")
  assertEquals(r.map(x => x.qualifiers), [["lot", "02"], ["lot", "07"]])
})

Deno.test("extraction : verbe suffixé (prévoit-il) arrête la mention", () => {
  assertEquals(extractNamedDocuments("Le CCTP prévoit-il un paratonnerre sur l'EHPAD ?"),
    [{ type: "cctp", phrase: "CCTP", qualifiers: [] }])
})

Deno.test("extraction : motif long prioritaire (PV de réception, procès-verbal, mémoire technique)", () => {
  assertEquals(extractNamedDocuments("Le PV de réception est-il signé ?")[0].type, "pv")
  assertEquals(extractNamedDocuments("Que dit le procès-verbal 72 ?"), [{ type: "cr", phrase: "procès-verbal 72", qualifiers: ["72"] }])
  const mt = extractNamedDocuments("D'après le mémoire technique, quel est le délai ?")
  assertEquals(mt, [{ type: "memoire", phrase: "mémoire technique", qualifiers: [] }])
})

Deno.test("extraction : question elliptique minuscule", () => {
  assertEquals(extractNamedDocuments("dans le ccap ?"), [{ type: "ccap", phrase: "ccap", qualifiers: [] }])
})

Deno.test("extraction : « plan de paiement » n'est pas un document", () => {
  assertEquals(extractNamedDocuments("Quel est le plan de paiement prévu ?"), [])
  assertEquals(extractNamedDocuments("Que montre le plan de masse ?")[0]?.type, "plan")
})

Deno.test("extraction : charte chantier vert (chantier est un mot-outil, vert un qualifiant)", () => {
  const r = extractNamedDocuments("Que prévoit la charte chantier vert sur CMP ?")
  assertEquals(r, [{ type: "charte", phrase: "charte chantier vert", qualifiers: ["vert"] }])
})

Deno.test("extraction : apostrophe typographique (U+2019) reconnue comme l'apostrophe droite", () => {
  assertEquals(extractNamedDocuments("Que dit l’acte d’engagement sur le délai ?"),
    [{ type: "acte_engagement", phrase: "acte d’engagement", qualifiers: [] }])
  assertEquals(extractNamedDocuments("Le CCTP de l’EHPAD prévoit-il un paratonnerre ?")[0].qualifiers, ["ehpad"])
})
