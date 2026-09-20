import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { remainingBudgetMs, MIN_ITERATION_BUDGET_MS } from "./orchestrator.ts"

Deno.test("le budget agentique se compte depuis le déclenchement de la Phase B, pas depuis la requête", () => {
  assertEquals(remainingBudgetMs(10_000, 12_500, 8000), 5500)
  assertEquals(remainingBudgetMs(10_000, 19_000, 8000), -1000)
  assertEquals(MIN_ITERATION_BUDGET_MS, 1500)
})
