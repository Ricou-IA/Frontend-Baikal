import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts"
import {
  extractNamedDocuments, matchNamedDocument, formatNamedDocumentsBlock, normalizeName,
  projectNameTokens, resolveNamedDocuments, fetchNamedDocumentCandidates, fetchProjectNameTokens,
  buildFilenameFilter, TYPE_FILENAME_PATTERNS,
} from "./named-documents.ts"
import type { CandidatesByType, NamedCandidate, NamedDocumentStatus, NamedDocumentType, Supabase } from "../types.ts"

// ============================================================================
// EXTRACTION
// ============================================================================

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

// R7 : « plan » et « notice » sont trop génériques, ils ne sont plus extraits (types conservés).
Deno.test("extraction R7 : plan et notice ne sont plus des documents nommés", () => {
  assertEquals(extractNamedDocuments("Quel est le plan de paiement prévu ?"), [])
  assertEquals(extractNamedDocuments("Que montre le plan de masse ?"), [])
  assertEquals(extractNamedDocuments("Que dit la notice de sécurité ?"), [])
})

// Hotfix 2026-09-15 : le CCAG est un document de la couche application (sources.files layer='app',
// project_id null), pas un fichier du projet — la résolution par projet répondrait « aucun » à tort.
// Réactivation au Sprint 2 avec la résolution couche application.
Deno.test("extraction : CCAG (couche application) n'est pas extrait pour ce déploiement", () => {
  assertEquals(extractNamedDocuments("Résume le CCAG"), [])
  assertEquals(extractNamedDocuments("Que dit le CCAG sur les pénalités de retard ?"), [])
})

// R1 : les qualifiants ne sont collectés que derrière un lien (de/du/des/d’/lot/n°/chiffre).
Deno.test("extraction R1 : un verbe après la mention n'est pas un qualifiant", () => {
  assertEquals(extractNamedDocuments("Qu'est-ce que le dernier CR rappelle sur les délais ?"),
    [{ type: "cr", phrase: "CR", qualifiers: [] }])
  assertEquals(extractNamedDocuments("Le CCTP renvoie à quelle norme ?"),
    [{ type: "cctp", phrase: "CCTP", qualifiers: [] }])
})

Deno.test("extraction R1 : un mot accolé qui n'est pas un lien ferme la collecte", () => {
  assertEquals(extractNamedDocuments("Y a-t-il un système de sprinklage prévu dans le CCTP TCE de Bessières ?"),
    [{ type: "cctp", phrase: "CCTP", qualifiers: [] }])
  assertEquals(extractNamedDocuments("Que prévoit la charte chantier vert sur CMP ?"),
    [{ type: "charte", phrase: "charte", qualifiers: [] }])
})

Deno.test("extraction R1 : liens acceptés (de, du, des, d’, lot, n°, numéro, chiffre)", () => {
  assertEquals(extractNamedDocuments("Que dit le CCTP du lot 15 ?")[0].qualifiers, ["lot", "15"])
  assertEquals(extractNamedDocuments("Que dit le CR 41 ?")[0].qualifiers, ["41"])
  assertEquals(extractNamedDocuments("Que dit le CCTP lot 15 ?")[0].qualifiers, ["lot", "15"])
  assertEquals(extractNamedDocuments("Que dit le CCTP n°12 ?")[0].qualifiers, ["12"])
  assertEquals(extractNamedDocuments("Que dit le CCTP numéro 12 ?")[0].qualifiers, ["12"])
  assertEquals(extractNamedDocuments("Que dit le CCTP des menuiseries ?")[0].qualifiers, ["menuiseries"])
  assertEquals(extractNamedDocuments("Que dit le CCTP d'étanchéité ?")[0].qualifiers, ["étanchéité"])
})

Deno.test("extraction R1 : inversion interrogative (figure-t-il, évoque-t-il) rompt la mention", () => {
  assertEquals(extractNamedDocuments("Le CCTP évoque-t-il le nettoyage ?"),
    [{ type: "cctp", phrase: "CCTP", qualifiers: [] }])
  const r = extractNamedDocuments("Dans le CCTP du lot 07, figure-t-il une tolérance ?")
  assertEquals(r[0].qualifiers, ["lot", "07"])
  assertEquals(r[0].phrase, "CCTP du lot 07")
})

Deno.test("extraction : apostrophe typographique (U+2019) reconnue comme l'apostrophe droite", () => {
  assertEquals(extractNamedDocuments("Que dit l’acte d’engagement sur le délai ?"),
    [{ type: "acte_engagement", phrase: "acte d’engagement", qualifiers: [] }])
  assertEquals(extractNamedDocuments("Le CCTP de l’EHPAD prévoit-il un paratonnerre ?")[0].qualifiers, ["ehpad"])
})

Deno.test("extraction : un motif par type restant (doe, dpgf, pgc, rict, planning, acte d'engagement)", () => {
  assertEquals(extractNamedDocuments("Le DOE a-t-il été remis ?")[0]?.type, "doe")
  assertEquals(extractNamedDocuments("Que contient la DPGF ?")[0]?.type, "dpgf")
  assertEquals(extractNamedDocuments("Que dit le PGC sur les accès ?")[0]?.type, "pgc")
  assertEquals(extractNamedDocuments("Le RICT est-il annexé ?")[0]?.type, "rict")
  assertEquals(extractNamedDocuments("Quel est le planning des travaux ?")[0]?.type, "planning")
  assertEquals(extractNamedDocuments("Que dit l'acte d'engagement ?")[0]?.type, "acte_engagement")
})

// ============================================================================
// NOM DU PROJET (R2)
// ============================================================================

Deno.test("normalizeName : accents, œ, casse", () => {
  assertEquals(normalizeName("GROS ŒUVRE Lézignan"), "gros oeuvre lezignan")
})

Deno.test("projectNameTokens : mots du nom du projet, 3 lettres ou plus, sans mots-outils", () => {
  assertEquals(projectNameTokens({ name: "OC014 - Bessières" }), ["oc014", "bessieres"])
  assertEquals(projectNameTokens({ name: "Golf Park" }), ["golf", "park"])
  assertEquals(projectNameTokens({ name: "CMP" }), ["cmp"])
  assertEquals(projectNameTokens(null), [])
  assertEquals(projectNameTokens({}), [])
  assertEquals(projectNameTokens({ name: 42 }), [])
})

// ============================================================================
// APPARIEMENT
// ============================================================================

/** Candidat tel que le construit `fetchNamedDocumentCandidates` (display_name absent par défaut). */
function cand(original: string, display?: string): NamedCandidate {
  return { name: display || original, searchText: normalizeName(`${original} ${display || ""}`) }
}

// Noms réels des 4 projets d'éval, vérifiés en base le 2026-09-15.
interface EvalProject { name: string; files: string[] }

const EHPAD: EvalProject = {
  name: "Ephad Lezignan",
  files: [
    "2139_CCAP.pdf",
    "72 PROCES VERBAL CHANTIER_Lézignan-Corbières_EHPAD.pdf.pdf",
    "73 PROCES VERBAL CHANTIER_Lézignan-Corbières_EHPAD.pdf.pdf",
    "CCTP -  N°12 PEINTURE.pdf",
    "CCTP - Lot N°02 ETANCHEITE.pdf",
    "CCTP - Lot N°03 REVÊTEMENT DE FACADES.pdf",
    "CCTP - Lot N°05 MENUISERIES EXTERIEURES ALUMINIUM.pdf",
    "CCTP - Lot N°07 PLÂTRERIE.pdf",
    "CCTP - Lot N°08 FAUX-PLAFONDS.pdf",
  ],
}
const CMP: EvalProject = {
  name: "CMP",
  files: [
    "CCAP.pdf",
    "PE06-06-CCTP-LOT 06-MENUISERIES EXTERIEURES ind02.pdf",
    "PE06-07-CCTP-LOT 07-MENUISERIES INTERIEURES ind02.pdf",
    "PE06-10-CCTP-LOT 10-PEINTURE ET SIGNALETIQUE INTERIEURE ind01.pdf",
    "PE06-15 CCTP LOT 15 - FLUIDES SPECIAUX ind01.pdf",
  ],
}
const BESSIERES: EvalProject = {
  name: "OC014 - Bessières",
  files: ["Acte d'Engagement", "CCAP", "CCTP TCE", "Mémoire Technique", "PGC", "RICT"],
}
const GOLF: EvalProject = {
  name: "Golf Park",
  files: ["Acte d'Engagement", "ANNEXES CHARTE CHANTIER VERT", "CCAP Travaux", "CHARTE CHANTIER VERT", "CCTP GOLF PARK"],
}

const EHPAD_CCTP = EHPAD.files.filter(f => f.startsWith("CCTP"))

/** Simule la requête `sources.files` : mêmes motifs qu'en base (~* ≡ RegExp /i). */
function byTypeFor(project: EvalProject, types: NamedDocumentType[], truncated = false): CandidatesByType {
  const map: CandidatesByType = new Map()
  for (const type of types) {
    const patterns = TYPE_FILENAME_PATTERNS[type].map(p => new RegExp(p, "i"))
    const files = project.files.filter(f => patterns.some(re => re.test(f)))
    map.set(type, { candidates: files.map(f => cand(f)), truncated })
  }
  return map
}

Deno.test("appariement : trouvé quand tous les qualifiants sont dans le nom (accents et n° ignorés)", () => {
  const r = matchNamedDocument({ type: "cctp", phrase: "CCTP du lot 7", qualifiers: ["lot", "7"] }, EHPAD_CCTP.map(f => cand(f)))
  assertEquals(r.status, "found")
  assertEquals(r.found, ["CCTP - Lot N°07 PLÂTRERIE.pdf"])
  assertEquals(r.total, 1)
  assertEquals(r.truncated, false)
})

Deno.test("appariement : qualifiant numérique apparié comme nombre entier (07 ≠ 070, 7 = 07)", () => {
  const cands = ["CR 07.pdf", "CR 070.pdf", "CR 107.pdf"].map(f => cand(f))
  const r = matchNamedDocument({ type: "cr", phrase: "CR 7", qualifiers: ["7"] }, cands)
  assertEquals(r.found, ["CR 07.pdf"])
})

Deno.test("appariement : non trouvé → fichiers du même type (max 12) et qualifiants effectifs conservés", () => {
  const r = matchNamedDocument({ type: "cctp", phrase: "CCTP du gros œuvre", qualifiers: ["gros", "œuvre"] }, EHPAD_CCTP.map(f => cand(f)))
  assertEquals(r.status, "not_found")
  assertEquals(r.found, [])
  assertEquals(r.similar, EHPAD_CCTP)
  assertEquals(r.qualifiers, ["gros", "œuvre"])
  assertEquals(r.total, 6)
})

Deno.test("appariement : aucun candidat", () => {
  const r = matchNamedDocument({ type: "pgc", phrase: "PGC", qualifiers: [] }, [])
  assertEquals(r.status, "no_candidate")
  assertEquals(r.total, 0)
})

Deno.test("appariement : sans qualifiant, un seul candidat → trouvé", () => {
  const r = matchNamedDocument({ type: "ccap", phrase: "CCAP", qualifiers: [] }, [cand("2139_CCAP.pdf")])
  assertEquals(r, {
    phrase: "CCAP", type: "ccap", qualifiers: [], found: ["2139_CCAP.pdf"],
    similar: [], status: "found", total: 1, truncated: false,
  })
})

Deno.test("appariement : sans qualifiant, plusieurs candidats → tous, total réel", () => {
  const r = matchNamedDocument({ type: "cctp", phrase: "CCTP", qualifiers: [] }, EHPAD_CCTP.map(f => cand(f)))
  assertEquals(r.status, "found")
  assertEquals(r.found.length, 6)
  assertEquals(r.total, 6)
})

Deno.test("appariement R5 : le qualifiant est cherché dans les deux noms, le nom présenté est affiché", () => {
  const c = cand("PE06-15 CCTP LOT 15 - FLUIDES SPECIAUX ind01.pdf", "Fluides spéciaux")
  const r = matchNamedDocument({ type: "cctp", phrase: "CCTP du lot 15", qualifiers: ["lot", "15"] }, [c])
  assertEquals(r.status, "found")
  assertEquals(r.found, ["Fluides spéciaux"])
})

Deno.test("appariement R2 : les mots du nom du projet sont retirés des qualifiants", () => {
  const r = matchNamedDocument({ type: "ccap", phrase: "CCAP de CMP", qualifiers: ["cmp"] }, [cand("CCAP.pdf")], ["cmp"])
  assertEquals(r.status, "found")
  assertEquals(r.found, ["CCAP.pdf"])
  assertEquals(r.qualifiers, [])
})

Deno.test("appariement : compte rendu 72 trouvé parmi les procès-verbaux", () => {
  const pv = EHPAD.files.filter(f => f.includes("PROCES")).map(f => cand(f))
  const r = matchNamedDocument({ type: "cr", phrase: "compte rendu de chantier, le 72", qualifiers: ["72"] }, pv)
  assertEquals(r.found, ["72 PROCES VERBAL CHANTIER_Lézignan-Corbières_EHPAD.pdf.pdf"])
})

// ============================================================================
// BLOC DE PROMPT (R3, R4)
// ============================================================================

Deno.test("bloc de prompt : found, not_found factuel, no_candidate, unknown omis", () => {
  const block = formatNamedDocumentsBlock([
    { phrase: "CCAP", type: "ccap", qualifiers: [], found: ["2139_CCAP.pdf"], similar: [], status: "found", total: 1, truncated: false },
    { phrase: "CCAP de l'EHPAD", type: "ccap", qualifiers: ["ehpad"], found: [], similar: ["2139_CCAP.pdf"], status: "not_found", total: 1, truncated: false },
    { phrase: "CCTP du gros œuvre", type: "cctp", qualifiers: ["gros", "œuvre"], found: [], similar: ["CCTP - Lot N°07 PLÂTRERIE.pdf", "CCTP - Lot N°02 ETANCHEITE.pdf"], status: "not_found", total: 6, truncated: false },
    { phrase: "PGC", type: "pgc", qualifiers: [], found: [], similar: [], status: "no_candidate", total: 0, truncated: false },
    { phrase: "DOE", type: "doe", qualifiers: [], found: [], similar: [], status: "unknown", total: 0, truncated: false },
  ])!
  assert(block.startsWith("DOCUMENTS NOMMES DANS LA QUESTION"))
  assert(block.includes("- « CCAP » → 2139_CCAP.pdf"))
  assert(block.includes("- « CCAP de l'EHPAD » → aucun fichier ccap ne porte « ehpad » ; fichiers ccap du projet : 2139_CCAP.pdf"))
  assert(block.includes("- « CCTP du gros œuvre » → aucun fichier cctp ne porte « gros », « œuvre » ; fichiers cctp du projet : CCTP - Lot N°07 PLÂTRERIE.pdf, CCTP - Lot N°02 ETANCHEITE.pdf (+4 autres)"))
  assert(block.includes("- « PGC » → AUCUN fichier de ce type dans le projet"))
  assert(!block.includes("DOE"))
  // Le bloc n'affirme une absence que pour no_candidate
  assert(!block.includes("AUCUN fichier correspondant"))
  assertEquals(formatNamedDocumentsBlock([]), null)
  assertEquals(formatNamedDocumentsBlock([{ phrase: "DOE", type: "doe", qualifiers: [], found: [], similar: [], status: "unknown", total: 0, truncated: false }]), null)
})

Deno.test("bloc de prompt R4 : liste tronquée signalée, sur found comme sur not_found", () => {
  const douze = Array.from({ length: 12 }, (_, i) => `CCTP - Lot N°${String(i + 1).padStart(2, "0")}.pdf`)
  const block = formatNamedDocumentsBlock([
    { phrase: "CCTP", type: "cctp", qualifiers: [], found: douze, similar: [], status: "found", total: 20, truncated: true },
    { phrase: "CCTP du lot 25", type: "cctp", qualifiers: ["lot", "25"], found: [], similar: douze, status: "not_found", total: 20, truncated: true },
  ])!
  assert(block.includes("CCTP - Lot N°12.pdf (+8 autres) (liste partielle)"))
  assertEquals(block.split("(liste partielle)").length - 1, 2)
})

// ============================================================================
// TABLE DE NON-RÉGRESSION (R9) — phrasés réels des golden sets
// ============================================================================

interface Row {
  id: string
  q: string
  project?: EvalProject
  count?: number
  type?: NamedDocumentType
  phrase?: string
  qualifiers?: string[]
  status?: NamedDocumentStatus
  found?: string[]
  similar?: string[]
  total?: number
}

const ROWS: Row[] = [
  {
    id: "C7-004", q: "Dans le CCTP du gros œuvre, aborde-t-on le nettoyage extérieur ?", project: EHPAD,
    type: "cctp", phrase: "CCTP du gros œuvre", status: "not_found",
    qualifiers: ["gros", "œuvre"], found: [], similar: EHPAD_CCTP, total: 6,
  },
  {
    id: "SC8-005", q: "Que dit l'article 3.2 du CCAP de l'EHPAD ?", project: EHPAD,
    type: "ccap", status: "not_found", qualifiers: ["ehpad"], similar: ["2139_CCAP.pdf"], total: 1,
  },
  {
    id: "SC4-003", q: "Quel est le délai de paiement dans le CCAP de CMP ?", project: CMP,
    type: "ccap", status: "found", qualifiers: [], found: ["CCAP.pdf"], total: 1,
  },
  {
    id: "SC4-002", q: "Que prévoit l'acte d'engagement de Golf Park sur le prix ?", project: GOLF,
    type: "acte_engagement", status: "found", qualifiers: [], found: ["Acte d'Engagement"],
  },
  {
    id: "SC7-005", q: "Y a-t-il un système de sprinklage prévu dans le CCTP TCE de Bessières ?", project: BESSIERES,
    type: "cctp", phrase: "CCTP", status: "found", qualifiers: [], found: ["CCTP TCE"],
  },
  { id: "SC3-005", q: "Qu'est-ce que le dernier CR rappelle sur les délais ?", type: "cr", phrase: "CR", qualifiers: [] },
  { id: "SC6-006", q: "Le CCTP renvoie à quelle norme ?", type: "cctp", phrase: "CCTP", qualifiers: [] },
  { id: "SC1-003", q: "Un plan d'exécution en retard sur CMP, que dit le CCAP ?", count: 1, type: "ccap", phrase: "CCAP" },
  {
    id: "lot-15", q: "Dans le CCTP du lot 15, quelles sont les prescriptions ?", project: CMP,
    type: "cctp", status: "found", found: ["PE06-15 CCTP LOT 15 - FLUIDES SPECIAUX ind01.pdf"],
  },
  {
    id: "cr-72", q: "Le compte rendu 72, il date de quand ?", project: EHPAD,
    type: "cr", status: "found", found: ["72 PROCES VERBAL CHANTIER_Lézignan-Corbières_EHPAD.pdf.pdf"],
  },
  { id: "pgc-bessieres", q: "Que dit le PGC sur les accès ?", project: BESSIERES, type: "pgc", status: "found", found: ["PGC"] },
  { id: "pgc-cmp", q: "Que dit le PGC sur les accès ?", project: CMP, type: "pgc", status: "no_candidate", total: 0 },
  {
    id: "charte-golf", q: "Que prévoit la charte chantier vert ?", project: GOLF,
    type: "charte", phrase: "charte", status: "found", qualifiers: [],
    found: ["ANNEXES CHARTE CHANTIER VERT", "CHARTE CHANTIER VERT"], total: 2,
  },
  { id: "charte-cmp", q: "Que prévoit la charte chantier vert ?", project: CMP, type: "charte", status: "no_candidate", total: 0 },
]

Deno.test("non-régression : phrasés réels des golden sets sur les fichiers réels des 4 projets", () => {
  for (const row of ROWS) {
    const named = extractNamedDocuments(row.q)
    assertEquals(named.length, row.count ?? 1, `${row.id} : nombre de mentions`)
    const n = named[0]
    if (row.type) assertEquals(n.type, row.type, `${row.id} : type`)
    if (row.phrase !== undefined) assertEquals(n.phrase, row.phrase, `${row.id} : phrase`)
    if (!row.project) {
      if (row.qualifiers) assertEquals(n.qualifiers, row.qualifiers, `${row.id} : qualifiants`)
      continue
    }
    const byType = byTypeFor(row.project, named.map(x => x.type))
    const [r] = resolveNamedDocuments(named, byType, projectNameTokens({ name: row.project.name }))
    if (row.status) assertEquals(r.status, row.status, `${row.id} : statut`)
    if (row.qualifiers) assertEquals(r.qualifiers, row.qualifiers, `${row.id} : qualifiants effectifs`)
    if (row.found) assertEquals(r.found, row.found, `${row.id} : found`)
    if (row.similar) assertEquals(r.similar, row.similar, `${row.id} : similar`)
    if (row.total !== undefined) assertEquals(r.total, row.total, `${row.id} : total`)
    assertEquals(r.truncated, false, `${row.id} : truncated`)
  }
})

Deno.test("non-régression R4 : 20 candidats → liste partielle, aucune absence affirmée", () => {
  const vingt: EvalProject = {
    name: "Lots",
    files: Array.from({ length: 20 }, (_, i) => `CCTP - Lot N°${String(i + 1).padStart(2, "0")} TRAVAUX.pdf`),
  }
  const named = extractNamedDocuments("Que dit le CCTP du lot 25 ?")
  const [r] = resolveNamedDocuments(named, byTypeFor(vingt, ["cctp"], true), projectNameTokens({ name: vingt.name }))
  assertEquals(r.status, "not_found")
  assertEquals(r.truncated, true)
  assertEquals(r.total, 20)
  assertEquals(r.similar.length, 12)
  const block = formatNamedDocumentsBlock([r])!
  assert(block.includes("(liste partielle)"), block)
  assert(!block.includes("AUCUN"), block)
})

Deno.test("résolution : type absent de la Map ou en erreur → unknown, ligne omise du bloc", () => {
  const named = extractNamedDocuments("Que dit le CCAP sur les pénalités ?")
  const absent = resolveNamedDocuments(named, new Map())
  assertEquals(absent[0].status, "unknown")
  assertEquals(absent[0].qualifiers, [])
  assertEquals(absent[0].truncated, false)
  assertEquals(formatNamedDocumentsBlock(absent), null)

  const erreur: CandidatesByType = new Map([["ccap", null]])
  assertEquals(resolveNamedDocuments(named, erreur)[0].status, "unknown")
})

Deno.test("résolution : aucune requête sans project_id ni mention", async () => {
  const supabase = {} as unknown as Supabase
  assertEquals((await fetchNamedDocumentCandidates(supabase, undefined, extractNamedDocuments("Que dit le CCAP ?"))).size, 0)
  assertEquals((await fetchNamedDocumentCandidates(supabase, "p1", [])).size, 0)
})

// ============================================================================
// NOM DU PROJET (core.projects — out_project_identity n'a pas de clé name)
// ============================================================================

function fakeProjectsClient(result: { data: { name: string } | null; error: { message: string } | null }): Supabase {
  return {
    schema: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve(result),
          }),
        }),
      }),
    }),
  } as unknown as Supabase
}

Deno.test("fetchProjectNameTokens : lit core.projects par id, tokenise le nom", async () => {
  const supabase = fakeProjectsClient({ data: { name: "Golf Park" }, error: null })
  assertEquals(await fetchProjectNameTokens(supabase, "p1"), ["golf", "park"])
})

Deno.test("fetchProjectNameTokens : erreur PostgREST → []", async () => {
  const supabase = fakeProjectsClient({ data: null, error: { message: "boom" } })
  assertEquals(await fetchProjectNameTokens(supabase, "p1"), [])
})

Deno.test("fetchProjectNameTokens : sans project_id → [] sans appel", async () => {
  const supabase = {} as unknown as Supabase
  assertEquals(await fetchProjectNameTokens(supabase, undefined), [])
})

// ============================================================================
// FILTRE POSTGREST (R6)
// ============================================================================

Deno.test("filtre PostgREST : deux colonnes par motif, imatch, motifs sans borne \\m ni virgule ni parenthèse", () => {
  assertEquals(buildFilenameFilter("ccap"), "original_filename.imatch.ccap,display_name.imatch.ccap")
  const cr = buildFilenameFilter("cr")
  assert(cr.includes("original_filename.imatch.[^a-z0-9]cr[^a-z0-9]"))
  assert(cr.includes("display_name.imatch.compte.?s?.?rendu"))
  assert(cr.includes("proc[eèé]s.?verba"))
  for (const patterns of Object.values(TYPE_FILENAME_PATTERNS)) {
    for (const p of patterns) {
      assert(!/[,()]/.test(p), `motif interdit dans .or() : ${p}`)
      assert(!p.includes("\\m") && !p.includes("\\M"), `borne Postgres \\m/\\M interdite (échoue sur « _ ») : ${p}`)
    }
  }
})

Deno.test("filtre R6 : les bornes acceptent « _ », le point et les extrémités du nom", () => {
  const pgc = TYPE_FILENAME_PATTERNS.pgc.map(p => new RegExp(p, "i"))
  for (const nom of ["2139_PGC.pdf", "PGC.pdf", "OC014 PGC", "PGC"]) {
    assert(pgc.some(re => re.test(nom)), `PGC non reconnu dans « ${nom} »`)
  }
  assert(!pgc.some(re => re.test("PGCX.pdf")), "PGCX ne doit pas passer pour un PGC")
})
