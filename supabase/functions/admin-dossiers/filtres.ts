// Normalisation des parametres de la liste des dossiers clients.
// Pure : aucun acces reseau, testable sans permissions Deno.
export interface Criteres {
  recherche: string;
  periodeJours: number | null;
  statuts: string[];
  perimetre: "b2c" | "b2b" | null;
  inclureMasquees: boolean;
  exclureTests: boolean;
  inclureSupprimes: boolean;
  // Client payant : derive de paye_le, jamais du slug d'etape. Un dossier
  // peut avoir paye et etre dans une etape post-paiement (envoye, a traiter,
  // abonne) — filtrer sur l'etape ferait disparaitre ces clients.
  payesSeuls: boolean;
  tri: "cree_le" | "paye_le";
  ordre: "asc" | "desc";
  page: number;
  parPage: number;
}

const PERIODES = new Set([7, 30, 90]);

export function normaliserCriteres(body: Record<string, unknown>): Criteres {
  const recherche = typeof body.recherche === "string"
    ? body.recherche.trim().slice(0, 200)
    : "";
  const periode = Number(body.periodeJours);
  const statuts = Array.isArray(body.statuts)
    ? body.statuts.filter((s): s is string => typeof s === "string" && s !== "").slice(0, 20)
    : [];
  const parPageBrut = Number(body.parPage);
  return {
    recherche,
    periodeJours: PERIODES.has(periode) ? periode : null,
    statuts,
    perimetre: body.perimetre === "b2c" || body.perimetre === "b2b" ? body.perimetre : null,
    inclureMasquees: body.inclureMasquees === true,
    exclureTests: body.exclureTests !== false,
    inclureSupprimes: body.inclureSupprimes === true,
    payesSeuls: body.payesSeuls === true,
    tri: body.tri === "paye_le" ? "paye_le" : "cree_le",
    ordre: body.ordre === "asc" ? "asc" : "desc",
    page: Number.isInteger(body.page) && (body.page as number) > 0 ? body.page as number : 1,
    parPage: Number.isInteger(parPageBrut) ? Math.min(100, Math.max(5, parPageBrut)) : 25,
  };
}
