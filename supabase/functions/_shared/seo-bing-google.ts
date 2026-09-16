// Bing vs Google — logique pure de l'action `bing-vs-google` d'admin-seo,
// isolee pour etre testee sans base (seo-bing-google.test.ts).
//
// REGLE DE COHERENCE (ecart remonte par Eric le 10/09/2026, 217 vs 224 clics
// sur le meme mois) : le total Google d'un mois est la somme des lignes
// `device` de l'archive, JAMAIS des lignes `page`. Search Console agrege
// « par page » des que la dimension page est demandee (une recherche qui
// affiche deux pages du site = 2 impressions, un clic sur un sitelink est
// compte a sa page) : c'est systematiquement plus haut que le total « par
// propriete » — celui de l'interface Search Console, du KPI, du graphe
// Performances et de « Mobile et ordinateur ». Les trois appareils
// partitionnent tout le trafic : leur somme EST le total par propriete,
// et ce sont les memes lignes que le tableau des appareils.

export interface LigneMois {
  period_start: string;
  clicks: number;
  impressions: number;
}

export interface LigneJour {
  period_start: string;
  clicks: number;
}

export interface Mensuel {
  mois: string;
  google: number;
  impressionsGoogle: number;
  bing: number | null;
  partBingPct: number | null;
  enCours: boolean;
}

export interface ObservationRequete {
  key: string;
  clicks: number;
  impressions: number;
  position: number | string | null;
}

export interface RequeteComparee {
  requete: string;
  clicksGoogle: number | null;
  impressionsGoogle: number | null;
  positionGoogle: number | null;
  clicksBing: number | null;
  impressionsBing: number | null;
  positionBing: number | null;
  /** Rangs gagnes sur Bing (position Google − position Bing) ; null si un cote manque. */
  delta: number | null;
}

export interface EcartPosition {
  requete: string;
  positionBing: number;
  positionGoogle: number;
  delta: number;
  clicksBing: number;
  clicksGoogle: number;
}

const mois = (d: string) => d.slice(0, 7);

/**
 * Serie mensuelle : Google = somme des lignes mensuelles fournies (appareils),
 * Bing = somme de la serie quotidienne. Mois sans mesure Bing = null, JAMAIS
 * 0 (Bing n'a pas d'historique : les mois d'avant le cron sont vides a jamais).
 */
export function serieMensuelle(
  google: LigneMois[],
  bing: LigneJour[],
  moisCourant: string,
): Mensuel[] {
  const g = new Map<string, { clicks: number; impressions: number }>();
  for (const r of google) {
    const m = mois(r.period_start);
    const cur = g.get(m) ?? { clicks: 0, impressions: 0 };
    cur.clicks += r.clicks;
    cur.impressions += r.impressions;
    g.set(m, cur);
  }
  const b = new Map<string, number>();
  for (const r of bing) {
    const m = mois(r.period_start);
    b.set(m, (b.get(m) ?? 0) + r.clicks);
  }
  const tousMois = [...new Set([...g.keys(), ...b.keys()])].sort();
  return tousMois.map((m) => {
    const gg = g.get(m) ?? { clicks: 0, impressions: 0 };
    const bb = b.has(m) ? b.get(m)! : null;
    return {
      mois: `${m}-01`,
      google: gg.clicks,
      impressionsGoogle: gg.impressions,
      bing: bb,
      partBingPct: bb !== null && gg.clicks + bb > 0
        ? Number(((bb / (gg.clicks + bb)) * 100).toFixed(0))
        : null,
      enCours: m === moisCourant,
    };
  });
}

/**
 * Dernier mois COMPLET archive (le mois en cours, rafraichi chaque nuit, ne
 * couvre que quelques jours : on compare Bing a un mois plein). Repli sur le
 * plus recent si aucun mois complet n'existe encore.
 */
export function dernierMoisComplet(
  periodStarts: string[],
  moisCourant: string,
): string | null {
  const tries = [...new Set(periodStarts)].sort().reverse();
  return tries.find((p) => mois(p) < moisCourant) ?? tries[0] ?? null;
}

const cle = (s: string) => s.trim().toLowerCase();
const nombre = (v: number | string | null | undefined): number | null =>
  v === null || v === undefined ? null : Number(v);
const arrondi = (n: number) => Number(n.toFixed(1));

/**
 * Comparaison par requete : union des requetes des deux moteurs, jointure
 * insensible a la casse (Bing renvoie parfois des majuscules, Google jamais),
 * triee par clics cumules puis impressions. Absent d'un moteur = null.
 */
export function comparerRequetes(
  bing: ObservationRequete[],
  google: ObservationRequete[],
  limite = 50,
): RequeteComparee[] {
  const parCle = new Map<string, RequeteComparee>();
  const vide = (requete: string): RequeteComparee => ({
    requete,
    clicksGoogle: null,
    impressionsGoogle: null,
    positionGoogle: null,
    clicksBing: null,
    impressionsBing: null,
    positionBing: null,
    delta: null,
  });
  for (const g of google) {
    const l = parCle.get(cle(g.key)) ?? vide(g.key);
    l.requete = g.key;
    l.clicksGoogle = g.clicks;
    l.impressionsGoogle = g.impressions;
    l.positionGoogle = nombre(g.position);
    parCle.set(cle(g.key), l);
  }
  for (const b of bing) {
    const l = parCle.get(cle(b.key)) ?? vide(b.key);
    l.clicksBing = b.clicks;
    l.impressionsBing = b.impressions;
    l.positionBing = nombre(b.position);
    parCle.set(cle(b.key), l);
  }
  const lignes = [...parCle.values()];
  for (const l of lignes) {
    l.delta = l.positionGoogle !== null && l.positionBing !== null
      ? arrondi(l.positionGoogle - l.positionBing)
      : null;
  }
  const clics = (l: RequeteComparee) => (l.clicksGoogle ?? 0) + (l.clicksBing ?? 0);
  const impressions = (l: RequeteComparee) => (l.impressionsGoogle ?? 0) + (l.impressionsBing ?? 0);
  return lignes
    .sort((a, b) =>
      clics(b) - clics(a) || impressions(b) - impressions(a) || a.requete.localeCompare(b.requete, "fr")
    )
    .slice(0, limite);
}

/** Requetes ou Bing classe nettement mieux (>= `seuil` rangs), du plus grand ecart au plus petit. */
export function ecartsPosition(
  bing: ObservationRequete[],
  google: ObservationRequete[],
  seuil = 5,
  limite = 15,
): EcartPosition[] {
  const googleParCle = new Map(
    google.filter((g) => g.position !== null).map((g) => [cle(g.key), g]),
  );
  return bing
    .filter((b) => b.position !== null && googleParCle.has(cle(b.key)))
    .map((b) => {
      const g = googleParCle.get(cle(b.key))!;
      const positionBing = Number(b.position);
      const positionGoogle = Number(g.position);
      return {
        requete: g.key,
        positionBing,
        positionGoogle,
        delta: arrondi(positionGoogle - positionBing),
        clicksBing: b.clicks,
        clicksGoogle: g.clicks,
      };
    })
    .filter((e) => e.delta >= seuil)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, limite);
}
