// Periode d'un rapport : deux dates incluses. Un mois civil est le cas
// courant, mais un trimestre ou une periode libre sont acceptes. Tout ce qui
// compare avec « avant » utilise la periode precedente de meme duree.

export interface Periode {
  debut: string; // YYYY-MM-DD
  fin: string; // YYYY-MM-DD inclus
}

const MOIS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
  "septembre", "octobre", "novembre", "décembre",
];

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function nbJours(p: Periode): number {
  return Math.round((d(p.fin).getTime() - d(p.debut).getTime()) / 86_400_000) + 1;
}

// Vrai si la periode couvre exactement un mois civil.
export function estMoisEntier(p: Periode): boolean {
  const a = d(p.debut), b = d(p.fin);
  if (a.getUTCDate() !== 1) return false;
  const dernier = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + 1, 0));
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() &&
    b.getUTCDate() === dernier.getUTCDate();
}

// Periode precedente : mois precedent si mois entier, sinon meme nombre de
// jours juste avant.
export function periodePrecedente(p: Periode): Periode {
  if (estMoisEntier(p)) {
    const a = d(p.debut);
    const debut = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() - 1, 1));
    const fin = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), 0));
    return { debut: iso(debut), fin: iso(fin) };
  }
  const n = nbJours(p);
  const fin = new Date(d(p.debut).getTime() - 86_400_000);
  const debut = new Date(fin.getTime() - (n - 1) * 86_400_000);
  return { debut: iso(debut), fin: iso(fin) };
}

// Mois civils (YYYY-MM) touches par la periode, dans l'ordre.
export function moisCouverts(p: Periode): string[] {
  const out: string[] = [];
  const a = d(p.debut), b = d(p.fin);
  let cur = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), 1));
  while (cur <= b) {
    out.push(cur.toISOString().slice(0, 7));
    cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
  }
  return out;
}

export function libelleMois(mois: string): string {
  const [a, m] = mois.split("-").map(Number);
  return `${MOIS_FR[m - 1]} ${a}`;
}

function jourLisible(isoDate: string, avecAnnee: boolean): string {
  const x = d(isoDate);
  const j = x.getUTCDate() === 1 ? "1er" : String(x.getUTCDate());
  return `${j} ${MOIS_FR[x.getUTCMonth()]}${avecAnnee ? ` ${x.getUTCFullYear()}` : ""}`;
}

// « août 2026 » pour un mois entier, sinon « du 1er juillet au 15 août 2026 ».
export function libellePeriode(p: Periode): string {
  if (estMoisEntier(p)) return libelleMois(p.debut.slice(0, 7));
  const memeAnnee = p.debut.slice(0, 4) === p.fin.slice(0, 4);
  return `du ${jourLisible(p.debut, !memeAnnee)} au ${jourLisible(p.fin, true)}`;
}

export function validerPeriode(debut: unknown, fin: unknown): Periode {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const a = String(debut ?? ""), b = String(fin ?? "");
  if (!re.test(a) || !re.test(b)) throw new Error("Dates attendues au format AAAA-MM-JJ");
  if (Number.isNaN(d(a).getTime()) || Number.isNaN(d(b).getTime())) throw new Error("Date invalide");
  if (b < a) throw new Error("La fin précède le début");
  if (nbJours({ debut: a, fin: b }) > 366) throw new Error("Période limitée à un an");
  return { debut: a, fin: b };
}
