import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { resolveAppLayerWeight } from "./layer-weight.ts"

const base = { projectId: "2ff1cd34-a2e8-4350-95c5-67c5fd64102e", detectedNorms: [] as string[], configuredWeight: 0.5 }

Deno.test("question projet sans norme → poids configuré", () => {
  assertEquals(resolveAppLayerWeight({ ...base, queryText: "comment on est réglés chaque mois ?" }), 0.5)
})

Deno.test("norme détectée par le cross-ref → poids 1", () => {
  assertEquals(resolveAppLayerWeight({ ...base, detectedNorms: ["DTU 25.41"], queryText: "quel DTU pour les renforts ?" }), 1.0)
})

Deno.test("mention textuelle CCAG / norme / NF → poids 1", () => {
  assertEquals(resolveAppLayerWeight({ ...base, queryText: "Résume le CCAG" }), 1.0)
  assertEquals(resolveAppLayerWeight({ ...base, queryText: "que dit la norme NFP 03-001 sur les situations ?" }), 1.0)
})

Deno.test("hors projet → poids 1", () => {
  assertEquals(resolveAppLayerWeight({ ...base, projectId: undefined, queryText: "pénalités de retard" }), 1.0)
})

Deno.test("poids configuré borné entre 0.1 et 1", () => {
  assertEquals(resolveAppLayerWeight({ ...base, configuredWeight: 0, queryText: "délai de paiement" }), 0.1)
  assertEquals(resolveAppLayerWeight({ ...base, configuredWeight: 3, queryText: "délai de paiement" }), 1.0)
})
