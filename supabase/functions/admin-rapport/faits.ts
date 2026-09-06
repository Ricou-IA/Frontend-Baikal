// Faits du rapport mensuel, lus dans l'archive `admin` (jamais en direct) :
// decompte du partenariat, ventes du mois, SEO du mois. Une source absente
// (pas de contrat, Bing avant le cron) donne une section vide et une entree
// dans `sources_manquantes`, jamais une erreur.
// deno-lint-ignore-file no-explicit-any
import {
  calculerHighlights,
  type FaitsHighlights,
  libelleMois,
  moisPrecedent,
  type RequeteMois,
  type TotauxSeo,
} from "./highlights.ts";

export interface Faits {
  site: { id: string; nom: string; domaine: string | null; repo_github: string | null };
  mois: string;
  libelle_mois: string;
  debut: string;
  fin: string;
  partenariat: { contrat: any | null; lignes: any[] };
  ventes: { lignes: any[]; nombre: number; total_ttc: number; total_ht: number };
  seo: {
    google: { mois: TotauxSeo | null; precedent: TotauxSeo | null };
    bing: { mois: TotauxSeo | null; precedent: TotauxSeo | null };
    top_requetes: RequeteMois[];
    top_pages: RequeteMois[];
  };
  highlights: string[];
  sources_manquantes: string[];
}

function arrondi(n: number, d = 2): number {
  return Number(n.toFixed(d));
}

function bornes(mois: string): { debut: string; fin: string } {
  const [a, m] = mois.split("-").map(Number);
  const dernier = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { debut: `${mois}-01`, fin: `${mois}-${String(dernier).padStart(2, "0")}` };
}

// Totaux d'un mois depuis la serie quotidienne du site : c'est la reference,
// elle inclut les requetes anonymisees que la somme des pages n'a pas.
function totaux(rows: any[]): TotauxSeo | null {
  if (rows.length === 0) return null;
  let clics = 0, impressions = 0, posPond = 0;
  for (const r of rows) {
    clics += Number(r.clicks);
    impressions += Number(r.impressions);
    posPond += Number(r.position) * Number(r.impressions);
  }
  return {
    clics,
    impressions,
    ctr: impressions > 0 ? arrondi(clics / impressions, 4) : 0,
    position: impressions > 0 ? arrondi(posPond / impressions, 1) : 0,
  };
}

async function serieSite(admin: any, appId: string, source: string, mois: string): Promise<TotauxSeo | null> {
  const { debut, fin } = bornes(mois);
  const { data, error } = await admin.schema("admin").from("seo_snapshots")
    .select("clicks, impressions, position")
    .eq("app_id", appId).eq("source", source)
    .eq("granularity", "day").eq("dimension", "site")
    .gte("period_start", debut).lte("period_start", fin);
  if (error) throw new Error(error.message);
  return totaux(data ?? []);
}

async function lignesMois(admin: any, appId: string, dimension: string, mois: string, limite: number): Promise<RequeteMois[]> {
  const { data, error } = await admin.schema("admin").from("seo_snapshots")
    .select("key, clicks, impressions, position")
    .eq("app_id", appId).eq("source", "google")
    .eq("granularity", "month").eq("dimension", dimension)
    .eq("period_start", `${mois}-01`).eq("is_noise", false)
    .order("clicks", { ascending: false }).limit(limite);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => ({
    cle: String(r.key),
    clics: Number(r.clicks),
    impressions: Number(r.impressions),
    position: arrondi(Number(r.position), 1),
  }));
}

export async function construireFaits(admin: any, appId: string, mois: string): Promise<Faits> {
  const { debut, fin } = bornes(mois);
  const prec = moisPrecedent(mois);
  const manquantes: string[] = [];

  const { data: app } = await admin.schema("config").from("apps")
    .select("id, name, domaine, repo_github").eq("id", appId).maybeSingle();
  if (!app) throw new Error("Site inconnu");

  // --- Partenariat : 12 mois jusqu'au mois du rapport, assiette du contrat.
  const { data: contrats } = await admin.schema("admin").from("partenariats")
    .select("*").eq("app_id", appId).order("debut").limit(1);
  const contrat = contrats?.[0] ?? null;
  let lignesPartenariat: any[] = [];
  if (contrat) {
    const { data, error } = await admin.rpc("admin_partenariat_serie", {
      p_partenariat: contrat.id, p_assiette: null, p_prix_unitaire: null,
    });
    if (error) throw new Error(error.message);
    lignesPartenariat = (data ?? [])
      .map((l: any) => ({ ...l, mois: String(l.mois).slice(0, 7) }))
      .filter((l: any) => l.mois <= mois)
      .slice(-12);
  } else {
    manquantes.push("Aucun contrat de partenariat sur ce site");
  }

  // --- Ventes du mois : B2C encaissees, jamais de donnee nominative.
  const { data: ventes, error: eVentes } = await admin.schema("admin").from("ventes_enrichies")
    .select("paid_at, offre, canal, domaine, montant_ttc, montant_ht")
    .eq("app_id", appId).eq("perimetre", "b2c").eq("exclue", false)
    .gt("montant_ttc", 0)
    .gte("paid_at", `${debut}T00:00:00Z`).lte("paid_at", `${fin}T23:59:59Z`)
    .order("paid_at");
  if (eVentes) throw new Error(eVentes.message);
  const lignesVentes = (ventes ?? []).map((v: any) => ({
    date: String(v.paid_at).slice(0, 10),
    offre: v.offre,
    canal: v.canal ?? "unattributed",
    domaine: v.domaine ?? null,
    montant_ttc: Number(v.montant_ttc),
    montant_ht: Number(v.montant_ht),
  }));
  const totalTtc = arrondi(lignesVentes.reduce((a: number, v: any) => a + v.montant_ttc, 0));
  const totalHt = arrondi(lignesVentes.reduce((a: number, v: any) => a + v.montant_ht, 0));

  const { data: anciennes } = await admin.schema("admin").from("ventes_enrichies")
    .select("domaine")
    .eq("app_id", appId).eq("perimetre", "b2c").eq("exclue", false)
    .not("domaine", "is", null)
    .lt("paid_at", `${debut}T00:00:00Z`).limit(5000);
  const domainesConnus = [...new Set((anciennes ?? []).map((v: any) => String(v.domaine)))];

  // --- SEO.
  const [gM, gP, bM, bP, reqM, reqP, pagesM] = await Promise.all([
    serieSite(admin, appId, "google", mois),
    serieSite(admin, appId, "google", prec),
    serieSite(admin, appId, "bing", mois),
    serieSite(admin, appId, "bing", prec),
    lignesMois(admin, appId, "query", mois, 1000),
    lignesMois(admin, appId, "query", prec, 1000),
    lignesMois(admin, appId, "page", mois, 10),
  ]);
  if (!gM) manquantes.push("Aucune mesure Google sur le mois");
  if (!bM) manquantes.push("Aucune mesure Bing sur le mois");

  const faitsHighlights: FaitsHighlights = {
    mois,
    partenariat: {
      franchise: contrat ? Number(contrat.franchise) : null,
      lignes: lignesPartenariat.map((l: any) => ({
        mois: l.mois,
        dans_decompte: l.dans_decompte !== false,
        ventes: Number(l.ventes),
        ventes_partageables: Number(l.ventes_partageables),
        quote_part: Number(l.quote_part),
      })),
    },
    seo: {
      google: { mois: gM, precedent: gP },
      bing: { mois: bM, precedent: bP },
      requetes_mois: reqM,
      requetes_precedent: reqP,
    },
    ventes: {
      domaines_mois: lignesVentes.map((v: any) => v.domaine).filter(Boolean),
      domaines_connus_avant: domainesConnus,
    },
  };

  return {
    site: { id: app.id, nom: app.name, domaine: app.domaine ?? null, repo_github: app.repo_github ?? null },
    mois,
    libelle_mois: libelleMois(mois),
    debut,
    fin,
    partenariat: {
      contrat: contrat && {
        id: contrat.id,
        partenaire: contrat.partenaire,
        debut: contrat.debut,
        franchise: Number(contrat.franchise),
        part: Number(contrat.part),
        assiette: contrat.assiette,
        prix_unitaire: contrat.prix_unitaire,
        prix_catalogue_ht: contrat.prix_catalogue_ht === null ? null : Number(contrat.prix_catalogue_ht),
        couts_directs: contrat.couts_directs ?? [],
      },
      lignes: lignesPartenariat,
    },
    ventes: { lignes: lignesVentes, nombre: lignesVentes.length, total_ttc: totalTtc, total_ht: totalHt },
    seo: {
      google: { mois: gM, precedent: gP },
      bing: { mois: bM, precedent: bP },
      top_requetes: reqM.slice(0, 10),
      top_pages: pagesM,
    },
    highlights: calculerHighlights(faitsHighlights),
    sources_manquantes: manquantes,
  };
}
