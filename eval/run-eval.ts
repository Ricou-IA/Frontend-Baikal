// ============================================================================
// eval/run-eval.ts — Banc d'évaluation RAG ARPET (Sprint 0, S0.4)
// ============================================================================
// Rejoue le golden set contre l'Edge Function baikal-retrieval déployée,
// parse le flux SSE, calcule recall@k / MRR / critères factuels, et produit
// un rapport JSON + Markdown comparable entre runs.
//
// Usage :
//   deno run -A eval/run-eval.ts                            # golden set complet
//   deno run -A eval/run-eval.ts --smoke                    # 1 question de fumée
//   deno run -A eval/run-eval.ts --classes C1,C3            # filtre par classe
//   deno run -A eval/run-eval.ts --limit 5                  # n premières entrées
//   deno run -A eval/run-eval.ts --tag baseline-v2.0.0      # nom du rapport
//   deno run -A eval/run-eval.ts --baseline eval/reports/baseline-v2.0.0.json
//
// eval/.env : SUPABASE_ANON_KEY requis (SUPABASE_URL optionnel, sinon config)
// ============================================================================

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

interface GoldenExpected {
  source_doc_contains?: string | null
  source_page?: number | null
  answer_must_contain?: string[]
  answer_must_not_contain?: string[]
  must_refuse?: boolean
}

interface GoldenEntry {
  id: string
  classe: string
  project_ref: string
  question: string
  conversation_context?: { question: string }[] | null
  synthetic?: boolean
  a_valider?: boolean
  expected: GoldenExpected
  origine?: string
}

interface EvalContext { project_id: string; org_id: string; user_id: string; note?: string }

interface EvalConfig {
  endpoint: string
  app_id: string
  contexts: Record<string, EvalContext>
  defaults: { top_k_for_recall: number; request_timeout_ms: number; delay_between_calls_ms: number }
}

interface SSESource {
  id?: number | string
  document_name?: string
  page?: number
  score?: number
  type?: string
  layer?: string
  content_preview?: string | null
  section_title?: string | null
  hierarchy_level?: number
}

interface CallResult {
  answer: string
  sources: SSESource[]
  conversation_id: string | null
  generation_mode: string
  fast_path: boolean | null
  agentic: { iterations?: number; timed_out?: boolean } | null
  intent: string | null
  latency_ms: number
  error: string | null
}

interface EvalResult {
  id: string
  classe: string
  project_ref: string
  question: string
  ok_recall_doc: boolean | null   // null = pas de doc attendu (ex: must_refuse)
  ok_recall_page: boolean | null  // null = page non vérifiable (absente d'un côté)
  rank: number | null
  ok_criteria: boolean
  refusal_detected: boolean
  missing_facts: string[]
  violations: string[]
  mode: string
  fast_path: boolean | null
  agentic_iterations: number | null
  intent: string | null
  latency_ms: number
  error: string | null
  conversation_id: string | null
  answer: string
  sources: SSESource[]
}

// ----------------------------------------------------------------------------
// Utilitaires
// ----------------------------------------------------------------------------

// Matching insensible à la casse, aux accents, aux espaces (y compris insécables)
// et aux variantes typographiques de tirets/apostrophes — arbitrage n°2 du golden set :
//   « NF P 03‑001 » ≡ « NFP03-001 » ≡ « nfp03001 »
//   « 09 71 10 39 60 » ≡ « 0971103960 »
//   « Les Écoles » ≡ « les ecoles »
// Les points sont conservés volontairement (« 11.2 » ne doit pas matcher « 112 »),
// tout comme les symboles significatifs (%). Appliqué aux DEUX côtés de la comparaison.
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')        // diacritiques combinants (accents)
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")  // apostrophes typographiques → apostrophe droite
    .replace(/[‐-―−]/g, '-') // tirets typographiques (‐ ‑ – — −) → '-'
    .replace(/[\s-]+/g, '')                 // espaces (incl. NBSP/fines) et tirets : supprimés
}

const REFUSAL_PATTERNS = [
  /pas (ete |été )?trouv/i, /ne figure pas/i, /aucune information/i,
  /pas d'information/i, /ne mentionne(nt)? pas/i, /n'est pas (mentionn|precis|précis|indiqu)/i,
  /ne (sont|est) pas couvert/i, /pas de donnees? disponible/i, /hors (du )?(perimetre|périmètre|sujet)/i,
  /ne (fait|fais) pas partie/i, /ne relève pas/i, /sort du (cadre|périmètre|perimetre)/i,
  /je ne peux pas (vous )?(aider|répondre|fournir|confirmer)/i, /pas en mesure de/i,
]

function detectRefusal(answer: string): boolean {
  return REFUSAL_PATTERNS.some(rx => rx.test(answer))
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[Math.max(0, idx)]
}

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
  } catch {
    // pas de .env : on retombe sur les variables d'environnement
  }
  for (const key of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'GEMINI_API_KEY']) {
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
    const key = a.slice(2)
    const next = args[i + 1]
    if (next && !next.startsWith('--')) { out[key] = next; i++ } else { out[key] = true }
  }
  return out
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ----------------------------------------------------------------------------
// Appel SSE de baikal-retrieval
// ----------------------------------------------------------------------------

async function callRetrieval(
  question: string,
  ctx: EvalContext,
  conversationId: string | null,
  cfg: EvalConfig,
  anonKey: string,
): Promise<CallResult> {
  const started = Date.now()
  const result: CallResult = {
    answer: '', sources: [], conversation_id: null, generation_mode: 'unknown',
    fast_path: null, agentic: null, intent: null, latency_ms: 0, error: null,
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), cfg.defaults.request_timeout_ms)

  try {
    const response = await fetch(cfg.endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`,
        'apikey': anonKey,
      },
      body: JSON.stringify({
        query: question,
        user_id: ctx.user_id,
        org_id: ctx.org_id,
        project_id: ctx.project_id,
        conversation_id: conversationId,
        app_id: cfg.app_id,
        stream: true,
        generation_mode: 'auto',
        enable_suggestions: false,
      }),
    })

    if (!response.ok || !response.body) {
      result.error = `HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`
      return result
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const blocks = buffer.split('\n\n')
      buffer = blocks.pop() || ''

      for (const block of blocks) {
        let event = ''
        let data = ''
        for (const line of block.split('\n')) {
          if (line.startsWith('event: ')) event = line.slice(7).trim()
          else if (line.startsWith('data: ')) data += line.slice(6)
        }
        if (!event || !data) continue

        let payload: Record<string, unknown>
        try { payload = JSON.parse(data) } catch { continue }

        if (event === 'token' && typeof payload.content === 'string') {
          result.answer += payload.content
        } else if (event === 'message' && typeof payload.content === 'string') {
          result.answer += payload.content
        } else if (event === 'sources') {
          result.sources = (payload.sources as SSESource[]) || []
          result.conversation_id = (payload.conversation_id as string) || null
          result.generation_mode = (payload.generation_mode as string) || 'unknown'
          result.fast_path = typeof payload.fast_path === 'boolean' ? payload.fast_path : null
          result.intent = (payload.intent as string) || null
          const ag = payload.agentic as { iterations?: number; timed_out?: boolean } | null
          result.agentic = ag || null
        } else if (event === 'error') {
          result.error = String(payload.error || 'erreur SSE')
        }
      }
    }
  } catch (err) {
    result.error = err instanceof Error
      ? (err.name === 'AbortError' ? `timeout ${cfg.defaults.request_timeout_ms}ms` : err.message)
      : String(err)
  } finally {
    clearTimeout(timeout)
  }

  result.latency_ms = Date.now() - started
  return result
}

// ----------------------------------------------------------------------------
// Évaluation d'une entrée
// ----------------------------------------------------------------------------

async function evalEntry(
  entry: GoldenEntry,
  cfg: EvalConfig,
  anonKey: string,
): Promise<EvalResult> {
  const ctx = cfg.contexts[entry.project_ref]
  if (!ctx) throw new Error(`project_ref inconnu dans config.json: ${entry.project_ref} (entrée ${entry.id})`)

  // ISOLATION : chaque entrée dans SA propre conversation neuve.
  // get_agent_context crée la conversation si l'id fourni n'existe pas encore
  // → aucune réutilisation de la conversation active (pas de contamination inter-questions).
  // Pour C5, le même id neuf est réutilisé sur toute la séquence (contexte interne voulu).
  const convId = crypto.randomUUID()
  if (entry.conversation_context?.length) {
    for (const pre of entry.conversation_context) {
      await callRetrieval(pre.question, ctx, convId, cfg, anonKey)
      await delay(cfg.defaults.delay_between_calls_ms)
    }
  }

  const call = await callRetrieval(entry.question, ctx, convId, cfg, anonKey)
  const exp = entry.expected || {}
  const answerNorm = normalize(call.answer)
  const topK = call.sources.slice(0, cfg.defaults.top_k_for_recall)

  // Recall doc-level (les sources SSE sont dédupliquées par fichier)
  let ok_recall_doc: boolean | null = null
  let ok_recall_page: boolean | null = null
  let rank: number | null = null
  if (exp.source_doc_contains) {
    const needle = normalize(exp.source_doc_contains)
    const idx = topK.findIndex(s => normalize(s.document_name || '').includes(needle))
    ok_recall_doc = idx >= 0
    rank = idx >= 0 ? idx + 1 : null
    if (idx >= 0 && exp.source_page != null) {
      const page = topK[idx].page
      ok_recall_page = typeof page === 'number' ? Math.abs(page - exp.source_page) <= 1 : null
    }
  }

  // Critères factuels
  const mustContain = exp.answer_must_contain || []
  const missing_facts = mustContain.filter(f => !answerNorm.includes(normalize(f)))
  const violations = (exp.answer_must_not_contain || []).filter(f => answerNorm.includes(normalize(f)))
  const refusal_detected = detectRefusal(call.answer)

  let ok_criteria: boolean
  if (exp.must_refuse) {
    ok_criteria = refusal_detected && violations.length === 0
  } else {
    ok_criteria = missing_facts.length === 0 && violations.length === 0 && call.error === null
  }

  return {
    id: entry.id, classe: entry.classe, project_ref: entry.project_ref, question: entry.question,
    ok_recall_doc, ok_recall_page, rank, ok_criteria, refusal_detected,
    missing_facts, violations,
    mode: call.generation_mode, fast_path: call.fast_path,
    agentic_iterations: call.agentic?.iterations ?? null,
    intent: call.intent, latency_ms: call.latency_ms, error: call.error,
    conversation_id: convId,
    answer: call.answer, sources: call.sources,
  }
}

// ----------------------------------------------------------------------------
// Agrégats
// ----------------------------------------------------------------------------

interface Aggregate {
  n: number
  recall_doc_pct: number | null
  page_ok_pct: number | null
  criteria_pct: number
  mrr: number | null
  latency_p50: number
  latency_p95: number
  agentic_pct: number
  errors: number
}

function aggregate(results: EvalResult[]): Aggregate {
  const n = results.length
  const withDoc = results.filter(r => r.ok_recall_doc !== null)
  const withPage = results.filter(r => r.ok_recall_page !== null)
  const latencies = results.map(r => r.latency_ms)
  const ranks = withDoc.map(r => (r.rank ? 1 / r.rank : 0))
  return {
    n,
    recall_doc_pct: withDoc.length ? Math.round(100 * withDoc.filter(r => r.ok_recall_doc).length / withDoc.length) : null,
    page_ok_pct: withPage.length ? Math.round(100 * withPage.filter(r => r.ok_recall_page).length / withPage.length) : null,
    criteria_pct: n ? Math.round(100 * results.filter(r => r.ok_criteria).length / n) : 0,
    mrr: ranks.length ? Number((ranks.reduce((a, b) => a + b, 0) / ranks.length).toFixed(3)) : null,
    latency_p50: percentile(latencies, 50),
    latency_p95: percentile(latencies, 95),
    agentic_pct: n ? Math.round(100 * results.filter(r => r.mode === 'agentic').length / n) : 0,
    errors: results.filter(r => r.error !== null).length,
  }
}

function fmt(v: number | null, suffix = ''): string {
  return v === null ? 'n/a' : `${v}${suffix}`
}

function buildMarkdown(
  tag: string,
  results: EvalResult[],
  byClasse: Record<string, Aggregate>,
  global: Aggregate,
  baseline: { tag: string; byClasse: Record<string, Aggregate>; global: Aggregate } | null,
): string {
  const lines: string[] = []
  lines.push(`# Rapport d'évaluation RAG — ${tag}`)
  lines.push('')
  lines.push(`> ${new Date().toISOString()} — ${results.length} questions${baseline ? ` — comparé à ${baseline.tag}` : ''}`)
  lines.push('')
  lines.push('## Synthèse par classe')
  lines.push('')
  const delta = (cur: number | null, ref: number | null | undefined): string =>
    cur !== null && ref !== null && ref !== undefined ? ` (${cur - ref >= 0 ? '+' : ''}${cur - ref})` : ''
  lines.push('| Classe | n | Recall doc | Page OK | Critères | MRR | p50 | p95 | Agentique | Erreurs |')
  lines.push('|---|---|---|---|---|---|---|---|---|---|')
  for (const [classe, agg] of [...Object.entries(byClasse), ['GLOBAL', global] as [string, Aggregate]]) {
    const ref = classe === 'GLOBAL' ? baseline?.global : baseline?.byClasse?.[classe]
    lines.push(
      `| ${classe} | ${agg.n} | ${fmt(agg.recall_doc_pct, '%')}${delta(agg.recall_doc_pct, ref?.recall_doc_pct)} | ` +
      `${fmt(agg.page_ok_pct, '%')} | ${agg.criteria_pct}%${delta(agg.criteria_pct, ref?.criteria_pct)} | ` +
      `${fmt(agg.mrr)} | ${agg.latency_p50}ms | ${agg.latency_p95}ms | ${agg.agentic_pct}% | ${agg.errors} |`,
    )
  }
  lines.push('')
  lines.push('## Échecs')
  lines.push('')
  const failures = results.filter(r => !r.ok_criteria || r.ok_recall_doc === false)
  if (failures.length === 0) lines.push('Aucun échec 🎉')
  for (const f of failures) {
    const reasons: string[] = []
    if (f.ok_recall_doc === false) reasons.push('doc attendu non remonté')
    if (f.missing_facts.length) reasons.push(`faits manquants: ${f.missing_facts.join(', ')}`)
    if (f.violations.length) reasons.push(`violations: ${f.violations.join(', ')}`)
    if (f.error) reasons.push(`erreur: ${f.error}`)
    lines.push(`- **${f.id}** (${f.classe}, ${f.mode}, ${f.latency_ms}ms) « ${f.question.slice(0, 90)} » — ${reasons.join(' ; ') || 'critères non remplis'}`)
  }
  lines.push('')
  return lines.join('\n')
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

async function main() {
  const args = parseArgs(Deno.args)
  const cfg: EvalConfig = JSON.parse(await Deno.readTextFile('eval/config.json'))
  const env = await loadEnv('eval/.env')

  if (env.SUPABASE_URL) {
    cfg.endpoint = `${env.SUPABASE_URL.replace(/\/$/, '')}/functions/v1/baikal-retrieval`
  }
  const anonKey = env.SUPABASE_ANON_KEY
  if (!anonKey) {
    console.error('❌ SUPABASE_ANON_KEY manquant (eval/.env — voir eval/.env.example)')
    Deno.exit(1)
  }

  // --smoke : une question, affichage direct, pas de rapport
  if (args.smoke) {
    const ctx = cfg.contexts.bessieres
    console.log('🔥 Smoke test (bessieres) : "Quel est le délai global d\'exécution des travaux ?"')
    const r = await callRetrieval("Quel est le délai global d'exécution des travaux ?", ctx, null, cfg, anonKey)
    console.log(`\n⏱  ${r.latency_ms}ms — mode=${r.generation_mode} fast_path=${r.fast_path} intent=${r.intent} error=${r.error}`)
    console.log(`\n📄 Sources (${r.sources.length}):`)
    for (const s of r.sources) console.log(`   - ${s.document_name} (p.${s.page ?? '?'}, score=${s.score?.toFixed?.(3) ?? s.score})`)
    console.log(`\n💬 Réponse:\n${r.answer.slice(0, 800)}${r.answer.length > 800 ? '…' : ''}`)
    return
  }

  const goldenPath = typeof args.golden === 'string' ? args.golden : 'eval/golden-set.json'
  const golden: { version: string; entries: GoldenEntry[] } = JSON.parse(await Deno.readTextFile(goldenPath))

  let entries = golden.entries
  if (typeof args.classes === 'string') {
    const wanted = new Set(args.classes.split(',').map(s => s.trim().toUpperCase()))
    entries = entries.filter(e => wanted.has(e.classe.toUpperCase()))
  }
  if (args['validated-only']) entries = entries.filter(e => !e.a_valider)
  if (typeof args.limit === 'string') entries = entries.slice(0, parseInt(args.limit, 10))

  const tag = typeof args.tag === 'string' ? args.tag : `run-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`
  console.log(`▶ Éval « ${tag} » : ${entries.length} questions (golden ${golden.version}) → ${cfg.endpoint}`)

  const results: EvalResult[] = []
  for (const [i, entry] of entries.entries()) {
    const label = `[${i + 1}/${entries.length}] ${entry.id}`
    try {
      const r = await evalEntry(entry, cfg, anonKey)
      const status = r.error ? '💥' : r.ok_criteria && r.ok_recall_doc !== false ? '✅' : '❌'
      console.log(`${status} ${label} ${r.mode} ${r.latency_ms}ms recall=${r.ok_recall_doc} critères=${r.ok_criteria}`)
      results.push(r)
    } catch (err) {
      console.log(`💥 ${label} exception: ${err instanceof Error ? err.message : err}`)
    }
    await delay(cfg.defaults.delay_between_calls_ms)
  }

  // Agrégats
  const classes = [...new Set(results.map(r => r.classe))].sort()
  const byClasse: Record<string, Aggregate> = {}
  for (const c of classes) byClasse[c] = aggregate(results.filter(r => r.classe === c))
  const global = aggregate(results)

  // Baseline éventuelle
  let baseline: { tag: string; byClasse: Record<string, Aggregate>; global: Aggregate } | null = null
  if (typeof args.baseline === 'string') {
    try {
      const ref = JSON.parse(await Deno.readTextFile(args.baseline))
      baseline = { tag: ref.meta?.tag || args.baseline, byClasse: ref.aggregates?.by_classe || {}, global: ref.aggregates?.global }
    } catch (err) {
      console.warn(`⚠ baseline illisible (${args.baseline}): ${err instanceof Error ? err.message : err}`)
    }
  }

  // Rapports
  await Deno.mkdir('eval/reports', { recursive: true })
  const reportJson = {
    meta: { tag, date: new Date().toISOString(), golden_version: golden.version, endpoint: cfg.endpoint, n: results.length },
    aggregates: { global, by_classe: byClasse },
    results,
  }
  const jsonPath = `eval/reports/${tag}.json`
  const mdPath = `eval/reports/${tag}.md`
  await Deno.writeTextFile(jsonPath, JSON.stringify(reportJson, null, 2))
  await Deno.writeTextFile(mdPath, buildMarkdown(tag, results, byClasse, global, baseline))

  // Sidecar : conversations créées en prod par ce run, pour purge chirurgicale.
  const convIds = [...new Set(results.map(r => r.conversation_id).filter((c): c is string => !!c))]
  const convPath = `eval/reports/${tag}.conversations.json`
  await Deno.writeTextFile(convPath, JSON.stringify({ tag, date: reportJson.meta.date, conversation_ids: convIds }, null, 2))

  console.log(`\n📊 GLOBAL : recall doc ${fmt(global.recall_doc_pct, '%')} · critères ${global.criteria_pct}% · MRR ${fmt(global.mrr)} · p50 ${global.latency_p50}ms · p95 ${global.latency_p95}ms · agentique ${global.agentic_pct}% · erreurs ${global.errors}`)
  console.log(`📁 Rapports : ${jsonPath} + ${mdPath}`)
  console.log(`🧹 ${convIds.length} conversation(s) de test créée(s) → ${convPath} (purgeables après run)`)
}

if (import.meta.main) {
  main().catch(err => { console.error('Erreur fatale:', err); Deno.exit(1) })
}
