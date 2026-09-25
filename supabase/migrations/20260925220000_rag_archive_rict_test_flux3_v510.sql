-- MIGRATION DE DONNÉES appliquée en production le 2026-09-25 par apply_migration (MCP) — NE JAMAIS REJOUER : elle dépend de l'état du corpus à cet instant (état du corpus du jour).
-- Test de FLUX 3 publié le 2026-09-25 (chunking v5.1.0 + QQOQCCP v1.1.0 + retouches 3.8b / retry 3.6d-3.6i / garde 3.6f) :
-- archivage des 84 chunks v5.0.0 du RICT-DCE (ré-ingestion du 2026-09-24, dont 10 sous-sections rattachées par
-- 20260924150000) avant sa ré-ingestion, pour qu'aucun chunk_local_id identique ne soit écrasé par l'upsert.
-- Même mécanisme que 20260924110000 (status = 'rejected', metadata.archive, chunk_local_id retiré).
-- Rollback : UPDATE rag.documents SET status = 'approved',
--   metadata = (metadata - 'archive') || jsonb_build_object('chunk_local_id', metadata->'archive'->>'chunk_local_id')
--   WHERE source_file_id = '672c4542-30af-43da-9d4d-86adfd5fd426' AND metadata->'archive'->>'raison' = 'test-flux3-v510';
--   (puis passer en 'rejected' les chunks v5.1.0 du même fichier s'ils ont été insérés).
UPDATE rag.documents
SET status = 'rejected',
    metadata = (metadata - 'chunk_local_id')
             || jsonb_build_object('archive', jsonb_build_object(
                  'raison', 'test-flux3-v510',
                  'le', now(),
                  'chunk_local_id', metadata->>'chunk_local_id',
                  'status_avant', status::text))
WHERE status = 'approved'
  AND chunk_local_id IS NOT NULL
  AND source_file_id = '672c4542-30af-43da-9d4d-86adfd5fd426'; -- RICT-DCE
-- attendu : 84 lignes
