-- MIGRATION DE DONNÉES appliquée en production le 2026-09-24 par apply_migration (MCP) — NE JAMAIS REJOUER : elle dépend de l'état du corpus à cet instant (état du corpus du jour).
-- Sprint 4 (S4.2) : archivage des 107 chunks legacy (pipeline de janvier 2026, chunk_local_id NULL) du CCAP
-- Bessières, APRÈS sa ré-ingestion réussie en FLUX 3 v5.1.0 (2026-09-24 09:38 UTC, 136 chunks : 64 L0 + 72 L1).
-- Le rollback général (20260924123000) avait remis ces chunks en 'approved' ; ils cohabitent depuis avec les
-- chunks v5.1.0 (doublons en production) : on les archive maintenant, par le même mécanisme que
-- 20260924110000 (status = 'rejected', metadata.archive). Les chunks v5.1.0 (chunk_local_id renseigné) ne sont
-- pas touchés.
-- Rollback : voir 20260924123000 (même UPDATE inverse, restreint à ce fichier).
UPDATE rag.documents
SET status = 'rejected',
    metadata = (metadata - 'chunk_local_id')
             || jsonb_build_object('archive', jsonb_build_object(
                  'raison', 'sprint4-reingestion',
                  'le', now(),
                  'chunk_local_id', metadata->>'chunk_local_id',
                  'status_avant', status::text))
WHERE status = 'approved'
  AND chunk_local_id IS NULL
  AND source_file_id = 'ae536bdf-4079-4b89-839f-1235e7968138'; -- CCAP Bessières
-- attendu : 107 lignes
