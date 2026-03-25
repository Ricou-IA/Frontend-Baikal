// ============================================================================
// baikal-retrieval - Routing: Router (decision dispatch)
// ============================================================================

import type { AnalysisResult, BrainConfig, AgentContext, RouteDecision } from "../types.ts"

// ============================================================================
// ROUTE DECISION
// ============================================================================

export function resolveRoute(
  analysis: AnalysisResult,
  brainConfig: BrainConfig,
): RouteDecision {
  // Conversational bypass
  if (!analysis.requires_search && brainConfig.routing.skip_search_for_conversational) {
    return 'conversational'
  }

  // Future: external agent dispatch
  // if (brainConfig.routing.agents) {
  //   for (const [agentName, intents] of Object.entries(brainConfig.routing.agents)) {
  //     if (intents.includes(analysis.intent)) {
  //       return 'external_agent'
  //     }
  //   }
  // }

  return 'search'
}

// ============================================================================
// CONVERSATIONAL RESPONSE (Improvement J: uses config, not hardcoded)
// ============================================================================

export function buildConversationalResponse(
  query: string,
  context: AgentContext,
  brainConfig: BrainConfig,
): string {
  const identity = brainConfig.systemPrompt
    ? extractIdentityName(brainConfig.systemPrompt)
    : 'Assistant'

  const q = query.toLowerCase().trim().replace(/[\?\!\.\,]+$/, '')

  if (/^(bonjour|bonsoir|hello|hi|hey|salut|coucou)/.test(q)) {
    return `Bonjour ! Je suis ${identity}, votre assistant documentaire. Comment puis-je vous aider ?`
  }
  if (/^(merci|thanks|thank)/.test(q)) {
    return `Je vous en prie ! N'hesitez pas si vous avez d'autres questions.`
  }
  if (/^(au revoir|bye|goodbye|à bientôt)/.test(q)) {
    return `Au revoir ! N'hesitez pas a revenir si vous avez besoin d'aide.`
  }
  if (/^(ok|okay|d'accord|daccord|compris|parfait|super)/.test(q)) {
    return `Parfait ! N'hesitez pas si vous avez d'autres questions.`
  }

  return `Je suis la pour repondre a vos questions sur les documents du projet.`
}

function extractIdentityName(systemPrompt: string): string {
  // Try to find identity name from prompt
  const match = systemPrompt.match(/(?:tu es|je suis|nom\s*:?\s*)([^\n,\.]+)/i)
  if (match) return match[1].trim()
  return 'Assistant'
}
