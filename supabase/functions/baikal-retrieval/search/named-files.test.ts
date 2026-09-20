import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { selectNamedFiles } from "./named-files.ts"
import type { FileInfo } from "../types.ts"

function file(id: string, pages: number): FileInfo {
  return { file_id: id, storage_path: `${id}.pdf`, storage_bucket: 'documents', original_filename: `${id}.pdf`,
    mime_type: 'application/pdf', total_pages: pages, max_similarity: 1, avg_similarity: 1, chunk_count: 0,
    layer: 'project', score: 1, is_boosted: true }
}

Deno.test("selectNamedFiles respecte l'ordre, le nombre et le cumul de pages", () => {
  const files = [file('a', 100), file('b', 300), file('c', 200)]
  assertEquals(selectNamedFiles(files, 5, 450).map(f => f.file_id), ['a', 'b'])
  assertEquals(selectNamedFiles(files, 1, 450).map(f => f.file_id), ['a'])
  assertEquals(selectNamedFiles(files, 5, 50).map(f => f.file_id), [])
})
