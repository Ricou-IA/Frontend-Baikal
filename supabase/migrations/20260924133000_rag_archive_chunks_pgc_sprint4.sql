-- Sprint 4 (S4.2) : archivage des 175 chunks legacy (pipeline de janvier 2026, chunk_local_id NULL) de
-- PGC-Bessières APRÈS une ré-ingestion réussie en FLUX 3 v5.1.0 (le premier essai n'avait rien produit et
-- avait été annulé par 20260924130000). Même mécanisme que 20260924110000 ; les chunks v5.1.0 (chunk_local_id
-- renseigné) ne sont pas touchés. Rollback : voir 20260924123000, restreint à ce fichier.
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
  AND source_file_id = '2ae83a91-5efb-4436-93cf-04c8d8e86653'; -- PGC-Bessières
-- attendu : 175 lignes
