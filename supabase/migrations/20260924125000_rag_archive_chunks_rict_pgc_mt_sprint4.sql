-- MIGRATION DE DONNÉES appliquée en production le 2026-09-24 par apply_migration (MCP) — NE JAMAIS REJOUER : elle dépend de l'état du corpus à cet instant (état du corpus du jour).
-- Sprint 4 (S4.2) : archivage des chunks legacy (pipeline de janvier 2026, chunk_local_id NULL) de RICT-DCE,
-- PGC-Bessières et du Mémoire Technique, juste avant leur ré-ingestion en FLUX 3 v5.1.0 (le pipeline est
-- validé par la ré-ingestion réussie du CCAP le 2026-09-24). Même mécanisme que 20260924110000 ; l'Acte
-- d'Engagement (dont le premier essai n'a produit aucun chunk) n'est pas dans ce lot : il sera archivé
-- seulement après une ré-ingestion réussie.
-- Rollback (par fichier) : voir 20260924123000.
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
  AND source_file_id IN (
    '672c4542-30af-43da-9d4d-86adfd5fd426', -- RICT-DCE, 41
    '2ae83a91-5efb-4436-93cf-04c8d8e86653', -- PGC-Bessières, 175
    '5cd5db31-b679-4b65-9c32-74579e549a55'  -- Mémoire Technique (DBC - BESSIERES OPH 31), 171
  );
-- attendu : 387 lignes
