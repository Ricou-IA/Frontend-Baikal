// ============================================================================
// baikal-retrieval - Generation: Prompt Builder
// ============================================================================

import type {
  ChunkResult, FileInfo, AgentContext, FeatureFlags,
} from "../types.ts"

// ============================================================================
// ZERO HALLUCINATION PROMPT
// ============================================================================

const ZERO_HALLUCINATION_PROMPT = `
REGLES ABSOLUES - ZERO HALLUCINATION (NON NEGOCIABLES)

1. Tu es un ASSISTANT DE RECHERCHE DOCUMENTAIRE, pas un expert.
   Tu ne sais RIEN par toi-meme. Tu ne connais QUE ce qui est dans les chunks fournis.

2. CHAQUE affirmation factuelle DOIT etre sourcee :
   Format obligatoire : [NomDocument, Page X, Section Y.Z]
   UTILISE UNIQUEMENT les numeros de page et sections indiques dans le HEADER de chaque chunk (Page: X ou Pages: X-Y, Section: ...).
   NE JAMAIS inventer ou deviner un numero de page ou de section qui n'apparait pas dans les metadonnees du chunk.
   Si un chunk n'a pas de numero de page dans son header, cite le nom du document SANS numero de page.

3. Si l'information n'est PAS dans les chunks fournis :
   a) Decris brievement le CADRE GENERAL couvert par les documents disponibles (quels sujets, quels documents)
   b) Indique clairement que l'information specifique demandee n'a pas ete trouvee
   c) Suggere 2-3 sujets CONNEXES que tu peux traiter a partir des chunks disponibles
   Ne JAMAIS inventer, deduire, extrapoler ou "completer" avec des connaissances generales

4. Si plusieurs chunks semblent contradictoires :
   Cite LES DEUX avec leurs sources respectives
   Precise : "Les documents presentent des informations differentes : [Source A] indique X, tandis que [Source B] indique Y."

5. DISTINCTION L0/L1 CRITIQUE :
   - Les chunks avec hierarchy_level=0 sont des RESUMES generes par IA -> JAMAIS pour sourcage factuel
   - Les chunks avec hierarchy_level=1 sont du TEXTE ORIGINAL -> SEULS valides pour sourcage
   - Si tu n'as que des L0, precise : "Cette information provient d'un resume, je recommande de verifier dans le document original."

6. Pour les COMPARAISONS entre documents :
   Presente les informations cote a cote, document par document
   Cite TOUTES les sources pour chaque element compare
   Si un element est absent d'un document, precise "Non mentionne dans [Document X]"

7. LOCALISATION dans les CCTP :
   Pour les questions "ou se trouve X ?", cite UNIQUEMENT les residences/zones ou X est explicitement mentionne
   Si une section indique "Sans Objet" ou "Neant", cite-la aussi
   JAMAIS d'extrapolation sur les zones non mentionnees
`

// ============================================================================
// BUILD SYSTEM PROMPT
// ============================================================================

export function buildSystemPrompt(
  configPrompt: string | null,
  context: AgentContext,
  files: FileInfo[],
  intent: string | undefined,
  answerFormat: string | undefined,
  keyConcepts: string[] | undefined,
  useGemini: boolean,
  features: FeatureFlags,
): string {
  const parts: string[] = []

  // Zero Hallucination first (highest priority)
  parts.push(ZERO_HALLUCINATION_PROMPT)

  // Config system prompt
  if (configPrompt?.trim()) {
    parts.push(configPrompt.trim())
  }

  // Project identity
  const projectCtx = formatProjectIdentity(context.projectIdentity)
  if (projectCtx) parts.push(projectCtx)

  // Improvement I: Conversation context in generation
  if (features.inject_conversation_in_generation) {
    const convCtx = formatConversationContext(context)
    if (convCtx) parts.push(convCtx)
  }

  // Gemini citation rules
  if (useGemini && files.length > 0) {
    const catalog = files.map(f =>
      `- ID: "${f.file_id}" | NOM: "${f.original_filename}" | PAGES: ${f.total_pages}`
    ).join('\n')
    parts.push(`REGLES DE CITATION (MODE GEMINI - OBLIGATOIRES)\nPour chaque information citee, utilise ce format :\n<cite doc="ID_DU_DOCUMENT" page="NUMERO_PAGE">texte ou reference</cite>\n\nCatalogue des documents disponibles:\n${catalog}`)
  }

  // Answer format
  if (answerFormat) {
    const instructions: Record<string, string> = {
      paragraph: 'Reponds en paragraphes fluides et bien structures.',
      list: 'Structure ta reponse sous forme de liste a puces.',
      table: 'Presente les informations dans un tableau markdown comparatif.',
      quote: 'Cite le texte exact entre guillemets avec la reference precise.',
    }
    if (instructions[answerFormat]) {
      parts.push(`FORMAT DEMANDE: ${instructions[answerFormat]}`)
    }
  }

  // Key concepts
  if (keyConcepts && keyConcepts.length > 0) {
    parts.push(`CONCEPTS CLES a rechercher: ${keyConcepts.join(', ')}`)
  }

  // Intent-specific instructions
  const intentInstructions: Record<string, string> = {
    synthesis: "L'utilisateur demande une SYNTHESE. Identifie les points cles et croise les informations. Cite chaque source.",
    factual: "L'utilisateur cherche une INFORMATION PRECISE. Va droit au but, cite l'article/page/section exact.",
    comparison: "L'utilisateur veut COMPARER. Analyse systematiquement les DIFFERENCES entre les documents. Presente les resultats document par document.",
    citation: "L'utilisateur veut un EXTRAIT EXACT. Reproduis le texte exact entre guillemets avec la source [Document, Page X, Section Y].",
  }
  if (intent && intentInstructions[intent]) {
    parts.push(`INTENTION: ${intentInstructions[intent]}`)
  }

  return parts.join('\n\n')
}

// ============================================================================
// FORMAT CONTEXT (chunks mode)
// ============================================================================

export function formatContext(chunks: ChunkResult[], maxLength: number): string {
  if (chunks.length === 0) {
    return "CONTEXTE DOCUMENTAIRE:\nAucun document pertinent trouve.\n"
  }

  // Group by file for sourcing
  const fileGroups = new Map<string, ChunkResult[]>()
  for (const chunk of chunks) {
    const key = chunk.source_file_id || 'unknown'
    if (!fileGroups.has(key)) fileGroups.set(key, [])
    fileGroups.get(key)!.push(chunk)
  }

  let context = "CONTEXTE DOCUMENTAIRE (CHUNKS DISPONIBLES POUR SOURCAGE)\n\n"
  let currentLength = context.length

  for (const [fileId, fileChunks] of fileGroups) {
    const fileName = fileChunks[0]?.file_original_filename || 'Document inconnu'
    const header = `\nDOCUMENT: "${fileName}" (ID: ${fileId})\n${'─'.repeat(50)}\n`
    if (currentLength + header.length > maxLength) break

    context += header
    currentLength += header.length

    for (const chunk of fileChunks) {
      const hierLabel = chunk.hierarchy_level === 0 ? 'RESUME (L0)' : 'TEXTE ORIGINAL (L1)'
      const roleLabel = chunk.retrieval_role === 'child' ? ' [enfant]' : ''
      const sectionInfo = chunk.section_title ? `Section: ${chunk.section_title}` : ''
      const pageStart = chunk.metadata?.page_start ?? chunk.metadata?.page
      const pageEnd = chunk.metadata?.page_end
      const pageInfo = pageStart
        ? (pageEnd && pageEnd !== pageStart ? `Pages: ${pageStart}-${pageEnd}` : `Page: ${pageStart}`)
        : ''
      const sourceInfo = [hierLabel, roleLabel, sectionInfo, pageInfo].filter(Boolean).join(' | ')

      const text = `\n[${sourceInfo}]\n${chunk.content}\n`
      if (currentLength + text.length > maxLength) break

      context += text
      currentLength += text.length
    }
  }

  return context
}

// ============================================================================
// MEETING CONTEXT
// ============================================================================

export function buildMeetingContext(meetingChunks: ChunkResult[]): string {
  if (meetingChunks.length === 0) return ''
  const content = meetingChunks.map(c => c.content).join('\n\n---\n\n')
  return `COMPTES-RENDUS DE REUNIONS DE CHANTIER\n${content}`
}

// ============================================================================
// HELPERS
// ============================================================================

function formatProjectIdentity(identity: Record<string, unknown> | null): string | null {
  if (!identity || Object.keys(identity).length === 0) return null
  const details: string[] = []
  if (identity.market_type) details.push(`Type de marche: ${identity.market_type}`)
  if (identity.project_type) details.push(`Type de projet: ${identity.project_type}`)
  if (identity.description) details.push(`Description: ${identity.description}`)
  if (identity.name) details.push(`Nom du projet: ${identity.name}`)
  if (details.length === 0) return null

  // Market type rules
  const rules: string[] = []
  if (identity.market_type === 'prive') {
    rules.push(
      `REGLE MARCHE PRIVE : Ce projet est un marche PRIVE. Le CCAG (Cahier des Clauses Administratives Generales) ne s'applique PAS aux marches prives.`,
      `Si l'utilisateur pose une question sur le CCAG, precise que ce document concerne les marches publics et n'est pas applicable a ce projet.`,
      `Privilegie les documents contractuels du projet (CCAP, CCTP, Charte) plutot que le CCAG pour repondre.`,
    )
  } else if (identity.market_type === 'public') {
    rules.push(
      `REGLE MARCHE PUBLIC : Ce projet est un marche PUBLIC. Le CCAG s'applique comme cadre de reference.`,
    )
  }

  const rulesBlock = rules.length > 0 ? '\n' + rules.join('\n') : ''
  return `CONTEXTE PROJET ACTIF\n${details.join('\n')}${rulesBlock}`
}

function formatConversationContext(context: AgentContext): string | null {
  if (!context.recentMessages || context.recentMessages.length === 0) return null

  const parts: string[] = []
  if (context.conversationSummary) {
    parts.push(`Resume: ${context.conversationSummary}`)
  }

  const recent = context.recentMessages
    .slice(-3)
    .map(m => `${m.role === 'user' ? 'Utilisateur' : 'Assistant'}: ${m.content.substring(0, 400)}`)
    .join('\n')

  parts.push(`Derniers echanges:\n${recent}`)

  return `CONTEXTE CONVERSATIONNEL\n${parts.join('\n')}`
}
