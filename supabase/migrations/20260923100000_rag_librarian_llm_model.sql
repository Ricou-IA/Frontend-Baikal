-- ============================================================================
-- Sprint 3 (S3.1/S3.2) — Modèle de génération sur extraits de baikal-retrieval
-- ============================================================================
-- parameters.generation.llm_model est lu depuis v2.3.0 (repli gpt-4o-mini).
-- Valeur retenue sur les chiffres des campagnes s3-v2.3.0-* (spec ARPET §7.5) :
-- gpt-4o-mini reste — gpt-4.1-mini hors budget de latence (p50 réel 6,0 s),
-- gemini-2.5-flash à parité de critères mais 3 % de réponses tronquées par
-- boucle de répétition et coût ×3. Le paramètre est posé explicitement pour
-- que la décision soit tracée et la bascule future une ligne.
-- ============================================================================
UPDATE config.agent_prompts
SET parameters = jsonb_set(parameters, '{generation,llm_model}', to_jsonb('gpt-4o-mini'::text), true),
    updated_at = now()
WHERE agent_type = 'librarian_v3' AND app_id = 'arpet' AND org_id IS NULL AND is_active;
