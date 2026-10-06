// ---------------------------------------------------------------------------
// Module Prospects v1 — le passe-plat de reference pour un site sur BASE DEDIEE.
//
// Installer chez un site : copier ce fichier dans supabase/functions/<nom>/index.ts
// du site, adapter les trois imports _shared (cors, client service_role,
// comparaison en temps constant) a ce que le site possede, poser le secret
// BAIKAL_ADMIN_KEY (= ADMIN_ENV_<SITE>_KEY cote Baikal), deployer, puis
// renseigner config.apps.env_prospects_fn = '<nom>' dans le registre.
//
// Il ne contient AUCUNE logique metier : il verifie la cle, valide la forme
// du corps et appelle les deux wrappers publics de l'annexe « site dedie » de
// prospects-v1.sql (baikal_prospect_action, baikal_prospect_importer, sans
// p_app_id). C'est le site qui decide ce qui est ecrivable chez lui, dans
// <schema>.prospect_action — jamais ce fichier.
//
// Contrat HTTP (appele par admin-prospects via _shared/relais.ts) :
//   POST { action: "action", actionSite, email, valeur?, acteur? }
//     -> 200 jsonb de prospect_action ({ ok, email, action }) | 400 { error }
//   POST { action: "importer", lignes: [...], acteur? }       (2000 max)
//     -> 200 jsonb de prospect_importer ({ ok, recus, inseres, doublons }) | 400 { error }
//   401 { error: "Unauthorized" } sans cle valide.
// Installation de reference : Pack Vendeur, supabase/functions/pv-admin-prospects.
// ---------------------------------------------------------------------------
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders } from "../_shared/cors.ts";            // A ADAPTER : les en-tetes CORS du site
import { getSupabase } from "../_shared/logging.ts";         // A ADAPTER : un client service_role
import { constantTimeEqual } from "../_shared/auth.ts";      // A ADAPTER : comparaison en temps constant

// Validation pure du corps recu de Baikal. Aucune logique metier : on ne fait
// que verifier la forme et nommer les parametres des deux RPC du module.
// `creer` n'existe pas ici : Baikal l'envoie comme un import d'une ligne, meme
// chemin, meme regle de non-ecrasement.
const ACTIONS_SITE = new Set(["statut", "note", "desinscrire", "supprimer"]);
const MAX_LIGNES = 2000;

type CorpsLu =
  | { ok: true; action: "action"; params: { p_action: string; p_email: string; p_valeur: string | null; p_acteur: string | null } }
  | { ok: true; action: "importer"; params: { p_lignes: unknown[]; p_acteur: string | null } }
  | { ok: false; erreur: string };

function acteurDe(body: Record<string, unknown>): string | null {
  return typeof body.acteur === "string" && body.acteur.trim() ? body.acteur.trim().slice(0, 200) : null;
}

function lireCorps(body: Record<string, unknown>): CorpsLu {
  const action = typeof body.action === "string" ? body.action : "";
  if (action === "action") {
    const actionSite = typeof body.actionSite === "string" ? body.actionSite : "";
    if (!ACTIONS_SITE.has(actionSite)) return { ok: false, erreur: `Action inconnue: ${actionSite}` };
    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (!email) return { ok: false, erreur: "email requis" };
    return {
      ok: true,
      action: "action",
      params: {
        p_action: actionSite,
        p_email: email,
        p_valeur: typeof body.valeur === "string" ? body.valeur : null,
        p_acteur: acteurDe(body),
      },
    };
  }
  if (action === "importer") {
    const lignes = Array.isArray(body.lignes) ? body.lignes : [];
    if (lignes.length === 0) return { ok: false, erreur: "Aucune ligne" };
    if (lignes.length > MAX_LIGNES) return { ok: false, erreur: `${MAX_LIGNES} lignes maximum par lot` };
    return { ok: true, action: "importer", params: { p_lignes: lignes, p_acteur: acteurDe(body) } };
  }
  return { ok: false, erreur: `Action inconnue: ${action}` };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const supabase = getSupabase();
  if (!supabase) return jsonResponse({ error: "Missing env" }, 500);

  // Secret absent de l'env → refus : jamais de comparaison a une valeur vide.
  const cle = req.headers.get("X-Baikal-Key") || req.headers.get("x-baikal-key");
  const secret = Deno.env.get("BAIKAL_ADMIN_KEY");
  if (!cle || !secret || !constantTimeEqual(cle, secret)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const body = await req.json().catch(() => ({}));
  if (!body || typeof body !== "object" || Array.isArray(body)) return jsonResponse({ error: "Corps JSON attendu" }, 400);
  const lu = lireCorps(body);
  if (!lu.ok) return jsonResponse({ error: lu.erreur }, 400);

  // Jamais d'adresse dans les journaux : l'action et le volume seulement.
  console.log(
    `[prospects-relais] via=baikal action=${lu.action}` +
      (lu.action === "action" ? ` site=${lu.params.p_action}` : ` lignes=${lu.params.p_lignes.length}`),
  );

  const rpc = lu.action === "action" ? "baikal_prospect_action" : "baikal_prospect_importer";
  const { data, error } = await supabase.rpc(rpc, lu.params);
  if (error) {
    // Le message de la fonction SQL est le motif que Baikal affiche
    // (« Statut inconnu », « Seul un prospect saisi ou importe peut etre supprime »).
    return jsonResponse({ error: error.message }, 400);
  }
  return jsonResponse(data);
});
