// ============================================================================
// baikal-retrieval - Search: Layer weight (Sprint 1, S4.4 remontée — P8)
// ============================================================================
// Dans un projet, les documents de la couche application (CCAG générique,
// NFP 03-001) ne doivent pas prendre la place du CCAP/CCTP du projet, sauf
// quand la question porte explicitement sur une norme ou sur le CCAG.
// ============================================================================

const NORMATIVE_PATTERN = /\b(dtu|nf\s?[a-z]?\s?\d|ccag|norme|normes|eurocode|réglementation|reglementation)\b/i

export interface LayerWeightInput {
  projectId: string | undefined
  detectedNorms: string[]
  queryText: string
  configuredWeight: number
}

export function resolveAppLayerWeight(input: LayerWeightInput): number {
  if (!input.projectId) return 1.0
  if (input.detectedNorms.length > 0) return 1.0
  if (NORMATIVE_PATTERN.test(input.queryText)) return 1.0
  const w = Number.isFinite(input.configuredWeight) ? input.configuredWeight : 0.5
  return Math.min(1.0, Math.max(0.1, w))
}
