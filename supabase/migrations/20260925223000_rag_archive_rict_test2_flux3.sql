-- MIGRATION DE DONNÉES appliquée en production le 2026-09-25 par apply_migration (MCP) — NE JAMAIS REJOUER : elle dépend de l'état du corpus à cet instant (état du corpus du jour).
-- Second test de FLUX 3 publié (version 0b3b8884 : chunking v5.1.0 + QQOQCCP v1.1.0 + réparation JSON 3.6e/3.6j
-- + garde tout-ou-rien 3.6f) : archivage des 84 chunks v5.0.0 du RICT-DCE avant sa ré-ingestion.
-- Rollback : UPDATE rag.documents SET status = 'approved',
--   metadata = (metadata - 'archive') || jsonb_build_object('chunk_local_id', metadata->'archive'->>'chunk_local_id')
--   WHERE source_file_id = '672c4542-30af-43da-9d4d-86adfd5fd426' AND metadata->'archive'->>'raison' = 'test2-flux3';
UPDATE rag.documents
SET status = 'rejected',
    metadata = (metadata - 'chunk_local_id')
             || jsonb_build_object('archive', jsonb_build_object(
                  'raison', 'test2-flux3',
                  'le', now(),
                  'chunk_local_id', metadata->>'chunk_local_id',
                  'status_avant', status::text))
WHERE status = 'approved'
  AND chunk_local_id IS NOT NULL
  AND source_file_id = '672c4542-30af-43da-9d4d-86adfd5fd426'; -- RICT-DCE
-- attendu : 84 lignes
