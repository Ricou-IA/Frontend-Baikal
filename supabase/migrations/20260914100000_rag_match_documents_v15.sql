-- Sprint 1 RAG (S1.2, S1.3, S4.4) — match_documents_v15
-- v14 + (1) pool vector/fulltext ×4, (2) pondération couche app, (3) enfants L1 hors LIMIT.
-- Même table de sortie que v14 : l'Edge Function bascule par simple changement de nom.

CREATE OR REPLACE FUNCTION rag.match_documents_v15(
  query_embedding vector,
  query_text text,
  p_user_id uuid,
  p_org_id uuid,
  p_project_id uuid,
  p_app_id text,
  match_count integer DEFAULT 8,
  similarity_threshold double precision DEFAULT 0.35,
  include_app_layer boolean DEFAULT true,
  include_org_layer boolean DEFAULT true,
  include_project_layer boolean DEFAULT true,
  include_user_layer boolean DEFAULT false,
  filter_source_types text[] DEFAULT NULL::text[],
  filter_file_ids uuid[] DEFAULT NULL::uuid[],
  filter_filenames text[] DEFAULT NULL::text[],
  enable_concept_expansion boolean DEFAULT true,
  max_concepts_for_expansion integer DEFAULT 5,
  concept_relevance_threshold double precision DEFAULT 0.3,
  p_hierarchy_levels integer[] DEFAULT ARRAY[1],
  p_include_children boolean DEFAULT false,
  p_app_layer_weight double precision DEFAULT 1.0,
  p_children_per_parent integer DEFAULT 3
)
RETURNS TABLE(
  out_chunk_id bigint, out_content text, out_similarity double precision, out_metadata jsonb,
  out_layer text, out_source_file_id uuid, out_matched_concepts text[], out_rank_score double precision,
  out_match_source text, out_filter_applied boolean, out_file_storage_path text, out_file_storage_bucket text,
  out_file_original_filename text, out_file_mime_type text, out_file_total_pages integer,
  out_file_max_similarity double precision, out_file_chunk_count integer, out_hierarchy_level integer,
  out_parent_chunk_id bigint, out_retrieval_role text, out_section_title text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    k_rrf CONSTANT INTEGER := 60;
    intersection_boost CONSTANT DOUBLE PRECISION := 1.5;
    v_has_filters BOOLEAN;
    v_pool INTEGER := GREATEST(match_count * 4, 8);
BEGIN
    v_has_filters := (filter_file_ids IS NOT NULL AND array_length(filter_file_ids, 1) > 0)
                  OR (filter_filenames IS NOT NULL AND array_length(filter_filenames, 1) > 0);

    RETURN QUERY
    WITH
    -- ÉTAPE 1 : recherche vectorielle (pool ×4)
    vector_matches AS (
        SELECT d.id AS did, d.content AS dcontent, d.metadata AS dmeta, d.layer AS dlayer,
               d.source_file_id AS dfile_id, d.hierarchy_level AS dhier, d.parent_chunk_id AS dparent,
               (1 - (d.embedding <=> query_embedding)) AS dsim,
               ROW_NUMBER() OVER (ORDER BY d.embedding <=> query_embedding) AS drn
        FROM rag.documents d
        LEFT JOIN sources.files f ON f.id = d.source_file_id
        WHERE d.status = 'approved'
          AND d.embedding IS NOT NULL
          AND d.target_apps @> ARRAY[p_app_id]
          AND (p_hierarchy_levels IS NULL OR d.hierarchy_level = ANY(p_hierarchy_levels))
          AND (
              (include_app_layer AND d.layer = 'app')
              OR (include_org_layer AND d.layer = 'org' AND d.org_id = p_org_id)
              OR (include_project_layer AND d.layer = 'project' AND p_project_id = ANY(d.target_projects))
              OR (include_user_layer AND d.layer = 'user' AND d.created_by = p_user_id)
          )
          AND (filter_source_types IS NULL OR d.metadata->>'source_type' = ANY(filter_source_types))
          AND (1 - (d.embedding <=> query_embedding)) >= similarity_threshold
          AND (
              NOT v_has_filters
              OR (
                  (filter_file_ids IS NULL OR array_length(filter_file_ids, 1) IS NULL OR d.source_file_id = ANY(filter_file_ids))
                  AND
                  (filter_filenames IS NULL OR array_length(filter_filenames, 1) IS NULL
                   OR EXISTS (SELECT 1 FROM unnest(filter_filenames) fn
                              WHERE LOWER(f.original_filename) LIKE '%' || LOWER(fn) || '%'))
              )
          )
        ORDER BY d.embedding <=> query_embedding
        LIMIT v_pool
    ),

    -- ÉTAPE 2 : full-text (pool ×4) — query_text arrive déjà OR-isée depuis l'Edge Function
    fulltext_matches AS (
        SELECT d.id AS did, d.content AS dcontent, d.metadata AS dmeta, d.layer AS dlayer,
               d.source_file_id AS dfile_id, d.hierarchy_level AS dhier, d.parent_chunk_id AS dparent,
               ts_rank_cd(d.fts, websearch_to_tsquery('french', query_text)) AS dsim,
               ROW_NUMBER() OVER (ORDER BY ts_rank_cd(d.fts, websearch_to_tsquery('french', query_text)) DESC) AS drn
        FROM rag.documents d
        LEFT JOIN sources.files f ON f.id = d.source_file_id
        WHERE d.status = 'approved'
          AND d.fts IS NOT NULL
          AND query_text IS NOT NULL AND query_text <> '' AND length(query_text) > 2
          AND d.fts @@ websearch_to_tsquery('french', query_text)
          AND d.target_apps @> ARRAY[p_app_id]
          AND (p_hierarchy_levels IS NULL OR d.hierarchy_level = ANY(p_hierarchy_levels))
          AND (
              (include_app_layer AND d.layer = 'app')
              OR (include_org_layer AND d.layer = 'org' AND d.org_id = p_org_id)
              OR (include_project_layer AND d.layer = 'project' AND p_project_id = ANY(d.target_projects))
              OR (include_user_layer AND d.layer = 'user' AND d.created_by = p_user_id)
          )
          AND (filter_source_types IS NULL OR d.metadata->>'source_type' = ANY(filter_source_types))
          AND (
              NOT v_has_filters
              OR (
                  (filter_file_ids IS NULL OR array_length(filter_file_ids, 1) IS NULL OR d.source_file_id = ANY(filter_file_ids))
                  AND
                  (filter_filenames IS NULL OR array_length(filter_filenames, 1) IS NULL
                   OR EXISTS (SELECT 1 FROM unnest(filter_filenames) fn
                              WHERE LOWER(f.original_filename) LIKE '%' || LOWER(fn) || '%'))
              )
          )
        ORDER BY ts_rank_cd(d.fts, websearch_to_tsquery('french', query_text)) DESC
        LIMIT v_pool
    ),

    -- ÉTAPES 3-5 : concepts + GraphRAG (identiques à v14)
    chunk_concepts AS (
        SELECT DISTINCT c.id AS cid, c.slug AS cslug, c.parent_id AS cparent,
               COUNT(*) OVER (PARTITION BY c.id) AS chunk_count_with_concept
        FROM vector_matches vm
        JOIN rag.document_concepts dc ON dc.document_id = vm.did
        JOIN config.concepts c ON c.id = dc.concept_id
        WHERE enable_concept_expansion AND c.status = 'active' AND c.target_apps @> ARRAY[p_app_id]
        ORDER BY chunk_count_with_concept DESC
        LIMIT max_concepts_for_expansion
    ),
    expanded_concepts AS (
        SELECT cid, cslug FROM chunk_concepts
        UNION
        SELECT ch.id AS cid, ch.slug AS cslug
        FROM chunk_concepts cc
        JOIN config.concepts ch ON ch.parent_id = cc.cid
        WHERE cc.cparent IS NULL AND ch.status = 'active' AND ch.target_apps @> ARRAY[p_app_id]
    ),
    graphrag_matches AS (
        SELECT d.id AS did, d.content AS dcontent, d.metadata AS dmeta, d.layer AS dlayer,
               d.source_file_id AS dfile_id, d.hierarchy_level AS dhier, d.parent_chunk_id AS dparent,
               (COUNT(DISTINCT ec.cid)::double precision / GREATEST(1, (SELECT COUNT(*) FROM expanded_concepts))) AS dsim,
               ROW_NUMBER() OVER (ORDER BY COUNT(DISTINCT ec.cid) DESC) AS drn
        FROM rag.documents d
        JOIN rag.document_concepts dc ON dc.document_id = d.id
        JOIN expanded_concepts ec ON ec.cid = dc.concept_id
        LEFT JOIN sources.files f ON f.id = d.source_file_id
        WHERE enable_concept_expansion
          AND EXISTS (SELECT 1 FROM expanded_concepts)
          AND d.status = 'approved'
          AND d.target_apps @> ARRAY[p_app_id]
          AND d.id NOT IN (SELECT did FROM vector_matches)
          AND (p_hierarchy_levels IS NULL OR d.hierarchy_level = ANY(p_hierarchy_levels))
          AND (
              (include_app_layer AND d.layer = 'app')
              OR (include_org_layer AND d.layer = 'org' AND d.org_id = p_org_id)
              OR (include_project_layer AND d.layer = 'project' AND p_project_id = ANY(d.target_projects))
              OR (include_user_layer AND d.layer = 'user' AND d.created_by = p_user_id)
          )
          AND (filter_source_types IS NULL OR d.metadata->>'source_type' = ANY(filter_source_types))
          AND (
              NOT v_has_filters
              OR (
                  (filter_file_ids IS NULL OR array_length(filter_file_ids, 1) IS NULL OR d.source_file_id = ANY(filter_file_ids))
                  AND
                  (filter_filenames IS NULL OR array_length(filter_filenames, 1) IS NULL
                   OR EXISTS (SELECT 1 FROM unnest(filter_filenames) fn
                              WHERE LOWER(f.original_filename) LIKE '%' || LOWER(fn) || '%'))
              )
          )
        GROUP BY d.id, d.content, d.metadata, d.layer, d.source_file_id, d.hierarchy_level, d.parent_chunk_id
        HAVING COUNT(DISTINCT ec.cid) >= 1
        LIMIT match_count
    ),

    -- ÉTAPE 6 : fusion avec détection d'intersection (identique à v14)
    vector_ids AS (SELECT did FROM vector_matches),
    fulltext_ids AS (SELECT did FROM fulltext_matches),
    primary_matches AS (
        SELECT did, dcontent, dmeta, dlayer, dfile_id, dhier, dparent, dsim, drn,
               CASE WHEN EXISTS (SELECT 1 FROM fulltext_ids fi WHERE fi.did = vm.did)
                    THEN 'intersection'::text ELSE 'vector'::text END AS msrc,
               'primary'::text AS mrole
        FROM vector_matches vm
        UNION ALL
        SELECT f.did, f.dcontent, f.dmeta, f.dlayer, f.dfile_id, f.dhier, f.dparent, f.dsim, f.drn,
               'fulltext'::text, 'primary'::text
        FROM fulltext_matches f
        WHERE NOT EXISTS (SELECT 1 FROM vector_ids v WHERE v.did = f.did)
        UNION ALL
        SELECT g.did, g.dcontent, g.dmeta, g.dlayer, g.dfile_id, g.dhier, g.dparent, g.dsim, g.drn,
               'graphrag'::text, 'primary'::text
        FROM graphrag_matches g
        WHERE NOT EXISTS (SELECT 1 FROM vector_ids v WHERE v.did = g.did)
          AND NOT EXISTS (SELECT 1 FROM fulltext_ids ft WHERE ft.did = g.did)
    ),

    -- ÉTAPE 7 : enfants L1 des L0 primaires (identique à v14)
    children_matches AS (
        SELECT d.id AS did, d.content AS dcontent, d.metadata AS dmeta, d.layer AS dlayer,
               d.source_file_id AS dfile_id, d.hierarchy_level AS dhier, d.parent_chunk_id AS dparent,
               pm.dsim AS dsim,
               (ROW_NUMBER() OVER (PARTITION BY pm.did ORDER BY d.id))::bigint + 1000 AS drn,
               'child'::text AS msrc, 'child'::text AS mrole
        FROM primary_matches pm
        JOIN rag.documents d ON d.parent_chunk_id = pm.did
        WHERE p_include_children = true
          AND pm.dhier = 0
          AND d.hierarchy_level = 1
          AND d.status = 'approved'
          AND NOT EXISTS (SELECT 1 FROM primary_matches pm2 WHERE pm2.did = d.id)
    ),
    all_matches AS (
        SELECT * FROM primary_matches
        UNION ALL
        SELECT * FROM children_matches
    ),

    -- ÉTAPE 9 (v15) : RRF avec boost d'intersection ET pondération de couche
    aggregated AS (
        SELECT am.did, am.dcontent, am.dmeta, am.dlayer, am.dfile_id, am.dhier, am.dparent,
               MAX(am.dsim) AS best_sim,
               SUM(
                   (1.0 / (k_rrf + am.drn))
                   * CASE WHEN am.msrc = 'intersection' THEN intersection_boost ELSE 1.0 END
               ) * CASE WHEN am.dlayer = 'app' THEN p_app_layer_weight ELSE 1.0 END AS rrf,
               (ARRAY_AGG(am.msrc ORDER BY
                   CASE am.msrc WHEN 'intersection' THEN 0 WHEN 'vector' THEN 1
                                WHEN 'fulltext' THEN 2 WHEN 'graphrag' THEN 3 WHEN 'child' THEN 4 END
               ))[1] AS psrc,
               (ARRAY_AGG(am.mrole ORDER BY am.dsim DESC))[1] AS prole
        FROM all_matches am
        GROUP BY am.did, am.dcontent, am.dmeta, am.dlayer, am.dfile_id, am.dhier, am.dparent
    ),

    -- ÉTAPES 10-12 : concepts liés, agrégation fichier, métadonnées (identiques à v14)
    with_concepts AS (
        SELECT a.*,
               COALESCE((SELECT ARRAY_AGG(DISTINCT c2.slug)
                         FROM rag.document_concepts dc2
                         JOIN config.concepts c2 ON c2.id = dc2.concept_id
                         WHERE dc2.document_id = a.did), ARRAY[]::text[]) AS dconcepts
        FROM aggregated a
    ),
    file_aggregation AS (
        SELECT wc.dfile_id, MAX(wc.best_sim) AS file_max_sim, COUNT(*)::integer AS file_chunk_count
        FROM with_concepts wc
        WHERE wc.dfile_id IS NOT NULL
        GROUP BY wc.dfile_id
    ),
    final_result AS (
        SELECT wc.did, wc.dcontent, wc.best_sim, wc.dmeta, wc.dlayer, wc.dfile_id, wc.dhier, wc.dparent,
               wc.dconcepts, wc.rrf, wc.psrc, wc.prole,
               v_has_filters AS filter_applied,
               f.storage_path AS file_storage_path,
               f.storage_bucket AS file_storage_bucket,
               COALESCE(f.display_name, f.original_filename, wc.dmeta->>'filename') AS file_original_filename,
               f.mime_type AS file_mime_type,
               COALESCE(f.total_pages, (wc.dmeta->>'total_pages')::integer, 1) AS file_total_pages,
               fa.file_max_sim, fa.file_chunk_count,
               COALESCE(wc.dmeta->>'section_title',
                        wc.dmeta->'enrichment'->'hierarchy'->>'section_title',
                        wc.dmeta->'enrichment'->'hierarchy'->>'section_number', NULL) AS section_title
        FROM with_concepts wc
        LEFT JOIN sources.files f ON f.id = wc.dfile_id
        LEFT JOIN file_aggregation fa ON fa.dfile_id = wc.dfile_id
    ),

    -- ÉTAPE 13 (v15) : primaires limités, puis enfants des primaires retenus EN PLUS
    ranked_primary AS (
        SELECT fr.*, 0 AS ord
        FROM final_result fr
        WHERE fr.prole = 'primary'
        ORDER BY fr.rrf DESC
        LIMIT match_count
    ),
    ranked_children AS (
        SELECT fr.*, 1 AS ord,
               ROW_NUMBER() OVER (PARTITION BY fr.dparent ORDER BY fr.rrf DESC) AS rn_in_parent
        FROM final_result fr
        WHERE fr.prole = 'child'
          AND fr.dparent IN (SELECT rp.did FROM ranked_primary rp)
    ),
    selected AS (
        SELECT did, dcontent, best_sim, dmeta, dlayer, dfile_id, dhier, dparent, dconcepts, rrf, psrc, prole,
               filter_applied, file_storage_path, file_storage_bucket, file_original_filename, file_mime_type,
               file_total_pages, file_max_sim, file_chunk_count, section_title, ord
        FROM ranked_primary
        UNION ALL
        (SELECT did, dcontent, best_sim, dmeta, dlayer, dfile_id, dhier, dparent, dconcepts, rrf, psrc, prole,
                filter_applied, file_storage_path, file_storage_bucket, file_original_filename, file_mime_type,
                file_total_pages, file_max_sim, file_chunk_count, section_title, ord
         FROM ranked_children
         WHERE rn_in_parent <= p_children_per_parent
         ORDER BY rrf DESC
         LIMIT match_count)
    )
    SELECT
        s.did::bigint, s.dcontent::text, s.best_sim::double precision, s.dmeta::jsonb, s.dlayer::text,
        s.dfile_id::uuid, s.dconcepts::text[], s.rrf::double precision, s.psrc::text, s.filter_applied::boolean,
        s.file_storage_path::text, s.file_storage_bucket::text, s.file_original_filename::text, s.file_mime_type::text,
        s.file_total_pages::integer, s.file_max_sim::double precision, s.file_chunk_count::integer,
        s.dhier::integer, s.dparent::bigint, s.prole::text, s.section_title::text
    FROM selected s
    ORDER BY s.ord, s.rrf DESC;
END;
$function$;

COMMENT ON FUNCTION rag.match_documents_v15 IS
  'Sprint 1 RAG : v14 + pool ×4, pondération couche app (p_app_layer_weight), enfants L1 retournés en plus des match_count primaires (p_children_per_parent).';

GRANT EXECUTE ON FUNCTION rag.match_documents_v15 TO service_role;
