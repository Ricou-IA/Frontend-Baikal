-- Partenariat : une vente reglee par coupon a 100 % (0 EUR encaisse) n'est
-- pas une « vente du mois ».
--
-- Parite avec la vue contractuelle du site Pack Vendeur
-- (public.pv_seo_partenariat_mensuel, Annexe 3 : `amount_paid > 0`). Sans cette
-- regle Baikal comptait 7 ventes de plus que le /admin PV entre avril et
-- juillet 2026 (avril 1, mai 1, juin 1, juillet 4), toutes a 0 EUR.
-- Le seuil de 15 s'apprecie donc sur les ventes encaissees.
--
-- Meme signature et meme type de retour que 20260906100000 : simple
-- remplacement du corps, le wrapper public.admin_partenariat_serie est inchange.

CREATE OR REPLACE FUNCTION admin.partenariat_serie(
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
  report_entrant numeric,
  report_sortant numeric,
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
  v_report     numeric := 0;
  v_net        numeric;
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
      -- Mois hors decompte, ou mois sous le seuil : aucun partage, et AUCUN
      -- report de ventes (article 7.1). Le report de solde negatif, lui,
      -- traverse le mois (il est nul tant que le contrat n'a pas commence).
      ca_partageable_ht := 0; couts_imputables := 0; resultat_partageable := 0;
      report_entrant := v_report; report_sortant := v_report; quote_part := 0;
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
      v_net   := v_res + v_report;   -- le report est negatif ou nul

      ca_partageable_ht := round(v_ca_partage, 2);
      couts_imputables  := round(v_imput, 2);
      resultat_partageable := round(v_res, 2);
      report_entrant    := round(v_report, 2);

      IF v_net < 0 THEN
        quote_part := 0;
        report_sortant := round(v_net, 2);
      ELSE
        quote_part := round(v_net * c.part, 2);
        report_sortant := 0;
      END IF;
    END IF;

    v_report := report_sortant;
    mois := m;
    ventes := v_ventes;
    ca_ht := round(v_ca_ht, 2);
    ventes_partageables := v_part;
    couts_mois := round(v_couts, 2);
    RETURN NEXT;
  END LOOP;
END;
$function$;
