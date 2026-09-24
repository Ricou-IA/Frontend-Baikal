-- Sprint 4 (S4.2) : ROLLBACK partiel de 20260924125000 pour PGC-Bessières seulement.
-- La ré-ingestion du PGC (FLUX 3 v5.1.0, 2026-09-24 09:50-09:59 UTC) s'est terminée sans insérer de chunk
-- (même symptôme que l'Acte d'Engagement : HTTP 200 vide, aucun appel à ingest-documents). Les 175 chunks
-- legacy sont remis en 'approved' pour ne pas priver la production du PGC ; ils seront ré-archivés si une
-- nouvelle tentative réussit.
UPDATE rag.documents
SET status = 'approved',
    metadata = (metadata - 'archive')
             || CASE WHEN metadata->'archive'->>'chunk_local_id' IS NULL THEN '{}'::jsonb
                     ELSE jsonb_build_object('chunk_local_id', metadata->'archive'->>'chunk_local_id') END
WHERE status = 'rejected'
  AND metadata->'archive'->>'raison' = 'sprint4-reingestion'
  AND source_file_id = '2ae83a91-5efb-4436-93cf-04c8d8e86653'; -- PGC-Bessières
-- attendu : 175 lignes
