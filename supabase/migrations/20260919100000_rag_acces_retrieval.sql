-- ============================================================================
-- Sprint 2 (T2) — Contrôle d'accès de baikal-retrieval
-- ============================================================================
-- 1. rag.resolve_access : même prédicat que la RLS SELECT de core.projects.
-- 2. rag.get_agent_context (surcharge avec p_conversation_id) : une conversation
--    fournie n'est reprise que si elle appartient à l'utilisateur.
-- 3. Toutes les fonctions du schéma rag (hors fonctions trigger), appelées uniquement
--    par des Edge Functions en service_role, ne sont plus exécutables par anon /
--    authenticated (le schéma rag est exposé par PostgREST) : seules delete_conversation
--    et close_conversation, appelées avec un jeton utilisateur par ARPET, restent ouvertes.
--    La boucle sur le catalogue s'entretient d'elle-même quand une fonction est ajoutée.
-- ============================================================================

-- 1. Décision d'accès -------------------------------------------------------
CREATE OR REPLACE FUNCTION rag.resolve_access(
  p_user_id uuid,
  p_project_id uuid DEFAULT NULL,
  p_org_id uuid DEFAULT NULL
)
RETURNS TABLE(allowed boolean, effective_org_id uuid, effective_app_id text, is_super_admin boolean, reason text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile_org uuid;
  v_profile_app text;
  v_super boolean;
  v_project_org uuid;
BEGIN
  SELECT p.org_id, COALESCE(p.app_id, 'arpet') INTO v_profile_org, v_profile_app
  FROM core.profiles p WHERE p.id = p_user_id;
  v_profile_app := COALESCE(v_profile_app, 'arpet');
  v_super := core.rls_is_super_admin(p_user_id);

  IF p_project_id IS NOT NULL THEN
    SELECT pr.org_id INTO v_project_org FROM core.projects pr WHERE pr.id = p_project_id;
    IF NOT FOUND THEN
      RETURN QUERY SELECT false, NULL::uuid, v_profile_app, v_super, 'project_not_found'::text;
      RETURN;
    END IF;
    -- Parité avec la policy projects_select_secure (un projet sans org_id reste accessible à ses membres)
    IF v_super
       OR (core.rls_is_org_admin(p_user_id) AND v_project_org IS NOT NULL AND v_project_org = v_profile_org)
       OR p_project_id = ANY(core.rls_get_user_project_ids(p_user_id)) THEN
      RETURN QUERY SELECT true, v_project_org, v_profile_app, v_super, 'project_member'::text;
      RETURN;
    END IF;
    RETURN QUERY SELECT false, NULL::uuid, v_profile_app, v_super, 'not_project_member'::text;
    RETURN;
  END IF;

  IF p_org_id IS NOT NULL THEN
    -- Parité avec la policy org_members_select_own_org
    IF v_super OR p_org_id = v_profile_org THEN
      RETURN QUERY SELECT true, p_org_id, v_profile_app, v_super, 'org_member'::text;
      RETURN;
    END IF;
    RETURN QUERY SELECT false, NULL::uuid, v_profile_app, v_super, 'not_org_member'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_profile_org, v_profile_app, v_super, 'no_scope'::text;
END;
$$;

-- 2. get_agent_context : conversation fournie → doit appartenir à l'utilisateur
CREATE OR REPLACE FUNCTION rag.get_agent_context(
  p_user_id uuid,
  p_org_id uuid DEFAULT NULL::uuid,
  p_project_id uuid DEFAULT NULL::uuid,
  p_app_id text DEFAULT NULL::text,
  p_agent_type text DEFAULT 'librarian'::text,
  p_conversation_id uuid DEFAULT NULL::uuid,
  p_conversation_timeout_minutes integer DEFAULT 30,
  p_context_messages_count integer DEFAULT 4
)
RETURNS TABLE(out_effective_org_id uuid, out_effective_app_id text, out_system_prompt text, out_gemini_system_prompt text, out_parameters jsonb, out_config_source text, out_project_identity jsonb, out_conversation_id uuid, out_conversation_summary text, out_conversation_first_message text, out_recent_messages jsonb, out_message_count integer, out_previous_source_file_ids uuid[], out_documents_cles jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'rag', 'core', 'config', 'public'
AS $function$
DECLARE
    v_effective_org_id uuid;
    v_effective_app_id text;
    v_system_prompt text;
    v_gemini_system_prompt text;
    v_parameters jsonb;
    v_config_source text := 'fallback';
    v_project_identity jsonb;
    v_conversation_id uuid;
    v_conversation_summary text;
    v_conversation_first_message text;
    v_recent_messages jsonb;
    v_message_count int := 0;
    v_previous_source_file_ids uuid[];
    v_documents_cles jsonb;
    v_parent_concept_id uuid;
    v_timeout_threshold timestamptz;
    v_last_assistant_sources jsonb;
BEGIN
    -- 1. RÉSOUDRE PROFILE
    SELECT
        COALESCE(p_org_id, p.org_id),
        COALESCE(p_app_id, p.app_id, 'arpet')
    INTO v_effective_org_id, v_effective_app_id
    FROM core.profiles p
    WHERE p.id = p_user_id;

    IF v_effective_app_id IS NULL THEN
        v_effective_app_id := COALESCE(p_app_id, 'arpet');
    END IF;

    -- 2. RÉCUPÉRER CONFIG AGENT (avec p_agent_type dynamique)
    IF v_effective_org_id IS NOT NULL THEN
        SELECT ap.system_prompt, ap.gemini_system_prompt, ap.parameters, 'org'
        INTO v_system_prompt, v_gemini_system_prompt, v_parameters, v_config_source
        FROM config.agent_prompts ap
        WHERE ap.agent_type = p_agent_type
          AND ap.is_active = true
          AND ap.org_id = v_effective_org_id
        LIMIT 1;
    END IF;

    IF v_system_prompt IS NULL THEN
        SELECT ap.system_prompt, ap.gemini_system_prompt, ap.parameters, 'app'
        INTO v_system_prompt, v_gemini_system_prompt, v_parameters, v_config_source
        FROM config.agent_prompts ap
        WHERE ap.agent_type = p_agent_type
          AND ap.is_active = true
          AND ap.app_id = v_effective_app_id
          AND ap.org_id IS NULL
        LIMIT 1;
    END IF;

    IF v_system_prompt IS NULL THEN
        SELECT ap.system_prompt, ap.gemini_system_prompt, ap.parameters, 'global'
        INTO v_system_prompt, v_gemini_system_prompt, v_parameters, v_config_source
        FROM config.agent_prompts ap
        WHERE ap.agent_type = p_agent_type
          AND ap.is_active = true
          AND ap.app_id IS NULL
          AND ap.org_id IS NULL
        LIMIT 1;
    END IF;

    IF v_parameters IS NULL THEN
        v_parameters := '{}'::jsonb;
        v_config_source := 'fallback';
    END IF;

    -- 3. RÉCUPÉRER IDENTITÉ PROJET
    IF p_project_id IS NOT NULL THEN
        SELECT p.identity
        INTO v_project_identity
        FROM core.projects p
        WHERE p.id = p_project_id;
    END IF;

    -- 4. FIND OR CREATE CONVERSATION
    -- v2.2 (Sprint 2, sécurité) : une conversation fournie n'est reprise que si elle
    -- appartient à l'utilisateur ; sinon elle est ignorée (find-or-create ci-dessous).
    IF p_conversation_id IS NOT NULL THEN
        SELECT c.id, c.summary
        INTO v_conversation_id, v_conversation_summary
        FROM rag.conversations c
        WHERE c.id = p_conversation_id
          AND c.user_id = p_user_id;

        IF v_conversation_id IS NULL
           AND NOT EXISTS (SELECT 1 FROM rag.conversations c WHERE c.id = p_conversation_id) THEN
            INSERT INTO rag.conversations (id, user_id, org_id, project_id, app_id)
            VALUES (p_conversation_id, p_user_id, v_effective_org_id, p_project_id, v_effective_app_id)
            RETURNING id INTO v_conversation_id;
        END IF;
    END IF;

    IF v_conversation_id IS NULL THEN
        v_timeout_threshold := NOW() - (p_conversation_timeout_minutes || ' minutes')::interval;

        SELECT c.id, c.summary
        INTO v_conversation_id, v_conversation_summary
        FROM rag.conversations c
        WHERE c.user_id = p_user_id
          AND c.app_id = v_effective_app_id
          AND (c.org_id = v_effective_org_id OR (c.org_id IS NULL AND v_effective_org_id IS NULL))
          AND (c.project_id = p_project_id OR (c.project_id IS NULL AND p_project_id IS NULL))
          AND c.updated_at > v_timeout_threshold
        ORDER BY c.updated_at DESC
        LIMIT 1;

        IF v_conversation_id IS NULL THEN
            INSERT INTO rag.conversations (user_id, org_id, project_id, app_id)
            VALUES (p_user_id, v_effective_org_id, p_project_id, v_effective_app_id)
            RETURNING id INTO v_conversation_id;
        END IF;
    END IF;

    -- Contexte conversation
    SELECT
        (SELECT content FROM rag.messages WHERE conversation_id = v_conversation_id AND role = 'user' ORDER BY created_at ASC LIMIT 1),
        COUNT(*)::int
    INTO v_conversation_first_message, v_message_count
    FROM rag.messages
    WHERE conversation_id = v_conversation_id;

    SELECT jsonb_agg(
        jsonb_build_object(
            'role', m.role,
            'content', m.content,
            'created_at', m.created_at,
            'sources', m.sources
        ) ORDER BY m.created_at DESC
    )
    INTO v_recent_messages
    FROM (
        SELECT role, content, created_at, sources
        FROM rag.messages
        WHERE conversation_id = v_conversation_id
        ORDER BY created_at DESC
        LIMIT p_context_messages_count
    ) m;

    -- 4b. SOURCE_FILE_ID DU DERNIER MESSAGE ASSISTANT
    SELECT m.sources
    INTO v_last_assistant_sources
    FROM rag.messages m
    WHERE m.conversation_id = v_conversation_id
      AND m.role = 'assistant'
      AND m.sources IS NOT NULL
    ORDER BY m.created_at DESC
    LIMIT 1;

    IF v_last_assistant_sources IS NOT NULL THEN
        WITH parsed_sources AS (
            SELECT
                CASE
                    WHEN jsonb_typeof(v_last_assistant_sources) = 'array' THEN v_last_assistant_sources
                    WHEN jsonb_typeof(v_last_assistant_sources) = 'string' THEN (v_last_assistant_sources #>> '{}')::jsonb
                    ELSE '[]'::jsonb
                END AS sources_array
        ),
        extracted_ids AS (
            SELECT DISTINCT (elem->>'source_file_id')::uuid AS file_id
            FROM parsed_sources ps
            CROSS JOIN LATERAL jsonb_array_elements(ps.sources_array) AS elem
            WHERE elem->>'source_file_id' IS NOT NULL
        )
        SELECT ARRAY_AGG(file_id)
        INTO v_previous_source_file_ids
        FROM extracted_ids;
    END IF;

    -- 5. DOCUMENTS CLÉS
    SELECT c.id
    INTO v_parent_concept_id
    FROM config.concepts c
    WHERE c.slug = 'documents_cles'
      AND c.status = 'active'
      AND v_effective_app_id = ANY(c.target_apps)
    LIMIT 1;

    IF v_parent_concept_id IS NOT NULL THEN
        SELECT jsonb_agg(
            jsonb_build_object('slug', c.slug, 'label', c.label)
        )
        INTO v_documents_cles
        FROM config.concepts c
        WHERE c.parent_id = v_parent_concept_id
          AND c.status = 'active';
    END IF;

    RETURN QUERY SELECT
        v_effective_org_id,
        v_effective_app_id,
        v_system_prompt,
        v_gemini_system_prompt,
        v_parameters,
        v_config_source,
        v_project_identity,
        v_conversation_id,
        v_conversation_summary,
        v_conversation_first_message,
        COALESCE(v_recent_messages, '[]'::jsonb),
        v_message_count,
        COALESCE(v_previous_source_file_ids, ARRAY[]::uuid[]),
        COALESCE(v_documents_cles, '[]'::jsonb);
END;
$function$;

-- 3. Fermeture à anon / authenticated de toutes les fonctions du schéma rag exposé par PostgREST,
--    sauf les deux appelées avec un jeton utilisateur par ARPET, et hors fonctions trigger.
--    Toutes les autres ne sont appelées que par des Edge Functions en service_role.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'rag'
      AND p.prokind = 'f'
      AND p.prorettype <> 'trigger'::regtype
      AND p.proname NOT IN ('delete_conversation', 'close_conversation')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;
