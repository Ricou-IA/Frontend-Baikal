// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  chunk-rows.ts — Découpage en lots pour l'upsert par lots (v8.2.0)            ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  Module séparé de index.ts car `serve(...)` s'exécute à l'import : un test   ║
// ║  Deno ne peut pas importer le helper directement depuis index.ts.            ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

// v8.2.0 : taille de lot pour l'upsert de rag.documents. Le rôle PostgREST
// `authenticator` a un statement_timeout de 8 s ; un upsert unique de 496 lignes
// (embeddings 1536 d, index HNSW, trigger fts) l'a dépassé. Les upserts de
// ≤ 147 lignes passent ; 100 laisse de la marge.
export const UPSERT_BATCH_SIZE = 100

/**
 * Découpe `rows` en lots consécutifs de taille `size` (le dernier lot peut être
 * plus court), en préservant l'ordre. `[]` → `[]`. `size <= 0` → un seul lot
 * contenant toutes les lignes (jamais de boucle infinie).
 */
export function chunkRows<T>(rows: T[], size: number): T[][] {
  if (rows.length === 0) return []
  if (size <= 0) return [rows]

  const batches: T[][] = []
  for (let i = 0; i < rows.length; i += size) {
    batches.push(rows.slice(i, i + size))
  }
  return batches
}
