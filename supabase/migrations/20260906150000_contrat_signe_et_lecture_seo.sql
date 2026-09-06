-- Alignement sur le contrat IA MEDIA signe (11/08 et 18/08/2026) et socle de la
-- « Lecture SEO » du rapport. Decisions d'Eric du 06/09/2026 soir.
--
-- 1. Charges : chaque charge dit si elle est un Cout Direct au sens de
--    l'article 8.1 (IA, Stripe, Resend, Supabase/Vercel, acquisition payante,
--    licences, domaine, liens). Par defaut oui ; un frais de structure se
--    decoche.
-- 2. Contrat : prix de reference 20,83 EUR HT (art. 1), CA partageable = HT
--    effectivement encaisse sur les ventes au-dela du seuil (mode « reel »),
--    couts directs = ia + stripe + ads + charges (les remboursements ne sont
--    pas un cout : une vente remboursee n'est pas une Vente).
-- 3. admin.partenariat_serie au modele de l'Annexe 2 : ventes brutes,
--    remboursees, nettes, CA HT encaisse, couts directs, ratio, CA
--    partageable, CD imputables, report de solde negatif (art. 7.2, dernier
--    alinea : il EXISTE), resultat, quote-parts.
-- 4. Lecture SEO : panier de requetes et pages cles par site (config.apps),
--    table admin.seo_chantiers, colonne lecture_seo sur admin.rapports.

-- ---------------------------------------------------------------- 1. charges
ALTER TABLE admin.charges_recurrentes ADD COLUMN IF NOT EXISTS cout_direct boolean NOT NULL DEFAULT true;
ALTER TABLE admin.charges_ponctuelles ADD COLUMN IF NOT EXISTS cout_direct boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN admin.charges_recurrentes.cout_direct IS
  'Cout Direct au sens de l''art. 8.1 du contrat de partenariat (impute au prorata des ventes partageables). false = frais de structure.';
COMMENT ON COLUMN admin.charges_ponctuelles.cout_direct IS
  'Cout Direct au sens de l''art. 8.1 du contrat de partenariat. false = frais de structure.';

-- ---------------------------------------------------------------- 2. contrat
UPDATE admin.partenariats
   SET prix_unitaire = 'reel',
       prix_catalogue_ht = 20.83,
       couts_directs = ARRAY['ia', 'stripe', 'ads', 'charges']
 WHERE app_id = 'pack-vendeur';

-- ---------------------------------------------------------------- 3. serie
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
   WHERE app_id = c.app_id AND perimetre = 'b2c' AND NOT exclue AND montant_ttc > 0;
  v_premier := least(coalesce(v_premier, v_contrat), v_contrat);

  FOR m IN
    SELECT generate_series(v_premier,
                           date_trunc('month', coalesce(c.fin, now()::date)),
                           interval '1 month')::date
  LOOP
    m_fin := (m + interval '1 month' - interval '1 day')::date;

    -- Ventes du mois : B2C encaissees (> 0), dans l'assiette. Une vente
    -- remboursee n'est pas une Vente (art. 1) : comptee a part, hors CA.
    -- Les frais Stripe restent dus sur toutes, remboursees comprises.
    SELECT count(*)::int,
           count(*) FILTER (WHERE montant_rembourse > 0)::int,
           coalesce(sum(montant_ht) FILTER (WHERE montant_rembourse = 0), 0),
           coalesce(sum(frais_stripe_eur), 0)
      INTO v_ventes, v_remb, v_ca_ht, v_frais
      FROM admin.ventes_enrichies
     WHERE app_id = c.app_id AND perimetre = 'b2c' AND NOT exclue
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
           WHERE app_id = c.app_id AND perimetre = 'b2c' AND NOT exclue
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

CREATE FUNCTION public.admin_partenariat_serie(
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
LANGUAGE sql
SECURITY DEFINER
SET search_path = admin, public
AS $function$
  SELECT * FROM admin.partenariat_serie(p_partenariat, p_assiette, p_prix_unitaire);
$function$;

REVOKE ALL ON FUNCTION public.admin_partenariat_serie(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_partenariat_serie(uuid, text, text) TO service_role;

-- ---------------------------------------------------------------- 4. lecture SEO
ALTER TABLE config.apps
  ADD COLUMN IF NOT EXISTS seo_panier jsonb,
  ADD COLUMN IF NOT EXISTS seo_pages_cles jsonb;
COMMENT ON COLUMN config.apps.seo_panier IS
  'Requetes suivies (outil de suivi interne, pas une clause du contrat) : tableau JSON de chaines.';
COMMENT ON COLUMN config.apps.seo_pages_cles IS
  'Pages cles suivies en requete x page : tableau JSON de chemins (« / » = accueil).';

UPDATE config.apps SET
  seo_panier = '["pré-état daté","pré état daté en ligne","pré état daté prix","tarif pré état daté","état daté prix","pré état daté obligatoire","validité pré état daté","faire un pré état daté soi même","pré état daté avis","pre etat date est il payant"]'::jsonb,
  seo_pages_cles = '["/","/comparatif","/guide/cout-pre-etat-date-syndic","/guide/modele-pre-etat-date","/guide/pre-etat-date-gratuit","/guide/validite-pre-etat-date","/guide/pre-etat-date-obligatoire"]'::jsonb
WHERE id = 'pack-vendeur';

CREATE TABLE IF NOT EXISTS admin.seo_chantiers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id           text NOT NULL REFERENCES config.apps(id) ON DELETE CASCADE,
  date             date NOT NULL,
  libelle          text NOT NULL,
  cible            text,
  hypothese        text,
  mesure_prevue_le date,
  verdict          text,
  cree_le          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seo_chantiers_verdict_chk CHECK (verdict IS NULL OR verdict IN ('gagne','en_progres','rate','sans_objet'))
);
CREATE INDEX IF NOT EXISTS seo_chantiers_app_date_idx ON admin.seo_chantiers (app_id, date DESC);
ALTER TABLE admin.seo_chantiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.seo_chantiers FORCE ROW LEVEL SECURITY;
GRANT ALL ON admin.seo_chantiers TO service_role;
COMMENT ON TABLE admin.seo_chantiers IS
  'Chantiers SEO d''un site : ce qui a ete fait, sur quelle cible, avec quel verdict (pose apres lecture).';

INSERT INTO admin.seo_chantiers (app_id, date, libelle, cible, hypothese, mesure_prevue_le, verdict)
SELECT 'pack-vendeur', d::date, l, c, h, mp::date, v FROM (VALUES
  ('2026-07-11', 'Page-outil tantièmes', 'cluster tantiemes', 'Capter la demande « calcul tantième »', '2026-09-06', 'rate'),
  ('2026-07-11', 'Section délai sur la page état daté', 'cluster delai', 'Répondre aux requêtes « délai / 10 jours »', '2026-09-06', 'sans_objet'),
  ('2026-07-14', 'Dé-cannibalisation « en ligne », 301 vers /comparatif', 'cluster en_ligne', 'Un seul champion sur le cluster commercial', '2026-09-06', 'gagne'),
  ('2026-07-14', 'Retitrage prix du guide coût + 301 pas-cher', 'cluster prix', 'Remonter le guide coût sur les requêtes prix', '2026-09-06', 'en_progres'),
  ('2026-08-08', 'Lien prix depuis la home vers le guide coût', '/guide/cout-pre-etat-date-syndic', 'Transférer de l''autorité interne au guide coût', '2026-10-01', NULL),
  ('2026-09-06', 'Brief liens agence : cibles /comparatif et guide coût', 'autorité', 'Passer les deux clusters commerciaux de la position 10 à 5', '2026-10-31', NULL)
) AS t(d, l, c, h, mp, v)
WHERE NOT EXISTS (SELECT 1 FROM admin.seo_chantiers WHERE app_id = 'pack-vendeur');

ALTER TABLE admin.rapports ADD COLUMN IF NOT EXISTS lecture_seo text;
