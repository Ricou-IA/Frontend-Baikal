// ============================================================================
// generate-document v2 — Stockage (Storage + sources.files)
// ============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import type { StorageResult } from "./types.ts";

const STORAGE_BUCKET = "user-workspace";

/**
 * Stocke le document Markdown généré :
 * 1. Upload dans Storage (bucket user-workspace)
 * 2. Insert dans sources.files (pas d'ingestion RAG)
 * 3. Génère une signed URL (1h)
 */
export async function storeDocument(
  supabase: ReturnType<typeof createClient>,
  markdownContent: string,
  projectId: string,
  orgId: string,
  userId: string,
  documentType: string,
  lotFilter: string | null,
): Promise<StorageResult> {
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename =
    documentType === "memo_chantier"
      ? `Memo_chantier_${dateStr}.md`
      : `Fiche_lot_${lotFilter}_${dateStr}.md`;

  const storagePath = `project/${orgId}/${filename}`;
  const contentBytes = new TextEncoder().encode(markdownContent);

  // 1. Upload Markdown → Storage
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, contentBytes, {
      contentType: "text/markdown",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`);
  }

  // 2. Insert sources.files record
  const { data: fileRecord, error: insertError } = await supabase
    .schema("sources")
    .from("files")
    .insert({
      original_filename: filename,
      mime_type: "text/markdown",
      file_size: contentBytes.length,
      org_id: orgId,
      project_id: projectId,
      created_by: userId,
      app_id: "arpet",
      layer: "project",
      storage_bucket: STORAGE_BUCKET,
      storage_path: storagePath,
      ingestion_level: "none",
      processing_status: "completed",
      promotion_status: "approved",
      metadata: {
        category: "ad65b932-3ec2-4847-8dff-14079aac76fc",
        document_type: documentType,
        lot_reference: lotFilter || null,
        description: `Document généré automatiquement - ${documentType}`,
        enriched_with_rag: true,
      },
    })
    .select("id")
    .single();

  if (insertError) {
    // Cleanup storage on DB error
    await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
    throw new Error(`File record creation failed: ${insertError.message}`);
  }

  // 3. Signed URL (1 heure)
  const { data: signedData } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, 3600);

  return {
    file_id: fileRecord.id,
    file_name: filename,
    download_url: signedData?.signedUrl || "",
  };
}
