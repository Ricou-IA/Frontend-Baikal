// ============================================================================
// generate-document v2 — Collecte des données projet
// ============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import type {
  CollectedData,
  ProjectContext,
  MeetingContext,
  MeetingItem,
  IntervenantContext,
  EnrichedMeetingItem,
  RagDocumentChunk,
} from "./types.ts";

/**
 * Collecte l'ensemble des données nécessaires à la génération :
 * - Projet + organisation (branding)
 * - 4 dernières réunions (extraction_status = done|extracted)
 * - Meeting items (+ toutes les actions ouvertes tous meetings)
 * - Intervenants du projet
 * - (Fiche lot) chunks RAG filtrés par qui_lots
 */
export async function collectProjectData(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  lotFilter: string | null,
): Promise<CollectedData> {

  // 1. Projet + Organisation
  const { data: project, error: projectErr } = await supabase
    .schema("core")
    .from("projects")
    .select("id, name, description, status, identity, org_id, organizations:org_id(name, settings)")
    .eq("id", projectId)
    .single();

  if (projectErr || !project) {
    throw new Error(`Projet introuvable: ${projectErr?.message || "not found"}`);
  }

  const identity = (project.identity as Record<string, string>) || {};
  const org = project.organizations as { name: string; settings: Record<string, unknown> | null } | null;

  const projectContext: ProjectContext = {
    project_name: project.name,
    project_description: project.description || null,
    org_name: org?.name || "Organisation",
    org_settings: org?.settings || null,
    market_type: identity.market_type || undefined,
    project_type: identity.project_type || undefined,
  };

  const orgId = project.org_id as string;

  // 2. 4 dernières réunions (done ou extracted)
  const { data: meetings, error: meetingsErr } = await supabase
    .schema("arpet")
    .from("meetings")
    .select("id, meeting_date, meeting_title, summary, participants")
    .eq("project_id", projectId)
    .in("extraction_status", ["done", "extracted"])
    .order("meeting_date", { ascending: false })
    .limit(4);

  if (meetingsErr) {
    throw new Error(`Erreur réunions: ${meetingsErr.message}`);
  }

  const meetingIds = (meetings || []).map((m: { id: string }) => m.id);

  // 3. Meeting items pour ces réunions
  let itemsQuery = supabase
    .schema("arpet")
    .from("meeting_items")
    .select("id, meeting_id, item_type, subject, content, context, lot_reference, responsible, due_date, status, location, topic_tags, display_order")
    .in("meeting_id", meetingIds.length > 0 ? meetingIds : ["__none__"])
    .order("display_order", { ascending: true });

  if (lotFilter) {
    itemsQuery = itemsQuery.eq("lot_reference", lotFilter);
  }

  const { data: items } = await itemsQuery;

  // 3b. Actions ouvertes tous meetings (pas seulement les 4 dernières)
  let openActionsQuery = supabase
    .schema("arpet")
    .from("meeting_items")
    .select("id, meeting_id, item_type, subject, content, context, lot_reference, responsible, due_date, status, location, topic_tags, display_order")
    .eq("item_type", "action")
    .eq("status", "open")
    .in("meeting_id",
      // Get all meeting IDs for this project (broader than the 4 latest)
      // We use a subquery approach: fetch open actions for the project's meetings
      // that aren't already in our meetingIds
      ["__placeholder__"]
    );

  // Fetch all project meeting IDs for open actions
  const { data: allProjectMeetings } = await supabase
    .schema("arpet")
    .from("meetings")
    .select("id")
    .eq("project_id", projectId)
    .in("extraction_status", ["done", "extracted"]);

  const allMeetingIds = (allProjectMeetings || []).map((m: { id: string }) => m.id);
  const olderMeetingIds = allMeetingIds.filter((id: string) => !meetingIds.includes(id));

  let olderOpenActions: MeetingItem[] = [];
  if (olderMeetingIds.length > 0) {
    let olderQuery = supabase
      .schema("arpet")
      .from("meeting_items")
      .select("id, meeting_id, item_type, subject, content, context, lot_reference, responsible, due_date, status, location, topic_tags, display_order")
      .eq("item_type", "action")
      .eq("status", "open")
      .in("meeting_id", olderMeetingIds);

    if (lotFilter) {
      olderQuery = olderQuery.eq("lot_reference", lotFilter);
    }

    const { data: olderActions } = await olderQuery;
    olderOpenActions = (olderActions || []) as MeetingItem[];
  }

  // 4. Intervenants du projet
  const { data: projetIntervenants } = await supabase
    .schema("core")
    .from("projet_intervenants")
    .select("lot_reference, role_in_project, intervenants:intervenant_id(name, company, role, specialty)")
    .eq("project_id", projectId);

  const intervenantContexts: IntervenantContext[] = (projetIntervenants || []).map((pi: any) => {
    const i = pi.intervenants as { name: string; company: string | null; role: string | null; specialty: string | null } | null;
    return {
      name: i?.name || "Inconnu",
      company: i?.company || null,
      role: i?.role || null,
      specialty: i?.specialty || null,
      lot_reference: pi.lot_reference || null,
      role_in_project: pi.role_in_project || null,
    };
  });

  // 5. (Fiche lot) RAG chunks filtrés par qui_lots
  let lotRagChunks: RagDocumentChunk[] = [];
  if (lotFilter) {
    const { data: ragChunks } = await supabase
      .schema("rag")
      .from("documents")
      .select("content, metadata, source_file_id, sources_files:source_file_id(original_filename)")
      .contains("qui_lots", [lotFilter])
      .eq("org_id", orgId)
      .limit(20);

    lotRagChunks = (ragChunks || []).map((c: any) => ({
      content: c.content || "",
      metadata: c.metadata || {},
      source_file_name: c.sources_files?.original_filename || null,
    }));
  }

  // Build meeting contexts with items grouped by meeting
  const itemsByMeeting = new Map<string, MeetingItem[]>();
  for (const item of (items || []) as MeetingItem[]) {
    const list = itemsByMeeting.get(item.meeting_id) || [];
    list.push(item);
    itemsByMeeting.set(item.meeting_id, list);
  }

  // Add older open actions to their respective meetings (or create virtual entries)
  for (const action of olderOpenActions) {
    const list = itemsByMeeting.get(action.meeting_id) || [];
    // Avoid duplicates
    if (!list.some(i => i.id === action.id)) {
      list.push(action);
      itemsByMeeting.set(action.meeting_id, list);
    }
  }

  // Reverse meetings to chronological order (oldest first)
  const sortedMeetings = [...(meetings || [])].reverse();

  const meetingContexts: MeetingContext[] = sortedMeetings.map((m: any) => {
    const meetingItems = itemsByMeeting.get(m.id) || [];
    // Items start as EnrichedMeetingItem with empty rag_context (will be enriched later)
    const enrichedItems: EnrichedMeetingItem[] = meetingItems.map(item => ({
      ...item,
      rag_context: [],
    }));

    return {
      id: m.id,
      meeting_date: m.meeting_date,
      meeting_title: m.meeting_title,
      summary: m.summary,
      participants: m.participants || [],
      items: enrichedItems,
    };
  });

  // Also include older open actions as a synthetic context
  // They'll appear in the "Actions en cours" section
  const olderOpenActionsNotInMeetings = olderOpenActions.filter(
    a => !meetingIds.includes(a.meeting_id)
  );

  if (olderOpenActionsNotInMeetings.length > 0) {
    // Add a synthetic meeting entry for older open actions
    meetingContexts.push({
      id: "__older_actions__",
      meeting_date: "",
      meeting_title: "Actions ouvertes (réunions antérieures)",
      summary: null,
      participants: [],
      items: olderOpenActionsNotInMeetings.map(item => ({
        ...item,
        rag_context: [],
      })),
    });
  }

  return {
    project: projectContext,
    meetings: meetingContexts,
    intervenants: intervenantContexts,
    lot_filter: lotFilter,
    lot_rag_chunks: lotRagChunks,
  };
}
