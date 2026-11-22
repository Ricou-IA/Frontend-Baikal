-- Facturation, lots 3 et 4 en version courte : la piece de ventes d'un site.
--
-- Une piece = un brouillon de facture cree dans Pennylane au client « Clients
-- particuliers » du site, pour une periode de mois entiers, datee du dernier
-- jour de la periode. C'est le comptable qui la relit et la finalise dans
-- Pennylane : Baikal ne finalise jamais une piece.
--
--   admin.pieces_ventes : ce qui a deja ete prepare, pour ne pas le refaire.
--     Une periode ne recouvre jamais une autre (controle dans la fonction ;
--     l'unicite de (app_id, au) en est le filet).
--   config.apps.pennylane_client_particuliers : l'identifiant, chez Pennylane,
--     du client « Clients particuliers » du site. Ecrit par la fonction a la
--     premiere piece. Non expose par la vue public.apps.
--
-- AUCUNE donnee nominative. Rejouable sans effet.

CREATE TABLE IF NOT EXISTS admin.pieces_ventes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id                text NOT NULL REFERENCES config.apps(id),
  du                    date NOT NULL,
  au                    date NOT NULL,
  pennylane_invoice_id  bigint NOT NULL,
  montant_ttc           numeric(12, 2) NOT NULL,
  nb_ventes             integer NOT NULL,
  cree_par              uuid,
  cree_le               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pieces_ventes_periode CHECK (du <= au),
  CONSTRAINT pieces_ventes_unique UNIQUE (app_id, au)
);

COMMENT ON TABLE admin.pieces_ventes IS
  'Pieces de ventes mensuelles preparees en brouillon dans Pennylane. Aucune donnee nominative.';

ALTER TABLE admin.pieces_ventes ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.pieces_ventes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON admin.pieces_ventes FROM PUBLIC, anon, authenticated;
GRANT ALL ON admin.pieces_ventes TO service_role;

ALTER TABLE config.apps
  ADD COLUMN IF NOT EXISTS pennylane_client_particuliers bigint;

COMMENT ON COLUMN config.apps.pennylane_client_particuliers IS
  'Identifiant Pennylane du client « Clients particuliers » du site (piece de ventes mensuelle).';

-- Verification apres application (lecture seule) :
--   SELECT to_regclass('admin.pieces_ventes');                             -- admin.pieces_ventes
--   SELECT relrowsecurity, relforcerowsecurity FROM pg_class
--    WHERE oid = 'admin.pieces_ventes'::regclass;                          -- t, t
--   SELECT has_table_privilege('anon', 'admin.pieces_ventes', 'SELECT'),
--          has_table_privilege('authenticated', 'admin.pieces_ventes', 'SELECT'); -- f, f
--   SELECT count(*) FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'apps'
--      AND column_name = 'pennylane_client_particuliers';                  -- 0
