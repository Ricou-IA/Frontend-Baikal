-- Deux decisions d'Eric du 06/09/2026 sur /finances.
--
-- 1. Charges ponctuelles : une depense non recurrente (achat, prestation,
--    abonnement annuel regle en une fois) datee d'un jour. Elle entre dans le
--    resultat du jour ou elle tombe, sans prorata. Meme regime que
--    charges_recurrentes : RLS forcee sans policy, service_role seul.
--
-- 2. Le contrat de partenariat NE prevoit PAS de report du solde negatif :
--    chaque mois s'apprecie seul. Les colonnes report_entrant / report_sortant
--    disparaissent de admin.partenariat_serie ; un mois dont le resultat
--    partageable est negatif donne une quote-part nulle, sans memoire.
--    Le type de retour change : fonction et wrapper public recrees.

CREATE TABLE IF NOT EXISTS admin.charges_ponctuelles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id      text NOT NULL REFERENCES config.apps(id) ON DELETE CASCADE,
  libelle     text NOT NULL,
  categorie   text NOT NULL DEFAULT 'autre',
  montant_eur numeric(12,2) NOT NULL,
  jour        date NOT NULL,
  cree_le     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS charges_ponctuelles_app_idx ON admin.charges_ponctuelles (app_id, jour);

ALTER TABLE admin.charges_ponctuelles ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.charges_ponctuelles FORCE ROW LEVEL SECURITY;
GRANT ALL ON admin.charges_ponctuelles TO service_role;

COMMENT ON TABLE admin.charges_ponctuelles IS
  'Depenses non recurrentes d''un site, imputees au jour ou elles tombent (pas de prorata).';

-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.admin_partenariat_serie(uuid, text, text);
DROP FUNCTION IF EXISTS admin.partenariat_serie(uuid, text, text);

CREATE FUNCTION admin.partenariat_serie(
  p_partenariat uuid,
  p_assiette text DEFAULT NULL,
  p_prix_unitaire text DEFAULT NULL
)
RETURNS TABLE(
  mois date,
  dans_decompte boolean,
  ventes integer,
  ca_ht numeric,
  ventes_partageables integer,
  ca_partageable_ht numeric,
  couts_mois numeric,
  couts_imputables numeric,
  resultat_partageable numeric,
  quote_part numeric
)
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  c            record;
  m            date;
  v_premier    date;
  v_contrat    date;
  v_assiette   text;
  v_prix       text;
  v_ventes     integer;
  v_ca_ht      numeric;
  v_frais      numeric;
  v_remb       numeric;
  v_ia         numeric;
  v_part       integer;
  v_ca_partage numeric;
  v_couts      numeric;
  v_imput      numeric;
  v_res        numeric;
BEGIN
  SELECT * INTO c FROM admin.partenariats WHERE id = p_partenariat;
  IF NOT FOUND THEN RETURN; END IF;
  v_assiette := coalesce(p_assiette, c.assiette);
  v_prix     := coalesce(p_prix_unitaire, c.prix_unitaire);
  v_contrat  := date_trunc('month', c.debut)::date;

  -- Premier mois de vente B2C encaissee du site (toutes assiettes confondues :
  -- un mois vide dans l'assiette simulee reste affiche, a zero).
  SELECT date_trunc('month', min(paid_at))::date INTO v_premier
    FROM admin.ventes_enrichies
   WHERE app_id = c.app_id AND perimetre = 'b2c' AND NOT exclue
     AND montant_ttc > 0;
  v_premier := least(coalesce(v_premier, v_contrat), v_contrat);

  FOR m IN
    SELECT generate_series(v_premier,
                           date_trunc('month', coalesce(c.fin, now()::date)),
                           interval '1 month')::date
  LOOP
    -- Ventes du mois : B2C, encaissees (> 0 EUR), dans l'assiette.
    SELECT count(*)::int,
           coalesce(sum(montant_ht), 0),
           coalesce(sum(frais_stripe_eur), 0),
           coalesce(sum(montant_rembourse), 0)
      INTO v_ventes, v_ca_ht, v_frais, v_remb
      FROM admin.ventes_enrichies
     WHERE app_id = c.app_id AND perimetre = 'b2c' AND NOT exclue
       AND montant_ttc > 0
       AND paid_at >= m AND paid_at < m + interval '1 month'
       AND (v_assiette = 'toutes'
            OR (v_assiette = 'organic'              AND canal = 'organic')
            OR (v_assiette = 'organic_unattributed' AND canal IN ('organic','unattributed'))
            OR (v_assiette = 'hors_ads'             AND canal <> 'paid'));

    -- Cout IA : il porte sur toute l'activite du mois, il n'est pas rattachable
    -- a une vente. C'est le prorata de l'article 7.2 qui l'impute.
    SELECT coalesce(sum(cout_ia_eur), 0) INTO v_ia
      FROM admin.finance_jours
     WHERE app_id = c.app_id AND jour >= m AND jour < m + interval '1 month';

    v_couts :=
        (CASE WHEN 'ia'             = ANY(c.couts_directs) THEN v_ia    ELSE 0 END)
      + (CASE WHEN 'stripe'         = ANY(c.couts_directs) THEN v_frais ELSE 0 END)
      + (CASE WHEN 'remboursements' = ANY(c.couts_directs) THEN v_remb  ELSE 0 END);

    dans_decompte := (m >= v_contrat);
    v_part := CASE WHEN dans_decompte THEN greatest(0, v_ventes - c.franchise) ELSE 0 END;

    IF v_part = 0 THEN
      -- Mois avant le contrat, ou sous le seuil : aucun partage, aucun report
      -- (article 7.1 : le seuil s'apprecie mois par mois).
      ca_partageable_ht := 0; couts_imputables := 0; resultat_partageable := 0;
      quote_part := 0;
    ELSE
      IF v_prix = 'catalogue' THEN
        v_ca_partage := v_part * coalesce(c.prix_catalogue_ht, 0);
      ELSIF v_prix = 'moyenne' THEN
        v_ca_partage := v_part * (v_ca_ht / nullif(v_ventes, 0));
      ELSE -- 'reel' : les ventes effectivement realisees au-dela de la franchise
        SELECT coalesce(sum(montant_ht), 0) INTO v_ca_partage FROM (
          SELECT montant_ht FROM admin.ventes_enrichies
           WHERE app_id = c.app_id AND perimetre = 'b2c' AND NOT exclue
             AND montant_ttc > 0
             AND paid_at >= m AND paid_at < m + interval '1 month'
             AND (v_assiette = 'toutes'
                  OR (v_assiette = 'organic'              AND canal = 'organic')
                  OR (v_assiette = 'organic_unattributed' AND canal IN ('organic','unattributed'))
                  OR (v_assiette = 'hors_ads'             AND canal <> 'paid'))
           ORDER BY paid_at OFFSET c.franchise) x;
      END IF;

      v_imput := v_couts * (v_part::numeric / nullif(v_ventes, 0));
      v_res   := v_ca_partage - v_imput;

      ca_partageable_ht := round(v_ca_partage, 2);
      couts_imputables  := round(v_imput, 2);
      resultat_partageable := round(v_res, 2);
      -- Pas de report : un mois negatif ne doit rien et n'ampute pas le suivant.
      quote_part := CASE WHEN v_res > 0 THEN round(v_res * c.part, 2) ELSE 0 END;
    END IF;

    mois := m;
    ventes := v_ventes;
    ca_ht := round(v_ca_ht, 2);
    ventes_partageables := v_part;
    couts_mois := round(v_couts, 2);
    RETURN NEXT;
  END LOOP;
END;
$function$;

CREATE FUNCTION public.admin_partenariat_serie(
  p_partenariat uuid,
  p_assiette text DEFAULT NULL,
  p_prix_unitaire text DEFAULT NULL
)
RETURNS TABLE(
  mois date,
  dans_decompte boolean,
  ventes integer,
  ca_ht numeric,
  ventes_partageables integer,
  ca_partageable_ht numeric,
  couts_mois numeric,
  couts_imputables numeric,
  resultat_partageable numeric,
  quote_part numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = admin, public
AS $function$
  SELECT * FROM admin.partenariat_serie(p_partenariat, p_assiette, p_prix_unitaire);
$function$;

REVOKE ALL ON FUNCTION public.admin_partenariat_serie(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_partenariat_serie(uuid, text, text) TO service_role;
