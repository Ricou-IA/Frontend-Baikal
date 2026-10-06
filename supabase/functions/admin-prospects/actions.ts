// Preparation pure d'une action de fiche prospect, commune aux deux
// transports : RPC baikal_prospect_action (base partagee) et relais HTTP vers
// env_prospects_fn (base dediee). Les deux ne different que par le transport ;
// la validation et la construction de la ligne `creer` vivent ici, une fois.
const ACTIONS = new Set(["statut", "note", "desinscrire", "creer", "supprimer"]);

export type ActionPreparee =
  | { ok: true; genre: "action"; actionSite: string; email: string; valeur: string | null }
  | { ok: true; genre: "creer"; email: string; ligne: Record<string, unknown> }
  | { ok: false; erreur: string };

function texte(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

export function preparerActionProspect(body: Record<string, unknown>): ActionPreparee {
  const actionSite = typeof body.actionSite === "string" ? body.actionSite : "";
  if (!ACTIONS.has(actionSite)) return { ok: false, erreur: `Action inconnue: ${actionSite}` };
  const email = typeof body.email === "string" ? body.email : "";
  if (!email) return { ok: false, erreur: "email requis" };

  if (actionSite === "creer") {
    // "creer" est un import d'une seule ligne : meme fonction, donc meme
    // regle de non-ecrasement, quel que soit le transport.
    return {
      ok: true, genre: "creer", email,
      ligne: {
        email,
        metier: typeof body.metier === "string" ? body.metier : "autre",
        provenance: "import",
        nom_affiche: typeof body.nomAffiche === "string" ? body.nomAffiche : email,
        commune: body.commune ?? null,
        code_postal: body.codePostal ?? null,
        telephone: body.telephone ?? null,
        site_web: body.siteWeb ?? null,
      },
    };
  }
  return { ok: true, genre: "action", actionSite, email, valeur: texte(body.valeur) };
}
