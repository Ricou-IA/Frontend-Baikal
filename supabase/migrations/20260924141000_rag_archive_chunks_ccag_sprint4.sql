-- Sprint 4 (S4.1) : archivage des 527 chunks pipeline 3.2.0 du CCAG (129 L0, 374 L1, 24 niveaux 2/3) avant
-- un NOUVEL essai de ré-ingestion en FLUX 3 v5.1.0 — le premier essai avait échoué sur le statement_timeout de
-- l'upsert (496 lignes), corrigé par ingest-documents v8.2.0 (upsert par lots de 100, validé sur NFP03-001 :
-- 471 chunks en 5 lots). Le rollback 20260924140000 avait remis ces chunks en 'approved' avec leur
-- chunk_local_id (forme `batch_N_sec_…`, identique à celle de v5.1.0) : ils doivent être archivés AVANT
-- l'upsert pour qu'aucune ligne legacy ne soit écrasée par un id identique. Même mécanisme que 20260924110000.
-- Rollback : voir 20260924140000.
UPDATE rag.documents
SET status = 'rejected',
    metadata = (metadata - 'chunk_local_id')
             || jsonb_build_object('archive', jsonb_build_object(
                  'raison', 'sprint4-reingestion',
                  'le', now(),
                  'chunk_local_id', metadata->>'chunk_local_id',
                  'status_avant', status::text))
WHERE status = 'approved'
  AND source_file_id = '5ba512af-d68a-41f3-9578-aeb17a231a55'; -- CCAG (couche app)
-- attendu : 527 lignes
