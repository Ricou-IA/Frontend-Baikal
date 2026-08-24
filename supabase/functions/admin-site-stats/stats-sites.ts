// Definitions des KPIs par site pour admin-site-stats.
// Chaque fonction recoit le tag sql (connexion lecture seule du site, deja
// scopee au bon projet par lecteurSite) et la fenetre en jours, et rend
// { kpis, dernieres }. Un site absent d'ici recoit le fallback generique
// (tables + volumes) construit dans index.ts.

// deno-lint-ignore-file no-explicit-any
type Sql = any;

export interface StatsSite {
  kpis: Array<{ cle: string; libelle: string; valeur: number; format?: "eur" }>;
  dernieres: {
    titre: string;
    colonnes: Array<{ cle: string; libelle: string }>;
    lignes: Array<Record<string, unknown>>;
  };
}

async function statsPackVendeur(sql: Sql, jours: number): Promise<StatsSite> {
  const [k] = await sql`
    SELECT
      count(*) FILTER (WHERE created_at >= now() - make_interval(days => ${jours}))::int AS crees,
      count(*) FILTER (WHERE paid_at >= now() - make_interval(days => ${jours}))::int AS payes,
      coalesce(sum(amount_paid) FILTER (WHERE paid_at >= now() - make_interval(days => ${jours})), 0)::float AS ca_periode,
      coalesce(sum(amount_paid) FILTER (WHERE paid_at IS NOT NULL), 0)::float AS ca_total
    FROM pack_vendeur.dossiers
    WHERE is_test IS NOT TRUE AND deleted_at IS NULL`;
  const lignes = await sql`
    SELECT paid_at::date AS date, property_city AS ville, amount_paid::float AS montant,
           coalesce(acquisition_channel, utm_source, 'direct') AS canal
    FROM pack_vendeur.dossiers
    WHERE paid_at IS NOT NULL AND is_test IS NOT TRUE AND deleted_at IS NULL
    ORDER BY paid_at DESC LIMIT 10`;
  return {
    kpis: [
      { cle: "crees", libelle: `Dossiers crees (${jours} j)`, valeur: k.crees },
      { cle: "payes", libelle: `Dossiers payes (${jours} j)`, valeur: k.payes },
      { cle: "ca_periode", libelle: `CA (${jours} j)`, valeur: k.ca_periode, format: "eur" },
      { cle: "ca_total", libelle: "CA total", valeur: k.ca_total, format: "eur" },
    ],
    dernieres: {
      titre: "Derniers dossiers payes",
      colonnes: [
        { cle: "date", libelle: "Date" },
        { cle: "ville", libelle: "Ville" },
        { cle: "montant", libelle: "Montant" },
        { cle: "canal", libelle: "Canal" },
      ],
      lignes,
    },
  };
}

async function statsVoirie(sql: Sql, jours: number): Promise<StatsSite> {
  // Payee = tout statut post-paiement (PAID, SENT_TO_MAIRIE, MANUAL_FALLBACK).
  const [k] = await sql`
    SELECT
      count(*) FILTER (WHERE created_at >= now() - make_interval(days => ${jours}))::int AS demandes_periode,
      count(*) FILTER (WHERE status IN ('PAID','SENT_TO_MAIRIE','MANUAL_FALLBACK')
                       AND created_at >= now() - make_interval(days => ${jours}))::int AS payees_periode,
      count(*) FILTER (WHERE status IN ('PAID','SENT_TO_MAIRIE','MANUAL_FALLBACK'))::int AS payees_total
    FROM voirie.demandes
    WHERE deleted_at IS NULL`;
  const lignes = await sql`
    SELECT created_at::date AS date, type_occupation, status AS statut
    FROM voirie.demandes
    WHERE deleted_at IS NULL
    ORDER BY created_at DESC LIMIT 10`;
  return {
    kpis: [
      { cle: "demandes", libelle: `Demandes (${jours} j)`, valeur: k.demandes_periode },
      { cle: "payees_periode", libelle: `Payees (${jours} j)`, valeur: k.payees_periode },
      { cle: "payees_total", libelle: "Payees (total)", valeur: k.payees_total },
    ],
    dernieres: {
      titre: "Dernieres demandes",
      colonnes: [
        { cle: "date", libelle: "Date" },
        { cle: "type_occupation", libelle: "Type" },
        { cle: "statut", libelle: "Statut" },
      ],
      lignes,
    },
  };
}

async function statsMajordhome(sql: Sql, jours: number): Promise<StatsSite> {
  const [k] = await sql`
    SELECT
      count(*) FILTER (WHERE scheduled_date >= current_date - ${jours})::int AS rdv_periode,
      count(*)::int AS rdv_total
    FROM majordhome.appointments`;
  const lignes = await sql`
    SELECT scheduled_date AS date, client_name AS client, city AS ville,
           appointment_type AS type, status AS statut
    FROM majordhome.appointments
    ORDER BY scheduled_date DESC NULLS LAST LIMIT 10`;
  return {
    kpis: [
      { cle: "rdv_periode", libelle: `Rendez-vous (${jours} j)`, valeur: k.rdv_periode },
      { cle: "rdv_total", libelle: "Rendez-vous (total)", valeur: k.rdv_total },
    ],
    dernieres: {
      titre: "Derniers rendez-vous",
      colonnes: [
        { cle: "date", libelle: "Date" },
        { cle: "client", libelle: "Client" },
        { cle: "ville", libelle: "Ville" },
        { cle: "type", libelle: "Type" },
        { cle: "statut", libelle: "Statut" },
      ],
      lignes,
    },
  };
}

export const statsParSite: Record<
  string,
  (sql: Sql, jours: number) => Promise<StatsSite>
> = {
  "pack-vendeur": statsPackVendeur,
  "voirie": statsVoirie,
  "majordhome": statsMajordhome,
};
