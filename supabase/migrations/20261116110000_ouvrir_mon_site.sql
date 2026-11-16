-- « Ouvrir mon site dans Baikal » : la dernière marche de l'onboarding par
-- l'agent (plan docs/superpowers/plans/2026-11-15-tester-mon-site.md, décision
-- d'Eric du 16/11/2026 : « le vrai chemin »).
--
-- Jusqu'ici, brancher un site sur base dédiée demandait qu'un humain pose sa
-- connexion dans les secrets des Edge Functions, puis inscrive le site au
-- registre par une migration. Un client ne peut pas faire ça, et on ne peut
-- pas le faire pour chacun. Désormais :
--
--   1. l'agent du fondateur lance le test avec `garder: true` ; quand le
--      niveau 1 passe, la connexion du rôle baikal_reader est rangée CHIFFRÉE
--      dans le coffre de la base (Vault), sous le jeton du test ;
--   2. le fondateur ouvre son lien privé et crée son compte ;
--   3. `admin.ouvrir_site` inscrit le site au registre, lui attache la
--      connexion gardée et ouvre le chapitre Clients à ce compte — d'un bloc.
--
-- Ce que la table admin.tests_site ne porte TOUJOURS PAS : la connexion. Elle
-- ne vit que dans le coffre. La table gagne le domaine du site que l'agent
-- déclare brancher, et l'état d'ouverture du lien.
--
-- Les trois fonctions sont SECURITY DEFINER, sans search_path, et réservées au
-- service_role : seule l'Edge Function baikal-test (et _shared/sites.ts pour la
-- lecture) les appelle.

-- ------ 1. La table des tests ------

ALTER TABLE admin.tests_site
  ADD COLUMN IF NOT EXISTS site             text,
  ADD COLUMN IF NOT EXISTS connexion_gardee boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ouvert_le        timestamptz,
  ADD COLUMN IF NOT EXISTS app_id           text REFERENCES config.apps(id) ON DELETE SET NULL;

COMMENT ON COLUMN admin.tests_site.site IS
  'Domaine du site que l''agent déclare brancher (monsaas.fr). Jamais l''hôte de la base.';
COMMENT ON COLUMN admin.tests_site.connexion_gardee IS
  'Vrai quand la connexion du rôle baikal_reader est rangée dans le coffre (Vault), sous le nom test_ro_dsn_<jeton>.';
COMMENT ON COLUMN admin.tests_site.ouvert_le IS
  'Moment où le site a été ouvert dans la console depuis ce lien. Un lien ne s''ouvre qu''une fois.';

COMMENT ON TABLE admin.tests_site IS
  'Résultats des tests publics de /tester (EF baikal-test). Jeton = lien privé, 30 jours. '
  'Jamais la connexion ni l''hôte en clair : une empreinte seulement ; la connexion gardée '
  'pour l''ouverture du site vit dans le coffre (Vault), pas ici.';

-- ------ 2. Garder la connexion d'un test, dans le coffre ------
--
-- Appelée par baikal-test quand un test demandé avec `garder: true` passe le
-- niveau 1. Un test rejoué remplace la connexion gardée ; un site déjà ouvert
-- garde la sienne.

CREATE OR REPLACE FUNCTION admin.garder_connexion_test(p_jeton text, p_dsn text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_nom text;
  v_id  uuid;
BEGIN
  IF p_jeton IS NULL OR p_jeton !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'jeton invalide';
  END IF;
  IF p_dsn IS NULL OR p_dsn !~ '^postgres(ql)?://' OR length(p_dsn) > 2000 THEN
    RAISE EXCEPTION 'connexion invalide';
  END IF;
  IF EXISTS (SELECT 1 FROM admin.tests_site t WHERE t.jeton = p_jeton AND t.ouvert_le IS NOT NULL) THEN
    RAISE EXCEPTION 'site déjà ouvert';
  END IF;

  v_nom := 'test_ro_dsn_' || p_jeton;
  SELECT s.id INTO v_id FROM vault.secrets s WHERE s.name = v_nom;
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(
      p_dsn, v_nom,
      'Connexion baikal_reader gardée par un test de /tester, en attente d''ouverture du site');
  ELSE
    PERFORM vault.update_secret(v_id, p_dsn);
  END IF;
END
$$;

REVOKE ALL ON FUNCTION admin.garder_connexion_test(text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin.garder_connexion_test(text, text) TO service_role;

-- ------ 3. Relire la connexion d'un site ouvert ------
--
-- Un site ouvert par ce chemin porte db_ro_secret_ref = 'coffre:<id>' : le
-- registre dit toujours « base dédiée », et _shared/sites.ts sait que la
-- connexion se lit ici plutôt que dans les secrets des Edge Functions.

CREATE OR REPLACE FUNCTION admin.connexion_site(p_app_id text)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT d.decrypted_secret
  FROM vault.decrypted_secrets d
  WHERE d.name = 'site_ro_dsn_' || p_app_id
$$;

REVOKE ALL ON FUNCTION admin.connexion_site(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin.connexion_site(text) TO service_role;

-- ------ 4. Ouvrir le site : registre, connexion, accès — d'un bloc ------
--
-- Les refus que le fondateur doit lire commencent par « OUVERTURE: » ; l'Edge
-- Function les lui redit tels quels. Tout autre échec annule l'ensemble.

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

  -- L'accès : ce site, le chapitre Clients, en lecture. Les autres chapitres
  -- dépendent de clés que le fondateur n'a pas encore confiées.
  INSERT INTO admin.droits_sites (user_id, app_id, cree_par, modules)
  VALUES (p_user_id, v_id, p_user_id, '{"clients": "lecture"}'::jsonb)
  ON CONFLICT (user_id, app_id) DO NOTHING;

  UPDATE admin.tests_site SET ouvert_le = now(), app_id = v_id WHERE jeton = p_jeton;
  RETURN v_id;
END
$$;

REVOKE ALL ON FUNCTION admin.ouvrir_site(text, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin.ouvrir_site(text, uuid) TO service_role;

-- ------ 5. La purge suit ------
--
-- Une connexion gardée pour un test jamais ouvert ne reste pas plus longtemps
-- que le lien : quand la ligne du test expire (30 jours après son dernier
-- passage), le secret part avec elle. Un secret sans ligne vivante — test
-- expiré, ou ligne jamais écrite — est supprimé après un jour de grâce, le
-- temps qu'un passage en cours écrive sa ligne. Les connexions des sites
-- OUVERTS portent un autre nom (site_ro_dsn_…) et ne sont pas concernées.

SELECT cron.unschedule('admin-tests-site-purge')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'admin-tests-site-purge');

SELECT cron.schedule(
  'admin-tests-site-purge',
  '20 3 * * *',
  $cron$
    DELETE FROM vault.secrets s
    WHERE s.name LIKE 'test\_ro\_dsn\_%'
      AND s.created_at < now() - interval '1 day'
      AND NOT EXISTS (SELECT 1 FROM admin.tests_site t
                      WHERE s.name = 'test_ro_dsn_' || t.jeton AND t.expire_le >= now());
    DELETE FROM admin.tests_site WHERE expire_le < now();
  $cron$
);

NOTIFY pgrst, 'reload schema';
