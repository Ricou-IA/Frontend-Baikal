-- Le perimetre etait code en dur a 'b2c' dans la capture : les ventes de
-- credits pros (B2B) se melangeaient aux ventes de dossiers. Il devient une
-- propriete du produit, portee par le mapping.
-- Enjeu : le contrat de partenariat SEO porte sur les ventes B2C ; melanger
-- les deux fausse le seuil autant que le resultat.
ALTER TABLE admin.stripe_mapping
  ADD COLUMN IF NOT EXISTS perimetre text NOT NULL DEFAULT 'b2c';

ALTER TABLE admin.stripe_mapping
  DROP CONSTRAINT IF EXISTS stripe_mapping_perimetre_chk;
ALTER TABLE admin.stripe_mapping
  ADD CONSTRAINT stripe_mapping_perimetre_chk CHECK (perimetre IN ('b2c','b2b'));

UPDATE admin.stripe_mapping SET perimetre = 'b2b', offre = 'credits-pro-1'
  WHERE cle = 'prod_UWhwcQ6I0FarKG';
UPDATE admin.stripe_mapping SET perimetre = 'b2b', offre = 'credits-pro-5'
  WHERE cle = 'prod_UWhynX6GtKJHYy';
UPDATE admin.stripe_mapping SET perimetre = 'b2b', offre = 'credits-pro-10'
  WHERE cle = 'prod_UP4b6U4xzrlExH';
UPDATE admin.stripe_mapping SET perimetre = 'b2b', offre = 'credits-pro-20'
  WHERE cle = 'prod_UP4bNZZAiZVTPO';
