import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { chunkRows, UPSERT_BATCH_SIZE } from "./chunk-rows.ts"

Deno.test("chunkRows : lots consecutifs de la taille demandee, dernier lot plus court, ordre preserve", () => {
  assertEquals(chunkRows([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
  assertEquals(chunkRows([1, 2, 3], 3), [[1, 2, 3]])
  assertEquals(chunkRows([1, 2], 5), [[1, 2]])
})

Deno.test("chunkRows : tableau vide → aucun lot ; taille invalide → un seul lot", () => {
  assertEquals(chunkRows([], 100), [])
  assertEquals(chunkRows([1, 2, 3], 0), [[1, 2, 3]])
  assertEquals(chunkRows([1, 2, 3], -1), [[1, 2, 3]])
})

Deno.test("UPSERT_BATCH_SIZE : 100 lignes (sous le statement_timeout 8 s observe a 496 lignes)", () => {
  assertEquals(UPSERT_BATCH_SIZE, 100)
})
