// Highlights du rapport : des phrases calculees par regles fixes, pour que
// la trame soit identique d'une periode a l'autre (decision d'Eric du
// 06/09/2026 : pas de modele ici, chaque phrase se deduit d'une ligne de
// l'archive et se verifie).
//
// Fonctions pures : aucune lecture de base, testables en isolation. La
// periode est deja libellee par l'appelant (« en août 2026 », « du 1er au 15
// août 2026 ») : ces regles ne connaissent pas le calendrier.

// Ce que le rapport montre : clics (serie quotidienne, exacts) et impressions
// HORS BRUIT (Google : total des pages du mois moins les requetes entre
// guillemets marquees is_noise). Le total brut et la position moyenne globale
// sont conserves dans le JSON mais jamais affiches ni commentes : ecartes par
// le contrat agence (annexe 2, B.2), ils mentent sur ce site.
export interface TotauxSeo {
  clics: number;
  impressions: number; // brut, non affiche
  impressions_hors_bruit: number | null; // null = notion sans objet (Bing)
  ctr: number;
  position: number; // non affichee
}

export interface RequeteMois {
  cle: string;
  clics: number;
  impressions: number;
  position: number;
}

// Un highlight porte son theme : la trame se lit par rubrique (ventes,
// Google, requetes, Bing), pas comme une liste plate.
export type ThemeHighlight = "ventes" | "google" | "requetes" | "bing";
export interface Highlight {
  theme: ThemeHighlight;
  texte: string;
}

export interface FaitsHighlights {
  libelle: string; // « en août 2026 » ou « du 1er au 15 août 2026 »
  libelle_precedent: string; // « en juillet 2026 » ou « sur la période précédente »
  ventes: { periode: number; precedent: number | null };
  // Seuil du contrat : seulement quand la periode est un mois civil entier,
  // la franchise s'apprecie par mois.
  franchise: { seuil: number; ventes: number; partageables: number; quote_part: number } | null;
  seo: {
    google: { periode: TotauxSeo | null; precedent: TotauxSeo | null };
    bing: { periode: TotauxSeo | null; precedent: TotauxSeo | null };
    requetes_periode: RequeteMois[];
    requetes_precedent: RequeteMois[];
  };
}

// Espace fine insecable (U+202F) remplacee par une espace : lisible partout,
// y compris dans les polices standard du PDF.
const ESPACE_FINE = new RegExp(String.fromCharCode(0x202f), "g");

function nb(n: number): string {
  return new Intl.NumberFormat("fr-FR").format(n).replace(ESPACE_FINE, " ");
}

function eur(n: number): string {
  return `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n).replace(ESPACE_FINE, " ")} €`;
}

function dec(n: number): string {
  return n.toFixed(1).replace(".", ",");
}

function signe(n: number): string {
  const v = nb(Math.abs(n));
  return n > 0 ? `+${v}` : n < 0 ? `−${v}` : "±0";
}

// Variation en valeur, et en % seulement si la base est significative
// (>= 20) : un % sur 3 clics ne veut rien dire — regle d'Eric.
export function variation(actuel: number, precedent: number): string {
  const delta = actuel - precedent;
  if (precedent >= 20) {
    const pct = Math.round((delta / precedent) * 100);
    return `${signe(delta)}, ${signe(pct)} %`;
  }
  return signe(delta);
}

function pluriel(n: number, mot: string): string {
  return `${nb(n)} ${mot}${n > 1 ? "s" : ""}`;
}

export function calculerHighlights(f: FaitsHighlights): Highlight[] {
  const out: Highlight[] = [];
  const push = (theme: ThemeHighlight, texte: string) => out.push({ theme, texte });

  // 1. Ventes, periode contre periode precedente.
  const v = f.ventes.periode;
  if (f.ventes.precedent !== null) {
    push("ventes", `${pluriel(v, "vente")} ${f.libelle} contre ${nb(f.ventes.precedent)} ${f.libelle_precedent} (${variation(v, f.ventes.precedent)}).`);
  } else {
    push("ventes", `${pluriel(v, "vente")} ${f.libelle}, première période mesurée.`);
  }

  // 2. Franchise du contrat (mois civil entier seulement).
  if (f.franchise) {
    const fr = f.franchise;
    if (fr.partageables === 0) {
      push("ventes", `Seuil de ${fr.seuil} ventes non atteint (${nb(fr.ventes)} sur ${fr.seuil}) : aucune vente partageable ce mois.`);
    } else {
      push("ventes", `${pluriel(fr.partageables, "vente")} au-delà du seuil de ${fr.seuil} : quote-part de ${eur(fr.quote_part)}.`);
    }
  }

  // 3-4. Google : clics, puis impressions hors bruit. Jamais la position
  // moyenne globale ni le total brut (annexe 2, B.2 du contrat agence).
  const g = f.seo.google.periode;
  const gp = f.seo.google.precedent;
  if (g && gp) {
    push("google", `${nb(g.clics)} clics Google contre ${nb(gp.clics)} (${variation(g.clics, gp.clics)}).`);
    if (g.impressions_hors_bruit !== null && gp.impressions_hors_bruit !== null) {
      push("google", `${nb(g.impressions_hors_bruit)} impressions Google hors bruit contre ${nb(gp.impressions_hors_bruit)} (${variation(g.impressions_hors_bruit, gp.impressions_hors_bruit)}).`);
      // CTR hors bruit : clics rapportes aux impressions reelles, en points.
      if (g.impressions_hors_bruit > 0 && gp.impressions_hors_bruit > 0) {
        const c = (g.clics / g.impressions_hors_bruit) * 100;
        const cp = (gp.clics / gp.impressions_hors_bruit) * 100;
        const delta = c - cp;
        push("google", `CTR Google hors bruit ${dec(c)} % contre ${dec(cp)} % (${delta > 0 ? "+" : delta < 0 ? "−" : "±"}${dec(Math.abs(delta))} point${Math.abs(delta) >= 2 ? "s" : ""}).`);
      }
    }
  } else if (g) {
    push("google", `${nb(g.clics)} clics Google, première période mesurée.`);
  }

  // 5. Meilleure progression de position : requetes presentes les deux
  // periodes avec au moins 20 impressions chacune. La position n'est lue
  // qu'au niveau d'une requete, jamais globalement.
  const precMap = new Map(f.seo.requetes_precedent.map((r) => [r.cle, r]));
  let meilleure: { cle: string; avant: number; apres: number } | null = null;
  for (const r of f.seo.requetes_periode) {
    const p = precMap.get(r.cle);
    if (!p || r.impressions < 20 || p.impressions < 20) continue;
    const gain = p.position - r.position;
    if (gain > 0 && (!meilleure || gain > meilleure.avant - meilleure.apres)) {
      meilleure = { cle: r.cle, avant: p.position, apres: r.position };
    }
  }
  if (meilleure) {
    push("requetes", `« ${meilleure.cle} » passe de la position ${dec(meilleure.avant)} à ${dec(meilleure.apres)} (${dec(meilleure.avant - meilleure.apres)} place${meilleure.avant - meilleure.apres >= 2 ? "s" : ""} gagnée${meilleure.avant - meilleure.apres >= 2 ? "s" : ""}).`);
  }

  // 6. Entrees dans le top 10 par clics.
  const top10 = (l: RequeteMois[]) =>
    [...l].sort((a, b) => b.clics - a.clics).slice(0, 10).map((r) => r.cle);
  if (f.seo.requetes_precedent.length > 0) {
    const avant = new Set(top10(f.seo.requetes_precedent));
    const entrees = top10(f.seo.requetes_periode).filter((c) => !avant.has(c));
    if (entrees.length > 0) {
      push("requetes", `${entrees.length} requête${entrees.length > 1 ? "s entrent" : " entre"} dans le top 10 : ${entrees.map((c) => `« ${c} »`).join(", ")}.`);
    }
  }

  // 7. Bing, seulement si la periode precedente est mesuree (pas
  // d'historique Bing avant le cron : un 0 serait un mensonge).
  const b = f.seo.bing.periode;
  const bp = f.seo.bing.precedent;
  if (b && bp) {
    push("bing", `${nb(b.clics)} clics Bing contre ${nb(bp.clics)} (${variation(b.clics, bp.clics)}).`);
  }

  return out;
}
