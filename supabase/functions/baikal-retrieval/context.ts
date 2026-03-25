// ============================================================================
// baikal-retrieval - Context (agent context + conversation management)
// ============================================================================

import type { Supabase, AgentContext, BrainConfig } from "./types.ts"

// ============================================================================
// GET AGENT CONTEXT
// ============================================================================

export async function getAgentContext(
  supabase: Supabase,
  userId: string,
  orgId: string | undefined,
  projectId: string | undefined,
  appId: string | undefined,
  conversationId: string | undefined,
  brainConfig: BrainConfig,
): Promise<AgentContext> {
  const { data, error } = await supabase.schema('rag').rpc('get_agent_context', {
    p_user_id: userId,
    p_org_id: orgId || null,
    p_project_id: projectId || null,
    p_app_id: appId || null,
    p_agent_type: 'librarian_v3',
    p_conversation_id: conversationId || null,
    p_conversation_timeout_minutes: brainConfig.context.timeout_minutes,
    p_context_messages_count: brainConfig.context.messages_count,
  })

  if (error) throw new Error(`Context error: ${error.message}`)

  const ctx = data?.[0] || data

  let recentMessages = ctx.out_recent_messages || []
  if (typeof recentMessages === 'string') {
    try { recentMessages = JSON.parse(recentMessages) } catch { recentMessages = [] }
  }

  let documentsCles = ctx.out_documents_cles || []
  if (typeof documentsCles === 'string') {
    try { documentsCles = JSON.parse(documentsCles) } catch { documentsCles = [] }
  }

  return {
    effectiveOrgId: ctx.out_effective_org_id || null,
    effectiveAppId: ctx.out_effective_app_id || 'arpet',
    systemPrompt: ctx.out_system_prompt || null,
    geminiSystemPrompt: ctx.out_gemini_system_prompt || null,
    parameters: ctx.out_parameters || {},
    configSource: ctx.out_config_source || 'fallback',
    projectIdentity: ctx.out_project_identity || null,
    conversationId: ctx.out_conversation_id,
    conversationSummary: ctx.out_conversation_summary || null,
    conversationFirstMessage: ctx.out_conversation_first_message || null,
    recentMessages,
    messageCount: ctx.out_message_count || 0,
    previousSourceFileIds: ctx.out_previous_source_file_ids || [],
    documentsCles,
  }
}

// ============================================================================
// ADD MESSAGE
// ============================================================================

export async function addMessage(
  supabase: Supabase,
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  sources?: unknown[],
  generationMode?: string,
  processingTimeMs?: number,
): Promise<void> {
  try {
    await supabase.schema('rag').rpc('add_message', {
      p_conversation_id: conversationId,
      p_role: role,
      p_content: content,
      p_sources: sources ? JSON.stringify(sources) : null,
      p_generation_mode: generationMode || null,
      p_processing_time_ms: processingTimeMs || null,
    })
  } catch (err) {
    console.warn('[retrieval] add_message error:', err)
  }
}
