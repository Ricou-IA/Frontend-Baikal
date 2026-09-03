// Groupement des champs declares par le site (vue baikal_dossier_champs) en
// sections ordonnees. Baikal ne connait aucun de ces libelles : il ne fait
// que les ranger et transmettre le format demande.
const FORMATS = new Set([
  "texte",
  "euro",
  "date",
  "datetime",
  "pourcent",
  "nombre",
  "octets",
  "booleen",
  "lien",
  "mono",
]);
const NIVEAUX = new Set(["attention", "danger"]);

// Number(null) vaut 0 : sans cette garde, une colonne SQL NULL -- le cas
// normal d'un bloc sans ordre explicite -- serait lue comme un rang 0 et
// passerait devant les sections reellement ordonnees.
function nombreOuNull(valeur: unknown): number | null {
  if (valeur === null || valeur === undefined) return null;
  const n = Number(valeur);
  return Number.isFinite(n) ? n : null;
}

export interface Champ {
  libelle: string;
  valeur: string | null;
  format: string;
  niveau: string | null;
}

export interface SectionChamps {
  section: string;
  champs: Champ[];
}

interface Interne {
  section: string;
  ordreSection: number | null;
  champs: { champ: Champ; ordre: number | null; arrivee: number }[];
}

export function grouperChamps(lignes: Record<string, unknown>[]): SectionChamps[] {
  const groupes = new Map<string, Interne>();

  lignes.forEach((ligne, arrivee) => {
    const libelle = typeof ligne.libelle === "string" ? ligne.libelle.trim() : "";
    if (!libelle) return; // une ligne sans libelle n'est pas affichable
    const section = typeof ligne.section === "string" ? ligne.section : "";
    const ordreSection = nombreOuNull(ligne.ordre_section);
    const ordre = nombreOuNull(ligne.ordre);
    const format = typeof ligne.format === "string" && FORMATS.has(ligne.format)
      ? ligne.format
      : "texte";
    const niveau = typeof ligne.niveau === "string" && NIVEAUX.has(ligne.niveau)
      ? ligne.niveau
      : null;
    const valeur = ligne.valeur === null || ligne.valeur === undefined
      ? null
      : String(ligne.valeur);

    if (!groupes.has(section)) {
      groupes.set(section, { section, ordreSection, champs: [] });
    }
    const groupe = groupes.get(section)!;
    // La premiere valeur non nulle rencontree fixe l'ordre de la section.
    if (groupe.ordreSection === null && ordreSection !== null) {
      groupe.ordreSection = ordreSection;
    }
    groupe.champs.push({ champ: { libelle, valeur, format, niveau }, ordre, arrivee });
  });

  return [...groupes.values()]
    .sort((a, b) => {
      // Sans ordre_section, la section passe apres celles qui en ont un,
      // puis par ordre alphabetique -- sauf la section sans titre, qui
      // ouvre la fiche.
      if (a.section === "" && b.section !== "") return -1;
      if (b.section === "" && a.section !== "") return 1;
      if (a.ordreSection !== null && b.ordreSection !== null) {
        return a.ordreSection - b.ordreSection;
      }
      if (a.ordreSection !== null) return -1;
      if (b.ordreSection !== null) return 1;
      return a.section.localeCompare(b.section);
    })
    .map((groupe) => ({
      section: groupe.section,
      champs: groupe.champs
        .sort((a, b) => {
          if (a.ordre !== null && b.ordre !== null) return a.ordre - b.ordre;
          if (a.ordre !== null) return -1;
          if (b.ordre !== null) return 1;
          return a.arrivee - b.arrivee;
        })
        .map((c) => c.champ),
    }));
}
