-- Facturation Stripe -> Pennylane, lot 1 : un compte Stripe par site et le
-- compte de produits du site (plan docs/superpowers/plans/2026-11-21-facturation-stripe-pennylane.md).
--
--   * stripe_key_ref : NOM du secret Edge Functions qui porte la cle Stripe
--     (restreinte, en lecture) du compte propre au site. NULL = le site vend
--     dans le compte commun (ADMIN_STRIPE_KEY ou STRIPE_SECRET_KEY). Jamais la
--     cle elle-meme.
--   * compte_produit : numero du compte de produits du site dans Pennylane
--     (classe 7). NULL = facturation fermee pour ce site, pas de bouton.
--
-- La vue public.apps liste ses colonnes une a une : elle n'expose aucune des
-- deux, et n'est pas recreee ici. Aucune donnee n'est ecrite : les deux
-- colonnes naissent vides, le registre se renseigne ensuite dans Parametrage.
-- Rejouable sans effet (IF NOT EXISTS, contraintes reposees).

ALTER TABLE config.apps
  ADD COLUMN IF NOT EXISTS stripe_key_ref text,
  ADD COLUMN IF NOT EXISTS compte_produit text;

-- Le nom du secret est borne : sa valeur part vers api.stripe.com, le registre
-- ne doit donc pas pouvoir designer une autre cle du projet. Meme regle que
-- refStripeValide (supabase/functions/_shared/finance-comptes.ts).
ALTER TABLE config.apps DROP CONSTRAINT IF EXISTS apps_stripe_key_ref_check;
ALTER TABLE config.apps
  ADD CONSTRAINT apps_stripe_key_ref_check
  CHECK (
    stripe_key_ref IS NULL
    OR (stripe_key_ref ~ '^[A-Z][A-Z0-9_]{2,63}$' AND stripe_key_ref LIKE '%STRIPE%')
  );

ALTER TABLE config.apps DROP CONSTRAINT IF EXISTS apps_compte_produit_check;
ALTER TABLE config.apps
  ADD CONSTRAINT apps_compte_produit_check
  CHECK (compte_produit IS NULL OR compte_produit ~ '^7[0-9]{2,11}$');

COMMENT ON COLUMN config.apps.stripe_key_ref IS
  'Nom du secret Edge Functions de la cle Stripe (lecture) du compte propre au site ; NULL = compte commun. Jamais la cle.';
COMMENT ON COLUMN config.apps.compte_produit IS
  'Numero du compte de produits du site dans Pennylane (classe 7) ; NULL = facturation fermee pour ce site.';

-- Verification apres application (lecture seule) :
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema = 'config' AND table_name = 'apps'
--      AND column_name IN ('stripe_key_ref', 'compte_produit');          -- 2 lignes
--   SELECT conname FROM pg_constraint
--    WHERE conrelid = 'config.apps'::regclass
--      AND conname IN ('apps_stripe_key_ref_check', 'apps_compte_produit_check'); -- 2 lignes
--   SELECT count(*) FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'apps'
--      AND column_name IN ('stripe_key_ref', 'compte_produit');          -- 0
