// Correspondance onglet -> vue contractuelle du site. Le nom de vue ne vient
// JAMAIS de la requete : le parametre client est seulement une cle de ce
// dictionnaire, ce qui ferme toute surface d'injection.
export interface DefOnglet {
  vue: string;
  tri: string;
  ordre: "ASC" | "DESC";
}

export const ONGLETS: Record<string, DefOnglet> = {
  documents: { vue: "baikal_dossier_documents", tri: "depose_le", ordre: "DESC" },
  resultats: { vue: "baikal_dossier_resultats", tri: "produit_le", ordre: "DESC" },
  emails: { vue: "baikal_dossier_emails", tri: "envoye_le", ordre: "DESC" },
  chat: { vue: "baikal_dossier_messages", tri: "survenu_le", ordre: "ASC" },
  ia: { vue: "baikal_dossier_ia", tri: "survenu_le", ordre: "DESC" },
  donnees: { vue: "baikal_dossier_donnees", tri: "ordre", ordre: "ASC" },
  events: { vue: "baikal_dossier_events", tri: "survenu_le", ordre: "DESC" },
};

export function resoudreOnglet(nom: unknown): DefOnglet | null {
  if (typeof nom !== "string") return null;
  // Object.hasOwn : "constructor" ou "toString" ne doivent pas resoudre.
  if (!Object.hasOwn(ONGLETS, nom)) return null;
  return ONGLETS[nom];
}

// Un site peut ne pas exposer la colonne de tri : on lit sans ORDER BY
// plutot que d'echouer -- une absence n'est jamais une erreur.
export function triEffectif(def: DefOnglet, colonnes: Set<string>): string | null {
  if (!colonnes.has(def.tri)) return null;
  return `${def.tri} ${def.ordre}`;
}

export function paginationOnglet(
  body: Record<string, unknown>,
): { page: number; parPage: number } {
  const pageBrute = Number(body.page);
  const parPageBrute = Number(body.parPage);
  const page = Number.isFinite(pageBrute) && pageBrute >= 1
    ? Math.floor(pageBrute)
    : 1;
  const parPage = Number.isFinite(parPageBrute)
    ? Math.min(200, Math.max(5, Math.floor(parPageBrute)))
    : 50;
  return { page, parPage };
}
