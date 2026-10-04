// « Points de detail » de l'audit SEO : ce que la lecture a la main du
// 04/10/2026 a fait ressortir et que la grille ne calculait pas. Ils servent a
// decider quoi changer sur le site ; ils ne partent ni dans le texte redige
// pour le partenaire ni dans le PDF.
//   - rendement : ventes pour 100 clics, par page d'entree organique ;
//   - opportunites : requetes en page 1 que presque personne ne clique ;
//   - disputees : requetes que deux pages du site se partagent ;
//   - ecart_moteurs : pages bien classees sur Bing et loin sur Google
//     (la grille : probleme d'autorite, pas de contenu) ;
//   - hors_sitemap : adresses qui recoivent des impressions sans etre dans le
//     sitemap (adresses fantomes, redirections pas encore transferees) ;
//   - concentration : part des clics portee par la premiere page.
// deno-lint-ignore-file no-explicit-any

export interface CroiseDetail {
  requete: string;
  page: string;
  clics: number;
  impressions: number;
  position: number | null;
}

export interface LigneRendement {
  page: string;
  clics: number;
  dossiers: number;
  ventes: number;
  ventes_pour_100_clics: number | null;
}

export interface LigneOpportunite {
  requete: string;
  page: string;
  impressions: number;
  clics: number;
  position: number;
}

export interface LigneDisputee {
  requete: string;
  impressions: number;
  pages: { page: string; impressions: number; position: number | null }[];
}

export interface LigneEcartMoteurs {
  page: string;
  position_bing: number;
  impressions_bing: number;
  position_google: number;
  impressions_google: number;
}

export interface LigneHorsSitemap {
  page: string;
  clics: number;
  impressions: number;
}

export interface DetailsSeo {
  rendement: LigneRendement[];
  opportunites: LigneOpportunite[];
  disputees: LigneDisputee[];
  ecart_moteurs: LigneEcartMoteurs[];
  ecart_moteurs_releve_le: string | null;
  hors_sitemap: LigneHorsSitemap[];
  sitemap_lu: boolean;
  concentration: { page: string; clics: number; part: number } | null;
}

interface StatPage {
  clics: number;
  impressions: number;
  position: number | null;
}

// Seuils : une requete compte a partir de 50 impressions sur la periode ; la
// « page 1 » s'arrete a la position 12 (la moyenne d'une requete en bas de
// page 1 depasse souvent 10) ; sous 2 % de taux de clic en page 1, le
// resultat est vu sans etre choisi.
const MIN_IMPRESSIONS = 50;
const POSITION_PAGE_1 = 12;
const CTR_FAIBLE = 0.02;
const PART_DISPUTE = 0.2;
const MIN_IMPRESSIONS_DISPUTE = 100;
const POSITION_BING_HAUTE = 7;
const POSITION_GOOGLE_LOIN = 15;

export function chemin(url: string): string {
  let c = url.replace(/^https?:\/\/[^/]+/, "") || "/";
  try {
    c = decodeURI(c);
  } catch { /* adresse mal encodee : on la garde telle quelle */ }
  if (c.length > 1) c = c.replace(/\/+$/, "");
  return c.split(/[?#]/)[0] || "/";
}

export function opportunites(croise: CroiseDetail[]): LigneOpportunite[] {
  return croise
    .filter((r) => r.position !== null && r.position <= POSITION_PAGE_1 && r.impressions >= MIN_IMPRESSIONS
      && r.clics / r.impressions < CTR_FAIBLE)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 10)
    .map((r) => ({ requete: r.requete, page: chemin(r.page), impressions: r.impressions, clics: r.clics, position: r.position as number }));
}

export function disputees(croise: CroiseDetail[]): LigneDisputee[] {
  const parRequete = new Map<string, CroiseDetail[]>();
  for (const r of croise) {
    const l = parRequete.get(r.requete) ?? [];
    l.push(r);
    parRequete.set(r.requete, l);
  }
  const out: LigneDisputee[] = [];
  for (const [requete, lignes] of parRequete) {
    const total = lignes.reduce((a, r) => a + r.impressions, 0);
    if (total < MIN_IMPRESSIONS_DISPUTE) continue;
    const fortes = lignes.filter((r) => r.impressions / total >= PART_DISPUTE);
    if (fortes.length < 2) continue;
    out.push({
      requete,
      impressions: total,
      pages: fortes.sort((a, b) => b.impressions - a.impressions)
        .map((r) => ({ page: chemin(r.page), impressions: r.impressions, position: r.position })),
    });
  }
  return out.sort((a, b) => b.impressions - a.impressions).slice(0, 8);
}

export function rendement(
  parPage: { page: string; dossiers: number; payes: number }[],
  clicsGoogle: Map<string, StatPage>,
): LigneRendement[] {
  return parPage
    .map((p) => {
      const clics = clicsGoogle.get(chemin(p.page))?.clics ?? 0;
      return {
        page: chemin(p.page),
        clics,
        dossiers: p.dossiers,
        ventes: p.payes,
        ventes_pour_100_clics: clics >= 20 ? Number(((p.payes / clics) * 100).toFixed(1)) : null,
      };
    })
    .sort((a, b) => b.ventes - a.ventes || b.clics - a.clics);
}

export function ecartMoteurs(google: Map<string, StatPage>, bing: Map<string, StatPage>): LigneEcartMoteurs[] {
  const out: LigneEcartMoteurs[] = [];
  for (const [page, b] of bing) {
    const g = google.get(page);
    if (!g || g.position === null || b.position === null) continue;
    if (b.position <= POSITION_BING_HAUTE && b.impressions >= MIN_IMPRESSIONS && g.position >= POSITION_GOOGLE_LOIN) {
      out.push({ page, position_bing: b.position, impressions_bing: b.impressions, position_google: g.position, impressions_google: g.impressions });
    }
  }
  return out.sort((a, b) => b.impressions_google - a.impressions_google).slice(0, 8);
}

export function horsSitemap(google: Map<string, StatPage>, sitemap: Set<string>): LigneHorsSitemap[] {
  if (sitemap.size === 0) return [];
  return [...google.entries()]
    .filter(([page, s]) => !sitemap.has(page) && s.impressions >= 5)
    .map(([page, s]) => ({ page, clics: s.clics, impressions: s.impressions }))
    .sort((a, b) => b.clics - a.clics || b.impressions - a.impressions)
    .slice(0, 10);
}

export function concentration(google: Map<string, StatPage>): DetailsSeo["concentration"] {
  const total = [...google.values()].reduce((a, s) => a + s.clics, 0);
  if (total === 0) return null;
  const [page, s] = [...google.entries()].sort((a, b) => b[1].clics - a[1].clics)[0];
  return { page, clics: s.clics, part: Number((s.clics / total).toFixed(3)) };
}

// Pages Google au mois (dimension page), cumulees sur les mois couverts. La
// position d'une page seule est un indice, pas une mesure (piege 4 de la
// grille) : elle ne sert ici qu'a reperer un ecart avec Bing.
async function pagesGoogle(admin: any, appId: string, mois: string[]): Promise<Map<string, StatPage>> {
  const out = new Map<string, StatPage & { posPond: number }>();
  if (mois.length === 0) return out;
  const { data, error } = await admin.schema("admin").from("seo_snapshots")
    .select("key, clicks, impressions, position")
    .eq("app_id", appId).eq("source", "google")
    .eq("granularity", "month").eq("dimension", "page")
    .in("period_start", mois.map((m) => `${m}-01`)).limit(5000);
  if (error) throw new Error(error.message);
  for (const r of data ?? []) {
    const k = chemin(String(r.key));
    const cur = out.get(k) ?? { clics: 0, impressions: 0, position: null, posPond: 0 };
    cur.clics += Number(r.clicks);
    cur.impressions += Number(r.impressions);
    cur.posPond += Number(r.position) * Number(r.impressions);
    cur.position = cur.impressions > 0 ? Number((cur.posPond / cur.impressions).toFixed(1)) : null;
    out.set(k, cur);
  }
  return out;
}

// Bing ne date pas ses tops par page : on lit le dernier releve ponctuel pris
// au plus tard dix jours apres la fin de la periode.
async function pagesBing(admin: any, appId: string, fin: string): Promise<{ pages: Map<string, StatPage>; releve: string | null }> {
  const limite = new Date(`${fin}T00:00:00Z`);
  limite.setUTCDate(limite.getUTCDate() + 10);
  const { data: dernier } = await admin.schema("admin").from("seo_snapshots")
    .select("period_start")
    .eq("app_id", appId).eq("source", "bing")
    .eq("granularity", "observation").eq("dimension", "page")
    .lte("period_start", limite.toISOString().slice(0, 10))
    .order("period_start", { ascending: false }).limit(1);
  const releve = dernier?.[0]?.period_start ? String(dernier[0].period_start).slice(0, 10) : null;
  const pages = new Map<string, StatPage>();
  if (!releve) return { pages, releve };
  const { data, error } = await admin.schema("admin").from("seo_snapshots")
    .select("key, clicks, impressions, position")
    .eq("app_id", appId).eq("source", "bing")
    .eq("granularity", "observation").eq("dimension", "page").eq("period_start", releve);
  if (error) throw new Error(error.message);
  for (const r of data ?? []) {
    pages.set(chemin(String(r.key)), {
      clics: Number(r.clicks),
      impressions: Number(r.impressions),
      position: r.position === null ? null : Number(Number(r.position).toFixed(1)),
    });
  }
  return { pages, releve };
}

async function lireSitemap(domaine: string | null): Promise<Set<string>> {
  const out = new Set<string>();
  if (!domaine) return out;
  try {
    const rep = await fetch(`https://${domaine}/sitemap.xml`, { signal: AbortSignal.timeout(6000) });
    if (!rep.ok) return out;
    const xml = await rep.text();
    for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) out.add(chemin(m[1]));
  } catch { /* sitemap injoignable : le bloc reste vide et se dit non lu */ }
  return out;
}

export async function construireDetailsSeo(
  admin: any,
  appId: string,
  domaine: string | null,
  mois: string[],
  fin: string,
  croise: CroiseDetail[],
  parPage: { page: string; dossiers: number; payes: number }[],
): Promise<DetailsSeo> {
  const [google, bing, sitemap] = await Promise.all([
    pagesGoogle(admin, appId, mois),
    pagesBing(admin, appId, fin),
    lireSitemap(domaine),
  ]);
  return {
    rendement: rendement(parPage, google),
    opportunites: opportunites(croise),
    disputees: disputees(croise),
    ecart_moteurs: ecartMoteurs(google, bing.pages),
    ecart_moteurs_releve_le: bing.releve,
    hors_sitemap: horsSitemap(google, sitemap),
    sitemap_lu: sitemap.size > 0,
    concentration: concentration(google),
  };
}
