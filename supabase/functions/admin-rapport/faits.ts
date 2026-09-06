// Faits du rapport, lus dans l'archive `admin` (jamais en direct, sauf la
// conversion par page d'entree qui lit la vue contractuelle du site) :
// Registre des Ventes et compte de partage (Annexe 2 du contrat signe),
// ventes de la periode, SEO de la periode, lecture SEO. Une source absente
// (pas de contrat, Bing avant le cron) donne une section vide et une entree
// dans `sources_manquantes`, jamais une erreur.
//
// Periode : deux dates incluses. Les totaux SEO sont exacts au jour ; les
// top requetes et pages n'existent qu'au mois dans l'archive, ils cumulent
// donc les mois couverts (dit dans le rapport quand la periode n'est pas un
// mois entier). Le decompte du partenariat reste mensuel par nature du contrat.
// deno-lint-ignore-file no-explicit-any
import { calculerHighlights, type FaitsHighlights, type RequeteMois, type TotauxSeo } from "./highlights.ts";
import type { Commit } from "./github.ts";
import { construireLectureSeo, type LectureSeo } from "./lecture-seo.ts";
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
  partenariat: {
    contrat: any | null;
    lignes: any[];
    cumul_12_mois: { ca_ht: number; resultat_partageable: number; depuis: string | null } | null;
  };
  ventes: {
    lignes: any[];
    nombre: number;
    remboursees: number;
    nettes: number;
    total_ttc: number;
    total_ht: number;
    nombre_precedent: number | null;
  };
  seo: {
    google: { periode: TotauxSeo | null; precedent: TotauxSeo | null };
    bing: { periode: TotauxSeo | null; precedent: TotauxSeo | null };
    top_requetes: RequeteMois[];
    top_pages: RequeteMois[];
  };
  lecture_seo: LectureSeo | null;
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

// Ventes B2C encaissees (> 0 EUR) d'une periode : brutes et nettes de
// remboursements (une vente remboursee n'est pas une Vente, art. 1).
async function compterVentes(admin: any, appId: string, p: Periode): Promise<{ brutes: number; nettes: number }> {
  const { data, error } = await admin.schema("admin").from("ventes_enrichies")
    .select("montant_rembourse")
    .eq("app_id", appId).eq("perimetre", "b2c").eq("exclue", false)
    .gt("montant_ttc", 0)
    .gte("paid_at", `${p.debut}T00:00:00Z`).lte("paid_at", `${p.fin}T23:59:59Z`);
  if (error) throw new Error(error.message);
  const brutes = (data ?? []).length;
  const nettes = (data ?? []).filter((v: any) => Number(v.montant_rembourse) === 0).length;
  return { brutes, nettes };
}

export async function construireFaits(admin: any, appId: string, periode: Periode, commitsSeo: Commit[] = []): Promise<Faits> {
  const prec = periodePrecedente(periode);
  const moisEntier = estMoisEntier(periode);
  const mois = moisCouverts(periode);
  const moisPrec = moisCouverts(prec);
  const manquantes: string[] = [];

  const { data: app } = await admin.schema("config").from("apps")
    .select("id, name, domaine, repo_github").eq("id", appId).maybeSingle();
  if (!app) throw new Error("Site inconnu");

  // --- Partenariat : Registre et compte de partage, 12 mois jusqu'au dernier
  // mois couvert, assiette du contrat.
  const { data: contrats } = await admin.schema("admin").from("partenariats")
    .select("*").eq("app_id", appId).order("debut").limit(1);
  const contrat = contrats?.[0] ?? null;
  let lignesPartenariat: any[] = [];
  let cumul: Faits["partenariat"]["cumul_12_mois"] = null;
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
    // Clause de rendez-vous (art. 20) : CA HT et Resultat Partageable sur 12
    // mois glissants.
    cumul = {
      ca_ht: arrondi(lignesPartenariat.reduce((a: number, l: any) => a + Number(l.ca_ht), 0)),
      resultat_partageable: arrondi(lignesPartenariat.reduce((a: number, l: any) => a + Number(l.resultat_partageable), 0)),
      depuis: lignesPartenariat[0]?.mois ?? null,
    };
  } else {
    manquantes.push("Aucun contrat de partenariat sur ce site");
  }

  // --- Ventes de la periode : B2C encaissees, jamais de donnee nominative,
  // et sans origine : le partenaire ne descend pas a cette finesse (Eric, 06/09).
  const { data: ventes, error: eVentes } = await admin.schema("admin").from("ventes_enrichies")
    .select("paid_at, offre, montant_ttc, montant_ht, montant_rembourse, rembourse_le")
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
    montant_rembourse: Number(v.montant_rembourse ?? 0),
    rembourse_le: v.rembourse_le ? String(v.rembourse_le).slice(0, 10) : null,
  }));
  const nettes = lignesVentes.filter((v: any) => v.montant_rembourse === 0);
  const totalTtc = arrondi(nettes.reduce((a: number, v: any) => a + v.montant_ttc, 0));
  const totalHt = arrondi(nettes.reduce((a: number, v: any) => a + v.montant_ht, 0));

  // Periode precedente « mesuree » si l'archive a au moins une vente avant le
  // debut de la periode, sinon la comparaison n'aurait pas de sens.
  const { count: avant } = await admin.schema("admin").from("ventes_enrichies")
    .select("id", { count: "exact", head: true })
    .eq("app_id", appId).eq("perimetre", "b2c").eq("exclue", false)
    .lt("paid_at", `${periode.debut}T00:00:00Z`);
  const precedent = Number(avant ?? 0) > 0 ? await compterVentes(admin, appId, prec) : null;

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
    ventes: { periode: nettes.length, precedent: precedent ? precedent.nettes : null },
    franchise: contrat && ligneMois && ligneMois.dans_decompte !== false
      ? {
        seuil: Number(contrat.franchise),
        ventes: Number(ligneMois.ventes_nettes),
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

  // --- Lecture SEO (grille du flash audit). Une panne ici ne doit pas
  // empecher le rapport : section absente et signalee.
  let lecture: LectureSeo | null = null;
  try {
    lecture = await construireLectureSeo(admin, appId, periode, { ventes: lignesVentes.length, nettes: nettes.length }, commitsSeo);
    manquantes.push(...lecture.sources_manquantes);
  } catch (e) {
    manquantes.push(`Lecture SEO indisponible : ${(e as Error).message}`);
  }

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
      cumul_12_mois: cumul,
    },
    ventes: {
      lignes: lignesVentes,
      nombre: lignesVentes.length,
      remboursees: lignesVentes.length - nettes.length,
      nettes: nettes.length,
      total_ttc: totalTtc,
      total_ht: totalHt,
      nombre_precedent: precedent ? precedent.nettes : null,
    },
    seo: {
      google: { periode: gM, precedent: gP },
      bing: { periode: bM, precedent: bP },
      top_requetes: reqM.slice(0, 10),
      top_pages: pagesM,
    },
    lecture_seo: lecture,
    highlights: calculerHighlights(faitsHighlights),
    sources_manquantes: manquantes,
  };
}
