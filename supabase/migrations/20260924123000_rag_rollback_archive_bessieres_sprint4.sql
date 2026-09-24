-- MIGRATION DE DONNÉES appliquée en production le 2026-09-24 par apply_migration (MCP) — NE JAMAIS REJOUER : elle dépend de l'état du corpus à cet instant (état du corpus du jour).
-- Sprint 4 (S4.2) : ROLLBACK de 20260924110000_rag_archive_chunks_bessieres_sprint4.
-- Le canari de ré-ingestion (Acte d'Engagement, FLUX 3 v5.1.0 par webhook direct) s'est arrêté sans
-- insérer de chunk (HTTP 200 corps vide, aucun appel à ingest-documents) et le connecteur n8n étant
-- invalidé, l'exécution n'est pas lisible. Les 536 chunks legacy des 5 fichiers Bessières sont remis
-- en 'approved' (avec leur metadata d'origine) pour ne pas priver la production de ces documents
-- pendant l'attente ; l'archivage sera rejoué juste avant la prochaine tentative de ré-ingestion.
UPDATE rag.documents
SET status = 'approved',
    metadata = (metadata - 'archive')
             || CASE WHEN metadata->'archive'->>'chunk_local_id' IS NULL THEN '{}'::jsonb
                     ELSE jsonb_build_object('chunk_local_id', metadata->'archive'->>'chunk_local_id') END
WHERE status = 'rejected'
  AND metadata->'archive'->>'raison' = 'sprint4-reingestion'
  AND source_file_id IN (
    '50011461-6815-447c-9674-cd591633db65', -- Acte d'Engagement
    'ae536bdf-4079-4b89-839f-1235e7968138', -- CCAP Bessières
    '5cd5db31-b679-4b65-9c32-74579e549a55', -- Mémoire Technique
    '2ae83a91-5efb-4436-93cf-04c8d8e86653', -- PGC-Bessières
    '672c4542-30af-43da-9d4d-86adfd5fd426'  -- RICT-DCE
  );
-- attendu : 536 lignes
