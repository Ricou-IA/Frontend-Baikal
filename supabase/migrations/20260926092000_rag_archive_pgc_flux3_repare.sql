-- MIGRATION DE DONNÉES appliquée en production par apply_migration (MCP) — NE JAMAIS REJOUER : elle dépend de l'état du corpus à cet instant (état du corpus du jour).
-- Ré-ingestion avec FLUX 3 réparé (version publiée 646c84e4 : chunking v5.1.0, QQOQCCP v1.1.0, 3.8b corrigé, retry,
-- tout-ou-rien, réparation JSON v3 ; validé sur le RICT le 2026-09-25 : QQOQCCP 44/44) — PGC-Bessières :
-- archivage des chunks v5.0.0 du 2026-09-24 avant ré-ingestion (même mécanisme que 20260924110000).
-- Rollback : UPDATE rag.documents SET status = 'approved',
--   metadata = (metadata - 'archive') || jsonb_build_object('chunk_local_id', metadata->'archive'->>'chunk_local_id')
--   WHERE source_file_id = '2ae83a91-5efb-4436-93cf-04c8d8e86653' AND metadata->'archive'->>'raison' = 'reingestion-flux3-repare';
UPDATE rag.documents
SET status = 'rejected',
    metadata = (metadata - 'chunk_local_id')
             || jsonb_build_object('archive', jsonb_build_object(
                  'raison', 'reingestion-flux3-repare',
                  'le', now(),
                  'chunk_local_id', metadata->>'chunk_local_id',
                  'status_avant', status::text))
WHERE status = 'approved'
  AND chunk_local_id IS NOT NULL
  AND source_file_id = '2ae83a91-5efb-4436-93cf-04c8d8e86653'; -- PGC-Bessières
-- attendu : 107 lignes
