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
  assertEquals(REFUSAL_PATTERNS_VERSION, 3)
})

Deno.test("detectRefusal : une réponse qui cite n'est pas un refus", () => {
  assertEquals(detectRefusal("Le délai global est de 14 mois [Mémoire Technique, Page 29]."), false)
})

Deno.test("detectRefusal v3 : trois formulations des campagnes Sprint 3", () => {
  assertEquals(detectRefusal("Le projet ne contient pas de document intitulé « CCTP du gros œuvre ». … Par conséquent, il n'existe pas de CCTP du gros œuvre dans les documents fournis."), true)
  assertEquals(detectRefusal("Dans les documents fournis, notamment le CCAG CITROEN, il n'y a aucune mention explicite ni section traitant du diagnostic amiante avant travaux … mais ne font pas référence au diagnostic amiante"), true)
  assertEquals(detectRefusal("Le CCTP TCE de Bessières ne mentionne à aucun endroit la mise en place ou la fourniture d'un système de sprinklage. … aucune référence à un système de sprinklage n'est faite dans l'ensemble du document fourni."), true)
  assertEquals(detectRefusal("Le projet ne contient **aucun fichier CCTP spécifiquement nommé \"CCTP du gros œuvre\"**. Les fichiers CCTP disponibles sont …"), true)
})

Deno.test("detectRefusal v3 : « mentionne » et « référence » hors refus ne déclenchent pas", () => {
  assertEquals(detectRefusal("Le CCAP prévoit une pénalité de 100 € par jour [CCAP, Page 19] ; le document mentionne aussi une référence à la norme NF P 03-001."), false)
})
