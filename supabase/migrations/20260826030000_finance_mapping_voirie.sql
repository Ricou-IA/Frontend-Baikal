-- Autorisation Voirie construit son prix en price_data inline : aucun Product
-- ni Price au catalogue Stripe. Le libelle de la ligne est donc le seul point
-- d'accroche. Valeur exacte : _shared/offer.json du depot Autorisation-voirie.
INSERT INTO admin.stripe_mapping (cle_type, cle, app_id, offre) VALUES
  ('libelle', 'Demande d''occupation du domaine public (Cerfa 14023*01)', 'voirie', 'permis-voirie')
ON CONFLICT (cle_type, cle) DO NOTHING;
