// Definitions des KPIs par site pour admin-site-stats.
// Chaque fonction recoit le tag sql (connexion lecture seule du site, deja
// scopee au bon projet par lecteurSite) et la fenetre en jours, et rend
// { kpis, dernieres }. Un site absent d'ici recoit le fallback generique
// (tables + volumes) construit dans index.ts.
//
// Qu'est-ce qu'un dossier de TEST : la definition appartient au site et vit
// dans sa vue contractuelle baikal_dossiers (colonne est_test), jamais
// redefinie ici. Les KPI s'y joignent donc pour exclure tests et supprimes :
// c'est ce qui garantit que la Vue du site et la page Clients affichent le
// meme nombre. Redefinir le filtre en local est exactement ce qui faisait
// compter 4 demandes payees a voirie la ou il n'y en avait que 2.
// Consequence assumee : un site liste ici doit publier sa vue contractuelle.
//
// Ce fichier se vide a mesure que les sites passent au contrat des mesures
// (docs/contrats/mesures-v1.sql) : monsieurdpe n'y a jamais figure,
// pack-vendeur en est sorti le 15/11/2026 (ses quatre nombres verifies au
// centime contre public.baikal_mesures). Restent voirie et majordhome.

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

async function statsVoirie(sql: Sql, jours: number): Promise<StatsSite> {
  // Payee = paye_le renseigne dans la vue contractuelle, jamais le statut :
  // la vue n'y pose une date que pour un encaissement Stripe reel, ce qui
  // ecarte les sessions TEST_ que les statuts PAID laissaient passer.
  // La periode se compte sur la date de paiement (comme Pack Vendeur), pas
  // sur la date de creation.
  const [k] = await sql`
    SELECT
      count(*) FILTER (WHERE v.cree_le >= now() - make_interval(days => ${jours}))::int AS demandes_periode,
      count(*) FILTER (WHERE v.paye_le >= now() - make_interval(days => ${jours}))::int AS payees_periode,
      count(*) FILTER (WHERE v.paye_le IS NOT NULL)::int AS payees_total
    FROM voirie.baikal_dossiers v
    WHERE v.est_test IS NOT TRUE AND v.supprime_le IS NULL`;
  const lignes = await sql`
    SELECT d.created_at::date AS date, d.type_occupation, d.status AS statut
    FROM voirie.demandes d
    JOIN voirie.baikal_dossiers v ON v.dossier_id = d.id::text
    WHERE v.est_test IS NOT TRUE AND v.supprime_le IS NULL
    ORDER BY d.created_at DESC LIMIT 10`;
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
  "voirie": statsVoirie,
  "majordhome": statsMajordhome,
};
