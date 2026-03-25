// ============================================================================
// baikal-retrieval v2.0 - Agentic: Gemini 2.5 Flash Tool-Calling Client
// ============================================================================
//
// Sends a query + accumulated context to Gemini with function declarations.
// Gemini decides: call a tool OR generate a final text response.
//
// Returns either:
//   - { type: 'tool_call', name, args }  → orchestrator executes the tool
//   - { type: 'text', content }          → final answer (stream to user)
// ============================================================================

import type { AgenticConfig, ChunkResult } from "../types.ts"
import { TOOL_DECLARATIONS } from "./tools.ts"

// ============================================================================
// TYPES
// ============================================================================

export interface AgentTurn {
  type: 'tool_call' | 'text'
  name?: string
  args?: Record<string, unknown>
  content?: string
  thinking?: string   // The LLM's reasoning (for SSE step display)
}

interface GeminiMessage {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: { content: string } } }

// ============================================================================
// SYSTEM PROMPT FOR AGENTIC ORCHESTRATION
// ============================================================================

const ORCHESTRATOR_SYSTEM_PROMPT = `Tu es un assistant de recherche documentaire intelligent pour le BTP.

## TON ROLE
Tu réponds aux questions des utilisateurs EN TE BASANT UNIQUEMENT sur les documents du projet.
Tu disposes d'outils de recherche pour trouver les informations pertinentes.

## STRATEGIE DE RECHERCHE

1. **Analyse la question** : identifie les concepts clés, les documents mentionnés, le type de réponse attendu
2. **Cherche intelligemment** :
   - Question simple → un seul appel search_documents suffit
   - Comparaison entre documents → utilise search_in_file sur chaque document séparément
   - Question vague → utilise list_project_files pour voir ce qui est disponible, puis search_in_file
3. **Évalue tes résultats** : si les chunks trouvés ne couvrent pas la question, reformule et re-cherche
4. **Réponds quand tu as assez de contexte** : rédige ta réponse finale directement (sans appeler d'outil)

## REGLES ABSOLUES
- JAMAIS inventer ou extrapoler : tu ne sais QUE ce qui est dans les résultats de recherche
- TOUJOURS citer tes sources : [NomDocument, Page X, Section Y]
- Si tu ne trouves pas l'information après tes recherches, dis-le clairement
- Utilise le FORMAT adapté : paragraphe, liste, tableau selon la question
- Maximum 3 appels d'outils : sois efficace dans tes recherches

## POUR LES COMPARAISONS
Quand on te demande de comparer 2 documents (ex: CCAP vs CCTP) :
1. Cherche dans le premier document avec search_in_file
2. Cherche dans le second document avec search_in_file
3. Rédige ta comparaison en citant les deux sources

## LANGUE
Réponds toujours en français.`

// ============================================================================
// CALL GEMINI WITH TOOLS
// ============================================================================

export async function callGeminiAgent(
  query: string,
  conversationHistory: GeminiMessage[],
  agenticConfig: AgenticConfig,
  geminiApiKey: string,
): Promise<AgentTurn> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${agenticConfig.model}:generateContent?key=${geminiApiKey}`

  const body = {
    systemInstruction: {
      parts: [{ text: ORCHESTRATOR_SYSTEM_PROMPT }],
    },
    contents: conversationHistory,
    tools: [{
      functionDeclarations: TOOL_DECLARATIONS,
    }],
    generationConfig: {
      temperature: agenticConfig.temperature,
      maxOutputTokens: 8192,
    },
    toolConfig: {
      functionCallingConfig: {
        mode: "AUTO",  // Gemini decides: tool call or text
      },
    },
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Gemini agent error (${response.status}): ${errorText}`)
  }

  const data = await response.json()
  const candidate = data.candidates?.[0]

  if (!candidate?.content?.parts) {
    throw new Error('Gemini agent: no content in response')
  }

  // Parse response: tool call or text
  for (const part of candidate.content.parts) {
    if (part.functionCall) {
      return {
        type: 'tool_call',
        name: part.functionCall.name,
        args: part.functionCall.args || {},
        thinking: extractThinking(candidate.content.parts),
      }
    }
  }

  // No tool call → text response
  const textParts = candidate.content.parts
    .filter((p: Record<string, unknown>) => p.text)
    .map((p: Record<string, unknown>) => p.text as string)
    .join('')

  return {
    type: 'text',
    content: textParts,
  }
}

// ============================================================================
// STREAM FINAL RESPONSE FROM GEMINI
// ============================================================================

export async function* streamGeminiAgentResponse(
  conversationHistory: GeminiMessage[],
  agenticConfig: AgenticConfig,
  geminiApiKey: string,
): AsyncGenerator<string, string, undefined> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${agenticConfig.model}:streamGenerateContent?alt=sse&key=${geminiApiKey}`

  const body = {
    systemInstruction: {
      parts: [{ text: ORCHESTRATOR_SYSTEM_PROMPT }],
    },
    contents: conversationHistory,
    // No tools in final generation — force text response
    generationConfig: {
      temperature: agenticConfig.temperature,
      maxOutputTokens: 8192,
    },
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`Gemini stream error: ${await response.text()}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error("No response body reader")

  const decoder = new TextDecoder()
  let fullContent = ''
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data: ')) continue

      try {
        const json = JSON.parse(trimmed.slice(6))
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text
        if (text) {
          fullContent += text
          yield text
        }
      } catch {
        // skip malformed SSE chunks
      }
    }
  }

  return fullContent
}

// ============================================================================
// BUILD CONVERSATION MESSAGES
// ============================================================================

export function buildInitialMessages(
  query: string,
  contextInfo: string,
): GeminiMessage[] {
  // Single user message with the query and any preloaded context
  const parts: string[] = []

  if (contextInfo) {
    parts.push(contextInfo)
  }
  parts.push(`Question de l'utilisateur: ${query}`)

  return [{
    role: 'user',
    parts: [{ text: parts.join('\n\n') }],
  }]
}

export function appendToolCallToHistory(
  history: GeminiMessage[],
  toolName: string,
  toolArgs: Record<string, unknown>,
): GeminiMessage[] {
  return [
    ...history,
    {
      role: 'model',
      parts: [{
        functionCall: { name: toolName, args: toolArgs },
      }],
    },
  ]
}

export function appendToolResultToHistory(
  history: GeminiMessage[],
  toolName: string,
  resultContent: string,
): GeminiMessage[] {
  return [
    ...history,
    {
      role: 'user',
      parts: [{
        functionResponse: {
          name: toolName,
          response: { content: resultContent },
        },
      }],
    },
  ]
}

// ============================================================================
// HELPERS
// ============================================================================

function extractThinking(parts: GeminiPart[]): string | undefined {
  // If Gemini includes text before a function call, that's its reasoning
  const textParts = parts
    .filter((p): p is { text: string } => 'text' in p && typeof p.text === 'string')
    .map(p => p.text)
  return textParts.length > 0 ? textParts.join(' ') : undefined
}

export function formatChunksForAgent(chunks: ChunkResult[]): string {
  if (chunks.length === 0) return "Aucun résultat trouvé."

  return chunks.map(c => {
    const source = c.file_original_filename || 'Document inconnu'
    const page = c.metadata?.page_start ?? c.metadata?.page ?? '?'
    const section = c.section_title || ''
    const level = c.hierarchy_level === 0 ? '[RÉSUMÉ]' : '[TEXTE ORIGINAL]'
    return `${level} ${source} (Page ${page}${section ? ', ' + section : ''})\n${c.content}`
  }).join('\n\n---\n\n')
}
