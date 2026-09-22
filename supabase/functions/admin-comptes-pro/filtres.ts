// Normalisation des paramètres de la liste des comptes pro.
// Pur : aucun accès réseau, testable sans permissions Deno.
//
// Le tri est validé ici contre un vocabulaire fermé, mais la colonne demandée
// peut être ABSENTE de la vue du site : les blocs du contrat sont optionnels.
// C'est l'EF qui retombe alors sur la raison sociale (triEffectif), parce
// qu'elle seule connaît les colonnes réellement publiées.
export interface Criteres {
  recherche: string;
  exclureTests: boolean;
  inclureSupprimes: boolean;
  actifsSeuls: boolean;
  tri: string;
  ordre: "asc" | "desc";
  page: number;
  parPage: number;
}

export const TRIS = new Set([
  "raison_sociale",
  "cree_le",
  "ca_ttc",
  "credits_stock",
  "derniere_activite_le",
]);

export function normaliserCriteres(body: Record<string, unknown>): Criteres {
  const parPage = Number(body.parPage);
  return {
    recherche: typeof body.recherche === "string" ? body.recherche.trim().slice(0, 200) : "",
    // Un test est un test : la définition appartient au site, et la bascule
    // par défaut l'écarte, comme dans Clients.
    exclureTests: body.exclureTests !== false,
    inclureSupprimes: body.inclureSupprimes === true,
    actifsSeuls: body.actifsSeuls === true,
    tri: typeof body.tri === "string" && TRIS.has(body.tri) ? body.tri : "raison_sociale",
    ordre: body.ordre === "asc" ? "asc" : "desc",
    page: Number.isInteger(body.page) && (body.page as number) > 0 ? body.page as number : 1,
    parPage: Number.isInteger(parPage) ? Math.min(100, Math.max(5, parPage)) : 25,
  };
}

// Le tri demandé ne vaut que si la vue publie sa colonne. Un site sans bloc
// crédits ne doit pas voir sa liste échouer parce que la console a gardé un
// tri d'un autre site.
export function triEffectif(tri: string, colonnes: Set<string>): string {
  return colonnes.has(tri) ? tri : "raison_sociale";
}

// Blocs du contrat, déclarés par leur colonne pivot. Une colonne du bloc peut
// manquer sans que le bloc disparaisse : Clients publie quatre colonnes abo_*
// sur cinq depuis le 02/09, le montant d'un abonnement n'existant pas côté
// MonsieurDPE.
export function blocsPresents(colonnes: Set<string>) {
  return {
    credits: colonnes.has("credits_stock"),
    argent: colonnes.has("ca_ttc"),
    abonnement: colonnes.has("abo_statut"),
    categorie: colonnes.has("categorie"),
    activite: colonnes.has("derniere_activite_le"),
    contact: colonnes.has("contact_nom") || colonnes.has("telephone"),
  };
}
