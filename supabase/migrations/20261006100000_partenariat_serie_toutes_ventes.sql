-- Partenariat : les ventes B2B entrent dans le decompte (decision d'Eric du
-- 06/10/2026 : « les ventes B2B comptent, ca augmente l'assiette du CA
-- partageable »).
--
-- Le contrat signe ne reserve pas le partage au B2C : une « Vente » est
-- « toute commande passee sur le Site, effectivement payee » (art. 1) et le
-- perimetre couvre « l'ensemble des Ventes realisees sur le Site, quel que
-- soit le canal » (art. 4.1). L'art. 4.2 (avenant pour une offre pro) vise le
-- LANCEMENT d'une offre nouvelle ; l'Espace Pro et ses packs de credits
-- existaient avant la signature (premier pack en mai 2026). Le filtre
-- `perimetre = 'b2c'` des versions precedentes venait du term sheet de
-- juillet, pas du texte signe.
--
-- Consequences : l'achat d'un pack de credits est UNE Vente, au mois de son
-- paiement, pour son HT reellement encaisse (mode « reel ») ; ses frais Stripe
-- entrent dans les Couts Directs ; les dossiers pro consommes par credit ne
-- sont pas des ventes (ils ne sont pas payes sur le Site). Seuil, prorata et
-- report inchanges. Signature et type de retour identiques a 20260906150000 :
-- simple remplacement du corps, le wrapper public.admin_partenariat_serie est
-- inchange.

CREATE OR REPLACE FUNCTION admin.partenariat_serie(
  p_partenariat uuid,
  p_assiette text DEFAULT NULL,
  p_prix_unitaire text DEFAULT NULL
)
RETURNS TABLE(
  mois date,
  dans_decompte boolean,
  ventes integer,
  remboursees integer,
  ventes_nettes integer,
  ca_ht numeric,
  couts_directs numeric,
  ventes_partageables integer,
  ratio numeric,
  ca_partageable_ht numeric,
  couts_imputables numeric,
  report_entrant numeric,
  resultat_partageable numeric,
  resultat_apres_report numeric,
  quote_part numeric,
  quote_part_confer numeric,
  report_sortant numeric
)
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  c            record;
  m            date;
  m_fin        date;
  v_premier    date;
  v_contrat    date;
  v_assiette   text;
  v_prix       text;
  v_ventes     integer;
  v_remb       integer;
  v_nettes     integer;
  v_ca_ht      numeric;
  v_frais      numeric;
  v_ia         numeric;
  v_ads        numeric;
  v_charges    numeric;
  v_cd         numeric;
  v_part       integer;
  v_ratio      numeric;
  v_ca_partage numeric;
  v_imput      numeric;
  v_res        numeric;
  v_net        numeric;
  v_report     numeric := 0;
BEGIN
  SELECT * INTO c FROM admin.partenariats WHERE id = p_partenariat;
  IF NOT FOUND THEN RETURN; END IF;
  v_assiette := coalesce(p_assiette, c.assiette);
  v_prix     := coalesce(p_prix_unitaire, c.prix_unitaire);
  v_contrat  := date_trunc('month', c.debut)::date;

  SELECT date_trunc('month', min(paid_at))::date INTO v_premier
    FROM admin.ventes_enrichies
   WHERE app_id = c.app_id AND NOT exclue AND montant_ttc > 0;
  v_premier := least(coalesce(v_premier, v_contrat), v_contrat);

  FOR m IN
    SELECT generate_series(v_premier,
                           date_trunc('month', coalesce(c.fin, now()::date)),
                           interval '1 month')::date
  LOOP
    m_fin := (m + interval '1 month' - interval '1 day')::date;

    -- Ventes du mois : toutes les ventes encaissees (> 0 EUR, B2C et packs
    -- de credits B2B), dans l'assiette. Une vente
    -- remboursee n'est pas une Vente (art. 1) : comptee a part, hors CA.
    -- Les frais Stripe restent dus sur toutes, remboursees comprises.
    SELECT count(*)::int,
           count(*) FILTER (WHERE montant_rembourse > 0)::int,
           coalesce(sum(montant_ht) FILTER (WHERE montant_rembourse = 0), 0),
           coalesce(sum(frais_stripe_eur), 0)
      INTO v_ventes, v_remb, v_ca_ht, v_frais
      FROM admin.ventes_enrichies
     WHERE app_id = c.app_id AND NOT exclue
       AND montant_ttc > 0
       AND paid_at >= m AND paid_at < m + interval '1 month'
       AND (v_assiette = 'toutes'
            OR (v_assiette = 'organic'              AND canal = 'organic')
            OR (v_assiette = 'organic_unattributed' AND canal IN ('organic','unattributed'))
            OR (v_assiette = 'hors_ads'             AND canal <> 'paid'));
    v_nettes := v_ventes - v_remb;

    -- Couts Directs du mois (art. 8.1), pris pour tout le mois.
    SELECT coalesce(sum(cout_ia_eur), 0), coalesce(sum(ads_eur), 0)
      INTO v_ia, v_ads
      FROM admin.finance_jours
     WHERE app_id = c.app_id AND jour >= m AND jour <= m_fin;

    -- Charges recurrentes au prorata journalier (12/365, jours inclus,
    -- meme regle que l'EF admin-finance) + charges ponctuelles du mois.
    SELECT coalesce(sum(
             montant_mensuel_eur * 12 / 365
             * (least(coalesce(fin, m_fin), m_fin) - greatest(debut, m) + 1)
           ), 0)
      INTO v_charges
      FROM admin.charges_recurrentes
     WHERE app_id = c.app_id AND cout_direct
       AND debut <= m_fin AND coalesce(fin, m_fin) >= m;
    SELECT v_charges + coalesce(sum(montant_eur), 0)
      INTO v_charges
      FROM admin.charges_ponctuelles
     WHERE app_id = c.app_id AND cout_direct AND jour >= m AND jour <= m_fin;

    v_cd :=
        (CASE WHEN 'ia'      = ANY(c.couts_directs) THEN v_ia      ELSE 0 END)
      + (CASE WHEN 'stripe'  = ANY(c.couts_directs) THEN v_frais   ELSE 0 END)
      + (CASE WHEN 'ads'     = ANY(c.couts_directs) THEN v_ads     ELSE 0 END)
      + (CASE WHEN 'charges' = ANY(c.couts_directs) THEN v_charges ELSE 0 END);

    dans_decompte := (m >= v_contrat);
    v_part  := CASE WHEN dans_decompte THEN greatest(0, v_nettes - c.franchise) ELSE 0 END;
    v_ratio := CASE WHEN v_nettes > 0 THEN round(v_part::numeric / v_nettes, 4) ELSE 0 END;

    IF v_part = 0 THEN
      -- Sous le seuil ou avant le contrat : aucun partage, le seuil ne se
      -- reporte pas (7.1) ; le solde negatif, lui, traverse le mois (7.2).
      v_ca_partage := 0; v_imput := 0; v_res := 0;
      v_net := v_report;
      quote_part := 0; quote_part_confer := 0;
      report_entrant := v_report;
      report_sortant := CASE WHEN dans_decompte THEN v_report ELSE 0 END;
    ELSE
      IF v_prix = 'catalogue' THEN
        v_ca_partage := v_part * coalesce(c.prix_catalogue_ht, 0);
      ELSIF v_prix = 'moyenne' THEN
        v_ca_partage := v_part * (v_ca_ht / nullif(v_nettes, 0));
      ELSE -- 'reel' : HT effectivement encaisse sur les ventes au-dela du seuil (art. 1)
        SELECT coalesce(sum(montant_ht), 0) INTO v_ca_partage FROM (
          SELECT montant_ht FROM admin.ventes_enrichies
           WHERE app_id = c.app_id AND NOT exclue
             AND montant_ttc > 0 AND montant_rembourse = 0
             AND paid_at >= m AND paid_at < m + interval '1 month'
             AND (v_assiette = 'toutes'
                  OR (v_assiette = 'organic'              AND canal = 'organic')
                  OR (v_assiette = 'organic_unattributed' AND canal IN ('organic','unattributed'))
                  OR (v_assiette = 'hors_ads'             AND canal <> 'paid'))
           ORDER BY paid_at OFFSET c.franchise) x;
      END IF;

      v_imput := v_cd * v_ratio;
      v_res   := v_ca_partage - v_imput;
      v_net   := v_res + v_report;          -- le report est negatif ou nul
      report_entrant := v_report;
      IF v_net < 0 THEN
        quote_part := 0; quote_part_confer := 0;
        report_sortant := v_net;
      ELSE
        quote_part := round(v_net * c.part, 2);
        quote_part_confer := round(v_net - quote_part, 2);
        report_sortant := 0;
      END IF;
    END IF;

    v_report := report_sortant;
    mois := m;
    ventes := v_ventes;
    remboursees := v_remb;
    ventes_nettes := v_nettes;
    ca_ht := round(v_ca_ht, 2);
    couts_directs := round(v_cd, 2);
    ventes_partageables := v_part;
    ratio := v_ratio;
    ca_partageable_ht := round(v_ca_partage, 2);
    couts_imputables := round(v_imput, 2);
    report_entrant := round(report_entrant, 2);
    resultat_partageable := round(v_res, 2);
    resultat_apres_report := round(v_net, 2);
    report_sortant := round(report_sortant, 2);
    RETURN NEXT;
  END LOOP;
END;
$function$;
