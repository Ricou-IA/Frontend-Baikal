-- Sprint 4 (S4.1/S4.2) : rattachement des sous-sections produites par FLUX 3 v5.1.0 dont le parent est un L1.
-- Fait établi le 2026-09-24 : le chunking v5.1.0 émet parfois des sous-sections (`batch_N_chunk_X_Y_Z`) dont le
-- `parent_local_id` désigne un chunk L1 (et non un L0) ; certaines sont étiquetées niveau 2 ou 3 (RICT : 10 L2,
-- CCAG : 6 L2 + 3 L3), d'autres niveau 1 (PGC : 5). `rag.resolve_chunk_hierarchy` ne lie que L1 → L0 : ces
-- chunks restent sans `parent_chunk_id`, et les niveaux ≥ 2 sont invisibles pour `match_documents_v15`
-- (niveaux [0], [1] ou [0,1]).
-- Correction (données seulement, pipeline inchangé) : chaque chunk approuvé v5 (chunk_local_id renseigné) sans
-- parent, dont le parent_local_id désigne un chunk L1 approuvé du même fichier qui a lui-même un parent L0, est
-- rattaché à ce L0 (grand-parent) et ramené au niveau 1 s'il était ≥ 2. Deux passes identiques : la seconde
-- traite les niveaux 3 dont le parent (ex-niveau 2) vient d'être ramené au niveau 1 avec un parent.
-- Le niveau d'origine reste lisible dans metadata.enrichment.hierarchy.level et metadata.sprint4.niveau_avant.
-- Rollback : UPDATE rag.documents SET parent_chunk_id = NULL,
--            hierarchy_level = (metadata->'sprint4'->>'niveau_avant')::int, metadata = metadata - 'sprint4'
--            WHERE metadata->'sprint4'->>'rattachement' = 'grand-parent-l0';

-- Passe 1
WITH cibles AS (
  SELECT c.id AS child_id, p.parent_chunk_id AS grandparent_id
  FROM rag.documents c
  JOIN rag.documents p
    ON p.source_file_id = c.source_file_id
   AND p.status = 'approved'
   AND p.hierarchy_level = 1
   AND p.parent_chunk_id IS NOT NULL
   AND p.metadata->>'chunk_local_id' = c.metadata->'enrichment'->'hierarchy'->>'parent_local_id'
  WHERE c.status = 'approved'
    AND c.chunk_local_id IS NOT NULL
    AND c.parent_chunk_id IS NULL
    AND c.hierarchy_level >= 1
)
UPDATE rag.documents d
SET parent_chunk_id = cibles.grandparent_id,
    hierarchy_level = 1,
    metadata = d.metadata || jsonb_build_object('sprint4', jsonb_build_object(
                 'rattachement', 'grand-parent-l0',
                 'niveau_avant', d.hierarchy_level,
                 'le', now()))
FROM cibles
WHERE d.id = cibles.child_id;

-- Passe 2 (niveaux 3 : leur parent vient d'être ramené au niveau 1)
WITH cibles AS (
  SELECT c.id AS child_id, p.parent_chunk_id AS grandparent_id
  FROM rag.documents c
  JOIN rag.documents p
    ON p.source_file_id = c.source_file_id
   AND p.status = 'approved'
   AND p.hierarchy_level = 1
   AND p.parent_chunk_id IS NOT NULL
   AND p.metadata->>'chunk_local_id' = c.metadata->'enrichment'->'hierarchy'->>'parent_local_id'
  WHERE c.status = 'approved'
    AND c.chunk_local_id IS NOT NULL
    AND c.parent_chunk_id IS NULL
    AND c.hierarchy_level >= 1
)
UPDATE rag.documents d
SET parent_chunk_id = cibles.grandparent_id,
    hierarchy_level = 1,
    metadata = d.metadata || jsonb_build_object('sprint4', jsonb_build_object(
                 'rattachement', 'grand-parent-l0',
                 'niveau_avant', d.hierarchy_level,
                 'le', now()))
FROM cibles
WHERE d.id = cibles.child_id;
-- attendu au 2026-09-24 : 24 lignes (RICT 10 L2, PGC 5 L1, CCAG 6 L2 + 3 L3), à vérifier par
-- SELECT count(*) FROM rag.documents WHERE metadata->'sprint4'->>'rattachement' = 'grand-parent-l0';
