// Re-lecture hors ligne des refus C7 d'un rapport déjà produit par run-eval.ts,
// avec la version courante de detectRefusal (voir REFUSAL_PATTERNS_VERSION).
// Ne réécrit PAS le rapport : impression seule, pour la table de comparaison.
//
// Usage : deno run -A eval/rescore-refusals.ts --report eval/reports/<tag>.json

import { detectRefusal, REFUSAL_PATTERNS_VERSION } from "./run-eval.ts"

interface RescoreResult {
  id: string
  classe: string
  answer: string
  violations: string[]
  refusal_detected: boolean
  ok_criteria: boolean
}

interface Report {
  results: RescoreResult[]
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

async function main(): Promise<void> {
  const args = parseArgs(Deno.args)
  const reportPath = args.report
  if (typeof reportPath !== 'string') {
    console.error('Usage: deno run -A eval/rescore-refusals.ts --report eval/reports/<tag>.json')
    Deno.exit(1)
  }

  const report: Report = JSON.parse(await Deno.readTextFile(reportPath))
  const c7 = report.results.filter(r => r.classe.startsWith('C7'))

  let okBefore = 0, okAfter = 0
  for (const r of c7) {
    const avant = r.ok_criteria
    if (avant) okBefore++
    const refusal_detected = detectRefusal(r.answer)
    const ok_criteria = refusal_detected && r.violations.length === 0
    if (ok_criteria) okAfter++
    console.log(`${r.id} | ${avant ? 'ok' : 'échec'} → ${ok_criteria ? 'ok' : 'échec'}`)
  }

  console.log(`\nC7 ok: ${okAfter}/${c7.length} (avant: ${okBefore}/${c7.length})`)

  const rescored = new Map(c7.map(r => [r.id, detectRefusal(r.answer) && r.violations.length === 0]))
  const globalOk = report.results.filter(r => rescored.has(r.id) ? rescored.get(r.id) : r.ok_criteria).length
  console.log(`critères ok: ${globalOk}/${report.results.length}`)
  console.log(`refusal_patterns_version: ${REFUSAL_PATTERNS_VERSION}`)
}

if (import.meta.main) {
  main().catch(err => { console.error('Erreur fatale:', err); Deno.exit(1) })
}
