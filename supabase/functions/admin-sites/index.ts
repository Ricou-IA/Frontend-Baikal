// admin-sites : le registre config.apps (list-sites, save-site) et la
// taxonomie partagee admin.metier (list-metiers, save-metier, delete-metier).
// Extrait de admin-partenariats, qui melangeait ce registre avec les actions
// prospects/campagnes : /sites en depend et ne doit pas casser quand ce
// module sera demonte.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ErreurAcces, exigerSite, sitesAutorises } from "../_shared/droits.ts";

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

// Champs de config.apps modifiables par save-site. La creation d'app reste
// une migration : jamais d'insert ici, jamais name/is_active/system_prompt.
const CHAMPS_SITE = [
  "domaine",
  "gsc_propriete",
  "env_url",
  "env_secret_ref",
  "expediteur_nom",
  "expediteur_email",
  "reply_to",
] as const;

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
    // Droits par site : super_admin voit tout, un delegue ses sites, les
    // autres (y compris org_admin sans droit delegue) rien.
    const { data: profile } = await caller
      .from("profiles").select("app_role").eq("id", user.id).single();
    const sites = await sitesAutorises(caller);
    if (profile?.app_role !== "super_admin" && sites.length === 0) {
      return json({ data: null, error: "Acces refuse" }, 403);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json();
    const { action, appId } = body;
    // Aucune action de ce fichier ne prend d'appId aujourd'hui. La garde est
    // posee pour la suivante : une action par site ajoutee ici sans elle
    // laisserait un admin delegue agir sur un site qui n'est pas le sien.
    if (appId) exigerSite(sites, appId);

    switch (action) {
      case "list-sites": {
        // Champs env/secret : super_admin uniquement. Un delegue ne voit que
        // ses sites, avec les champs inoffensifs.
        if (profile?.app_role === "super_admin") {
          const { data, error } = await admin.schema("config").from("apps")
            .select("id, name, domaine, gsc_propriete, env_url, env_secret_ref, " +
              "expediteur_nom, expediteur_email, reply_to, is_active")
            .order("sort_order");
          if (error) throw error;
          return json({ data, error: null });
        }
        const { data, error } = await admin.schema("config").from("apps")
          .select("id, name, domaine, expediteur_nom, expediteur_email, reply_to, is_active")
          .in("id", sites)
          .order("sort_order");
        if (error) throw error;
        return json({ data, error: null });
      }

      case "save-site": {
        if (profile?.app_role !== "super_admin") {
          return json({ data: null, error: "Acces refuse" }, 403);
        }
        const s = body.site ?? {};
        if (!s.id) return json({ data: null, error: "site.id requis" }, 400);
        const maj: Record<string, unknown> = {};
        for (const champ of CHAMPS_SITE) {
          if (champ in s) maj[champ] = s[champ] === "" ? null : s[champ];
        }
        if (Object.keys(maj).length === 0) {
          return json({ data: null, error: "Aucun champ a enregistrer" }, 400);
        }
        const { data, error } = await admin.schema("config").from("apps")
          .update(maj).eq("id", s.id).select("id").single();
        if (error) throw error;
        return json({ data, error: null });
      }

      // list-metiers / save-metier / delete-metier : reservees super_admin,
      // meme si un delegue a franchi la porte d'entree (il a au moins un
      // site). La taxonomie est commune a tous les sites, aucun delegue
      // n'en est proprietaire.
      case "list-metiers": {
        if (profile?.app_role !== "super_admin") {
          return json({ data: null, error: "Acces refuse" }, 403);
        }
        const { data, error } = await admin.schema("admin").from("metier")
          .select("slug, libelle, couleur, ordre").order("ordre");
        if (error) return json({ data: null, error: error.message }, 400);
        return json({ data: { metiers: data }, error: null });
      }

      case "save-metier": {
        if (profile?.app_role !== "super_admin") {
          return json({ data: null, error: "Acces refuse" }, 403);
        }
        // La taxonomie est fermee mais elle vit en base : ajouter un metier
        // doit etre une ligne, pas un deploiement. Le slug est immuable — le
        // changer orphelinerait les vues des sites qui l'exposent.
        const m = body.metier as Record<string, unknown>;
        const slug = String(m?.slug ?? "").trim().toLowerCase();
        if (!/^[a-z][a-z0-9_]{1,30}$/.test(slug)) {
          return json({ data: null, error: "Slug invalide (a-z, 0-9, _)" }, 400);
        }
        const { error } = await admin.schema("admin").from("metier").upsert({
          slug,
          libelle: String(m.libelle ?? slug),
          couleur: String(m.couleur ?? "slate"),
          ordre: Number.isInteger(m.ordre) ? m.ordre : 100,
        });
        if (error) return json({ data: null, error: error.message }, 400);
        return json({ data: { ok: true }, error: null });
      }

      case "delete-metier": {
        if (profile?.app_role !== "super_admin") {
          return json({ data: null, error: "Acces refuse" }, 403);
        }
        // Refuser la suppression d'un slug encore porte par une vue de site
        // serait ideal, mais Baikal ne peut pas interroger tous les sites ici.
        // La page /prospect degrade proprement : un slug inconnu s'affiche en
        // gris avec sa valeur brute.
        const slug = String(body.slug ?? "");
        const { error } = await admin.schema("admin").from("metier")
          .delete().eq("slug", slug);
        if (error) return json({ data: null, error: error.message }, 400);
        return json({ data: { ok: true }, error: null });
      }

      default:
        return json({ data: null, error: `Action inconnue: ${action}` }, 400);
    }
  } catch (e) {
    console.error("[admin-sites]", e);
    if (e instanceof ErreurAcces) {
      return json({ data: null, error: e.message }, 403);
    }
    const message = e instanceof Error
      ? e.message
      : (typeof e === "object" && e !== null && "message" in e
        ? String((e as { message: unknown }).message)
        : String(e));
    return json({ data: null, error: message }, 500);
  }
});
