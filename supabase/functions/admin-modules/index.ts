// admin-modules : ouvrir / fermer les modules des organisations clientes d'un
// site, par le canal d'administration du site (config.apps.env_admin_fn ;
// baikal-admin chez Majord'home). Baikal ne lit ni ne recopie le catalogue :
// libelles, descriptions et etat effectif viennent du site a chaque appel.
//
// Actions (POST { action, appId, ... }) :
//   catalogue      -> charge du site { modules: [{ key, label, description, parDefaut }] }
//   organisations  -> charge du site { organisations: [{ id, nom, modules }] }
//   modules        -> { org_id, modules } relayes + auteur = email du jeton
// Droits : module console « modules » du site, lecture pour consulter,
// ecriture pour modifier.
// Canal non declare -> { disponible: false } (pas une erreur). Site en
// erreur -> 502 avec `canal` = { statut_site, code, detail } tels que le site
// les a renvoyes ; pas de reponse -> 504. Jamais de succes suppose.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chargerSite, ErreurSite } from "../_shared/sites.ts";
import { ErreurAcces, droitsModules, exigerModule, exigerSite, sitesAutorises } from "../_shared/droits.ts";
import { appelerRelais, ErreurRelais, relaisConfigure } from "../_shared/relais.ts";
import { corpsSite, erreurCanal, niveauExige } from "./regles.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-app-id",
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ data: null, error: "POST attendu" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ data: null, error: "Non authentifie" }, 401);
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await caller.auth.getUser();
    if (authError || !user) return json({ data: null, error: "Non authentifie" }, 401);
    const sites = await sitesAutorises(caller);
    if (sites.length === 0) return json({ data: null, error: "Acces refuse" }, 403);

    const body = await req.json();
    const { action, appId } = body;
    if (!appId) return json({ data: null, error: "appId requis" }, 400);
    const niveau = niveauExige(action);
    if (!niveau) return json({ data: null, error: `Action inconnue: ${action}` }, 400);
    exigerSite(sites, appId);
    exigerModule(await droitsModules(caller), appId, "modules", niveau);

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const site = await chargerSite(admin, appId);
    if (!relaisConfigure(site, site.env_admin_fn)) {
      return json({ data: { disponible: false }, error: null });
    }

    const charge = await appelerRelais(
      site,
      site.env_admin_fn,
      corpsSite(action, body, user.email ?? null),
      niveau === "ecriture" ? 20000 : 10000,
    );
    return json({ data: { disponible: true, ...(charge as Record<string, unknown>) }, error: null });
  } catch (e) {
    console.error("[admin-modules]", e);
    if (e instanceof ErreurAcces) return json({ data: null, error: e.message }, 403);
    if (e instanceof ErreurSite) return json({ data: null, error: e.message }, 400);
    if (e instanceof ErreurRelais) {
      return json(
        {
          data: null,
          error: e.message,
          canal: e.statutSortie === 502 ? erreurCanal(e.detail) : null,
        },
        e.statutSortie ?? 500,
      );
    }
    const message = e instanceof Error ? e.message : String(e);
    return json({ data: null, error: message }, 500);
  }
});
