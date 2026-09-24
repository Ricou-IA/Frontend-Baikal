-- Sprint 4 (S4.3) : le tsvector `fts` de rag.documents porte, en plus du contenu, les entités
-- clés du QQOQCCP et le titre de section, avec des poids distincts pour ts_rank_cd
-- (poids par défaut de Postgres : A = 1,0 ; B = 0,4 ; C = 0,2 ; D = 0,1).
--   A : normes (comment_normes) et lots (qui_lots)
--   B : localisations (qqoqccp.ou.localisations, batiment, niveau, zone) et titre de section
--   D : contenu (poids implicite d'avant : les rangs des correspondances de contenu sont inchangés)
-- Avant (2026-01) : NEW.fts := to_tsvector('french', COALESCE(NEW.content, ''))
-- Rollback : recréer rag.update_fts() avec la ligne ci-dessus, recréer le trigger sur
--            `content` seul, puis UPDATE rag.documents SET content = content.

CREATE OR REPLACE FUNCTION rag.fts_entites_a(p_comment_normes text[], p_qui_lots text[])
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT NULLIF(concat_ws(' ',
    array_to_string(COALESCE(p_comment_normes, '{}'::text[]), ' '),
    array_to_string(COALESCE(p_qui_lots, '{}'::text[]), ' ')
  ), '')
$$;

CREATE OR REPLACE FUNCTION rag.fts_entites_b(p_qqoqccp jsonb, p_metadata jsonb)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT NULLIF(concat_ws(' ',
    (SELECT string_agg(x, ' ')
       FROM jsonb_array_elements_text(
         CASE WHEN jsonb_typeof(p_qqoqccp->'ou'->'localisations') = 'array'
              THEN p_qqoqccp->'ou'->'localisations' ELSE '[]'::jsonb END) AS x),
    p_qqoqccp->'ou'->>'batiment',
    p_qqoqccp->'ou'->>'niveau',
    p_qqoqccp->'ou'->>'zone',
    COALESCE(p_metadata->>'section_title', p_metadata->>'current_section')
  ), '')
$$;

CREATE OR REPLACE FUNCTION rag.update_fts()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.fts :=
       setweight(to_tsvector('french', COALESCE(rag.fts_entites_a(NEW.comment_normes, NEW.qui_lots), '')), 'A')
    || setweight(to_tsvector('french', COALESCE(rag.fts_entites_b(NEW.qqoqccp, NEW.metadata), '')), 'B')
    || setweight(to_tsvector('french', COALESCE(NEW.content, '')), 'D');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_documents_fts ON rag.documents;
CREATE TRIGGER trg_documents_fts
  BEFORE INSERT OR UPDATE OF content, comment_normes, qui_lots, qqoqccp, metadata
  ON rag.documents
  FOR EACH ROW EXECUTE FUNCTION rag.update_fts();

-- Backfill (3 700 lignes au 2026-09-24) : `UPDATE OF content` déclenche le trigger même à valeur identique.
UPDATE rag.documents SET content = content;
