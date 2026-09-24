-- Sprint 4 (S4.2) : archivage des chunks legacy (pipeline de janvier 2026, sans L0) des 5 fichiers du
-- projet OC014 - Bessières avant leur ré-ingestion en FLUX 3 v5.1.0.
-- `rag.document_status` n'a pas de valeur 'archived' : status = 'rejected' (exclu de match_documents_v15 et
-- des stratégies ciblées ; lignes conservées, les citations restent résolubles).
-- `chunk_local_id` (colonne générée depuis metadata) est retiré pour que l'upsert (source_file_id, chunk_local_id)
-- de ingest-documents v8.1.0 n'écrase aucune ligne archivée et que rag.resolve_chunk_hierarchy ne rattache
-- aucun nouveau L1 à un ancien L0 (le rattachement se fait par chunk_local_id sans filtre de statut).
-- Rollback (un fichier) :
--   UPDATE rag.documents SET status = 'approved',
--     metadata = (metadata - 'archive') || CASE WHEN metadata->'archive'->>'chunk_local_id' IS NULL THEN '{}'::jsonb
--                ELSE jsonb_build_object('chunk_local_id', metadata->'archive'->>'chunk_local_id') END
--   WHERE source_file_id = '<id>' AND metadata->'archive'->>'raison' = 'sprint4-reingestion';
--   (puis passer les chunks v5.1.0 du même fichier en 'rejected' s'ils ont été insérés).
UPDATE rag.documents
SET status = 'rejected',
    metadata = (metadata - 'chunk_local_id')
             || jsonb_build_object('archive', jsonb_build_object(
                  'raison', 'sprint4-reingestion',
                  'le', now(),
                  'chunk_local_id', metadata->>'chunk_local_id',
                  'status_avant', status::text))
WHERE status = 'approved'
  AND source_file_id IN (
    '50011461-6815-447c-9674-cd591633db65', -- Acte d'Engagement (Bessières AE DBC Signé), 42 chunks
    'ae536bdf-4079-4b89-839f-1235e7968138', -- CCAP Bessières, 107
    '5cd5db31-b679-4b65-9c32-74579e549a55', -- Mémoire Technique (DBC - BESSIERES OPH 31), 171
    '2ae83a91-5efb-4436-93cf-04c8d8e86653', -- PGC-Bessières, 175
    '672c4542-30af-43da-9d4d-86adfd5fd426'  -- RICT-DCE, 41
  );
-- attendu : 536 lignes
