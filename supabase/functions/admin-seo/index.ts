import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { searchAnalytics, windowAnchored, previousWindow, type GscRow } from "./gsc.ts";

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

function totals(rows: GscRow[]) {
  const t = { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  for (const r of rows) {
    t.clicks += r.clicks;
    t.impressions += r.impressions;
  }
  // ctr et position se recalculent ponderes par impressions, pas en moyenne brute.
  if (t.impressions > 0) {
    t.ctr = t.clicks / t.impressions;
    let posImp = 0;
    for (const r of rows) posImp += r.position * r.impressions;
    t.position = posImp / t.impressions;
  }
  return t;
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
    if (!profile || !["super_admin", "org_admin"].includes(profile.app_role)) {
      return json({ data: null, error: "Acces refuse" }, 403);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json();
    const { action, appId, days = 28, limit = 50 } = body;
    const nbJours = [7, 28, 90].includes(days) ? days : 28;

    async function proprieteDe(id: string): Promise<string> {
      const { data, error } = await admin
        .schema("config").from("apps")
        .select("gsc_propriete").eq("id", id).single();
      if (error || !data?.gsc_propriete) {
        throw new Error(`Pas de propriete Search Console pour le site ${id}`);
      }
      return data.gsc_propriete;
    }

    switch (action) {
      case "overview": {
        const site = await proprieteDe(appId);
        const cur = windowAnchored(nbJours);
        const prev = previousWindow(nbJours);
        const [curRows, prevRows, daily] = await Promise.all([
          searchAnalytics(site, cur.startDate, cur.endDate),
          searchAnalytics(site, prev.startDate, prev.endDate),
          searchAnalytics(site, cur.startDate, cur.endDate, ["date"], 100),
        ]);
        return json({
          data: {
            fenetre: cur,
            fenetrePrecedente: prev,
            totaux: totals(curRows),
            totauxPrecedents: totals(prevRows),
            parJour: daily.map((r) => ({
              date: r.keys?.[0],
              clicks: r.clicks,
              impressions: r.impressions,
            })),
          },
          error: null,
        });
      }

      case "top": {
        const site = await proprieteDe(appId);
        const dimension = body.dimension === "page" ? "page" : "query";
        const w = windowAnchored(nbJours);
        const rows = await searchAnalytics(site, w.startDate, w.endDate, [dimension], limit);
        return json({
          data: rows.map((r) => ({
            cle: r.keys?.[0],
            clicks: r.clicks,
            impressions: r.impressions,
            ctr: r.ctr,
            position: r.position,
          })),
          error: null,
        });
      }

      case "all-sites": {
        const { data: apps, error } = await admin
          .schema("config").from("apps")
          .select("id, name, gsc_propriete")
          .not("gsc_propriete", "is", null);
        if (error) throw error;
        const w = windowAnchored(nbJours);
        const resultats = await Promise.all((apps ?? []).map(async (a) => {
          try {
            const rows = await searchAnalytics(a.gsc_propriete, w.startDate, w.endDate);
            return { appId: a.id, nom: a.name, ...totals(rows), erreur: null };
          } catch (e) {
            return {
              appId: a.id, nom: a.name,
              clicks: 0, impressions: 0, ctr: 0, position: 0,
              erreur: String(e).slice(0, 200),
            };
          }
        }));
        return json({ data: { fenetre: w, sites: resultats }, error: null });
      }

      default:
        return json({ data: null, error: `Action inconnue: ${action}` }, 400);
    }
  } catch (e) {
    console.error("[admin-seo]", e);
    return json({ data: null, error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
