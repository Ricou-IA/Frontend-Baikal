-- Bascule des modèles de génération d'ARPET sur gemini-3.8-flash (décision d'Eric du 2026-09-27).
-- Gemini 2.5 est coupé par Google à partir du 16/10/2026. Campagnes du 27/09 contre
-- baseline-v2.4.0-bessieres : génération sur extraits réel 31 → 32/35, synthétique 47 → 50/60,
-- fidélité 0,666 → 0,704 (réel) et 0,704 → 0,727 (synthétique), aucune boucle de répétition,
-- coût ~0,008 $/question (contre ~0,002 $), tarif garanti jusqu'au 31/12/2026.
-- Réglages de réflexion portés par baikal-retrieval v2.5.0 (generation/gemini-thinking.ts).
--
-- Rollback :
--   UPDATE config.agent_prompts SET parameters = jsonb_set(jsonb_set(jsonb_set(jsonb_set(parameters,
--     '{generation,llm_model}', '"gpt-4o-mini"'), '{generation,gemini_model}', '"gemini-2.5-flash-lite"'),
--     '{generation,intent_overrides,comparison,gemini_model}', '"gemini-2.5-pro"'), '{agentic,model}', '"gemini-2.5-flash"')
--   WHERE agent_type = 'librarian_v3' AND app_id = 'arpet' AND is_active;
UPDATE config.agent_prompts
SET parameters = jsonb_set(jsonb_set(jsonb_set(jsonb_set(parameters,
      '{generation,llm_model}', '"gemini-3.8-flash"'),
      '{generation,gemini_model}', '"gemini-3.8-flash"'),
      '{generation,intent_overrides,comparison,gemini_model}', '"gemini-3.8-flash"'),
      '{agentic,model}', '"gemini-3.8-flash"')
WHERE agent_type = 'librarian_v3' AND app_id = 'arpet' AND is_active;
-- attendu : 1 ligne
