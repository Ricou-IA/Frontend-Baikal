// ============================================================================
// baikal-retrieval - Generation: Gemini Streaming + Google File Upload + Cache
// ============================================================================

import type {
  Supabase, LibrarianConfig, FileInfo, EffectiveGenerationParams,
} from "../types.ts"
import { hashFileIds, hashPrompt } from "../utils.ts"

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!

// ============================================================================
// GOOGLE FILE UPLOAD (with caching)
// ============================================================================

export async function getOrUploadGoogleFile(
  supabase: Supabase,
  file: FileInfo,
  ttlHours: number,
): Promise<string> {
  // Check existing URI
  const { data: dbFile } = await supabase
    .schema('sources')
    .from('files')
    .select('google_file_uri, google_uri_expires_at')
    .eq('id', file.file_id)
    .single()

  if (dbFile?.google_file_uri && dbFile.google_uri_expires_at) {
    const expiresAt = new Date(dbFile.google_uri_expires_at)
    if (expiresAt > new Date()) {
      return dbFile.google_file_uri
    }
  }

  // Download from Supabase storage
  const { data: fileData, error } = await supabase.storage
    .from(file.storage_bucket)
    .download(file.storage_path)

  if (error || !fileData) {
    throw new Error(`Download error ${file.original_filename}: ${error?.message}`)
  }

  const fileBuffer = await fileData.arrayBuffer()

  // Initiate Google upload
  const initResponse = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": fileBuffer.byteLength.toString(),
        "X-Goog-Upload-Header-Content-Type": file.mime_type,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { display_name: file.original_filename } }),
    },
  )

  if (!initResponse.ok) {
    throw new Error(`Google Files init error: ${await initResponse.text()}`)
  }

  const uploadUrl = initResponse.headers.get("X-Goog-Upload-URL")
  if (!uploadUrl) throw new Error("Missing upload URL")

  // Upload content
  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "X-Goog-Upload-Command": "upload, finalize",
      "X-Goog-Upload-Offset": "0",
      "Content-Type": file.mime_type,
    },
    body: fileBuffer,
  })

  if (!uploadResponse.ok) {
    throw new Error(`Google Files upload error: ${await uploadResponse.text()}`)
  }

  const fileInfo = await uploadResponse.json()
  const googleFileUri = fileInfo.file?.uri || fileInfo.uri
  if (!googleFileUri) throw new Error("No URI returned from Google Files API")

  // Save URI
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString()
  await supabase
    .schema('sources')
    .from('files')
    .update({ google_file_uri: googleFileUri, google_uri_expires_at: expiresAt })
    .eq('id', file.file_id)

  return googleFileUri
}

// ============================================================================
// GLOBAL CACHE
// ============================================================================

export async function getOrCreateGlobalCache(
  supabase: Supabase,
  files: FileInfo[],
  googleUris: string[],
  systemPrompt: string,
  config: LibrarianConfig,
  orgId: string | null,
  appId: string,
  effectiveModel: string,
): Promise<{ cacheName: string; wasReused: boolean }> {
  const fileIds = files.map(f => f.file_id)
  const fileIdsHash = await hashFileIds(fileIds)
  const promptHash = await hashPrompt(systemPrompt)

  // Check existing cache
  const { data: existing } = await supabase
    .schema('rag')
    .from('gemini_caches')
    .select('cache_name, expires_at')
    .eq('file_ids_hash', fileIdsHash)
    .eq('system_prompt_hash', promptHash)
    .eq('model', effectiveModel)
    .or(orgId ? `org_id.eq.${orgId},org_id.is.null` : 'org_id.is.null')
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: false })
    .limit(1)
    .single()

  if (existing) {
    await supabase
      .schema('rag')
      .from('gemini_caches')
      .update({ last_used_at: new Date().toISOString() })
      .eq('cache_name', existing.cache_name)

    return { cacheName: existing.cache_name, wasReused: true }
  }

  // Create new cache
  const parts: Array<Record<string, unknown>> = [{ text: systemPrompt }]
  for (let i = 0; i < googleUris.length; i++) {
    parts.push({
      fileData: {
        fileUri: googleUris[i],
        mimeType: files[i].mime_type || 'application/pdf',
      },
    })
  }

  const ttlSeconds = config.cache_ttl_minutes * 60
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: `models/${effectiveModel}`,
        contents: [{ role: "user", parts }],
        ttl: `${ttlSeconds}s`,
      }),
    },
  )

  if (!response.ok) {
    throw new Error(`Gemini Cache error: ${await response.text()}`)
  }

  const cacheData = await response.json()
  const cacheName = cacheData.name
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString()

  await supabase
    .schema('rag')
    .from('gemini_caches')
    .insert({
      file_ids_hash: fileIdsHash,
      file_ids: fileIds,
      cache_name: cacheName,
      model: effectiveModel,
      org_id: orgId,
      app_id: appId,
      system_prompt_hash: promptHash,
      expires_at: expiresAt,
      total_tokens: cacheData.usageMetadata?.totalTokenCount || null,
      file_count: files.length,
    })

  return { cacheName, wasReused: false }
}

// ============================================================================
// GEMINI STREAMING
// ============================================================================

export async function* generateWithGeminiStream(
  query: string,
  cacheName: string,
  effectiveParams: EffectiveGenerationParams,
  meetingContext: string = '',
): AsyncGenerator<string, string, undefined> {
  const fullQuery = meetingContext ? `${query}\n\n${meetingContext}` : query

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${effectiveParams.model}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cachedContent: cacheName,
        contents: [{ role: "user", parts: [{ text: fullQuery }] }],
        generationConfig: {
          temperature: effectiveParams.temperature,
          maxOutputTokens: effectiveParams.maxTokens,
        },
      }),
    },
  )

  if (!response.ok) {
    throw new Error(`Gemini streaming error: ${await response.text()}`)
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
        // skip
      }
    }
  }

  return fullContent
}
