-- Sprint 4 (S4.2) : archivage des 42 chunks legacy (pipeline de janvier 2026, chunk_local_id NULL) de l'Acte
-- d'Engagement (Bessières AE DBC Signé) APRÈS une ré-ingestion réussie en FLUX 3 v5.1.0 (le premier essai
-- n'avait rien produit et avait été annulé par 20260924123000). Même mécanisme que 20260924110000 ; les
-- chunks v5.1.0 (chunk_local_id renseigné) ne sont pas touchés. Rollback : voir 20260924123000, restreint à
-- ce fichier.
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
  AND source_file_id = '50011461-6815-447c-9674-cd591633db65'; -- Acte d'Engagement
-- attendu : 42 lignes
