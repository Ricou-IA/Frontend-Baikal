// admin-seo-autorite — releve mensuel Moz (URL Metrics) de nos domaines et
// des concurrents, archive dans admin.seo_autorite.
//
//   capture  (X-Cron-Secret, cron le 5 a 05h30 UTC, ou a la main)
//            { appId?, domaines? } → un appel Moz par domaine, 10 s d'ecart.
//   serie    (JWT utilisateur) { appId } → la serie par domaine et par mois.
//
// Palier gratuit Moz : 50 lignes par mois, une ligne par domaine mesure. Neuf
// domaines par releve -> UN releve par mois, JAMAIS de retry automatique : un
// echec se journalise et se rejoue le mois suivant ou a la main.
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ErreurAcces, exigerSite, sitesAutorises } from "../_shared/droits.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-app-id, x-cron-secret",
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function entier(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  // Moz rend -1 quand il n'a pas de donnee (spam score) : pas un zero.
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

async function mesurerMoz(domaine: string, token: string): Promise<Record<string, unknown>> {
  const res = await fetch("https://api.moz.com/v2/url_metrics", {
    method: "POST",
    headers: { "x-moz-token": token, "Content-Type": "application/json" },
    body: JSON.stringify({ targets: [domaine] }),
  });
  if (!res.ok) throw new Error(`Moz ${res.status} sur ${domaine}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  const r = body?.results?.[0];
  if (!r) throw new Error(`Moz : aucun resultat pour ${domaine}`);
  return r;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ data: null, error: "POST attendu" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json().catch(() => ({}));
    const secretCron = req.headers.get("x-cron-secret");
    const attendu = Deno.env.get("ADMIN_SEO_CRON_SECRET");

    // --- Chemin cron : capture.
    if (secretCron !== null) {
      if (!attendu || secretCron !== attendu) return json({ data: null, error: "Secret de cron invalide" }, 401);
      const token = Deno.env.get("MOZ_API_TOKEN");
      if (!token) return json({ data: null, error: "MOZ_API_TOKEN absent" }, 500);

      let requete = admin.schema("config").from("apps")
        .select("id, seo_concurrents").eq("is_active", true).not("seo_concurrents", "is", null);
      if (body.appId) requete = requete.eq("id", String(body.appId));
      const { data: apps, error } = await requete;
      if (error) throw new Error(error.message);

      const aujourdhui = new Date().toISOString().slice(0, 10);
      const resume: Record<string, unknown> = {};
      for (const app of apps ?? []) {
        const domaines: string[] = Array.isArray(body.domaines)
          ? body.domaines.map(String)
          : (Array.isArray(app.seo_concurrents) ? app.seo_concurrents.map(String) : []);
        const ok: string[] = [];
        const echecs: Record<string, string> = {};
        for (let i = 0; i < domaines.length; i++) {
          const d = domaines[i];
          if (i > 0) await new Promise((r) => setTimeout(r, 10_000)); // 1 requete / 10 s
          try {
            const m = await mesurerMoz(d, token);
            const { error: eUp } = await admin.schema("admin").from("seo_autorite").upsert({
              app_id: app.id,
              domaine: d,
              mesure_le: aujourdhui,
              da: entier(m.domain_authority),
              pa: entier(m.page_authority),
              spam: entier(m.spam_score),
              ref_domains: entier(m.root_domains_to_root_domain),
              external_links: entier(m.external_pages_to_root_domain),
              nofollow_ref_domains: entier(m.nofollow_root_domains_to_root_domain),
              deleted_ref_domains: entier(m.deleted_root_domains_to_root_domain),
              last_crawled: m.last_crawled ? String(m.last_crawled).slice(0, 10) : null,
              brut: m,
            }, { onConflict: "app_id,domaine,mesure_le" });
            if (eUp) throw new Error(eUp.message);
            ok.push(d);
          } catch (e) {
            // Pas de retry : chaque essai reussi coute une ligne de quota.
            echecs[d] = (e as Error).message;
            console.error("[admin-seo-autorite]", app.id, d, (e as Error).message);
          }
        }
        resume[app.id] = { mesure_le: aujourdhui, ok, echecs };
      }
      return json({ data: resume, error: null });
    }

    // --- Chemin utilisateur : lecture de la serie.
    const authHeader = req.headers.get("Authorization") ?? "";
    const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const autorises = await sitesAutorises(caller);
    const appId = String(body.appId ?? "");
    exigerSite(autorises, appId);

    if (String(body.action ?? "serie") === "serie") {
      const [{ data: app }, { data, error }] = await Promise.all([
        admin.schema("config").from("apps").select("domaine, seo_concurrents").eq("id", appId).maybeSingle(),
        admin.schema("admin").from("seo_autorite")
          .select("domaine, mesure_le, da, pa, spam, ref_domains, external_links, nofollow_ref_domains, deleted_ref_domains, last_crawled")
          .eq("app_id", appId).order("mesure_le"),
      ]);
      if (error) throw new Error(error.message);
      const ordre: string[] = Array.isArray(app?.seo_concurrents) ? app.seo_concurrents.map(String) : [];
      const mois = [...new Set((data ?? []).map((r: any) => String(r.mesure_le).slice(0, 7)))].sort();
      const parDomaine = new Map<string, any[]>();
      for (const r of data ?? []) {
        const l = parDomaine.get(r.domaine) ?? [];
        l.push({ ...r, mois: String(r.mesure_le).slice(0, 7) });
        parDomaine.set(r.domaine, l);
      }
      const domaines = [...new Set([...ordre, ...parDomaine.keys()])].map((d) => ({
        domaine: d,
        notre: d === app?.domaine,
        releves: parDomaine.get(d) ?? [],
      }));
      return json({ data: { mois, domaines, notre_domaine: app?.domaine ?? null }, error: null });
    }

    return json({ data: null, error: "Action inconnue" }, 400);
  } catch (e) {
    if (e instanceof ErreurAcces) return json({ data: null, error: e.message }, 403);
    console.error("[admin-seo-autorite]", e);
    return json({ data: null, error: (e as Error).message }, 500);
  }
});
