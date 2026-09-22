import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { costUsd, PRICES_DEFAULT, normalize, detectRefusal, REFUSAL_PATTERNS_VERSION } from "./run-eval.ts"

Deno.test("costUsd : (in × prix_in + out × prix_out) / 1e6, arrondi 6 decimales", () => {
  const prices = { 'gpt-4o-mini': { in: 0.15, out: 0.60 } }
  assertEquals(costUsd('gpt-4o-mini', { input_tokens: 10_000, output_tokens: 1_000, calls: 1 }, prices), 0.0021)
})

Deno.test("costUsd : modele inconnu ou usage absent → null", () => {
  assertEquals(costUsd('modele-x', { input_tokens: 1, output_tokens: 1, calls: 1 }, PRICES_DEFAULT), null)
  assertEquals(costUsd('gpt-4o-mini', null, PRICES_DEFAULT), null)
  assertEquals(costUsd(null, { input_tokens: 1, output_tokens: 1, calls: 1 }, PRICES_DEFAULT), null)
})

Deno.test("PRICES_DEFAULT couvre les modeles du sprint", () => {
  for (const m of ['gpt-4o-mini', 'gpt-4.1-mini', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro']) {
    assertEquals(typeof PRICES_DEFAULT[m]?.in, 'number', m)
  }
})

Deno.test("normalize reste inchangee (garde-fou)", () => {
  assertEquals(normalize('NF P 03‑001'), 'nfp03001')
})

Deno.test("detectRefusal v2 : C7-004 (62 caractères entre « aucun fichier » et « projet ») est un refus", () => {
  assertEquals(detectRefusal("Aucun fichier de CCTP portant spécifiquement sur le gros œuvre n'existe dans le projet. Les CCTP disponibles sont…"), true)
  assertEquals(REFUSAL_PATTERNS_VERSION, 2)
})

Deno.test("detectRefusal : une réponse qui cite n'est pas un refus", () => {
  assertEquals(detectRefusal("Le délai global est de 14 mois [Mémoire Technique, Page 29]."), false)
})
