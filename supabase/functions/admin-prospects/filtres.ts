// Normalisation des parametres de la liste des prospects.
// Pure : aucun acces reseau, testable sans permissions Deno.
//
// Les listes blanches ne sont pas cosmetiques : ces valeurs partent dans des
// clauses SQL construites par postgresjs. Un slug non filtre ici, c'est une
// requete qui echoue en production sur une valeur que personne n'a saisie.
export interface Criteres {
  recherche: string;
  metiers: string[];
  statuts: string[];
  provenances: string[];
  departement: string;
  avecTelephone: boolean;
  exclureTests: boolean;
  // Un client n'est plus un prospect : on ne lui ecrit pas "reprenez votre
  // fiche" alors qu'il l'a reprise. Exclu par defaut, affichable a la demande.
  exclureClients: boolean;
  page: number;
  parPage: number;
  tri: "cree_le" | "dernier_contact_le";
  ordre: "asc" | "desc";
}

const METIERS = new Set([
  "notaire", "agent_immo", "syndic", "diagnostiqueur", "entreprise_rge", "autre",
]);
const STATUTS = new Set([
  "nouveau", "contacte", "relance", "repondu", "refus", "desinscrit",
]);
const PROVENANCES = new Set([
  "annuaire_public", "acquisition_propre", "import", "scrape",
]);

function listeBlanche(brut: unknown, permis: Set<string>): string[] {
  if (!Array.isArray(brut)) return [];
  return brut.filter((v): v is string => typeof v === "string" && permis.has(v)).slice(0, 20);
}

export function normaliserCriteres(body: Record<string, unknown>): Criteres {
  const departement = typeof body.departement === "string"
    ? body.departement.trim().toUpperCase()
    : "";
  const parPageBrut = Number(body.parPage);
  return {
    recherche: typeof body.recherche === "string"
      ? body.recherche.trim().slice(0, 200)
      : "",
    metiers: listeBlanche(body.metiers, METIERS),
    statuts: listeBlanche(body.statuts, STATUTS),
    provenances: listeBlanche(body.provenances, PROVENANCES),
    departement: /^(?:[0-9]{2}|2[AB]|[0-9]{3})$/.test(departement) ? departement : "",
    avecTelephone: body.avecTelephone === true,
    exclureTests: body.exclureTests !== false,
    exclureClients: body.exclureClients !== false,
    page: Number.isInteger(body.page) && (body.page as number) > 0
      ? body.page as number
      : 1,
    parPage: Number.isInteger(parPageBrut)
      ? Math.min(100, Math.max(5, parPageBrut))
      : 25,
    tri: body.tri === "dernier_contact_le" ? "dernier_contact_le" : "cree_le",
    ordre: body.ordre === "asc" ? "asc" : "desc",
  };
}
