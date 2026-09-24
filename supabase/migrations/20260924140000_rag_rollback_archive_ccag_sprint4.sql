-- Sprint 4 (S4.1) : ROLLBACK partiel de 20260924120000 pour le CCAG seulement.
-- La ré-ingestion du CCAG (FLUX 3 v5.1.0, 2026-09-24 10:28-11:04 UTC, 35 min) s'est terminée sans insérer de
-- chunk (HTTP 200 vide, get-concepts appelé à 10:31 puis aucun appel à ingest-documents : arrêt dans la phase
-- Gemini). Les 527 chunks pipeline 3.2.0 (129 L0, 374 L1, 24 niveaux 2/3) sont remis en 'approved' avec leur
-- chunk_local_id d'origine pour ne pas priver tous les projets ARPET du CCAG ; ils seront ré-archivés si une
-- nouvelle tentative réussit.
UPDATE rag.documents
SET status = 'approved',
    metadata = (metadata - 'archive')
             || CASE WHEN metadata->'archive'->>'chunk_local_id' IS NULL THEN '{}'::jsonb
                     ELSE jsonb_build_object('chunk_local_id', metadata->'archive'->>'chunk_local_id') END
WHERE status = 'rejected'
  AND metadata->'archive'->>'raison' = 'sprint4-reingestion'
  AND source_file_id = '5ba512af-d68a-41f3-9578-aeb17a231a55'; -- CCAG (couche app)
-- attendu : 527 lignes
