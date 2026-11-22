-- ---------------------------------------------------------------------------
-- « Tester mon site » : le compte qui ouvre son site reçoit aussi Comptes.
--
-- Le prompt d'onboarding fait publier, si l'app a des comptes, les vues
-- baikal_comptes_pro et baikal_compte_historique (contrats optionnels, spec
-- docs/superpowers/specs/2026-11-23-onboarding-modules-optionnels-design.md).
-- Sans le droit comptes_pro, le fondateur ne verrait pas l'onglet. Il le reçoit
-- toujours, en lecture : sans la vue, l'écran dit « module non disponible ».
--
-- Seul le droit accordé change (§4 de 20261116110000_ouvrir_mon_site.sql).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION admin.ouvrir_site(p_jeton text, p_user_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  r         admin.tests_site%ROWTYPE;
  v_secret  uuid;
  v_schema  text;
  v_nom     text;
  v_base    text;
  v_id      text;
  v_n       int := 1;
BEGIN
  SELECT * INTO r FROM admin.tests_site t WHERE t.jeton = p_jeton FOR UPDATE;
  IF NOT FOUND OR r.expire_le <= now() THEN
    RAISE EXCEPTION 'OUVERTURE: Ce lien a expiré ou n''existe pas. Relancez un test.';
  END IF;
  IF r.ouvert_le IS NOT NULL THEN
    RAISE EXCEPTION 'OUVERTURE: Ce site est déjà ouvert dans Baikal : connectez-vous à la console.';
  END IF;
  IF r.niveau1_pret IS NOT TRUE OR NOT r.connexion_gardee THEN
    RAISE EXCEPTION 'OUVERTURE: Le test de ce site n''est pas encore passé.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'compte inconnu';
  END IF;

  SELECT s.id INTO v_secret FROM vault.secrets s WHERE s.name = 'test_ro_dsn_' || p_jeton;
  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'OUVERTURE: Baikal n''a plus la connexion de ce site : relancez le test depuis le prompt.';
  END IF;

  -- Le schéma où le site publie ses vues : celui que le test a trouvé.
  v_schema := r.diagnostic ->> 'schema_contrat';
  IF v_schema IS NULL OR v_schema !~ '^[a-z_][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'OUVERTURE: Le test n''a pas trouvé le schéma de vos vues : relancez-le.';
  END IF;

  -- Un domaine déjà au registre n'est pas ouvert une seconde fois : deux sites
  -- du même nom dans la console, dont un tenu par un inconnu, seraient un piège.
  IF r.site IS NOT NULL AND EXISTS (SELECT 1 FROM config.apps a WHERE lower(a.domaine) = lower(r.site)) THEN
    RAISE EXCEPTION 'OUVERTURE: Ce site est déjà dans Baikal. Écrivez-nous pour y avoir accès.';
  END IF;

  -- L'identifiant : le domaine sans son extension (conseil-solaire.fr ->
  -- conseil-solaire), suffixé s'il est pris.
  v_nom  := coalesce(r.site, 'Site ' || left(p_jeton, 8));
  v_base := trim(both '-' from regexp_replace(
              regexp_replace(lower(coalesce(r.site, 'site-' || left(p_jeton, 8))), '\.[a-z]{2,}$', ''),
              '[^a-z0-9]+', '-', 'g'));
  IF v_base = '' THEN v_base := 'site-' || left(p_jeton, 8); END IF;
  v_id := v_base;
  WHILE EXISTS (SELECT 1 FROM config.apps a WHERE a.id = v_id) LOOP
    v_n  := v_n + 1;
    v_id := v_base || '-' || v_n;
  END LOOP;

  -- Insertion inactive puis activation, comme les sites précédents.
  INSERT INTO config.apps (id, name, description, is_active, sort_order, domaine, db_schema,
                           db_ro_secret_ref, modele_comptes)
  VALUES (v_id, v_nom, 'Ouvert par son fondateur depuis « Tester mon site »', false,
          (SELECT coalesce(max(a.sort_order), 0) + 10 FROM config.apps a),
          r.site, v_schema, 'coffre:' || v_id, 'clients');
  UPDATE config.apps SET is_active = true, updated_at = now() WHERE id = v_id;

  -- La connexion gardée devient celle du site.
  PERFORM vault.update_secret(
    secret_id       := v_secret,
    new_name        := 'site_ro_dsn_' || v_id,
    new_description := 'Connexion baikal_reader du site ' || v_id || ' (ouvert depuis /tester)');

  -- L'accès : ce site, les chapitres Clients et Comptes, en lecture. Les autres
  -- chapitres dépendent de clés que le fondateur n'a pas encore confiées.
  INSERT INTO admin.droits_sites (user_id, app_id, cree_par, modules)
  VALUES (p_user_id, v_id, p_user_id, '{"clients": "lecture", "comptes_pro": "lecture"}'::jsonb)
  ON CONFLICT (user_id, app_id) DO NOTHING;

  UPDATE admin.tests_site SET ouvert_le = now(), app_id = v_id WHERE jeton = p_jeton;
  RETURN v_id;
END
$$;

REVOKE ALL ON FUNCTION admin.ouvrir_site(text, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin.ouvrir_site(text, uuid) TO service_role;

-- Les sites déjà ouverts par ce chemin : le compte qui les a ouverts reçoit
-- Comptes en lecture, s'il ne l'a pas déjà. Rejouable.
UPDATE admin.droits_sites d
SET modules = d.modules || '{"comptes_pro": "lecture"}'::jsonb
FROM admin.tests_site t
WHERE t.app_id = d.app_id
  AND t.ouvert_le IS NOT NULL
  AND d.user_id = d.cree_par
  AND NOT d.modules ? 'comptes_pro';
