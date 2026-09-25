-- MIGRATION DE DONNÉES appliquée en production le 2026-09-25 par apply_migration (MCP) — NE JAMAIS REJOUER : elle dépend de l'état du corpus à cet instant (état du corpus du jour).
-- ROLLBACK du test FLUX 3 v5.1.0 sur le RICT-DCE (20260925220000) : la ré-ingestion (exécution n8n 36644) n'a
-- produit que 4 chunks (page 1) — 2 des 3 lots de la passe 1 ont échoué au JSON.parse du nœud 3.6e (« Bad control
-- character in string literal », « Bad escaped character ») sans arrêter l'ingestion. On rejette les 4 chunks du
-- test et on remet en 'approved' les 84 chunks v5.0.0 du 2026-09-24 (avec leur chunk_local_id).
UPDATE rag.documents
SET status = 'rejected',
    metadata = metadata || jsonb_build_object('archive', jsonb_build_object(
                 'raison', 'test-flux3-v510-partiel', 'le', now(), 'status_avant', status::text))
WHERE status = 'approved'
  AND source_file_id = '672c4542-30af-43da-9d4d-86adfd5fd426'
  AND created_at > '2026-09-25 21:00+00';
-- attendu : 4 lignes

UPDATE rag.documents
SET status = 'approved',
    metadata = (metadata - 'archive')
             || jsonb_build_object('chunk_local_id', metadata->'archive'->>'chunk_local_id')
WHERE status = 'rejected'
  AND metadata->'archive'->>'raison' = 'test-flux3-v510'
  AND source_file_id = '672c4542-30af-43da-9d4d-86adfd5fd426';
-- attendu : 84 lignes
