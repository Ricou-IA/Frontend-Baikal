-- Socle du module Financier (spec 2026-08-25-baikal-financier-design).
-- admin.ventes est la memoire primaire : une ligne par vente, attribution figee.
-- Le CA n'est jamais stocke en agregat, il se somme depuis cette table.
-- Les couts qui ne sont pas par vente (IA, Ads) vivent dans admin.finance_jours.

ALTER TABLE config.apps
  ADD COLUMN IF NOT EXISTS tva_taux numeric(5,4) NOT NULL DEFAULT 0.20,
  ADD COLUMN IF NOT EXISTS stripe_secret_ref text;

COMMENT ON COLUMN config.apps.stripe_secret_ref IS
  'NOM du secret Edge Function portant la cle Stripe restreinte en lecture. Jamais la valeur.';

CREATE TABLE IF NOT EXISTS admin.ventes (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id                    text NOT NULL REFERENCES config.apps(id) ON DELETE CASCADE,
  vente_id                  text,                    -- identifiant cote site, rempli au lot 2
  stripe_payment_intent_id  text,
  created_at                timestamptz,             -- creation cote site (lot 2)
  paid_at                   timestamptz NOT NULL,
  montant_ttc               numeric(12,2) NOT NULL DEFAULT 0,
  montant_ht                numeric(12,2) NOT NULL DEFAULT 0,
  devise                    text NOT NULL DEFAULT 'EUR',
  frais_stripe_eur          numeric(12,2) NOT NULL DEFAULT 0,
  rembourse_le              timestamptz,
  montant_rembourse         numeric(12,2) NOT NULL DEFAULT 0,
  offre                     text NOT NULL DEFAULT 'inconnu',
  perimetre                 text NOT NULL DEFAULT 'b2c',
  attribution               jsonb NOT NULL DEFAULT '{}'::jsonb,
  capture                   text NOT NULL DEFAULT 'live',
  capture_le                timestamptz NOT NULL DEFAULT now(),
  maj_le                    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ventes_capture_chk CHECK (capture IN ('live','backfill','backfill_partiel')),
  CONSTRAINT ventes_perimetre_chk CHECK (perimetre IN ('b2c','b2b'))
);

COMMENT ON TABLE admin.ventes IS
  'Une ligne par vente. Attribution figee a la capture, jamais reecrite : la purge RGPD des sites efface referrer et gclid a 90 jours.';
COMMENT ON COLUMN admin.ventes.montant_rembourse IS
  'Le remboursement ne diminue pas montant_ttc : la vente reste comptee, le remboursement est un cout decompose (arbitrage Eric du 25/08).';

CREATE UNIQUE INDEX IF NOT EXISTS ventes_pi_uidx
  ON admin.ventes (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ventes_site_vente_uidx
  ON admin.ventes (app_id, vente_id) WHERE vente_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ventes_app_paid_idx ON admin.ventes (app_id, paid_at DESC);

CREATE TABLE IF NOT EXISTS admin.finance_jours (
  app_id       text NOT NULL REFERENCES config.apps(id) ON DELETE CASCADE,
  jour         date NOT NULL,
  cout_ia_usd  numeric(12,4) NOT NULL DEFAULT 0,
  cout_ia_eur  numeric(12,2) NOT NULL DEFAULT 0,
  taux_usd     numeric(8,4)  NOT NULL DEFAULT 0.92,
  ads_eur      numeric(12,2),
  complet      boolean NOT NULL DEFAULT true,
  manques      text[] NOT NULL DEFAULT '{}',
  calcule_le   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (app_id, jour)
);

COMMENT ON COLUMN admin.finance_jours.complet IS
  'false = une source a ECHOUE (nom dans manques). Une source non configuree, comme Ads, laisse la journee complete.';

CREATE TABLE IF NOT EXISTS admin.charges_recurrentes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id              text NOT NULL REFERENCES config.apps(id) ON DELETE CASCADE,
  libelle             text NOT NULL,
  categorie           text NOT NULL DEFAULT 'autre',
  montant_mensuel_eur numeric(12,2) NOT NULL,
  debut               date NOT NULL,
  fin                 date,
  cree_le             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT charges_periode_chk CHECK (fin IS NULL OR fin >= debut)
);
CREATE INDEX IF NOT EXISTS charges_app_idx ON admin.charges_recurrentes (app_id, debut);

-- Correspondance produit Stripe -> site, tant que les checkouts ne posent pas
-- metadata[application]. Le compte Stripe est partage par tous les produits :
-- sans cette table, rien ne separe leur CA. cle_type : product | price | libelle
-- (libelle pour les prix construits en price_data inline, comme Voirie).
CREATE TABLE IF NOT EXISTS admin.stripe_mapping (
  cle_type text NOT NULL,
  cle      text NOT NULL,
  app_id   text NOT NULL REFERENCES config.apps(id) ON DELETE CASCADE,
  offre    text NOT NULL,
  PRIMARY KEY (cle_type, cle),
  CONSTRAINT stripe_mapping_type_chk CHECK (cle_type IN ('product','price','libelle'))
);

ALTER TABLE admin.ventes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.ventes              FORCE ROW LEVEL SECURITY;
ALTER TABLE admin.finance_jours       ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.finance_jours       FORCE ROW LEVEL SECURITY;
ALTER TABLE admin.charges_recurrentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.charges_recurrentes FORCE ROW LEVEL SECURITY;
ALTER TABLE admin.stripe_mapping      ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.stripe_mapping      FORCE ROW LEVEL SECURITY;

GRANT ALL ON admin.ventes, admin.finance_jours,
             admin.charges_recurrentes, admin.stripe_mapping TO service_role;

-- Correspondances connues au 25/08/2026 (catalogue lu dans le compte Confer).
INSERT INTO admin.stripe_mapping (cle_type, cle, app_id, offre) VALUES
  ('product', 'prod_U3Ld2qJXsJp3a8', 'pack-vendeur', 'pre-etat-date'),
  ('product', 'prod_UWhwcQ6I0FarKG', 'pack-vendeur', 'pack-unitaire'),
  ('product', 'prod_UWhynX6GtKJHYy', 'pack-vendeur', 'pack-x5'),
  ('product', 'prod_UP4b6U4xzrlExH', 'pack-vendeur', 'pack-x10'),
  ('product', 'prod_UP4bNZZAiZVTPO', 'pack-vendeur', 'pack-x20')
ON CONFLICT (cle_type, cle) DO NOTHING;
