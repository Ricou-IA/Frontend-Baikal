// admin-site-stats : vue d'ensemble d'un site du registre (KPIs + dernieres
// entrees), lue par le canal lecture seule du connecteur _shared/sites.ts.
// Reserve aux super_admin : un org_admin d'un site n'a pas a voir les
// chiffres des autres.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chargerSite, ErreurSite, lecteurSite } from "../_shared/sites.ts";
import { statsParSite } from "./stats-sites.ts";

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
    const { data: profile } = await caller
      .from("profiles").select("app_role").eq("id", user.id).single();
    if (profile?.app_role !== "super_admin") {
      return json({ data: null, error: "Acces refuse" }, 403);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json();
    const { action, appId } = body;
    if (action !== "overview") {
      return json({ data: null, error: `Action inconnue: ${action}` }, 400);
    }
    if (!appId) return json({ data: null, error: "appId requis" }, 400);
    const jours = Number.isInteger(body.jours) && body.jours > 0 && body.jours <= 365
      ? body.jours
      : 30;

    const site = await chargerSite(admin, appId);
    if (!site.db_schema) {
      return json({ data: null, error: "Site sans base configuree (db_schema)" }, 400);
    }

    const sql = lecteurSite(site);
    try {
      const config = statsParSite[site.id];
      if (config) {
        const stats = await config(sql, jours);
        return json({ data: { mode: "kpis", jours, ...stats }, error: null });
      }
      // Fallback generique : tables du schema et volumes estimes, aucune
      // lecture des donnees elles-memes.
      const tables = await sql`
        SELECT relname AS "table", n_live_tup::bigint AS lignes_estimees
        FROM pg_stat_user_tables
        WHERE schemaname = ${site.db_schema}
        ORDER BY n_live_tup DESC, relname`;
      return json({ data: { mode: "generique", jours, tables }, error: null });
    } finally {
      await sql.end();
    }
  } catch (e) {
    console.error("[admin-site-stats]", e);
    if (e instanceof ErreurSite) {
      return json({ data: null, error: e.message }, 400);
    }
    return json({ data: null, error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
