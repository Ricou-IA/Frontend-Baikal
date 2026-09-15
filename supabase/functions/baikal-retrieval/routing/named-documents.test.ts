import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { extractNamedDocuments, matchNamedDocument, formatNamedDocumentsBlock, normalizeName, buildFilenameFilter, TYPE_FILENAME_PATTERNS } from "./named-documents.ts"

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

// Noms réels du projet EHPAD (eval/config.json → ehpad), vérifiés en base le 2026-09-15
const EHPAD_CCTP = [
  "CCTP -  N°12 PEINTURE.pdf",
  "CCTP - Lot N°02 ETANCHEITE.pdf",
  "CCTP - Lot N°03 REVÊTEMENT DE FACADES.pdf",
  "CCTP - Lot N°05 MENUISERIES EXTERIEURES ALUMINIUM.pdf",
  "CCTP - Lot N°07 PLÂTRERIE.pdf",
  "CCTP - Lot N°08 FAUX-PLAFONDS.pdf",
]
const EHPAD_PV = [
  "72 PROCES VERBAL CHANTIER_Lézignan-Corbières_EHPAD.pdf.pdf",
  "73 PROCES VERBAL CHANTIER_Lézignan-Corbières_EHPAD.pdf.pdf",
]

Deno.test("normalizeName : accents, œ, casse", () => {
  assertEquals(normalizeName("GROS ŒUVRE Lézignan"), "gros oeuvre lezignan")
})

Deno.test("appariement : trouvé quand tous les qualifiants sont dans le nom (accents et n° ignorés)", () => {
  const r = matchNamedDocument({ type: "cctp", phrase: "CCTP du lot 7", qualifiers: ["lot", "7"] }, EHPAD_CCTP)
  assertEquals(r.status, "found")
  assertEquals(r.found, ["CCTP - Lot N°07 PLÂTRERIE.pdf"])
  assertEquals(r.total, 1)
})

Deno.test("appariement : qualifiant numérique apparié comme nombre entier (07 ≠ 070, 7 = 07)", () => {
  const cand = ["CR 07.pdf", "CR 070.pdf", "CR 107.pdf"]
  const r = matchNamedDocument({ type: "cr", phrase: "CR 7", qualifiers: ["7"] }, cand)
  assertEquals(r.found, ["CR 07.pdf"])
})

Deno.test("appariement : non trouvé → fichiers proches (max 5) du même type", () => {
  const r = matchNamedDocument({ type: "cctp", phrase: "CCTP du gros œuvre", qualifiers: ["gros", "œuvre"] }, EHPAD_CCTP)
  assertEquals(r.status, "not_found")
  assertEquals(r.found, [])
  assertEquals(r.similar.length, 5)
  assertEquals(r.total, 6)
})

Deno.test("appariement : aucun candidat", () => {
  const r = matchNamedDocument({ type: "pgc", phrase: "PGC", qualifiers: [] }, [])
  assertEquals(r.status, "no_candidate")
  assertEquals(r.total, 0)
})

Deno.test("appariement : sans qualifiant, un seul candidat → trouvé", () => {
  const r = matchNamedDocument({ type: "ccap", phrase: "CCAP", qualifiers: [] }, ["2139_CCAP.pdf"])
  assertEquals(r, { phrase: "CCAP", type: "ccap", found: ["2139_CCAP.pdf"], similar: [], status: "found", total: 1 })
})

Deno.test("appariement : sans qualifiant, plusieurs candidats → tous (max 5), total réel", () => {
  const r = matchNamedDocument({ type: "cctp", phrase: "CCTP", qualifiers: [] }, EHPAD_CCTP)
  assertEquals(r.status, "found")
  assertEquals(r.found.length, 5)
  assertEquals(r.total, 6)
})

Deno.test("appariement : compte rendu 72 trouvé parmi les procès-verbaux", () => {
  const r = matchNamedDocument({ type: "cr", phrase: "compte rendu de chantier, le 72", qualifiers: ["72"] }, EHPAD_PV)
  assertEquals(r.found, ["72 PROCES VERBAL CHANTIER_Lézignan-Corbières_EHPAD.pdf.pdf"])
})

Deno.test("bloc de prompt : une ligne par statut, unknown omis, null si vide", () => {
  const block = formatNamedDocumentsBlock([
    { phrase: "CCAP", type: "ccap", found: ["2139_CCAP.pdf"], similar: [], status: "found", total: 1 },
    { phrase: "CCTP du gros œuvre", type: "cctp", found: [], similar: ["CCTP - Lot N°07 PLÂTRERIE.pdf", "CCTP - Lot N°02 ETANCHEITE.pdf"], status: "not_found", total: 6 },
    { phrase: "PGC", type: "pgc", found: [], similar: [], status: "no_candidate", total: 0 },
    { phrase: "DOE", type: "doe", found: [], similar: [], status: "unknown", total: 0 },
    { phrase: "CCTP", type: "cctp", found: ["a.pdf", "b.pdf", "c.pdf", "d.pdf", "e.pdf"], similar: [], status: "found", total: 6 },
  ])!
  assert(block.startsWith("DOCUMENTS NOMMES DANS LA QUESTION"))
  assert(block.includes("- « CCAP » → 2139_CCAP.pdf"))
  assert(block.includes("- « CCTP du gros œuvre » → AUCUN fichier correspondant dans le projet ; fichiers proches : CCTP - Lot N°07 PLÂTRERIE.pdf, CCTP - Lot N°02 ETANCHEITE.pdf"))
  assert(block.includes("- « PGC » → AUCUN fichier de ce type dans le projet"))
  assert(!block.includes("DOE"))
  assert(block.includes("e.pdf (+1 autre)"))
  assertEquals(formatNamedDocumentsBlock([]), null)
  assertEquals(formatNamedDocumentsBlock([{ phrase: "DOE", type: "doe", found: [], similar: [], status: "unknown", total: 0 }]), null)
})

Deno.test("filtre PostgREST : deux colonnes par motif, imatch, aucune virgule ni parenthèse dans les motifs", () => {
  assertEquals(buildFilenameFilter("ccap"), "original_filename.imatch.ccap,display_name.imatch.ccap")
  const cr = buildFilenameFilter("cr")
  assert(cr.includes("original_filename.imatch.\\mcr\\M"))
  assert(cr.includes("display_name.imatch.compte.?s?.?rendu"))
  assert(cr.includes("proc[eèé]s.?verba"))
  for (const patterns of Object.values(TYPE_FILENAME_PATTERNS)) {
    for (const p of patterns) assert(!/[,()]/.test(p), `motif interdit dans .or() : ${p}`)
  }
})
