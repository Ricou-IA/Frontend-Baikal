import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { averageVerdicts, isJudgeable } from "./judge-groundedness.ts"

const v = (g: number, c: number) => ({ claims: [], citations: [], groundedness: g, citation_accuracy: c })

Deno.test("averageVerdicts : moyenne et écart-type (population) sur 3 passages", () => {
  const s = averageVerdicts([v(1, 1), v(0.5, 1), v(0.75, 0.5)])
  assertEquals(s.groundedness, 0.75)
  assertEquals(s.citation_accuracy, 0.833)
  assertEquals(s.groundedness_sd, 0.204)
  assertEquals(s.passes, 3)
})

Deno.test("isJudgeable : extraits et agentique oui ; mode intégral (gemini) et refus non", () => {
  assertEquals(isJudgeable({ mode: 'chunks' }, true), true)
  assertEquals(isJudgeable({ mode: 'agentic', refusal_detected: false }, true), true)
  assertEquals(isJudgeable({ mode: 'gemini' }, true), false)
  assertEquals(isJudgeable({ mode: 'chunks', refusal_detected: true }, true), false)
  assertEquals(isJudgeable({ mode: 'gemini', refusal_detected: true }, false), true)
})
