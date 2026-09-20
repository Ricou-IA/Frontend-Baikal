// Recalcule la métrique « tous les documents attendus cités » (source_docs_all) sur un rapport
// existant : les sources y sont stockées. Sert à obtenir la valeur v2.1.0 sans rejouer le banc.
// Usage : deno run -A eval/rescore-both-docs.ts --report eval/reports/baseline-v2.1.0.json --golden eval/golden-set.json
import { parseArgs } from "https://deno.land/std@0.224.0/cli/parse_args.ts"

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\s-]+/g, '')
}

const args = parseArgs(Deno.args, { string: ['report', 'golden'] })
if (!args.report || !args.golden) {
  console.error('Usage: deno run -A eval/rescore-both-docs.ts --report <rapport.json> --golden <golden-set.json>')
  Deno.exit(1)
}
const report = JSON.parse(await Deno.readTextFile(args.report))
const golden = JSON.parse(await Deno.readTextFile(args.golden))
// Sprint 2 : les rapports v2.1.0 n'ont pas de clé `config` — le top-k vit dans `meta` selon les
// versions, sinon on retombe sur la valeur par défaut d'eval/config.json (10).
const topK: number = report.meta?.top_k_for_recall ?? report.meta?.defaults?.top_k_for_recall ?? 10
const expected = new Map<string, string[]>()
for (const e of golden.entries) if (e.expected?.source_docs_all?.length) expected.set(e.id, e.expected.source_docs_all)

let n = 0, ok = 0
const misses: string[] = []
for (const r of report.results) {
  const needles = expected.get(r.id)
  if (!needles) continue
  n++
  const docs = (r.sources || []).slice(0, topK).map((s: { document_name?: string }) => normalize(s.document_name || ''))
  const missing = needles.filter(nd => !docs.some((d: string) => d.includes(normalize(nd))))
  if (missing.length === 0) ok++
  else misses.push(`${r.id}: manque ${missing.join(', ')}`)
}
console.log(`${args.report} — tous docs cités : ${ok}/${n} (${n ? Math.round(100 * ok / n) : 0} %)`)
for (const m of misses) console.log('  ✗ ' + m)
