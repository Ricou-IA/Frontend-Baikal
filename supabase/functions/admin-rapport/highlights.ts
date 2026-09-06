// Highlights du rapport mensuel : des phrases calculees par regles fixes, pour
// que la trame soit identique d'un mois sur l'autre (decision d'Eric du
// 06/09/2026 : pas de modele ici, chaque phrase se deduit d'une ligne de
// l'archive et se verifie).
//
// Fonctions pures : aucune lecture de base, testables en isolation.

export interface TotauxSeo {
  clics: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface RequeteMois {
  cle: string;
  clics: number;
  impressions: number;
  position: number;
}

export interface LignePartenariat {
  mois: string; // YYYY-MM
  dans_decompte: boolean;
  ventes: number;
  ventes_partageables: number;
  quote_part: number;
}

export interface FaitsHighlights {
  mois: string; // YYYY-MM
  partenariat: {
    franchise: number | null;
    lignes: LignePartenariat[];
  };
  seo: {
    google: { mois: TotauxSeo | null; precedent: TotauxSeo | null };
    bing: { mois: TotauxSeo | null; precedent: TotauxSeo | null };
    requetes_mois: RequeteMois[];
    requetes_precedent: RequeteMois[];
  };
}

const MOIS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
  "septembre", "octobre", "novembre", "décembre",
];

export function libelleMois(mois: string): string {
  const [a, m] = mois.split("-").map(Number);
  return `${MOIS_FR[m - 1]} ${a}`;
}

export function moisPrecedent(mois: string): string {
  const [a, m] = mois.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

// Espace fine insecable (U+202F) remplacee par une espace : lisible partout,
// y compris dans les polices standard du PDF.
function nb(n: number): string {
  return new Intl.NumberFormat("fr-FR").format(n).replace(/ /g, " ");
}

function eur(n: number): string {
  return `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} €`;
}

function signe(n: number, decimales = 0): string {
  const v = decimales ? n.toFixed(decimales).replace(".", ",") : nb(n);
  return n > 0 ? `+${v}` : n < 0 ? `−${v.replace("-", "")}` : "±0";
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

export function calculerHighlights(f: FaitsHighlights): string[] {
  const out: string[] = [];
  const libelle = libelleMois(f.mois);
  const prec = moisPrecedent(f.mois);
  const libellePrec = libelleMois(prec);

  // 1. Ventes de l'assiette du contrat, M contre M-1.
  const ligneM = f.partenariat.lignes.find((l) => l.mois === f.mois);
  const ligneP = f.partenariat.lignes.find((l) => l.mois === prec);
  if (ligneM) {
    const v = ligneM.ventes;
    if (ligneP) {
      out.push(`${nb(v)} vente${v > 1 ? "s" : ""} en ${libelle} contre ${nb(ligneP.ventes)} en ${libellePrec} (${variation(v, ligneP.ventes)}).`);
    } else {
      out.push(`${nb(v)} vente${v > 1 ? "s" : ""} en ${libelle}, premier mois mesuré.`);
    }

    // 2. Franchise du contrat.
    if (ligneM.dans_decompte && f.partenariat.franchise !== null) {
      if (ligneM.ventes_partageables === 0) {
        out.push(`Seuil de ${f.partenariat.franchise} ventes non atteint (${nb(v)} sur ${f.partenariat.franchise}) : aucune vente partageable ce mois.`);
      } else {
        const p = ligneM.ventes_partageables;
        out.push(`${nb(p)} vente${p > 1 ? "s" : ""} au-delà du seuil de ${f.partenariat.franchise} : quote-part de ${eur(ligneM.quote_part)}.`);
      }
    }
  }

  // 3-5. Google : clics, impressions, position.
  const g = f.seo.google.mois;
  const gp = f.seo.google.precedent;
  if (g && gp) {
    out.push(`${nb(g.clics)} clics Google contre ${nb(gp.clics)} (${variation(g.clics, gp.clics)}).`);
    out.push(`${nb(g.impressions)} impressions Google contre ${nb(gp.impressions)} (${variation(g.impressions, gp.impressions)}).`);
    if (g.position > 0 && gp.position > 0) {
      const delta = Number((g.position - gp.position).toFixed(1));
      const sens = delta < 0 ? "gagnée" : delta > 0 ? "perdue" : "stable";
      out.push(`Position moyenne Google ${g.position.toFixed(1).replace(".", ",")} contre ${gp.position.toFixed(1).replace(".", ",")} (${sens === "stable" ? "stable" : `${Math.abs(delta).toFixed(1).replace(".", ",")} place${Math.abs(delta) >= 2 ? "s" : ""} ${sens}`}).`);
    }
  } else if (g) {
    out.push(`${nb(g.clics)} clics et ${nb(g.impressions)} impressions Google, premier mois mesuré.`);
  }

  // 6. Meilleure progression de position : requetes presentes les deux mois
  // avec au moins 20 impressions chacun.
  const precMap = new Map(f.seo.requetes_precedent.map((r) => [r.cle, r]));
  let meilleure: { cle: string; avant: number; apres: number } | null = null;
  for (const r of f.seo.requetes_mois) {
    const p = precMap.get(r.cle);
    if (!p || r.impressions < 20 || p.impressions < 20) continue;
    const gain = p.position - r.position;
    if (gain > 0 && (!meilleure || gain > meilleure.avant - meilleure.apres)) {
      meilleure = { cle: r.cle, avant: p.position, apres: r.position };
    }
  }
  if (meilleure) {
    out.push(`« ${meilleure.cle} » passe de la position ${meilleure.avant.toFixed(1).replace(".", ",")} à ${meilleure.apres.toFixed(1).replace(".", ",")}.`);
  }

  // 7. Entrees dans le top 10 par clics.
  const top10 = (l: RequeteMois[]) =>
    [...l].sort((a, b) => b.clics - a.clics).slice(0, 10).map((r) => r.cle);
  if (f.seo.requetes_precedent.length > 0) {
    const avant = new Set(top10(f.seo.requetes_precedent));
    const entrees = top10(f.seo.requetes_mois).filter((c) => !avant.has(c));
    if (entrees.length > 0) {
      out.push(`${entrees.length} requête${entrees.length > 1 ? "s entrent" : " entre"} dans le top 10 : ${entrees.map((c) => `« ${c} »`).join(", ")}.`);
    }
  }

  // 8. Bing, seulement si le mois precedent est mesure (pas d'historique
  // Bing avant le cron : un 0 serait un mensonge).
  const b = f.seo.bing.mois;
  const bp = f.seo.bing.precedent;
  if (b && bp) {
    out.push(`${nb(b.clics)} clics Bing contre ${nb(bp.clics)} (${variation(b.clics, bp.clics)}).`);
  }

  return out;
}
