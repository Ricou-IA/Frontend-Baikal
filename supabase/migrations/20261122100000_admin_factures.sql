-- Facturation Stripe -> Pennylane, lot 2 : la correspondance vente -> facture
-- (plan docs/superpowers/plans/2026-11-21-facturation-stripe-pennylane.md).
--
-- Une ligne par vente facturee a la demande. AUCUNE donnee nominative : ni
-- nom, ni adresse, ni e-mail. Le client vit dans Pennylane ; Baikal ne garde
-- que l'identifiant de la facture, son numero, ses montants et l'etat de l'envoi.
--
--   statut  en_cours : une emission est en route (ou s'est arretee en chemin ;
--                      `etape` dit ou, pour reprendre sans rien refaire)
--           emise    : la facture est definitive et porte un numero
--           erreur   : la derniere tentative a echoue avant la facture definitive
--   etape   client | brouillon | finalisee : derniere etape franchie
--   envoyee_le NULL sur une facture emise = « creee, envoi en attente » (le PDF
--           de Pennylane met parfois quelques minutes a etre pret).
--
-- Une vente = une facture : stripe_payment_intent_id est unique. Corriger une
-- facture se fait par un avoir, dans Pennylane.
-- Rejouable sans effet (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS admin.factures (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id                    text NOT NULL REFERENCES config.apps(id),
  stripe_payment_intent_id  text NOT NULL UNIQUE,
  statut                    text NOT NULL DEFAULT 'en_cours'
                              CHECK (statut IN ('en_cours', 'emise', 'erreur')),
  etape                     text
                              CHECK (etape IS NULL OR etape IN ('client', 'brouillon', 'finalisee')),
  pennylane_invoice_id      bigint,
  numero                    text,
  date_facture              date,
  montant_ttc               numeric(12, 2) NOT NULL,
  montant_ht                numeric(12, 2) NOT NULL,
  envoyee_le                timestamptz,
  erreur                    text,
  cree_par                  uuid,
  cree_le                   timestamptz NOT NULL DEFAULT now(),
  maj_le                    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT factures_emise_numerotee
    CHECK (statut <> 'emise' OR (numero IS NOT NULL AND pennylane_invoice_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS factures_app_idx ON admin.factures (app_id, cree_le DESC);

COMMENT ON TABLE admin.factures IS
  'Vente Stripe -> facture Pennylane emise a la demande. Aucune donnee nominative.';

-- Comme les autres tables du schema admin : RLS forcee sans policy, seul
-- service_role (les Edge Functions) y accede.
ALTER TABLE admin.factures ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.factures FORCE ROW LEVEL SECURITY;
REVOKE ALL ON admin.factures FROM PUBLIC, anon, authenticated;
GRANT ALL ON admin.factures TO service_role;

-- Verification apres application (lecture seule) :
--   SELECT to_regclass('admin.factures');                                  -- admin.factures
--   SELECT relrowsecurity, relforcerowsecurity FROM pg_class
--    WHERE oid = 'admin.factures'::regclass;                               -- t, t
--   SELECT count(*) FROM pg_policies
--    WHERE schemaname = 'admin' AND tablename = 'factures';                -- 0
--   SELECT has_table_privilege('anon', 'admin.factures', 'SELECT'),
--          has_table_privilege('authenticated', 'admin.factures', 'SELECT'),
--          has_table_privilege('service_role', 'admin.factures', 'INSERT'); -- f, f, t
