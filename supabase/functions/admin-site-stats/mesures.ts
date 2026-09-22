// Assemblage des tuiles d'un chapitre à partir des lignes de baikal_mesures.
// Pur : aucun accès réseau, testable sans permissions Deno.
//
// Tout ce qui décide d'un NOMBRE AFFICHÉ est ici, et nulle part ailleurs. Le
// contrat (docs/contrats/mesures-v1.sql) tient en quatre règles, dont trois se
// jouent dans ce fichier :
//
//   - un flux se SOMME sur la fenêtre, un stock se lit au DERNIER jour connu ;
//   - un stock porte sa date de mesure, toujours, parce qu'un chiffre sans sa
//     source ne vaut rien et qu'un trou blanc se lirait comme une régression ;
//   - Baikal ne se rabat jamais sur une fenêtre voisine, et écarte en silence
//     une ligne incomplète plutôt que d'échouer.

export const CHAPITRES = new Set(["clients", "finances", "comptes_pro"]);
export const FENETRES = [7, 30, 90];
const AGREGATIONS = new Set(["somme", "dernier"]);
const FORMATS = new Set(["nombre", "eur", "pourcent"]);

export interface LigneMesure {
  cle: string;
  jour: string; // AAAA-MM-JJ, jour LOCAL du site
  valeur: number;
  agregation: string;
  format: string;
  libelle: string;
  groupe: string | null;
  ordre: number | null;
  fenetre_jours: number | null;
}

export interface Tuile {
  cle: string;
  libelle: string;
  format: string;
  agregation: string;
  fenetreJours: number | null;
  valeur: number;
  // null = pas de période précédente connue. JAMAIS 0 : une variation depuis
  // zéro inventée est pire que pas de variation du tout.
  valeurPrecedente: number | null;
  // Renseignée pour un stock seulement : c'est la date du dernier jour mesuré.
  mesureLe: string | null;
  serie: { jour: string; valeur: number }[];
}

export interface GroupeTuiles {
  groupe: string | null;
  tuiles: Tuile[];
}

export function normaliserRequete(
  body: Record<string, unknown>,
): { chapitre: string | null; jours: number } {
  const chapitre = typeof body.chapitre === "string" && CHAPITRES.has(body.chapitre)
    ? body.chapitre
    : null;
  const jours = Number(body.jours);
  return {
    chapitre,
    jours: FENETRES.includes(jours) ? jours : 30,
  };
}

// Une ligne à laquelle il manque un champ obligatoire est écartée, pas fatale :
// les « non nul » du contrat sont des promesses du site, et une vue ne porte
// aucune contrainte. Un site qui publie une ligne bancale ne doit pas faire
// tomber les tuiles des autres.
export function ligneValide(l: Partial<LigneMesure>): boolean {
  return typeof l.cle === "string" && l.cle !== "" &&
    typeof l.jour === "string" && /^\d{4}-\d{2}-\d{2}$/.test(l.jour) &&
    typeof l.libelle === "string" && l.libelle !== "" &&
    typeof l.valeur === "number" && Number.isFinite(l.valeur) &&
    typeof l.agregation === "string" && AGREGATIONS.has(l.agregation) &&
    typeof l.format === "string" && FORMATS.has(l.format);
}

export function decalerJour(jour: string, jours: number): string {
  const d = new Date(`${jour}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
}

function metadonnees(lignes: LigneMesure[]): LigneMesure {
  // La dernière ligne publiée fait foi : un site qui renomme un libellé ou
  // déplace une tuile n'a pas à réécrire son historique.
  return lignes.reduce((a, b) => (b.jour >= a.jour ? b : a));
}

export function assembler(
  brut: Partial<LigneMesure>[],
  fin: string,
  jours: number,
): GroupeTuiles[] {
  const debut = decalerJour(fin, -(jours - 1));
  const debutPrecedent = decalerJour(fin, -(2 * jours - 1));
  const finPrecedente = decalerJour(fin, -jours);

  const parCle = new Map<string, LigneMesure[]>();
  for (const l of brut) {
    if (!ligneValide(l)) continue;
    const ligne = l as LigneMesure;
    if (ligne.jour > fin) continue; // rien du futur
    const liste = parCle.get(ligne.cle);
    if (liste) liste.push(ligne);
    else parCle.set(ligne.cle, [ligne]);
  }

  const tuiles: Tuile[] = [];
  for (const [cle, lignes] of parCle) {
    lignes.sort((a, b) => a.jour.localeCompare(b.jour));
    const meta = metadonnees(lignes);
    const fenetre = lignes.filter((l) => l.jour >= debut);
    const serie = fenetre.map((l) => ({ jour: l.jour, valeur: l.valeur }));

    let valeur: number;
    let valeurPrecedente: number | null;
    let mesureLe: string | null = null;

    if (meta.agregation === "somme") {
      // Un flux absent vaut zéro : c'est la seule agrégation où un trou est
      // sans danger, et où la période précédente vaut 0 plutôt que « inconnue ».
      valeur = fenetre.reduce((s, l) => s + l.valeur, 0);
      valeurPrecedente = lignes
        .filter((l) => l.jour >= debutPrecedent && l.jour <= finPrecedente)
        .reduce((s, l) => s + l.valeur, 0);
    } else {
      // Un stock vaut sa dernière valeur connue, sans borne de recul, et porte
      // sa date. La tolérance aux trous s'arrête là : c'est au site de publier
      // ses zéros (contrat §1 b bis), sans quoi son compteur se fige.
      const dernier = lignes[lignes.length - 1];
      valeur = dernier.valeur;
      mesureLe = dernier.jour;
      const avant = lignes.filter((l) => l.jour <= finPrecedente);
      valeurPrecedente = avant.length > 0 ? avant[avant.length - 1].valeur : null;
    }

    tuiles.push({
      cle,
      libelle: meta.libelle,
      format: meta.format,
      agregation: meta.agregation,
      fenetreJours: meta.fenetre_jours ?? null,
      valeur,
      valeurPrecedente,
      mesureLe,
      serie,
    });
  }

  return grouper(tuiles, parCle);
}

function grouper(
  tuiles: Tuile[],
  parCle: Map<string, LigneMesure[]>,
): GroupeTuiles[] {
  const rang = (cle: string) => {
    const o = metadonnees(parCle.get(cle)!).ordre;
    return typeof o === "number" && Number.isFinite(o) ? o : Number.MAX_SAFE_INTEGER;
  };
  const nomGroupe = (cle: string) => metadonnees(parCle.get(cle)!).groupe ?? null;

  const groupes = new Map<string, GroupeTuiles>();
  for (const t of tuiles) {
    const g = nomGroupe(t.cle);
    const cle = g ?? "";
    const existant = groupes.get(cle);
    if (existant) existant.tuiles.push(t);
    else groupes.set(cle, { groupe: g, tuiles: [t] });
  }

  for (const g of groupes.values()) {
    g.tuiles.sort((a, b) => rang(a.cle) - rang(b.cle) || a.cle.localeCompare(b.cle));
  }

  // Les groupes suivent le rang de leur première tuile : un site ordonne ses
  // blocs en ordonnant leurs tuiles, sans colonne de plus.
  return [...groupes.values()].sort((a, b) => {
    const ra = Math.min(...a.tuiles.map((t) => rang(t.cle)));
    const rb = Math.min(...b.tuiles.map((t) => rang(t.cle)));
    return ra - rb || (a.groupe ?? "").localeCompare(b.groupe ?? "");
  });
}
