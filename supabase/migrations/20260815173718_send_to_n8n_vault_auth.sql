-- Fix : send_to_n8n envoyait 'Bearer ' vide (current_setting('supabase.service_role_key') n'existe pas).
-- Lit desormais la cle anon depuis le Vault (comme les autres crons du projet).
-- La cle anon est un JWT valide : suffisant pour passer verify_jwt sur trigger-ingestion,
-- qui utilise en interne sa propre service key d'environnement.
-- Appliquee en prod le 2026-08-15 via MCP (miroir repo de la migration remote 20260815173718).
CREATE OR REPLACE FUNCTION sources.send_to_n8n(p_queue_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'sources', 'extensions'
AS $function$
DECLARE
    v_file RECORD;
    v_queue RECORD;
    v_payload JSONB;
    v_supabase_url TEXT := 'https://odspcxgafcqxjzrarsqf.supabase.co';
    v_auth_key TEXT;
BEGIN
    SELECT * INTO v_queue
    FROM sources.ingestion_queue
    WHERE id = p_queue_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Queue job not found: %', p_queue_id;
    END IF;

    SELECT * INTO v_file
    FROM sources.files
    WHERE id = v_queue.file_id;

    IF NOT FOUND THEN
        UPDATE sources.ingestion_queue
        SET status = 'failed',
            error_message = 'Source file not found',
            last_attempt_at = NOW()
        WHERE id = p_queue_id;
        RETURN;
    END IF;

    v_payload := jsonb_build_object(
        'queue_id', p_queue_id,
        'file_id', v_file.id,
        'filename', v_file.original_filename,
        'storage_bucket', v_file.storage_bucket,
        'storage_path', v_file.storage_path,
        'mime_type', v_file.mime_type,
        'layer', v_file.layer,
        'org_id', v_file.org_id,
        'project_id', v_file.project_id,
        'created_by', v_file.created_by,
        'app_id', COALESCE(v_file.app_id, 'arpet'),
        'metadata', v_file.metadata
    );

    -- Vault d'abord (cle anon = JWT valide), fallback sur l'ancien mecanisme
    v_auth_key := COALESCE(
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_anon_key' LIMIT 1),
        current_setting('supabase.service_role_key', true),
        ''
    );

    PERFORM net.http_post(
        url := v_supabase_url || '/functions/v1/trigger-ingestion',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_auth_key
        ),
        body := v_payload,
        timeout_milliseconds := 30000
    );

    UPDATE sources.ingestion_queue
    SET attempts = attempts + 1,
        last_attempt_at = NOW()
    WHERE id = p_queue_id;

EXCEPTION WHEN OTHERS THEN
    UPDATE sources.ingestion_queue
    SET attempts = attempts + 1,
        last_attempt_at = NOW(),
        error_message = SQLERRM,
        status = 'failed'::sources.ingestion_queue_status,
        next_retry_at = CASE
            WHEN attempts + 1 < max_attempts THEN
                NOW() + (POWER(5, attempts + 1) || ' minutes')::INTERVAL
            ELSE NULL
        END
    WHERE id = p_queue_id;
END;
$function$;
