// ---------------------------------------------------------------------------
// Module Mailing v1 — le passe-plat de reference pour un site sur BASE DEDIEE.
//
// Installer chez un site : copier ce fichier dans supabase/functions/<nom>/index.ts
// du site, adapter les trois imports _shared, reutiliser le secret
// BAIKAL_ADMIN_KEY (= ADMIN_ENV_<SITE>_KEY cote Baikal), deployer, puis
// renseigner config.apps.env_mailing_fn = '<nom>' dans le registre.
// Prealable : mailing-v1.sql installe, annexe « base dediee » comprise
// (wrappers public.baikal_mail_* sans p_app_id, grant + policy baikal_read).
//
// Aucune logique metier : verification de la cle, forme du corps, appel du
// wrapper. Ce que fait une desinscription chez le site vit dans
// <schema>.mail_desinscrire — jamais ici.
//
// Contrat HTTP (appele par Baikal via _shared/mailing/site.ts) :
//   POST { action: "reserver",    campagne_id, lignes: [{email, population, destinataire_id}] } (50 max)
//   POST { action: "marquer",     campagne_id, lignes: [{email, resend_id} | {email, erreur}] }
//   POST { action: "evenement",   resend_id, type, le, detail }
//   POST { action: "desinscrire", email, motif, campagne_id? }
//     -> 200 jsonb de la fonction du module | 400 { error } | 401 sans cle valide.
// ---------------------------------------------------------------------------
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders } from "../_shared/cors.ts";            // A ADAPTER : les en-tetes CORS du site
import { getSupabase } from "../_shared/logging.ts";         // A ADAPTER : un client service_role
import { constantTimeEqual } from "../_shared/auth.ts";      // A ADAPTER : comparaison en temps constant

const UUID = /^[0-9a-f-]{36}$/i;

type Appel = { rpc: string; params: Record<string, unknown> } | { erreur: string };

function lireCorps(b: Record<string, unknown>): Appel {
  const lignes = Array.isArray(b.lignes) ? b.lignes : [];
  const campagne = typeof b.campagne_id === "string" && UUID.test(b.campagne_id) ? b.campagne_id : null;
  switch (b.action) {
    case "reserver":
      if (!campagne) return { erreur: "campagne_id requis" };
      if (lignes.length === 0 || lignes.length > 50) return { erreur: "1 a 50 lignes" };
      return { rpc: "baikal_mail_reserver", params: { p_campagne_id: campagne, p_lignes: lignes } };
    case "marquer":
      if (!campagne) return { erreur: "campagne_id requis" };
      if (lignes.length === 0 || lignes.length > 50) return { erreur: "1 a 50 lignes" };
      return { rpc: "baikal_mail_marquer", params: { p_campagne_id: campagne, p_lignes: lignes } };
    case "evenement":
      if (typeof b.resend_id !== "string" || typeof b.type !== "string") return { erreur: "resend_id et type requis" };
      return {
        rpc: "baikal_mail_evenement",
        params: {
          p_resend_id: b.resend_id, p_type: b.type,
          p_le: typeof b.le === "string" ? b.le : new Date().toISOString(),
          p_detail: b.detail && typeof b.detail === "object" ? b.detail : {},
        },
      };
    case "desinscrire":
      if (typeof b.email !== "string") return { erreur: "email requis" };
      return {
        rpc: "baikal_mail_desinscrire",
        params: {
          p_email: b.email,
          p_motif: ["demande", "rebond", "plainte"].includes(String(b.motif)) ? b.motif : "demande",
          p_campagne_id: campagne,
        },
      };
    default:
      return { erreur: `Action inconnue: ${String(b.action)}` };
  }
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

  const cle = req.headers.get("X-Baikal-Key") || req.headers.get("x-baikal-key");
  const secret = Deno.env.get("BAIKAL_ADMIN_KEY");
  if (!cle || !secret || !constantTimeEqual(cle, secret)) return jsonResponse({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  if (!body || typeof body !== "object" || Array.isArray(body)) return jsonResponse({ error: "Corps JSON attendu" }, 400);
  const appel = lireCorps(body);
  if ("erreur" in appel) return jsonResponse({ error: appel.erreur }, 400);

  // Jamais d'adresse dans les journaux : l'action seulement.
  console.log(`[mailing-relais] via=baikal action=${body.action}`);

  const { data, error } = await supabase.rpc(appel.rpc, appel.params);
  if (error) return jsonResponse({ error: error.message }, 400);
  return jsonResponse(data);
});
