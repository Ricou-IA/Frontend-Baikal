// ============================================================================
// baikal-retrieval - Routing: Cross-Reference Detection (Heuristic)
// ============================================================================
//
// Detects when a query involves multiple documents (project docs + norms/DTU)
// and generates suggested cross-ref actions for the frontend.
//
// Called synchronously by buildFallbackAnalysis() — must be fast (0ms, no I/O).
// ============================================================================

import type { CrossRefAnalysis, CrossRefAction, CrossRefMode } from "../types.ts"
import { CROSS_REF_CONFIG } from "../config.ts"

// ============================================================================
// MAIN DETECTION
// ============================================================================

export function detectCrossRef(
  query: string,
  projectNorms?: string[],
  projectLots?: string[],
): CrossRefAnalysis {
  const norms = extractNormReferences(query)
  const intent = extractCrossRefIntent(query)
  const projectDocMatches = extractProjectDocReferences(query)
  const hasCooccurrence = checkNormCooccurrence(query)
  const matchedNorms = projectNorms ? matchProjectNorms(query, projectNorms) : []
  const matchedLot = projectLots ? matchProjectLots(query, projectLots) : null

  // Merge detected norms: regex-extracted + matched from project metadata
  const allNorms = [...new Set([...norms, ...matchedNorms])]

  // Determine if cross-ref is triggered
  const isCrossRef = determineCrossRef(allNorms, projectDocMatches, hasCooccurrence, intent, matchedLot)

  if (!isCrossRef) {
    return {
      is_cross_ref: false,
      cross_ref_type: null,
      detected_documents: [],
      detected_norms: [],
      detected_lot: null,
      suggested_actions: [],
      detection_method: 'heuristic',
    }
  }

  const allDocuments = [...new Set([...projectDocMatches, ...allNorms])]

  const analysis: CrossRefAnalysis = {
    is_cross_ref: true,
    cross_ref_type: intent,
    detected_documents: allDocuments,
    detected_norms: allNorms,
    detected_lot: matchedLot,
    suggested_actions: [],
    detection_method: 'heuristic',
  }

  analysis.suggested_actions = generateCrossRefActions(analysis)
  return analysis
}

// ============================================================================
// NORM REFERENCE EXTRACTION
// ============================================================================

export function extractNormReferences(query: string): string[] {
  const results: string[] = []

  // DTU references: "DTU 25.41", "DTU n°60.1", "DTU nº 25.42"
  const dtuRegex = new RegExp(CROSS_REF_CONFIG.regex.dtu.source, CROSS_REF_CONFIG.regex.dtu.flags)
  let match: RegExpExecArray | null
  while ((match = dtuRegex.exec(query)) !== null) {
    results.push(match[0].trim())
  }

  // NF references: "NF P 45-204", "NF EN 1234"
  const nfRegex = new RegExp(CROSS_REF_CONFIG.regex.nf.source, CROSS_REF_CONFIG.regex.nf.flags)
  while ((match = nfRegex.exec(query)) !== null) {
    results.push(match[0].trim())
  }

  return [...new Set(results)]
}

// ============================================================================
// CROSS-REF INTENT DETECTION
// ============================================================================

export function extractCrossRefIntent(query: string): CrossRefMode | null {
  const crossVerbsRegex = new RegExp(
    CROSS_REF_CONFIG.regex.crossVerbs.source,
    CROSS_REF_CONFIG.regex.crossVerbs.flags,
  )
  const verbMatch = query.match(crossVerbsRegex)

  if (!verbMatch) return null

  const verb = verbMatch[1].toLowerCase()

  // Map verbs to cross-ref modes
  if (/^comparer$/.test(verb)) return 'compare'
  if (/^(conformit[eé]|conforme|v[eé]rifier)$/.test(verb)) return 'compliance'
  if (/^(synth[eé]tiser|recouper)$/.test(verb)) return 'synthesize'
  if (/^prescriptions?\s+du$/.test(verb)) return 'compliance'
  if (/^pr[eé]voit.*concernant$/.test(verb)) return 'compliance'

  return 'synthesize'
}

// ============================================================================
// PROJECT DOCUMENT EXTRACTION
// ============================================================================

function extractProjectDocReferences(query: string): string[] {
  const results: string[] = []
  const docRegex = new RegExp(
    CROSS_REF_CONFIG.regex.projectDocs.source,
    CROSS_REF_CONFIG.regex.projectDocs.flags,
  )
  let match: RegExpExecArray | null
  while ((match = docRegex.exec(query)) !== null) {
    results.push(match[0].trim().toUpperCase())
  }
  return [...new Set(results)]
}

// ============================================================================
// NORM + PROJECT DOC CO-OCCURRENCE
// ============================================================================

export function checkNormCooccurrence(query: string): boolean {
  const hasNorm = CROSS_REF_CONFIG.regex.dtu.test(query) || CROSS_REF_CONFIG.regex.nf.test(query)
  // Reset regex lastIndex after test (global flag)
  CROSS_REF_CONFIG.regex.dtu.lastIndex = 0
  CROSS_REF_CONFIG.regex.nf.lastIndex = 0

  const hasProjectDoc = CROSS_REF_CONFIG.regex.projectDocs.test(query)
  CROSS_REF_CONFIG.regex.projectDocs.lastIndex = 0

  return hasNorm && hasProjectDoc
}

// ============================================================================
// PROJECT NORMS LOOKUP (from chunk metadata comment_normes)
// ============================================================================

export function matchProjectNorms(query: string, norms: string[]): string[] {
  const q = query.toLowerCase()
  return norms.filter(norm => q.includes(norm.toLowerCase()))
}

// ============================================================================
// PROJECT LOTS LOOKUP (from chunk metadata qui_lots)
// ============================================================================

export function matchProjectLots(query: string, lots: string[]): string | null {
  const q = query.toLowerCase()
  for (const lot of lots) {
    if (q.includes(lot.toLowerCase())) return lot
  }

  // Common lot keywords in French BTP
  const lotKeywords: Record<string, string[]> = {
    'CVC': ['cvc', 'chauffage', 'ventilation', 'climatisation'],
    'PLOMBERIE': ['plomberie', 'sanitaire', 'plomberie sanitaire'],
    'ELECTRICITE': ['electricite', 'electrique', 'courants forts', 'courants faibles', 'électricité', 'électrique'],
    'PLATRERIE': ['platrerie', 'cloisons', 'plafonds', 'doublage', 'plâtrerie'],
    'PEINTURE': ['peinture', 'revetements muraux', 'revêtements muraux'],
    'GROS OEUVRE': ['gros oeuvre', 'gros œuvre', 'maconnerie', 'maçonnerie', 'beton', 'béton'],
    'MENUISERIE': ['menuiserie', 'menuiseries', 'huisseries'],
    'ETANCHEITE': ['etancheite', 'étanchéité', 'toiture', 'couverture'],
    'CARRELAGE': ['carrelage', 'faience', 'faïence', 'revetement de sol', 'revêtement de sol'],
    'SERRURERIE': ['serrurerie', 'metallerie', 'métallerie'],
  }

  for (const [lotName, keywords] of Object.entries(lotKeywords)) {
    if (keywords.some(kw => q.includes(kw))) return lotName
  }

  return null
}

// ============================================================================
// CROSS-REF DETERMINATION LOGIC
// ============================================================================

function determineCrossRef(
  norms: string[],
  projectDocs: string[],
  hasCooccurrence: boolean,
  intent: CrossRefMode | null,
  matchedLot: string | null,
): boolean {
  // Rule 1: Norm + project doc co-occurrence → definite cross-ref
  if (hasCooccurrence) return true

  // Rule 2: Explicit norms + cross-ref verb → cross-ref
  if (norms.length > 0 && intent !== null) return true

  // Rule 3: Multiple norms detected → cross-ref (multi-norm query)
  if (norms.length >= 2) return true

  // Rule 4: A norm is mentioned with project docs in the query
  if (norms.length > 0 && projectDocs.length > 0) return true

  // Rule 5: Cross-ref verb + lot mention (implicit cross-ref)
  // e.g. "synthétise les obligations pour le lot CVC"
  if (intent !== null && matchedLot !== null) return true

  // Rule 6: Cross-ref verb + project doc + no specific norm
  // e.g. "les prescriptions du CCTP pour les cloisons"
  if (intent !== null && projectDocs.length > 0) return true

  return false
}

// ============================================================================
// ACTION GENERATION
// ============================================================================

export function generateCrossRefActions(analysis: Partial<CrossRefAnalysis>): CrossRefAction[] {
  const docs = analysis.detected_documents || []
  const norms = analysis.detected_norms || []
  const lot = analysis.detected_lot

  // Build a readable document list for labels
  const docList = docs.length > 0 ? docs.join(' et ') : 'les documents'
  const normList = norms.length > 0 ? norms.join(', ') : ''
  const lotLabel = lot ? ` (lot ${lot})` : ''

  const actions: CrossRefAction[] = []

  // Action 1: Compare
  actions.push({
    type: 'compare',
    label: 'Comparer les prescriptions',
    description: normList
      ? `Mettre en regard les exigences du ${docList}${lotLabel}`
      : `Comparer les prescriptions entre ${docList}${lotLabel}`,
    documents: docs,
    prompt_hint: 'compare_prescriptions',
  })

  // Action 2: Compliance
  actions.push({
    type: 'compliance',
    label: 'Verifier la conformite',
    description: normList
      ? `Verifier que les prescriptions respectent ${normList}`
      : `Verifier la conformite des documents${lotLabel}`,
    documents: docs,
    prompt_hint: 'check_compliance',
  })

  // Action 3: Synthesize
  actions.push({
    type: 'synthesize',
    label: 'Synthetiser les obligations',
    description: `Resumer toutes les obligations${lotLabel} a partir de ${docList}`,
    documents: docs,
    prompt_hint: 'synthesize_obligations',
  })

  return actions
}
