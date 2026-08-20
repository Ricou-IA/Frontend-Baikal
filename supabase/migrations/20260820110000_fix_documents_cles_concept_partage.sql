--- ---------------------------------------------------------------------------
--- Corrige config.create_documents_cles_concept (trigger
--- tr_create_documents_cles_on_app_insert sur config.apps, AFTER INSERT
--- WHEN new.is_active).
---
--- Bug constate le 20/08/2026 : le test d'existence exigeait que l'app soit
--- deja dans target_apps (NEW.id = ANY(c.target_apps)). Quand le concept
--- racine 'documents_cles' existe mais sans l'app, la fonction partait dans
--- la branche INSERT et violait concepts_slug_unique (UNIQUE(slug) global).
--- Toute deuxieme app active inseree echouait ('monsieurdpe', 'pack-vendeur').
---
--- Intention du RAG conservee : UN SEUL concept racine 'documents_cles',
--- partage entre les apps via target_apps (c'est ce que fait deja la branche
--- ELSE de l'ancienne fonction). On ne cree donc PAS un slug par app : le
--- boost/la detection resolvent le concept par slug puis filtrent par
--- target_apps. La reecriture en upsert rend l'operation atomique et sure
--- face aux insertions concurrentes.
--- ---------------------------------------------------------------------------

create or replace function config.create_documents_cles_concept()
returns trigger
language plpgsql
security definer
set search_path to 'config', 'public'
as $function$
BEGIN
    -- Un seul concept racine 'documents_cles', partage : on le cree s'il
    -- n'existe pas, sinon on ajoute l'app a target_apps (sans doublon).
    INSERT INTO config.concepts (
        slug,
        label,
        description,
        parent_id,
        status,
        target_apps,
        created_at,
        updated_at
    ) VALUES (
        'documents_cles',
        'Documents Métier Clés',
        'Catégorie regroupant les documents réglementaires et contractuels clés du métier. Utilisée pour la détection automatique et le boost dans le RAG.',
        NULL,  -- Concept racine (pas de parent)
        'active',
        ARRAY[NEW.id],
        NOW(),
        NOW()
    )
    ON CONFLICT ON CONSTRAINT concepts_slug_unique DO UPDATE
    SET target_apps = ARRAY(
            SELECT DISTINCT unnest(config.concepts.target_apps || ARRAY[NEW.id])
        ),
        updated_at  = NOW();

    RAISE NOTICE '[config.create_documents_cles_concept] App % rattachée au concept "documents_cles"', NEW.id;

    RETURN NEW;
END;
$function$;

--- Rattrapage : 'monsieurdpe' et 'pack-vendeur' ont ete inseres le 20/08/2026
--- avec is_active=false puis actives par UPDATE pour contourner le bug ; le
--- trigger AFTER INSERT ne les a donc jamais rattaches au concept.
update config.concepts
set target_apps = array(
        select distinct unnest(target_apps || array['monsieurdpe', 'pack-vendeur'])
    ),
    updated_at  = now()
where slug = 'documents_cles'
  and parent_id is null;
