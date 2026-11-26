// Regles de temps et de calcul de l'onglet Finances (audit du 26/11/2026).
//
// UNE seule regle de temps : des jours CIVILS dans le fuseau du site
// (config.apps.fuseau), celle du bandeau des mesures (admin-site-stats,
// mesures.ts). Une fenetre est un couple de jours locaux {du, au}, bornes
// comprises ; elle ne devient un intervalle d'instants qu'au moment de
// requeter (`bornes`). Avant ce correctif, la synthese « 7 jours » etait un
// glissant UTC (maintenant - 144 h) et sortait 6 ventes la ou le bandeau en
// comptait 7 : la vente du premier jour, avant l'heure courante, tombait.
//
// Tout ce qui decide d'un nombre affiche est ici, pur et teste ; index.ts ne
// fait que lire l'archive et appeler ces fonctions.

/** Arrondi au centime de l'archive (capture.ts) : meme fonction, memes
 *  centimes. 24,99 / 1,20 = 20,825 donne 20,82 (le flottant est 20,8249…),
 *  comme le montant_ht archive de chaque vente. */
export function arrondi(n: number): number {
  return Number(n.toFixed(2));
}

const RE_JOUR = /^\d{4}-\d{2}-\d{2}$/;

export function estJour(j: unknown): j is string {
  return typeof j === "string" && RE_JOUR.test(j) && !Number.isNaN(Date.parse(`${j}T00:00:00Z`));
}

/** Jour civil (AAAA-MM-JJ) d'un instant dans un fuseau. */
export function jourLocal(instant: Date, fuseau: string): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: fuseau }).format(instant);
}

export function decalerJour(jour: string, jours: number): string {
  const d = new Date(`${jour}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
}

/** Nombre de jours civils de `du` a `au`, bornes comprises (0 si inverse). */
export function joursInclus(du: string, au: string): number {
  const n = Math.round((Date.parse(`${au}T00:00:00Z`) - Date.parse(`${du}T00:00:00Z`)) / 86_400_000) + 1;
  return Math.max(0, n);
}

/** Ecart (minutes) entre l'heure murale du fuseau et UTC, a cet instant. */
function decalageMinutes(instant: number, fuseau: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: fuseau,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const v = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const mural = Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute"), v("second"));
  return Math.round((mural - Math.floor(instant / 1000) * 1000) / 60_000);
}

/** Instant (ISO UTC) du minuit local qui ouvre `jour` dans le fuseau. Juste
 *  aux changements d'heure : le decalage est relu a l'instant trouve. */
export function debutJour(jour: string, fuseau: string): string {
  const [a, m, j] = jour.split("-").map(Number);
  const mural = Date.UTC(a, m - 1, j);
  let t = mural - decalageMinutes(mural, fuseau) * 60_000;
  const corrige = mural - decalageMinutes(t, fuseau) * 60_000;
  if (corrige !== t) t = corrige;
  return new Date(t).toISOString();
}

export interface Fenetre {
  /** Premier et dernier jour civils, bornes comprises, AAAA-MM-JJ. */
  du: string;
  au: string;
}

/** Intervalle d'instants d'une fenetre : `paid_at >= debut AND paid_at < fin`. */
export function bornes(f: Fenetre, fuseau: string): { debut: string; fin: string } {
  return { debut: debutJour(f.du, fuseau), fin: debutJour(decalerJour(f.au, 1), fuseau) };
}

/** Les trois fenetres de la synthese, alignees sur le bandeau : « 7 jours » =
 *  aujourd'hui et les six jours civils precedents. */
export function fenetresSynthese(maintenant: Date, fuseau: string): Record<"7j" | "mois" | "annee", Fenetre> {
  const au = jourLocal(maintenant, fuseau);
  return {
    "7j": { du: decalerJour(au, -6), au },
    mois: { du: `${au.slice(0, 7)}-01`, au },
    annee: { du: `${au.slice(0, 4)}-01-01`, au },
  };
}

/** Les `n` derniers mois civils locaux, du plus ancien au plus recent ; le mois
 *  en cours s'arrete a aujourd'hui. */
export function moisSerie(maintenant: Date, fuseau: string, n: number): Array<Fenetre & { mois: string }> {
  const aujourdhui = jourLocal(maintenant, fuseau);
  const [an, mois] = aujourdhui.split("-").map(Number);
  const lignes = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(an, mois - 1 - i, 1));
    const cle = d.toISOString().slice(0, 7);
    const dernier = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    lignes.push({ mois: cle, du: `${cle}-01`, au: dernier > aujourdhui ? aujourdhui : dernier });
  }
  return lignes;
}

export type PeriodeVentes = "annee" | "3m" | "6m" | "12m";

/** Periode de la liste des ventes. Par defaut l'annee civile en cours ; « 3m »
 *  = le mois en cours et les deux precedents (l'ancien defaut). */
export function periodeVentes(
  choix: { periode?: unknown; du?: unknown; au?: unknown },
  maintenant: Date,
  fuseau: string,
): Fenetre {
  const au = jourLocal(maintenant, fuseau);
  if (estJour(choix.du) && estJour(choix.au)) {
    return choix.du <= choix.au ? { du: choix.du, au: choix.au } : { du: choix.au, au: choix.du };
  }
  const mois = ({ "3m": 3, "6m": 6, "12m": 12 } as Record<string, number>)[String(choix.periode)];
  if (!mois) return { du: `${au.slice(0, 4)}-01-01`, au };
  const [a, m] = au.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - mois, 1));
  return { du: d.toISOString().slice(0, 10), au };
}

export type FiltreRemboursement = "toutes" | "remboursees" | "non_remboursees";

export function filtreRemboursement(v: unknown): FiltreRemboursement {
  return v === "remboursees" || v === "non_remboursees" ? v : "toutes";
}

// --- Charges --------------------------------------------------------------------

export interface ChargeRecurrente {
  montant_mensuel_eur: number | string;
  debut: string;
  fin: string | null;
}

export interface ChargePonctuelle {
  montant_eur: number | string;
  jour: string;
}

/** Prorata journalier d'une charge mensuelle : 12 mois / 365 jours, compte en
 *  jours civils du fuseau du site (la fenetre en est deja faite). Une charge de
 *  30 EUR/mois ne creuse pas un trou le 1er : elle coute 0,99 EUR par jour. */
export function chargesSurPeriode(charges: ChargeRecurrente[], f: Fenetre): number {
  let total = 0;
  for (const c of charges) {
    const du = c.debut > f.du ? c.debut : f.du;
    const au = c.fin && c.fin < f.au ? c.fin : f.au;
    if (au < du) continue;
    total += (Number(c.montant_mensuel_eur) * 12 / 365) * joursInclus(du, au);
  }
  return arrondi(total);
}

/** Une charge ponctuelle tombe le jour ou elle est datee, sans prorata. */
export function ponctuellesSurPeriode(ponctuelles: ChargePonctuelle[], f: Fenetre): number {
  let total = 0;
  for (const c of ponctuelles) {
    if (c.jour >= f.du && c.jour <= f.au) total += Number(c.montant_eur);
  }
  return arrondi(total);
}

// --- Ventes ---------------------------------------------------------------------

export interface VenteArchive {
  montant_ttc: number | string;
  montant_ht: number | string;
  frais_stripe_eur: number | string;
  montant_rembourse: number | string;
  offre?: string | null;
  perimetre?: string | null;
}

export type Categorie = "payante" | "gratuite" | "pack";

/** Payante (B2C, montant > 0), gratuite (0 EUR : coupon 100 %, toujours un
 *  « Payé » au sens de la console) ou pack de credits pro. */
export function categorieVente(v: Pick<VenteArchive, "montant_ttc" | "offre" | "perimetre">): Categorie {
  if (Number(v.montant_ttc) <= 0) return "gratuite";
  if (String(v.offre ?? "").startsWith("credits-pro-") || v.perimetre === "b2b") return "pack";
  return "payante";
}

/** Remboursement en HT, a l'arrondi de l'archive : 24,99 -> 20,82. */
export function remboursementHt(montantRembourse: number, tva: number): number {
  return montantRembourse > 0 ? arrondi(montantRembourse / (1 + tva)) : 0;
}

export interface Agregat {
  ventes: number;
  ventilation: { payantes: number; gratuites: number; packs: number };
  ca_ttc: number;
  ca_ht: number;
  frais_stripe: number;
  /** TTC rembourse sur les ventes de la fenetre. */
  remboursements: number;
  remboursements_ht: number;
  ca_net_ttc: number;
  ca_net_ht: number;
}

/** Agregat d'une fenetre. Le CA « brut » compte toutes les ventes encaissees
 *  (gratuites a 0 EUR comprises) ; le CA « net » en deduit les remboursements.
 *  Un remboursement compte dans la fenetre de la vente qu'il rembourse. */
export function agregerVentes(ventes: VenteArchive[], tva: number): Agregat {
  const t: Agregat = {
    ventes: ventes.length,
    ventilation: { payantes: 0, gratuites: 0, packs: 0 },
    ca_ttc: 0,
    ca_ht: 0,
    frais_stripe: 0,
    remboursements: 0,
    remboursements_ht: 0,
    ca_net_ttc: 0,
    ca_net_ht: 0,
  };
  for (const v of ventes) {
    const c = categorieVente(v);
    if (c === "payante") t.ventilation.payantes++;
    else if (c === "gratuite") t.ventilation.gratuites++;
    else t.ventilation.packs++;
    const rembourse = Number(v.montant_rembourse);
    t.ca_ttc += Number(v.montant_ttc);
    t.ca_ht += Number(v.montant_ht);
    t.frais_stripe += Number(v.frais_stripe_eur);
    t.remboursements += rembourse;
    t.remboursements_ht += remboursementHt(rembourse, tva);
  }
  t.ca_ttc = arrondi(t.ca_ttc);
  t.ca_ht = arrondi(t.ca_ht);
  t.frais_stripe = arrondi(t.frais_stripe);
  t.remboursements = arrondi(t.remboursements);
  t.remboursements_ht = arrondi(t.remboursements_ht);
  t.ca_net_ttc = arrondi(t.ca_ttc - t.remboursements);
  t.ca_net_ht = arrondi(t.ca_ht - t.remboursements_ht);
  return t;
}

/** Resultat HT : le CA HT moins des couts tous HT. Le remboursement entre en
 *  HT ; le retrancher en TTC d'un CA HT ote la TVA deux fois (8,34 EUR sur
 *  l'annee 2026 de Pack vendeur, deux remboursements a 24,99). Google Ads
 *  absent (NULL) = 0, jamais estime. */
export function resultat(
  t: Pick<Agregat, "ca_ht" | "frais_stripe" | "remboursements_ht">,
  couts: { cout_ia: number; charges_fixes: number; charges_ponctuelles: number; ads: number | null },
): number {
  return arrondi(
    t.ca_ht - t.frais_stripe - t.remboursements_ht - couts.cout_ia - couts.charges_fixes -
      couts.charges_ponctuelles - (couts.ads ?? 0),
  );
}
