-- Idempotence de l'ingestion : cle naturelle (source_file_id, chunk_local_id)
-- Appliquee en prod le 2026-08-15 via MCP (miroir repo de la migration remote 20260815173656).
-- 1. Colonne generee depuis metadata (les payloads n8n/futur worker ecrivent deja chunk_local_id dans metadata)
ALTER TABLE rag.documents
  ADD COLUMN IF NOT EXISTS chunk_local_id text
  GENERATED ALWAYS AS (metadata->>'chunk_local_id') STORED;

-- 2. Index unique : les NULL restent non contraints (chunks legacy pre-v7 et transcripts sans local id)
CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_file_chunk_local
  ON rag.documents (source_file_id, chunk_local_id);

COMMENT ON COLUMN rag.documents.chunk_local_id IS
  'Genere depuis metadata->>chunk_local_id. Cle d''idempotence avec source_file_id (uq_documents_file_chunk_local) : un retry d''ingestion ne peut plus dupliquer les chunks.';
