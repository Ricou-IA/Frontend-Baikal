-- ============================================================================
-- Sprint 0 (S0.1) — Table d'observabilité des requêtes RAG
-- Spec : Frontend-ARPET/docs/SPEC_RAG_OPTIM_V1.md §4.5
-- Écriture : service_role uniquement (les Edge Functions utilisent la service
--   key, RLS bypassée). Aucune policy INSERT/UPDATE/DELETE volontairement.
-- Lecture : super_admin (core.profiles.app_role) ; sinon via MCP/dashboard.
-- ============================================================================

CREATE TABLE IF NOT EXISTS rag.query_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  conversation_id uuid,
  user_id uuid,
  org_id uuid,
  project_id uuid,
  app_id text,
  query text NOT NULL,
  rewritten_query text,
  intent text,
  answer_format text,
  fast_path boolean,
  generation_mode text,
  model text,
  memory_hit boolean DEFAULT false,
  reranked boolean DEFAULT false,
  agentic jsonb,                        -- {triggered, iterations, timed_out, steps[]}
  counts jsonb,                         -- {total, l0, l1, children, files, sources}
  top_similarities double precision[],  -- similarités des chunks retournés (ordre ranking)
  match_sources text[],                 -- vector | intersection | fulltext | graphrag | child
  sources jsonb,                        -- allégé : [{file_id, document_name, page, score, layer}]
  timings jsonb,
  processing_time_ms integer,
  error text
);

COMMENT ON TABLE rag.query_logs IS 'Observabilité RAG (Sprint 0) : une ligne par requête baikal-retrieval, alimentée en fin de pipeline';

CREATE INDEX IF NOT EXISTS idx_query_logs_created_at ON rag.query_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_query_logs_org_project ON rag.query_logs (org_id, project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_query_logs_intent ON rag.query_logs (intent, created_at DESC);

ALTER TABLE rag.query_logs ENABLE ROW LEVEL SECURITY;

-- Lecture réservée aux super_admin (colonne réelle : core.profiles.app_role)
CREATE POLICY query_logs_select_super_admin ON rag.query_logs
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM core.profiles p
    WHERE p.id = auth.uid() AND p.app_role = 'super_admin'
  ));
