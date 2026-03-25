// ============================================================================
// baikal-retrieval - Search: Embedding (wraps _shared)
// ============================================================================

import { generateEmbedding as _generateEmbedding } from "../utils.ts"

export async function generateEmbedding(
  text: string,
  openaiApiKey: string,
): Promise<number[]> {
  return _generateEmbedding(text.trim(), openaiApiKey)
}
