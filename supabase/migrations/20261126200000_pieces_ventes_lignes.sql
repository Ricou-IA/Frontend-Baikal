-- Pieces de ventes : ce que chaque piece contient, vente par vente.
--
-- Constat du 26/11/2026 : admin.pieces_ventes ne garde que la periode et les
-- totaux. Rien n'empeche une meme vente d'entrer dans deux pieces : seul le
-- controle de recouvrement des periodes, dans la fonction, fait barrage.
--
--   admin.pieces_ventes_lignes : une ligne par mouvement porte par une piece.
--     nature  vente             : la vente est comptee dans la piece (mois du paiement)
--             remboursement     : son remboursement y est deduit (mois du remboursement)
--             retrait_facture   : vendue avant la periode, facturee seule pendant :
--                                 la piece la retire (regle d'Eric du 21/11/2026)
--     Unicite (stripe_payment_intent_id, nature) : une vente n'entre qu'une fois
--     dans une piece, son remboursement n'est deduit qu'une fois, son retrait
--     n'est passe qu'une fois.
--   Garde : une vente deja facturee seule (admin.factures en_cours, brouillon ou
--     emise) AVANT la creation de la piece ne peut pas devenir une ligne `vente`
--     de cette piece ; une ligne `retrait_facture` exige une facture emise.
--     Une vente facturee seule APRES sa piece reste permise : c'est la regle
--     d'Eric (21/11/2026), la piece de la periode de la facture la retire, et
--     ce retrait n'est passe qu'une fois (unicite).
--   admin.pieces_ventes.numero : le numero reel du document Pennylane, une fois
--     finalise par le comptable (NULL tant qu'il est en brouillon ou non relu).
--
-- AUCUNE donnee nominative : identifiants Stripe et montants seulement.
-- N'ecrit aucune donnee. Le rattachement des pieces existantes passe par
-- l'action `pieces-rattacher` d'admin-finance, en essai par defaut.
-- Rejouable sans effet.

ALTER TABLE admin.pieces_ventes
  ADD COLUMN IF NOT EXISTS numero text;

COMMENT ON COLUMN admin.pieces_ventes.numero IS
  'Numero du document Pennylane de la piece une fois finalise (jamais celui d''une facture individuelle).';

CREATE TABLE IF NOT EXISTS admin.pieces_ventes_lignes (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  piece_id                  uuid NOT NULL REFERENCES admin.pieces_ventes(id) ON DELETE CASCADE,
  app_id                    text NOT NULL REFERENCES config.apps(id),
  stripe_payment_intent_id  text NOT NULL,
  nature                    text NOT NULL
                              CHECK (nature IN ('vente', 'remboursement', 'retrait_facture')),
  montant_ttc               numeric(12, 2) NOT NULL,
  cree_le                   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pieces_ventes_lignes_unique UNIQUE (stripe_payment_intent_id, nature)
);

CREATE INDEX IF NOT EXISTS pieces_ventes_lignes_piece_idx ON admin.pieces_ventes_lignes (piece_id);
CREATE INDEX IF NOT EXISTS pieces_ventes_lignes_app_idx ON admin.pieces_ventes_lignes (app_id);

COMMENT ON TABLE admin.pieces_ventes_lignes IS
  'Contenu des pieces de ventes, mouvement par mouvement. Unicite par vente et par nature. Aucune donnee nominative.';

ALTER TABLE admin.pieces_ventes_lignes ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.pieces_ventes_lignes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON admin.pieces_ventes_lignes FROM PUBLIC, anon, authenticated;
GRANT ALL ON admin.pieces_ventes_lignes TO service_role;

-- Garde croisee avec les factures individuelles.
CREATE OR REPLACE FUNCTION admin.pieces_ventes_lignes_garde()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = admin, pg_temp
AS $$
DECLARE
  st text;
  facture_le timestamptz;
  piece_le timestamptz;
BEGIN
  SELECT f.statut, f.cree_le INTO st, facture_le
    FROM admin.factures f
   WHERE f.stripe_payment_intent_id = NEW.stripe_payment_intent_id;
  SELECT p.cree_le INTO piece_le FROM admin.pieces_ventes p WHERE p.id = NEW.piece_id;

  IF NEW.nature = 'vente' AND st IN ('en_cours', 'brouillon', 'emise') AND facture_le <= piece_le THEN
    RAISE EXCEPTION 'vente % deja facturee individuellement (statut %) : elle ne peut pas entrer dans une piece',
      left(NEW.stripe_payment_intent_id, 8), st
      USING ERRCODE = '23514';
  END IF;

  IF NEW.nature = 'retrait_facture' AND st IS DISTINCT FROM 'emise' THEN
    RAISE EXCEPTION 'retrait de la vente % sans facture individuelle emise',
      left(NEW.stripe_payment_intent_id, 8)
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION admin.pieces_ventes_lignes_garde() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tr_pieces_ventes_lignes_garde ON admin.pieces_ventes_lignes;
CREATE TRIGGER tr_pieces_ventes_lignes_garde
  BEFORE INSERT OR UPDATE OF stripe_payment_intent_id, nature ON admin.pieces_ventes_lignes
  FOR EACH ROW EXECUTE FUNCTION admin.pieces_ventes_lignes_garde();

-- Verification apres application (lecture seule) :
--   SELECT to_regclass('admin.pieces_ventes_lignes');                       -- admin.pieces_ventes_lignes
--   SELECT relrowsecurity, relforcerowsecurity FROM pg_class
--    WHERE oid = 'admin.pieces_ventes_lignes'::regclass;                    -- t, t
--   SELECT has_table_privilege('anon', 'admin.pieces_ventes_lignes', 'SELECT'),
--          has_table_privilege('authenticated', 'admin.pieces_ventes_lignes', 'SELECT'); -- f, f
--   SELECT conname FROM pg_constraint
--    WHERE conrelid = 'admin.pieces_ventes_lignes'::regclass AND contype = 'u'; -- pieces_ventes_lignes_unique
--   SELECT tgname FROM pg_trigger
--    WHERE tgrelid = 'admin.pieces_ventes_lignes'::regclass AND NOT tgisinternal; -- tr_pieces_ventes_lignes_garde
--
-- Test d'unicite (a jouer sur une copie / un Postgres jetable, JAMAIS en prod) :
--   supabase/functions/admin-finance/essai-pieces/unicite.sql
