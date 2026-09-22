// ============================================================================
// eval/judge-groundedness.ts — Juge de fidélité sans référence (Sprint 0, S0.5)
// ============================================================================
// Vérifie, pour chaque réponse d'un rapport run-eval, que les affirmations
// sont soutenues par les extraits fournis et que les citations [Doc, Page X]
// correspondent à des sources réellement remontées. Aucune réponse attendue
// nécessaire — c'est l'étage 2 (monde ouvert) du dispositif d'évaluation.
//
// Usage :
//   deno run -A eval/judge-groundedness.ts --from-report eval/reports/<tag>.json [--passes 3] [--chunks-only] [--limit N]
//
// eval/.env : GEMINI_API_KEY requis.
//   Optionnel : SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY → le juge récupère le
//   contenu COMPLET des chunks cités (sinon il ne dispose que des aperçus 200c).
// ============================================================================

interface JudgeVerdict {
  claims: { text: string; verdict: 'SUPPORTED' | 'UNSUPPORTED' | 'CONTRADICTED'; source_quote: string | null }[]
  citations: { cited: string; valid: boolean }[]
  groundedness: number
  citation_accuracy: number
}

export interface JudgeSummary { groundedness: number; citation_accuracy: number; groundedness_sd: number; passes: number }

const r3 = (x: number) => Number(x.toFixed(3))

/** R-S2b : moyenne + écart-type (population) de la fidélité sur N passages du juge. */
export function averageVerdicts(verdicts: JudgeVerdict[]): JudgeSummary {
  const n = verdicts.length
  const g = verdicts.map(v => v.groundedness)
  const mean = g.reduce((a, b) => a + b, 0) / n
  const sd = Math.sqrt(g.reduce((a, b) => a + (b - mean) ** 2, 0) / n)
  return {
    groundedness: r3(mean),
    citation_accuracy: r3(verdicts.reduce((a, v) => a + v.citation_accuracy, 0) / n),
    groundedness_sd: r3(sd),
    passes: n,
  }
}

/** R-S2b : en mode intégral le juge ne voit pas les fichiers ; un refus n'a rien à soutenir. */
export function isJudgeable(r: { mode: string; refusal_detected?: boolean }, chunksOnly: boolean): boolean {
  if (!chunksOnly) return true
  return (r.mode === 'chunks' || r.mode === 'agentic') && !r.refusal_detected
}

interface ReportResult {
  id: string
  classe: string
  question: string
  answer: string
  mode: string
  error: string | null
  refusal_detected?: boolean
  sources: { id?: number | string; document_name?: string; page?: number; content_preview?: string | null }[]
  judge?: JudgeSummary | { error: string }
  judge_passes?: JudgeVerdict[]
}

const JUDGE_PROMPT = `Tu es un auditeur. Voici une RÉPONSE d'assistant documentaire BTP et les EXTRAITS documentaires qui lui étaient fournis.
1. Découpe la réponse en affirmations factuelles (ignore les formules de politesse et les transitions).
2. Pour chacune : SUPPORTED (un extrait la soutient), UNSUPPORTED (aucun extrait ne la soutient), CONTRADICTED (un extrait dit le contraire).
3. Vérifie chaque citation au format [Document, Page X] ou (p.X) dans la réponse : le document ET la page correspondent-ils à un extrait fourni ?
Si les extraits sont des aperçus tronqués (marqués APERÇU), sois prudent : ne marque CONTRADICTED que si la contradiction est explicite.
Réponds UNIQUEMENT en JSON :
{"claims":[{"text":"...","verdict":"SUPPORTED|UNSUPPORTED|CONTRADICTED","source_quote":"...ou null"}],
 "citations":[{"cited":"[Doc, Page X]","valid":true}],
 "groundedness":0.0,
 "citation_accuracy":0.0}
(groundedness = part de claims SUPPORTED ; citation_accuracy = part de citations valides ; 1.0 si aucune citation et aucune affirmation problématique)`

async function loadEnv(path: string): Promise<Record<string, string>> {
  const env: Record<string, string> = {}
  try {
    const text = await Deno.readTextFile(path)
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq > 0) env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
    }
  } catch { /* .env absent */ }
  for (const key of ['GEMINI_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
    const v = Deno.env.get(key)
    if (v && !env[key]) env[key] = v
  }
  return env
}

function parseArgs(args: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {}
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (!a.startsWith('--')) continue
    const next = args[i + 1]
    if (next && !next.startsWith('--')) { out[a.slice(2)] = next; i++ } else { out[a.slice(2)] = true }
  }
  return out
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Récupère le contenu complet des chunks via PostgREST (schéma rag), si service key dispo. */
async function fetchChunkContents(
  chunkIds: number[],
  env: Record<string, string>,
): Promise<Map<number, string>> {
  const map = new Map<number, string>()
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || chunkIds.length === 0) return map
  try {
    const url = `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/documents?select=id,content&id=in.(${chunkIds.join(',')})`
    const res = await fetch(url, {
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Accept-Profile': 'rag',
      },
    })
    if (!res.ok) return map
    const rows: { id: number; content: string }[] = await res.json()
    for (const row of rows) map.set(row.id, row.content)
  } catch { /* mode aperçu uniquement */ }
  return map
}

function buildEvidence(result: ReportResult, fullContents: Map<number, string>): string {
  const parts: string[] = []
  for (const [i, s] of result.sources.entries()) {
    const full = typeof s.id === 'number' ? fullContents.get(s.id) : undefined
    const label = `EXTRAIT ${i + 1} — ${s.document_name || 'Document'}${s.page != null ? `, Page ${s.page}` : ''}${full ? '' : ' (APERÇU tronqué)'}`
    const content = full || s.content_preview || '(contenu indisponible)'
    parts.push(`${label}\n${content}`)
  }
  return parts.join('\n\n---\n\n') || '(aucun extrait fourni)'
}

async function judgeOne(
  result: ReportResult,
  fullContents: Map<number, string>,
  model: string,
  geminiKey: string,
): Promise<JudgeVerdict> {
  const userContent = `${JUDGE_PROMPT}\n\n## EXTRAITS FOURNIS À L'ASSISTANT\n\n${buildEvidence(result, fullContents)}\n\n## RÉPONSE DE L'ASSISTANT\n\n${result.answer}`
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: userContent }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 4096, responseMimeType: 'application/json' },
    }),
  })
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('réponse juge vide')
  return JSON.parse(text) as JudgeVerdict
}

async function main() {
  const args = parseArgs(Deno.args)
  const env = await loadEnv('eval/.env')
  const model = typeof args.model === 'string' ? args.model : 'gemini-2.5-flash-lite'

  if (!env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY manquant (eval/.env)')
    Deno.exit(1)
  }
  const reportPath = typeof args['from-report'] === 'string' ? args['from-report'] : null
  if (!reportPath) {
    console.error('❌ Usage : deno run -A eval/judge-groundedness.ts --from-report eval/reports/<tag>.json')
    Deno.exit(1)
  }

  const passes = typeof args.passes === 'string' ? Math.max(1, parseInt(args.passes, 10)) : 1
  const chunksOnly = Boolean(args['chunks-only'])

  const report = JSON.parse(await Deno.readTextFile(reportPath))
  let results: ReportResult[] = report.results || []
  results = results.filter(r => r.answer && !r.error && isJudgeable(r, chunksOnly))
  if (typeof args.limit === 'string') results = results.slice(0, parseInt(args.limit, 10))

  const deepMode = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY)
  console.log(`⚖ Juge fidélité (${model}) sur ${results.length} réponses — mode ${deepMode ? 'COMPLET (chunks DB)' : 'APERÇUS (200c)'} · ${passes} passage(s) · ${chunksOnly ? 'extraits/agentique hors refus' : 'toutes réponses'}`)

  const scores: { id: string; classe: string; groundedness: number; citation_accuracy: number; sd: number }[] = []
  for (const [i, r] of results.entries()) {
    try {
      const chunkIds = r.sources.map(s => s.id).filter((id): id is number => typeof id === 'number')
      const fullContents = await fetchChunkContents(chunkIds, env)
      const verdicts: JudgeVerdict[] = []
      for (let p = 0; p < passes; p++) {
        verdicts.push(await judgeOne(r, fullContents, model, env.GEMINI_API_KEY))
        await delay(600)
      }
      r.judge = averageVerdicts(verdicts)
      r.judge_passes = verdicts
      scores.push({ id: r.id, classe: r.classe, groundedness: r.judge.groundedness, citation_accuracy: r.judge.citation_accuracy, sd: r.judge.groundedness_sd })
      const flag = r.judge.groundedness >= 0.8 ? '✅' : r.judge.groundedness >= 0.5 ? '⚠' : '❌'
      const claimsAvg = Math.round(verdicts.reduce((a, v) => a + v.claims.length, 0) / verdicts.length)
      console.log(`${flag} [${i + 1}/${results.length}] ${r.id} groundedness=${r.judge.groundedness.toFixed(2)}±${r.judge.groundedness_sd} citations=${r.judge.citation_accuracy.toFixed(2)} (${claimsAvg} claims)`)
    } catch (err) {
      r.judge = { error: err instanceof Error ? err.message : String(err) }
      console.log(`💥 [${i + 1}/${results.length}] ${r.id} juge en échec: ${(r.judge as { error: string }).error}`)
      await delay(600)
    }
  }

  // Moyennes par classe
  const classes = [...new Set(scores.map(s => s.classe))].sort()
  console.log('\n📊 Fidélité par classe :')
  for (const c of classes) {
    const cs = scores.filter(s => s.classe === c)
    const g = cs.reduce((a, b) => a + b.groundedness, 0) / cs.length
    const ca = cs.reduce((a, b) => a + b.citation_accuracy, 0) / cs.length
    const sdMoyen = cs.reduce((a, b) => a + b.sd, 0) / cs.length
    console.log(`   ${c} : groundedness ${g.toFixed(2)} (écart moyen ±${sdMoyen.toFixed(3)}) · citations ${ca.toFixed(2)} (n=${cs.length})`)
  }
  const worst = [...scores].sort((a, b) => a.groundedness - b.groundedness).slice(0, 3)
  if (worst.length) console.log(`\n🔎 À inspecter en priorité : ${worst.map(w => `${w.id} (${w.groundedness.toFixed(2)})`).join(', ')}`)

  const outPath = reportPath.replace(/\.json$/, passes > 1 ? `.judged-x${passes}.json` : '.judged.json')
  await Deno.writeTextFile(outPath, JSON.stringify(report, null, 2))
  console.log(`\n📁 Rapport enrichi : ${outPath}`)
}

if (import.meta.main) {
  main().catch(err => { console.error('Erreur fatale:', err); Deno.exit(1) })
}
