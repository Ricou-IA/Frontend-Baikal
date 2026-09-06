// Faits du rapport, lus dans l'archive `admin` (jamais en direct) : decompte
// du partenariat, ventes de la periode, SEO de la periode. Une source absente
// (pas de contrat, Bing avant le cron) donne une section vide et une entree
// dans `sources_manquantes`, jamais une erreur.
//
// Periode : deux dates incluses. Les totaux SEO sont exacts au jour ; les
// top requetes et pages n'existent qu'au mois dans l'archive, ils cumulent
// donc les mois couverts (dit dans le rapport quand la periode n'est pas un
// mois entier). Le decompte du partenariat reste mensuel par nature du contrat.
// deno-lint-ignore-file no-explicit-any
import { calculerHighlights, type FaitsHighlights, type RequeteMois, type TotauxSeo } from "./highlights.ts";
import {
  estMoisEntier,
  libelleMois,
  libellePeriode,
  moisCouverts,
  type Periode,
  periodePrecedente,
} from "./periode.ts";

export interface Faits {
  site: { id: string; nom: string; domaine: string | null; repo_github: string | null };
  periode: Periode;
  periode_precedente: Periode;
  libelle_periode: string;
  mois_entier: boolean;
  mois_couverts: string[];
  partenariat: { contrat: any | null; lignes: any[] };
  ventes: { lignes: any[]; nombre: number; total_ttc: number; total_ht: number; nombre_precedent: number | null };
  seo: {
    google: { periode: TotauxSeo | null; precedent: TotauxSeo | null };
    bing: { periode: TotauxSeo | null; precedent: TotauxSeo | null };
    top_requetes: RequeteMois[];
    top_pages: RequeteMois[];
  };
  highlights: string[];
  sources_manquantes: string[];
}

function arrondi(n: number, d = 2): number {
  return Number(n.toFixed(d));
}

// Totaux depuis la serie quotidienne du site : c'est la reference, elle
// inclut les requetes anonymisees que la somme des pages n'a pas.
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
    impressions_hors_bruit: null,
    ctr: impressions > 0 ? arrondi(clics / impressions, 4) : 0,
    position: impressions > 0 ? arrondi(posPond / impressions, 1) : 0,
  };
}

async function serieSite(admin: any, appId: string, source: string, p: Periode): Promise<TotauxSeo | null> {
  const { data, error } = await admin.schema("admin").from("seo_snapshots")
    .select("clicks, impressions, position")
    .eq("app_id", appId).eq("source", source)
    .eq("granularity", "day").eq("dimension", "site")
    .gte("period_start", p.debut).lte("period_start", p.fin);
  if (error) throw new Error(error.message);
  return totaux(data ?? []);
}

// Impressions Google hors bruit, au mois : total des pages du mois moins les
// requetes entre guillemets (is_noise), qui font des milliers d'impressions a
// 0 clic. Sur une periode partielle, c'est le cumul des mois couverts : dit
// dans le rapport. Null si aucun mois archive.
async function impressionsHorsBruit(admin: any, appId: string, mois: string[]): Promise<number | null> {
  if (mois.length === 0) return null;
  const debuts = mois.map((m) => `${m}-01`);
  const [pages, bruit] = await Promise.all([
    admin.schema("admin").from("seo_snapshots")
      .select("impressions")
      .eq("app_id", appId).eq("source", "google")
      .eq("granularity", "month").eq("dimension", "page")
      .in("period_start", debuts).limit(5000),
    admin.schema("admin").from("seo_snapshots")
      .select("impressions")
      .eq("app_id", appId).eq("source", "google")
      .eq("granularity", "month").eq("dimension", "query")
      .in("period_start", debuts).eq("is_noise", true).limit(5000),
  ]);
  if (pages.error) throw new Error(pages.error.message);
  if (bruit.error) throw new Error(bruit.error.message);
  if (!pages.data || pages.data.length === 0) return null;
  const somme = (rows: any[]) => rows.reduce((a, r) => a + Number(r.impressions), 0);
  return Math.max(0, somme(pages.data) - somme(bruit.data ?? []));
}

// Lignes mensuelles (requetes ou pages) cumulees sur les mois couverts :
// somme des clics et impressions, position ponderee par les impressions.
async function lignesCumulees(admin: any, appId: string, dimension: string, mois: string[], limite: number): Promise<RequeteMois[]> {
  if (mois.length === 0) return [];
  const { data, error } = await admin.schema("admin").from("seo_snapshots")
    .select("period_start, key, clicks, impressions, position")
    .eq("app_id", appId).eq("source", "google")
    .eq("granularity", "month").eq("dimension", dimension)
    .in("period_start", mois.map((m) => `${m}-01`)).eq("is_noise", false)
    .order("clicks", { ascending: false }).limit(limite * mois.length);
  if (error) throw new Error(error.message);
  const cumul = new Map<string, { clics: number; impressions: number; posPond: number }>();
  for (const r of data ?? []) {
    const cle = String(r.key);
    const cur = cumul.get(cle) ?? { clics: 0, impressions: 0, posPond: 0 };
    cur.clics += Number(r.clicks);
    cur.impressions += Number(r.impressions);
    cur.posPond += Number(r.position) * Number(r.impressions);
    cumul.set(cle, cur);
  }
  return [...cumul.entries()]
    .map(([cle, c]) => ({
      cle,
      clics: c.clics,
      impressions: c.impressions,
      position: c.impressions > 0 ? arrondi(c.posPond / c.impressions, 1) : 0,
    }))
    .sort((a, b) => b.clics - a.clics)
    .slice(0, limite);
}

async function compterVentes(admin: any, appId: string, p: Periode): Promise<number> {
  const { count, error } = await admin.schema("admin").from("ventes_enrichies")
    .select("id", { count: "exact", head: true })
    .eq("app_id", appId).eq("perimetre", "b2c").eq("exclue", false)
    .gt("montant_ttc", 0)
    .gte("paid_at", `${p.debut}T00:00:00Z`).lte("paid_at", `${p.fin}T23:59:59Z`);
  if (error) throw new Error(error.message);
  return Number(count ?? 0);
}

export async function construireFaits(admin: any, appId: string, periode: Periode): Promise<Faits> {
  const prec = periodePrecedente(periode);
  const moisEntier = estMoisEntier(periode);
  const mois = moisCouverts(periode);
  const moisPrec = moisCouverts(prec);
  const manquantes: string[] = [];

  const { data: app } = await admin.schema("config").from("apps")
    .select("id, name, domaine, repo_github").eq("id", appId).maybeSingle();
  if (!app) throw new Error("Site inconnu");

  // --- Partenariat : 12 mois jusqu'au dernier mois couvert, assiette du contrat.
  const { data: contrats } = await admin.schema("admin").from("partenariats")
    .select("*").eq("app_id", appId).order("debut").limit(1);
  const contrat = contrats?.[0] ?? null;
  let lignesPartenariat: any[] = [];
  if (contrat) {
    const { data, error } = await admin.rpc("admin_partenariat_serie", {
      p_partenariat: contrat.id, p_assiette: null, p_prix_unitaire: null,
    });
    if (error) throw new Error(error.message);
    const dernier = mois[mois.length - 1];
    lignesPartenariat = (data ?? [])
      .map((l: any) => ({ ...l, mois: String(l.mois).slice(0, 7) }))
      .filter((l: any) => l.mois <= dernier)
      .slice(-12);
  } else {
    manquantes.push("Aucun contrat de partenariat sur ce site");
  }

  // --- Ventes de la periode : B2C encaissees, jamais de donnee nominative,
  // et sans origine : le partenaire ne descend pas a cette finesse (Eric, 06/09).
  const { data: ventes, error: eVentes } = await admin.schema("admin").from("ventes_enrichies")
    .select("paid_at, offre, montant_ttc, montant_ht")
    .eq("app_id", appId).eq("perimetre", "b2c").eq("exclue", false)
    .gt("montant_ttc", 0)
    .gte("paid_at", `${periode.debut}T00:00:00Z`).lte("paid_at", `${periode.fin}T23:59:59Z`)
    .order("paid_at");
  if (eVentes) throw new Error(eVentes.message);
  const lignesVentes = (ventes ?? []).map((v: any) => ({
    date: String(v.paid_at).slice(0, 10),
    offre: v.offre,
    montant_ttc: Number(v.montant_ttc),
    montant_ht: Number(v.montant_ht),
  }));
  const totalTtc = arrondi(lignesVentes.reduce((a: number, v: any) => a + v.montant_ttc, 0));
  const totalHt = arrondi(lignesVentes.reduce((a: number, v: any) => a + v.montant_ht, 0));

  // Periode precedente « mesuree » si l'archive a au moins une vente avant le
  // debut de la periode, sinon la comparaison n'aurait pas de sens.
  const { count: avant } = await admin.schema("admin").from("ventes_enrichies")
    .select("id", { count: "exact", head: true })
    .eq("app_id", appId).eq("perimetre", "b2c").eq("exclue", false)
    .lt("paid_at", `${periode.debut}T00:00:00Z`);
  const nombrePrecedent = Number(avant ?? 0) > 0 ? await compterVentes(admin, appId, prec) : null;

  // --- SEO.
  const [gBrut, gpBrut, bM, bP, reqM, reqP, pagesM, hbM, hbP] = await Promise.all([
    serieSite(admin, appId, "google", periode),
    serieSite(admin, appId, "google", prec),
    serieSite(admin, appId, "bing", periode),
    serieSite(admin, appId, "bing", prec),
    lignesCumulees(admin, appId, "query", mois, 1000),
    lignesCumulees(admin, appId, "query", moisPrec, 1000),
    lignesCumulees(admin, appId, "page", mois, 10),
    impressionsHorsBruit(admin, appId, mois),
    impressionsHorsBruit(admin, appId, moisPrec),
  ]);
  const gM = gBrut && { ...gBrut, impressions_hors_bruit: hbM };
  const gP = gpBrut && { ...gpBrut, impressions_hors_bruit: hbP };
  if (!gM) manquantes.push("Aucune mesure Google sur la période");
  if (!bM) manquantes.push("Aucune mesure Bing sur la période");

  const libelle = libellePeriode(periode);
  const ligneMois = moisEntier ? lignesPartenariat.find((l: any) => l.mois === mois[0]) : null;

  const faitsHighlights: FaitsHighlights = {
    libelle: moisEntier ? `en ${libelle}` : libelle,
    libelle_precedent: moisEntier ? `en ${libelleMois(moisPrec[0])}` : "sur la période précédente",
    ventes: { periode: lignesVentes.length, precedent: nombrePrecedent },
    franchise: contrat && ligneMois && ligneMois.dans_decompte !== false
      ? {
        seuil: Number(contrat.franchise),
        ventes: Number(ligneMois.ventes),
        partageables: Number(ligneMois.ventes_partageables),
        quote_part: Number(ligneMois.quote_part),
      }
      : null,
    seo: {
      google: { periode: gM, precedent: gP },
      bing: { periode: bM, precedent: bP },
      requetes_periode: reqM,
      requetes_precedent: reqP,
    },
  };

  return {
    site: { id: app.id, nom: app.name, domaine: app.domaine ?? null, repo_github: app.repo_github ?? null },
    periode,
    periode_precedente: prec,
    libelle_periode: libelle,
    mois_entier: moisEntier,
    mois_couverts: mois,
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
    ventes: {
      lignes: lignesVentes,
      nombre: lignesVentes.length,
      total_ttc: totalTtc,
      total_ht: totalHt,
      nombre_precedent: nombrePrecedent,
    },
    seo: {
      google: { periode: gM, precedent: gP },
      bing: { periode: bM, precedent: bP },
      top_requetes: reqM.slice(0, 10),
      top_pages: pagesM,
    },
    highlights: calculerHighlights(faitsHighlights),
    sources_manquantes: manquantes,
  };
}
