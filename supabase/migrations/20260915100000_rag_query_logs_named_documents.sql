-- ============================================================================
-- Sprint 1 (fin) — Traçabilité des documents nommés dans la question
-- Spec : docs/superpowers/prompts/2026-09-15-documents-nommes-scalable.md (§ 6)
-- Colonne jsonb, nullable, sans index : lue par les analyses hors ligne uniquement.
-- À appliquer AVANT le déploiement de l'Edge Function qui l'écrit (sinon
-- l'insertion query_logs échoue : warn console, ligne perdue).
-- ============================================================================

ALTER TABLE rag.query_logs ADD COLUMN IF NOT EXISTS named_documents jsonb;

COMMENT ON COLUMN rag.query_logs.named_documents IS
  'Documents nommés dans la question et leur résolution sur sources.files : [{phrase, type, status, found[], similar[], total}]';
