-- ============================================================================
-- Cloture de la migration : verrouillage des copies residuelles
--   majordhome   -> migre vers le projet ejqqqwudmizqisdkxohw le 2026-08-09
--   pack_vendeur -> migre vers le projet ycmavnmtyvodqawvwrrd (org dediee)
-- Applique le 2026-08-24 (migrations Supabase :
--   cloture_migration_majordhome_packvendeur puis cloture_migration_rpc_public)
-- ============================================================================
-- Constat du 2026-08-24 sur le projet partage odspcxgafcqxjzrarsqf :
--   - les deux schemas sont des instantanes figes (majordhome.appointments :
--     418 lignes, 0 creee depuis la migration ; derniere ecriture pack_vendeur
--     le 2026-08-05) ;
--   - une seule ecriture egaree : majordhome.appointments
--     ea16d809-81dd-4229-8b50-bd40c0b60afc modifiee le 2026-08-17 a 07:08 ici
--     et a 07:20 sur le projet dedie — une interface pointait encore ici ;
--   - anon detenait SELECT/INSERT/UPDATE/DELETE sur les 90 tables majordhome,
--     alors que la cle anon de ce projet est publique (bundles ARPET, Baikal) ;
--   - 30 fonctions public.* en SECURITY DEFINER ecrivaient dans ces schemas et
--     etaient appelables anonymement, dont pv_pro_add_credits et
--     pv_pro_adjust_credits (attribution de credits).
--
-- Objectif : rendre ces copies inertes (service_role uniquement) sans les
-- supprimer, le temps de la periode de conservation.
--
-- PIEGE POSTGRES : sur les fonctions, EXECUTE etait detenu par PUBLIC
-- ('=X/postgres'), pas par anon. Revoquer sur anon/authenticated seuls est
-- SANS EFFET — il faut revoquer sur PUBLIC. Verifie au prealable que les 24
-- fonctions ciblees ont toutes un droit service_role explicite.
-- Les droits de TABLE, eux, se revoquent bien sur anon/authenticated.
--
-- Reversible : re-GRANT des memes droits.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Fermeture des RPC publiques ecrivant dans les schemas archives
-- ----------------------------------------------------------------------------
-- Exclues volontairement : inscription_record et inscrire_prospect_pellets,
-- qui ecrivent AUSSI dans un schema encore vivant. A traiter separement.

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND pg_get_functiondef(p.oid) ~* '(insert into|update |delete from)\s+(only\s+)?(majordhome|pack_vendeur)\.'
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND p.proname NOT IN ('inscription_record', 'inscrire_prospect_pellets')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Retrait des droits de table sur les schemas archives
-- ----------------------------------------------------------------------------
-- service_role n'est pas touche : l'archive reste lisible et les futurs
-- modules Baikal pourront s'en servir.

REVOKE ALL ON ALL TABLES    IN SCHEMA majordhome   FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA majordhome   FROM anon, authenticated;
REVOKE USAGE ON SCHEMA majordhome                  FROM anon, authenticated;

REVOKE ALL ON ALL TABLES    IN SCHEMA pack_vendeur FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA pack_vendeur FROM anon, authenticated;
REVOKE USAGE ON SCHEMA pack_vendeur                FROM anon, authenticated;

-- Empeche toute nouvelle table d'heriter de droits par defaut
ALTER DEFAULT PRIVILEGES IN SCHEMA majordhome   REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA pack_vendeur REVOKE ALL ON TABLES FROM anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Marquage
-- ----------------------------------------------------------------------------
COMMENT ON SCHEMA majordhome IS
  'ARCHIVE (2026-08-24) — migre vers le projet ejqqqwudmizqisdkxohw le 2026-08-09. Lecture service_role uniquement.';
COMMENT ON SCHEMA pack_vendeur IS
  'ARCHIVE (2026-08-24) — migre vers le projet ycmavnmtyvodqawvwrrd (org dediee). Lecture service_role uniquement.';

-- ----------------------------------------------------------------------------
-- RESTE A FAIRE, non scriptable ici
-- ----------------------------------------------------------------------------
-- Dashboard Supabase > Settings > API > Exposed schemas : retirer majordhome
-- et pack_vendeur de la liste s'ils y figurent. Le parametre vit dans la
-- configuration du projet, pas dans la base.
