-- Sprint 4 (S4.1) : archivage des chunks pipeline 3.2.0 (dont les 24 chunks niveaux 2/3 du CCAG) des 2 fichiers de la
-- couche application avant ré-ingestion en FLUX 3 v5.1.0.
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
    '5ba512af-d68a-41f3-9578-aeb17a231a55', -- CCAG (couche app), 527 chunks dont 24 niveaux 2/3
    '8644dc88-1ded-4a95-97e8-27cc8e10754b'  -- Norme NFP03-001 (couche app), 544
  );
-- attendu : 1071 lignes
