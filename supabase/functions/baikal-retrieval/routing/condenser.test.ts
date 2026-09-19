import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { isElliptical, buildCondensePrompt, copiesAssistant } from "./condenser.ts"

Deno.test("question courte → elliptique", () => {
  assertEquals(isElliptical("dans le ccap ?"), true)
  assertEquals(isElliptical("et les autres lots ?"), true)
  assertEquals(isElliptical("Sors-moi l'article correspondant"), true)
})

Deno.test("connecteur de suivi en tête → elliptique même si longue", () => {
  assertEquals(isElliptical("et dans l'autre sens, si c'est le maître d'ouvrage qui paie en retard ?"), true)
  assertEquals(isElliptical("pareil pour la résidence Dunant mais avec le lot menuiseries extérieures cette fois"), true)
})

Deno.test("pronom sans antécédent en tête → elliptique", () => {
  assertEquals(isElliptical("on peut la remplacer par autre chose ?"), true)
  assertEquals(isElliptical("il a combien de temps pour lever les réserves ?"), true)
})

Deno.test("question autonome → pas elliptique", () => {
  assertEquals(isElliptical("Quel est le délai global d'exécution des travaux d'après le mémoire technique ?"), false)
  assertEquals(isElliptical("Sur CMP, c'est quoi la retenue qu'ils nous prennent sur chaque situation ?"), false)
  assertEquals(isElliptical("Le CCAP prévoit-il un délai de paiement dans ce marché ?"), false)
})

Deno.test("prompt : historique borné, question en dernier, consigne de réécriture", () => {
  const recent = [
    { role: "assistant", content: "B".repeat(2000) },
    { role: "user", content: "Quel est le délai de paiement sur le marché CMP ?" },
  ]
  const p = buildCondensePrompt("et si le maître d'ouvrage paie en retard ?", recent as never)
  assert(p.includes("USER: Quel est le délai de paiement"))
  assert(!p.includes("B".repeat(700)), "l'historique doit être tronqué à 600 caractères par message")
  assert(p.trim().endsWith("et si le maître d'ouvrage paie en retard ?"))
  assert(/question autonome/i.test(p))
})

Deno.test("prompt : interdit la recopie des réponses de l'assistant, avec exemple", () => {
  const p = buildCondensePrompt("dans le ccap ?", [
    { role: "assistant", content: "Le projet de décompte final doit intégrer la formule de révision de l'article 18.2." },
    { role: "user", content: "Le marché est actualisable ou révisable ?" },
  ] as never)
  assert(/n['’]y recopie jamais/i.test(p))
  assert(p.includes("Le marché est-il actualisable ou révisable d'après le CCAP ?"))
})

Deno.test("copiesAssistant : 8 mots consécutifs d'une réponse → recopie détectée", () => {
  const recent = [
    { role: "assistant", content: "Le projet de décompte final doit intégrer l'application de la formule de révision figurant à l'article 18.2 si le marché est concerné." },
    { role: "user", content: "Le marché est actualisable ou révisable ?" },
  ] as never
  assertEquals(copiesAssistant("Le projet de décompte final doit intégrer l'application de la formule de révision dans le CCAP ?", recent), true)
  assertEquals(copiesAssistant("Le marché est-il actualisable ou révisable d'après le CCAP ?", recent), false)
})

Deno.test("copiesAssistant : les mots de l'utilisateur ne comptent pas, seuls ceux de l'assistant", () => {
  const recent = [
    { role: "user", content: "Quel est le délai global d'exécution des travaux d'après le mémoire technique du marché ?" },
  ] as never
  assertEquals(copiesAssistant("Quel est le délai global d'exécution des travaux d'après le mémoire technique du marché si on le dépasse ?", recent), false)
})
