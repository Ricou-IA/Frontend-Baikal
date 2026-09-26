-- MIGRATION DE DONNÉES appliquée en production par apply_migration (MCP) — NE JAMAIS REJOUER : elle dépend de l'état du corpus à cet instant (état du corpus du jour).
-- Ré-ingestion avec FLUX 3 réparé (version publiée 646c84e4 : chunking v5.1.0, QQOQCCP v1.1.0, 3.8b corrigé, retry,
-- tout-ou-rien, réparation JSON v3 ; validé sur le RICT le 2026-09-25 : QQOQCCP 44/44) — Acte d'Engagement (Bessières AE DBC Signé) :
-- archivage des chunks v5.0.0 du 2026-09-24 avant ré-ingestion (même mécanisme que 20260924110000).
-- Rollback : UPDATE rag.documents SET status = 'approved',
--   metadata = (metadata - 'archive') || jsonb_build_object('chunk_local_id', metadata->'archive'->>'chunk_local_id')
--   WHERE source_file_id = '50011461-6815-447c-9674-cd591633db65' AND metadata->'archive'->>'raison' = 'reingestion-flux3-repare';
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
  AND source_file_id = '50011461-6815-447c-9674-cd591633db65'; -- Acte d'Engagement (Bessières AE DBC Signé)
-- attendu : 41 lignes
