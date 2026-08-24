// admin-droits : gestion des admins delegues par site (super_admin only).
// Actions : list {appId} / grant {appId, email} / revoke {appId, userId}.
// Le compte doit deja exister (core.profiles) : la creation de compte passe
// par la page Utilisateurs, pas par ici.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    if (!appId) return json({ data: null, error: "appId requis" }, 400);

    switch (action) {
      case "list": {
        const { data: droits, error } = await admin.schema("admin")
          .from("droits_sites")
          .select("user_id, cree_le")
          .eq("app_id", appId)
          .order("cree_le");
        if (error) throw error;
        const ids = (droits ?? []).map((d) => d.user_id);
        let profils: Array<{ id: string; email: string; full_name: string | null }> = [];
        if (ids.length > 0) {
          const { data: p, error: pErr } = await admin.schema("core")
            .from("profiles").select("id, email, full_name").in("id", ids);
          if (pErr) throw pErr;
          profils = p ?? [];
        }
        const parId = new Map(profils.map((p) => [p.id, p]));
        return json({
          data: (droits ?? []).map((d) => ({
            userId: d.user_id,
            email: parId.get(d.user_id)?.email ?? "(compte supprime)",
            nom: parId.get(d.user_id)?.full_name ?? null,
            depuis: d.cree_le,
          })),
          error: null,
        });
      }

      case "grant": {
        const email = String(body.email ?? "").trim().toLowerCase();
        if (!email.includes("@")) {
          return json({ data: null, error: "email requis" }, 400);
        }
        const { data: cible, error: cErr } = await admin.schema("core")
          .from("profiles").select("id, email").ilike("email", email).maybeSingle();
        if (cErr) throw cErr;
        if (!cible) {
          return json(
            { data: null, error: `Aucun compte pour ${email} — creer le compte d'abord (page Utilisateurs)` },
            404,
          );
        }
        const { error } = await admin.schema("admin").from("droits_sites")
          .upsert({ user_id: cible.id, app_id: appId, cree_par: user.id },
            { onConflict: "user_id,app_id", ignoreDuplicates: true });
        if (error) throw error;
        return json({ data: { ok: true, userId: cible.id }, error: null });
      }

      case "revoke": {
        if (!body.userId) return json({ data: null, error: "userId requis" }, 400);
        const { error } = await admin.schema("admin").from("droits_sites")
          .delete().eq("app_id", appId).eq("user_id", body.userId);
        if (error) throw error;
        return json({ data: { ok: true }, error: null });
      }

      default:
        return json({ data: null, error: `Action inconnue: ${action}` }, 400);
    }
  } catch (e) {
    console.error("[admin-droits]", e);
    return json({ data: null, error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
