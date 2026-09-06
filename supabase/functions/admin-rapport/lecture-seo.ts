// « Lecture SEO » : les blocs calcules de la grille du flash audit
// (docs/superpowers/prompts/2026-09-06-grille-flash-audit-seo.md, depot Pack
// Vendeur), plus l'autorite Moz et la repartition par appareil. Trois regles
// venues de vrais faux positifs :
//   (a) jamais de position moyenne globale ni de total d'impressions brut ;
//   (b) toujours `not is_noise`, et des semaines pleines / jours ouvres ;
//   (c) deux comptes de ventes legitimes (paiement, creation) : nommer celui
//       qu'on affiche.
// deno-lint-ignore-file no-explicit-any
import { chargerSite, ErreurSite, lecteurSite } from "../_shared/sites.ts";
import type { Commit } from "./github.ts";
// Meme cascade d'attribution que la page Clients : la part organique des
// ventes se lit sur l'attribution figee de chaque vente, par date de paiement.
import { canalVente } from "../admin-dossiers/canal.ts";
import { moisCouverts, type Periode, periodePrecedente } from "./periode.ts";

export interface LigneCluster {
  cluster: string;
  requetes: number;
  clics: number;
  impressions: number;
  position: number | null;
}

export interface LigneSemaine {
  semaine: string; // lundi, YYYY-MM-DD
  jours: number; // 7 pour une semaine pleine
  clics: number;
  clics_par_jour: number;
  impressions: number;
  reference: boolean;
}

export interface LigneSuivi {
  requete: string;
  page: string | null;
  clics: number;
  impressions: number;
  position: number | null;
  position_precedente: number | null;
}

export interface LignePageCle {
  page: string;
  requetes: number;
  clics: number;
  impressions: number;
  position: number | null;
  clics_precedent: number;
  impressions_precedent: number;
  position_precedente: number | null;
  top_requetes: string[];
}

// Trafic d'une periode, sept jours sur sept : un SaaS vend le week-end.
export interface TraficPeriode {
  jours: number;
  clics: number;
  impressions: number;
  clics_par_jour: number;
  impressions_par_jour: number;
}

export interface LigneAutorite {
  domaine: string;
  notre: boolean;
  mesure_le: string | null;
  da: number | null;
  ref_domains: number | null;
  spam: number | null;
  da_precedent: number | null;
  ref_domains_precedent: number | null;
}

export interface LigneAppareil {
  appareil: string; // mobile | desktop | tablet
  clics: number;
  impressions: number;
  part_clics: number; // 0..1
  clics_precedent: number | null;
  part_clics_precedent: number | null;
}

export interface Chantier {
  date: string;
  libelle: string;
  cible: string | null;
  hypothese: string | null;
  mesure_prevue_le: string | null;
  verdict: string | null;
  source: "declare" | "commit";
}

export interface LectureSeo {
  trafic: { google: LigneSemaine[]; bing: LigneSemaine[] };
  trafic_periode: {
    google: { periode: TraficPeriode | null; precedent: TraficPeriode | null };
    bing: { periode: TraficPeriode | null; precedent: TraficPeriode | null };
  };
  appareils: LigneAppareil[];
  ventes: {
    par_paiement: { ventes: number; nettes: number; organiques?: number };
    par_creation: {
      disponible: boolean;
      dossiers: number;
      emails: number;
      payes: number;
      payes_organique: number;
      par_canal: { canal: string; dossiers: number; emails: number; payes: number }[];
      par_page: { page: string; dossiers: number; emails: number; payes: number }[];
    };
  };
  clusters: { periode: LigneCluster[]; precedent: LigneCluster[] };
  suivi: { requetes: LigneSuivi[]; pages: LignePageCle[]; disponible: boolean };
  autorite: LigneAutorite[];
  chantiers: Chantier[];
  sources_manquantes: string[];
}

// Ordre des `when` de la grille : « en ligne » avant « prix », « prix » avant
// « modele ». Le premier motif qui correspond gagne.
const CLUSTERS: [string, RegExp][] = [
  ["en_ligne", /en ligne|en-ligne/i],
  ["prix", /prix|tarif|co[uû]t|cher/i],
  ["modele", /mod[eè]le|vierge|gratuit|formulaire|word|pdf|exemple/i],
  ["foncia", /foncia|nexity|citya/i],
  ["delai", /d[ée]lai|10 jours|elan/i],
  ["tantiemes", /tanti/i],
  ["remboursement", /rembours/i],
];

function cluster(requete: string): string {
  for (const [nom, re] of CLUSTERS) if (re.test(requete)) return nom;
  return "autre";
}

function arrondi(n: number, d = 1): number {
  return Number(n.toFixed(d));
}

function jourIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// --- Bloc 1 : trafic en semaines pleines de sept jours (lundi-dimanche).
async function traficHebdo(admin: any, appId: string, source: string, fin: string): Promise<LigneSemaine[]> {
  const finDate = new Date(`${fin}T00:00:00Z`);
  const dernierDimanche = new Date(finDate);
  dernierDimanche.setUTCDate(finDate.getUTCDate() - ((finDate.getUTCDay() + 7) % 7));
  const premierLundi = new Date(dernierDimanche);
  premierLundi.setUTCDate(dernierDimanche.getUTCDate() - 6 - 7 * 11); // 12 semaines
  const { data, error } = await admin.schema("admin").from("seo_snapshots")
    .select("period_start, clicks, impressions")
    .eq("app_id", appId).eq("source", source)
    .eq("granularity", "day").eq("dimension", "site")
    .gte("period_start", jourIso(premierLundi)).lte("period_start", jourIso(dernierDimanche));
  if (error) throw new Error(error.message);
  const semaines = new Map<string, { clics: number; impressions: number; jours: number }>();
  for (const r of data ?? []) {
    const d = new Date(`${r.period_start}T00:00:00Z`);
    const js = d.getUTCDay();
    const lundi = new Date(d);
    lundi.setUTCDate(d.getUTCDate() - ((js + 6) % 7));
    const cle = jourIso(lundi);
    const cur = semaines.get(cle) ?? { clics: 0, impressions: 0, jours: 0 };
    cur.clics += Number(r.clicks);
    cur.impressions += Number(r.impressions);
    cur.jours += 1;
    semaines.set(cle, cur);
  }
  const lignes: LigneSemaine[] = [...semaines.entries()]
    .filter(([, s]) => s.jours >= 7) // semaine pleine seulement
    .map(([semaine, s]) => ({
      semaine,
      jours: s.jours,
      clics: s.clics,
      clics_par_jour: arrondi(s.clics / s.jours),
      impressions: s.impressions,
      reference: false,
    }))
    .sort((a, b) => a.semaine.localeCompare(b.semaine));
  if (lignes.length > 1) {
    const candidates = lignes.slice(0, -1);
    const meilleure = candidates.reduce((a, b) => (b.clics_par_jour > a.clics_par_jour ? b : a));
    meilleure.reference = true;
  }
  // Du plus recent au plus ancien (premiere ligne lue = derniere semaine
  // pleine), la semaine de reference en dernier si elle est plus ancienne.
  const dernieres = lignes.slice(-6).reverse();
  const ref = lignes.find((l) => l.reference);
  return ref && !dernieres.includes(ref) ? [...dernieres, ref] : dernieres;
}

// --- Bloc 1 (consigne) : periode contre periode precedente, tous les jours,
// depuis la serie quotidienne du site.
async function traficPeriode(admin: any, appId: string, source: string, p: Periode): Promise<TraficPeriode | null> {
  const { data, error } = await admin.schema("admin").from("seo_snapshots")
    .select("period_start, clicks, impressions")
    .eq("app_id", appId).eq("source", source)
    .eq("granularity", "day").eq("dimension", "site")
    .gte("period_start", p.debut).lte("period_start", p.fin);
  if (error) throw new Error(error.message);
  let jours = 0, clics = 0, impressions = 0;
  for (const r of data ?? []) {
    jours += 1;
    clics += Number(r.clicks);
    impressions += Number(r.impressions);
  }
  if (jours === 0) return null;
  return { jours, clics, impressions, clics_par_jour: arrondi(clics / jours), impressions_par_jour: arrondi(impressions / jours) };
}

// --- Appareils : mobile / ordinateur / tablette (dimension device, au mois).
async function appareilsSur(admin: any, appId: string, mois: string[]): Promise<Map<string, { clics: number; impressions: number }>> {
  const out = new Map<string, { clics: number; impressions: number }>();
  if (mois.length === 0) return out;
  const { data, error } = await admin.schema("admin").from("seo_snapshots")
    .select("key, clicks, impressions")
    .eq("app_id", appId).eq("source", "google")
    .eq("granularity", "month").eq("dimension", "device")
    .in("period_start", mois.map((m) => `${m}-01`));
  if (error) throw new Error(error.message);
  for (const r of data ?? []) {
    const k = String(r.key).toLowerCase();
    const cur = out.get(k) ?? { clics: 0, impressions: 0 };
    cur.clics += Number(r.clicks);
    cur.impressions += Number(r.impressions);
    out.set(k, cur);
  }
  return out;
}

function appareils(periode: Map<string, { clics: number; impressions: number }>, precedent: Map<string, { clics: number; impressions: number }>): LigneAppareil[] {
  const total = [...periode.values()].reduce((a, v) => a + v.clics, 0);
  const totalPrec = [...precedent.values()].reduce((a, v) => a + v.clics, 0);
  const ordre = ["mobile", "desktop", "tablet"];
  return ordre
    .filter((k) => periode.has(k) || precedent.has(k))
    .map((k) => {
      const p = periode.get(k) ?? { clics: 0, impressions: 0 };
      const q = precedent.get(k);
      return {
        appareil: k,
        clics: p.clics,
        impressions: p.impressions,
        part_clics: total > 0 ? arrondi(p.clics / total, 3) : 0,
        clics_precedent: q ? q.clics : null,
        part_clics_precedent: q && totalPrec > 0 ? arrondi(q.clics / totalPrec, 3) : null,
      };
    });
}

// --- Bloc 3 : clusters mensuels sur les mois couverts (not is_noise).
async function clustersSur(admin: any, appId: string, mois: string[]): Promise<LigneCluster[]> {
  if (mois.length === 0) return [];
  const { data, error } = await admin.schema("admin").from("seo_snapshots")
    .select("key, clicks, impressions, position")
    .eq("app_id", appId).eq("source", "google")
    .eq("granularity", "month").eq("dimension", "query")
    .in("period_start", mois.map((m) => `${m}-01`)).eq("is_noise", false)
    .limit(5000);
  if (error) throw new Error(error.message);
  const agg = new Map<string, { requetes: Set<string>; clics: number; impressions: number; posPond: number }>();
  for (const r of data ?? []) {
    const c = cluster(String(r.key));
    const cur = agg.get(c) ?? { requetes: new Set<string>(), clics: 0, impressions: 0, posPond: 0 };
    cur.requetes.add(String(r.key));
    cur.clics += Number(r.clicks);
    cur.impressions += Number(r.impressions);
    cur.posPond += Number(r.position) * Number(r.impressions);
    agg.set(c, cur);
  }
  const ordre = [...CLUSTERS.map(([n]) => n), "autre"];
  return ordre
    .filter((c) => agg.has(c))
    .map((c) => {
      const a = agg.get(c)!;
      return {
        cluster: c,
        requetes: a.requetes.size,
        clics: a.clics,
        impressions: a.impressions,
        position: a.impressions > 0 ? arrondi(a.posPond / a.impressions) : null,
      };
    });
}

// --- Blocs 4 et 5 : requete x page (dimension croisee archivee au mois).
interface Croise {
  requete: string;
  page: string;
  clics: number;
  impressions: number;
  position: number | null;
}

async function croiseSur(admin: any, appId: string, mois: string[]): Promise<Croise[]> {
  if (mois.length === 0) return [];
  const { data, error } = await admin.schema("admin").from("seo_snapshots")
    .select("key, clicks, impressions, position")
    .eq("app_id", appId).eq("source", "google")
    .eq("granularity", "month").eq("dimension", "query_page")
    .in("period_start", mois.map((m) => `${m}-01`)).eq("is_noise", false)
    .limit(10000);
  if (error) throw new Error(error.message);
  const agg = new Map<string, { requete: string; page: string; clics: number; impressions: number; posPond: number }>();
  for (const r of data ?? []) {
    const cle = String(r.key);
    const i = cle.indexOf("|");
    if (i < 0) continue;
    const cur = agg.get(cle) ?? { requete: cle.slice(0, i), page: cle.slice(i + 1), clics: 0, impressions: 0, posPond: 0 };
    cur.clics += Number(r.clicks);
    cur.impressions += Number(r.impressions);
    cur.posPond += Number(r.position) * Number(r.impressions);
    agg.set(cle, cur);
  }
  return [...agg.values()].map((a) => ({
    requete: a.requete,
    page: a.page,
    clics: a.clics,
    impressions: a.impressions,
    position: a.impressions > 0 ? arrondi(a.posPond / a.impressions) : null,
  }));
}

function chemin(url: string): string {
  return url.replace(/^https?:\/\/[^/]+/, "") || "/";
}

function suiviRequetes(panier: string[], periode: Croise[], precedent: Croise[]): LigneSuivi[] {
  const meilleure = (rows: Croise[], q: string) =>
    rows.filter((r) => r.requete === q).sort((a, b) => b.impressions - a.impressions)[0] ?? null;
  return panier.map((q) => {
    const m = meilleure(periode, q);
    const p = meilleure(precedent, q);
    return {
      requete: q,
      page: m ? chemin(m.page) : null,
      clics: m?.clics ?? 0,
      impressions: m?.impressions ?? 0,
      position: m?.position ?? null,
      position_precedente: p?.position ?? null,
    };
  });
}

function suiviPages(pages: string[], base: string, periode: Croise[], precedent: Croise[]): LignePageCle[] {
  const surPage = (rows: Croise[], page: string) => rows.filter((r) => chemin(r.page) === page);
  const stats = (rows: Croise[]) => {
    let clics = 0, impressions = 0, posPond = 0;
    for (const r of rows) {
      clics += r.clics;
      impressions += r.impressions;
      posPond += (r.position ?? 0) * r.impressions;
    }
    return { clics, impressions, position: impressions > 0 ? arrondi(posPond / impressions) : null };
  };
  return pages.map((page) => {
    const m = surPage(periode, page);
    const p = surPage(precedent, page);
    const sm = stats(m), sp = stats(p);
    return {
      page: page === "/" ? `${base}/` : page,
      requetes: m.length,
      clics: sm.clics,
      impressions: sm.impressions,
      position: sm.position,
      clics_precedent: sp.clics,
      impressions_precedent: sp.impressions,
      position_precedente: sp.position,
      top_requetes: [...m].sort((a, b) => b.clics - a.clics || b.impressions - a.impressions).slice(0, 8).map((r) => r.requete),
    };
  });
}

// --- Autorite Moz : dernier releve <= fin de periode, et dernier releve <=
// fin de la periode precedente. Le notre en tete, puis par domaines referents.
async function autoriteSur(admin: any, appId: string, notreDomaine: string | null, fin: string, finPrec: string): Promise<LigneAutorite[]> {
  const { data, error } = await admin.schema("admin").from("seo_autorite")
    .select("domaine, mesure_le, da, ref_domains, spam")
    .eq("app_id", appId).lte("mesure_le", fin).order("mesure_le");
  if (error) throw new Error(error.message);
  const dernier = new Map<string, any>();
  const dernierPrec = new Map<string, any>();
  for (const r of data ?? []) {
    dernier.set(r.domaine, r);
    if (String(r.mesure_le) <= finPrec) dernierPrec.set(r.domaine, r);
  }
  return [...dernier.entries()]
    .map(([domaine, r]) => {
      const p = dernierPrec.get(domaine);
      return {
        domaine,
        notre: domaine === notreDomaine,
        mesure_le: String(r.mesure_le).slice(0, 10),
        da: r.da ?? null,
        ref_domains: r.ref_domains ?? null,
        spam: r.spam ?? null,
        da_precedent: p && p !== r ? (p.da ?? null) : null,
        ref_domains_precedent: p && p !== r ? (p.ref_domains ?? null) : null,
      };
    })
    .sort((a, b) => (b.notre ? 1 : 0) - (a.notre ? 1 : 0) || (b.ref_domains ?? 0) - (a.ref_domains ?? 0));
}

// --- Chantiers : declares dans Baikal (verdict pose), plus les commits SEO
// du depot (sans saisie : ce qui a ete fait est dans git).
// Un commit vaut chantier SEO s'il porte un scope SEO (feat(seo), docs(geo),
// fix(contenu)...) ou un sujet explicitement SEO. Le tunnel, l'admin, les
// widgets et les emails n'en sont pas, meme s'ils touchent une « page ».
const SCOPE_SEO = /^\w+\((seo|geo|contenu|blog|guide|guides|glossaire|sitemap|netlinking|aeo)\)/i;
const SUJET_SEO = /\b(seo|geo|aeo|301|redirection|canonique|canonical|meta|schema|json-ld|sitemap|netlinking|backlink|llms\.txt|glossaire|maillage|title|balise)\b/i;
const HORS_SEO = /\b(admin|widget|checkout|stripe|paiement|email|mailing|prospection|leads|mcp|rgpd|cron|rls)\b/i;
const MAX_COMMITS_CHANTIERS = 10;

function chantiersDepuis(declares: any[], commits: Commit[]): Chantier[] {
  const out: Chantier[] = declares.map((c) => ({
    date: String(c.date).slice(0, 10),
    libelle: c.libelle,
    cible: c.cible ?? null,
    hypothese: c.hypothese ?? null,
    mesure_prevue_le: c.mesure_prevue_le ? String(c.mesure_prevue_le).slice(0, 10) : null,
    verdict: c.verdict ?? null,
    source: "declare" as const,
  }));
  const dejaVus = new Set(out.map((c) => c.libelle.toLowerCase()));
  const retenus = [...commits]
    .filter((c) => (SCOPE_SEO.test(c.sujet) || SUJET_SEO.test(c.sujet)) && !HORS_SEO.test(c.sujet))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_COMMITS_CHANTIERS);
  for (const c of retenus) {
    const libelle = c.sujet.replace(/^\w+(\([^)]*\))?:\s*/, "");
    if (dejaVus.has(libelle.toLowerCase())) continue;
    out.push({ date: c.date, libelle, cible: null, hypothese: null, mesure_prevue_le: null, verdict: null, source: "commit" });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

// --- Bloc 6 : ventes par date de creation, conversion par page d'entree.
// Lecture EN DIRECT de la vue contractuelle du site (baikal_dossiers).
async function ventesParCreation(admin: any, appId: string, p: Periode) {
  const vide = {
    disponible: false, dossiers: 0, emails: 0, payes: 0, payes_organique: 0,
    par_canal: [] as any[], par_page: [] as any[],
  };
  const site = await chargerSite(admin, appId);
  const sql = lecteurSite(site, 8000);
  try {
    const candidats = [site.db_schema, "public"].filter((s): s is string => Boolean(s));
    let schema: string | null = null;
    for (const s of candidats) {
      const [r] = await sql`SELECT to_regclass(${s + ".baikal_dossiers"}) IS NOT NULL AS ok`;
      if (r.ok) { schema = s; break; }
    }
    if (!schema) return vide;
    const colonnes = new Set(
      (await sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = ${schema} AND table_name = 'baikal_dossiers'`)
        .map((c: { column_name: string }) => c.column_name),
    );
    if (!colonnes.has("attribution") || !colonnes.has("cree_le")) return vide;
    const email = colonnes.has("email_capture_le") ? sql`email_capture_le IS NOT NULL` : sql`false`;
    const debut = `${p.debut}T00:00:00Z`;
    const fin = `${p.fin}T23:59:59Z`;
    const base = sql`
      FROM ${sql(schema)}.baikal_dossiers
      WHERE cree_le >= ${debut}::timestamptz AND cree_le <= ${fin}::timestamptz
        AND est_test IS NOT TRUE AND supprime_le IS NULL
        ${colonnes.has("perimetre") ? sql`AND coalesce(perimetre, 'b2c') = 'b2c'` : sql``}`;
    const [tot] = await sql`
      SELECT count(*)::int AS dossiers,
             count(*) FILTER (WHERE ${email})::int AS emails,
             count(*) FILTER (WHERE paye_le IS NOT NULL)::int AS payes,
             count(*) FILTER (WHERE paye_le IS NOT NULL AND attribution->>'channel' = 'organic_search')::int AS payes_organique
      ${base}`;
    const parCanal = await sql`
      SELECT coalesce(attribution->>'channel', 'inconnu') AS canal,
             count(*)::int AS dossiers,
             count(*) FILTER (WHERE ${email})::int AS emails,
             count(*) FILTER (WHERE paye_le IS NOT NULL)::int AS payes
      ${base}
      GROUP BY 1 ORDER BY 2 DESC`;
    const parPage = await sql`
      SELECT coalesce(attribution->>'landing_page', '(inconnue)') AS page,
             count(*)::int AS dossiers,
             count(*) FILTER (WHERE ${email})::int AS emails,
             count(*) FILTER (WHERE paye_le IS NOT NULL)::int AS payes
      ${base}
      AND attribution->>'channel' = 'organic_search'
      GROUP BY 1 ORDER BY 2 DESC LIMIT 8`;
    return {
      disponible: true,
      dossiers: Number(tot.dossiers),
      emails: Number(tot.emails),
      payes: Number(tot.payes),
      payes_organique: Number(tot.payes_organique),
      par_canal: parCanal.map((r: any) => ({ canal: r.canal, dossiers: Number(r.dossiers), emails: Number(r.emails), payes: Number(r.payes) })),
      par_page: parPage.map((r: any) => ({ page: r.page, dossiers: Number(r.dossiers), emails: Number(r.emails), payes: Number(r.payes) })),
    };
  } finally {
    await sql.end({ timeout: 2 }).catch(() => {});
  }
}

// Ventes nettes de la periode venues du referencement naturel, par date de
// paiement (le compte du contrat), d'apres l'attribution figee de chaque vente.
async function organiquesParPaiement(admin: any, appId: string, p: Periode): Promise<number> {
  const { data, error } = await admin.schema("admin").from("ventes_enrichies")
    .select("attribution")
    .eq("app_id", appId).eq("perimetre", "b2c").eq("exclue", false)
    .gt("montant_ttc", 0).eq("montant_rembourse", 0)
    .gte("paid_at", `${p.debut}T00:00:00Z`).lte("paid_at", `${p.fin}T23:59:59Z`);
  if (error) throw new Error(error.message);
  return (data ?? []).filter((v: any) => canalVente(v.attribution ?? null) === "organic").length;
}

export async function construireLectureSeo(
  admin: any,
  appId: string,
  periode: Periode,
  ventesParPaiement: { ventes: number; nettes: number },
  commits: Commit[] = [],
): Promise<LectureSeo> {
  const prec = periodePrecedente(periode);
  const mois = moisCouverts(periode);
  const moisPrec = moisCouverts(prec);
  const manquantes: string[] = [];

  const { data: app } = await admin.schema("config").from("apps")
    .select("domaine, seo_panier, seo_pages_cles").eq("id", appId).maybeSingle();
  const panier: string[] = Array.isArray(app?.seo_panier) ? app.seo_panier.map(String) : [];
  const pagesCles: string[] = Array.isArray(app?.seo_pages_cles) ? app.seo_pages_cles.map(String) : [];
  const base = app?.domaine ? `https://${app.domaine}` : "";

  const [google, bing, clM, clP, crM, crP, declares, appM, appP, autorite, organiques, tgM, tgP, tbM, tbP] = await Promise.all([
    traficHebdo(admin, appId, "google", periode.fin),
    traficHebdo(admin, appId, "bing", periode.fin),
    clustersSur(admin, appId, mois),
    clustersSur(admin, appId, moisPrec),
    croiseSur(admin, appId, mois),
    croiseSur(admin, appId, moisPrec),
    admin.schema("admin").from("seo_chantiers").select("*").eq("app_id", appId).order("date"),
    appareilsSur(admin, appId, mois),
    appareilsSur(admin, appId, moisPrec),
    autoriteSur(admin, appId, app?.domaine ?? null, periode.fin, prec.fin),
    organiquesParPaiement(admin, appId, periode),
    traficPeriode(admin, appId, "google", periode),
    traficPeriode(admin, appId, "google", prec),
    traficPeriode(admin, appId, "bing", periode),
    traficPeriode(admin, appId, "bing", prec),
  ]);

  let parCreation;
  try {
    parCreation = await ventesParCreation(admin, appId, periode);
    if (!parCreation.disponible) manquantes.push("Vue baikal_dossiers indisponible : pas de compte par date de création ni de conversion par page");
  } catch (e) {
    parCreation = { disponible: false, dossiers: 0, emails: 0, payes: 0, payes_organique: 0, par_canal: [], par_page: [] };
    manquantes.push(`Lecture directe du site impossible : ${e instanceof ErreurSite ? e.message : (e as Error).message}`);
  }

  const suiviDisponible = crM.length > 0;
  if (!suiviDisponible) manquantes.push("Aucun relevé requête × page archivé sur la période (capture Search Console à lancer)");
  if (panier.length === 0 && pagesCles.length === 0) manquantes.push("Requêtes suivies et pages clés non renseignées dans /sites");
  if (autorite.length === 0) manquantes.push("Aucun relevé d'autorité Moz");

  return {
    trafic: { google, bing },
    trafic_periode: { google: { periode: tgM, precedent: tgP }, bing: { periode: tbM, precedent: tbP } },
    appareils: appareils(appM, appP),
    ventes: { par_paiement: { ...ventesParPaiement, organiques }, par_creation: parCreation },
    clusters: { periode: clM, precedent: clP },
    suivi: {
      requetes: suiviRequetes(panier, crM, crP),
      pages: suiviPages(pagesCles, base, crM, crP),
      disponible: suiviDisponible,
    },
    autorite,
    chantiers: chantiersDepuis(declares.data ?? [], commits),
    sources_manquantes: manquantes,
  };
}
