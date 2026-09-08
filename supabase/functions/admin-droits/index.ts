// admin-droits : accès console par site et super admins (super_admin only).
//
// Accès par site (admin.droits_sites, colonne modules = {module: lecture|ecriture}) :
//   list {appId}                      -> accès du site, avec modules
//   list-all                          -> tous les accès (étage Baikal, grille)
//   grant {appId, email, modules?}    -> compte existant requis ; défaut tout en écriture
//   set-modules {appId, userId, modules}
//   revoke {appId, userId}
// Super admins (core.profiles.app_role) :
//   super-admins                      -> liste
//   super-admin-set {email, actif}    -> promotion / rétrogradation, journalisée
//                                        dans core.role_changes_log. Jamais soi-même,
//                                        jamais le dernier.
// Le compte doit déjà exister (core.profiles) : la création passe par l'onglet
// Comptes (EF admin-comptes) ou la page Utilisateurs (EF create-user), pas par ici.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-app-id",
};

// Même liste que core.modules_console() — la contrainte CHECK côté base
// refuse tout autre nom ou niveau.
const MODULES = ["clients", "prospects", "finances", "rapports", "seo", "partenariats", "users"];
const NIVEAUX = ["lecture", "ecriture"];

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toutEcriture(): Record<string, string> {
  return Object.fromEntries(MODULES.map((m) => [m, "ecriture"]));
}

// Nettoie un objet modules venu du client : clés connues, niveaux connus,
// tout le reste ignoré (absent = fermé).
function normaliserModules(brut: unknown): Record<string, string> | null {
  if (!brut || typeof brut !== "object" || Array.isArray(brut)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(brut as Record<string, unknown>)) {
    if (!MODULES.includes(k)) return null;
    if (v === null || v === "" || v === "ferme") continue;
    if (!NIVEAUX.includes(String(v))) return null;
    out[k] = String(v);
  }
  return out;
}

type Profil = { id: string; email: string; full_name: string | null };

async function profilsParIds(admin: SupabaseClient, ids: string[]): Promise<Map<string, Profil>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await admin.schema("core")
    .from("profiles").select("id, email, full_name").in("id", ids);
  if (error) throw error;
  return new Map((data ?? []).map((p: Profil) => [p.id, p]));
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
      .from("profiles").select("app_role, email").eq("id", user.id).single();
    if (profile?.app_role !== "super_admin") {
      return json({ data: null, error: "Acces refuse" }, 403);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json();
    const { action, appId } = body;
    const SANS_APP_ID = ["list-all", "super-admins", "super-admin-set"];
    if (!appId && !SANS_APP_ID.includes(action)) {
      return json({ data: null, error: "appId requis" }, 400);
    }

    switch (action) {
      case "list": {
        const { data: droits, error } = await admin.schema("admin")
          .from("droits_sites")
          .select("user_id, cree_le, modules")
          .eq("app_id", appId)
          .order("cree_le");
        if (error) throw error;
        const parId = await profilsParIds(admin, (droits ?? []).map((d) => d.user_id));
        return json({
          data: (droits ?? []).map((d) => ({
            userId: d.user_id,
            email: parId.get(d.user_id)?.email ?? "(compte supprime)",
            nom: parId.get(d.user_id)?.full_name ?? null,
            depuis: d.cree_le,
            modules: d.modules ?? {},
          })),
          error: null,
        });
      }

      case "list-all": {
        const { data: droits, error } = await admin.schema("admin")
          .from("droits_sites")
          .select("user_id, app_id, cree_le, modules")
          .order("cree_le");
        if (error) throw error;
        const parId = await profilsParIds(admin, [...new Set((droits ?? []).map((d) => d.user_id))]);
        const { data: apps } = await admin.schema("config").from("apps")
          .select("id, name, is_active").order("sort_order");
        const nomApp = new Map((apps ?? []).map((a) => [a.id, a.name]));
        return json({
          data: {
            modules: MODULES,
            sites: (apps ?? []).filter((a) => a.is_active).map((a) => ({ id: a.id, name: a.name })),
            acces: (droits ?? []).map((d) => ({
              userId: d.user_id,
              email: parId.get(d.user_id)?.email ?? "(compte supprime)",
              nom: parId.get(d.user_id)?.full_name ?? null,
              appId: d.app_id,
              site: nomApp.get(d.app_id) ?? d.app_id,
              depuis: d.cree_le,
              modules: d.modules ?? {},
            })),
          },
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
            { data: null, error: `Aucun compte pour ${email} — creer le compte d'abord (Baikal → Comptes)` },
            404,
          );
        }
        const modules = body.modules === undefined ? toutEcriture() : normaliserModules(body.modules);
        if (!modules) return json({ data: null, error: "modules invalides" }, 400);
        const { error } = await admin.schema("admin").from("droits_sites")
          .upsert({ user_id: cible.id, app_id: appId, cree_par: user.id, modules },
            { onConflict: "user_id,app_id", ignoreDuplicates: true });
        if (error) throw error;
        return json({ data: { ok: true, userId: cible.id }, error: null });
      }

      case "set-modules": {
        if (!body.userId) return json({ data: null, error: "userId requis" }, 400);
        const modules = normaliserModules(body.modules);
        if (!modules) return json({ data: null, error: "modules invalides" }, 400);
        const { data, error } = await admin.schema("admin").from("droits_sites")
          .update({ modules }).eq("app_id", appId).eq("user_id", body.userId)
          .select("user_id").maybeSingle();
        if (error) throw error;
        if (!data) return json({ data: null, error: "Acces introuvable" }, 404);
        return json({ data: { ok: true, modules }, error: null });
      }

      case "revoke": {
        if (!body.userId) return json({ data: null, error: "userId requis" }, 400);
        const { error } = await admin.schema("admin").from("droits_sites")
          .delete().eq("app_id", appId).eq("user_id", body.userId);
        if (error) throw error;
        return json({ data: { ok: true }, error: null });
      }

      case "super-admins": {
        const { data, error } = await admin.schema("core").from("profiles")
          .select("id, email, full_name, created_at")
          .eq("app_role", "super_admin").order("created_at");
        if (error) throw error;
        return json({
          data: (data ?? []).map((p) => ({
            userId: p.id, email: p.email, nom: p.full_name, depuis: p.created_at,
            moi: p.id === user.id,
          })),
          error: null,
        });
      }

      case "super-admin-set": {
        const email = String(body.email ?? "").trim().toLowerCase();
        const actif = body.actif === true;
        if (!email.includes("@")) return json({ data: null, error: "email requis" }, 400);
        const { data: cible, error: cErr } = await admin.schema("core")
          .from("profiles").select("id, email, app_role, org_id").ilike("email", email).maybeSingle();
        if (cErr) throw cErr;
        if (!cible) {
          return json({ data: null, error: `Aucun compte pour ${email} — creer le compte d'abord (Baikal → Comptes)` }, 404);
        }
        if (cible.id === user.id) {
          return json({ data: null, error: "Vous ne pouvez pas modifier votre propre statut" }, 400);
        }
        const dejaSuper = cible.app_role === "super_admin";
        if (actif === dejaSuper) {
          return json({ data: { ok: true, inchange: true }, error: null });
        }
        if (!actif) {
          const { count } = await admin.schema("core").from("profiles")
            .select("id", { count: "exact", head: true }).eq("app_role", "super_admin");
          if ((count ?? 0) <= 1) {
            return json({ data: null, error: "Impossible de retirer le dernier super admin" }, 400);
          }
        }
        // Rétrogradation : redevient un simple compte ; s'il est membre d'une
        // organisation il en reste membre avec le rôle user.
        const nouveauRole = actif ? "super_admin" : "user";
        const { error: uErr } = await admin.schema("core").from("profiles")
          .update({ app_role: nouveauRole, updated_at: new Date().toISOString() })
          .eq("id", cible.id);
        if (uErr) throw uErr;
        const { error: lErr } = await admin.schema("core").from("role_changes_log").insert({
          target_user_id: cible.id,
          target_user_email: cible.email,
          change_type: actif ? "super_admin_grant" : "super_admin_revoke",
          old_app_role: cible.app_role,
          new_app_role: nouveauRole,
          old_org_id: cible.org_id,
          new_org_id: cible.org_id,
          changed_by: user.id,
          changed_by_email: profile?.email ?? null,
          changed_by_role: "super_admin",
          reason: typeof body.reason === "string" ? body.reason : null,
          metadata: { source: "admin-droits" },
        });
        if (lErr) console.error("[admin-droits] journal role_changes_log:", lErr.message);
        return json({ data: { ok: true, userId: cible.id, appRole: nouveauRole }, error: null });
      }

      default:
        return json({ data: null, error: `Action inconnue: ${action}` }, 400);
    }
  } catch (e) {
    console.error("[admin-droits]", e);
    const message = e instanceof Error
      ? e.message
      : (typeof e === "object" && e !== null && "message" in e
        ? String((e as { message: unknown }).message)
        : String(e));
    return json({ data: null, error: message }, 500);
  }
});
