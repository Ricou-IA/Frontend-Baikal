// ============================================================================
// baikal-retrieval - Utilitaires locaux + re-exports _shared
// ============================================================================

export {
  corsHeaders,
  sseHeaders,
  errorResponse,
  handleCorsPreFlight,
  sendSSE,
  generateEmbedding,
  createLogger,
  getErrorMessage,
} from "../_shared/utils.ts"

import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts"

// ============================================================================
// HASHING
// ============================================================================

export async function hashFileIds(fileIds: string[]): Promise<string> {
  const sorted = [...fileIds].sort().join(',')
  const data = new TextEncoder().encode(sorted)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function hashPrompt(prompt: string): Promise<string> {
  const data = new TextEncoder().encode(prompt)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .substring(0, 32)
}

// ============================================================================
// TIMER
// ============================================================================

export function createTimer() {
  const start = Date.now()
  const timings: Record<string, number> = {}
  return {
    mark(label: string): number {
      const elapsed = Date.now() - start
      timings[label] = elapsed
      return elapsed
    },
    get timings() { return { ...timings } },
    get elapsed() { return Date.now() - start },
    get startTime() { return start },
  }
}
