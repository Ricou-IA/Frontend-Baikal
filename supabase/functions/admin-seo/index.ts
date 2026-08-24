// admin-seo — proxy Search Console multi-sites + lecture de l'archive
// admin.seo_snapshots (Bing vs Google). Parite avec le /admin de Pre-etat-date.
//
// Actions :
//   overview        { appId, days }   → totaux, precedents, buckets de position,
//                                       top 50 requetes, top 25 pages, parJour
//   compare         { appId, days }   → periode vs periode par requete, statuts
//                                       regression/lost/new/progress/stable (logique PV)
//   bing-vs-google  { appId }         → serie mensuelle Google/Bing + ecarts de position
//   all-sites       { days }          → totaux par site autorise
// Droits par site appliques partout (exigerSite / liste sites).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type GscRow,
  isExactPhraseQuery,
  previousWindow,
  searchAnalytics,
  windowAnchored,
} from "../_shared/gsc.ts";
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

function versLigne(r: GscRow) {
  return {
    cle: r.keys?.[0] ?? "",
    clicks: r.clicks,
    impressions: r.impressions,
    ctr_pct: Number((r.ctr * 100).toFixed(2)),
    position: Number(r.position.toFixed(1)),
  };
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

    // Droits par site : super_admin voit tout, un delegue ses sites.
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
    const { action, appId, days = 28 } = body;
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
        exigerSite(sites, appId);
        const site = await proprieteDe(appId);
        const cur = windowAnchored(nbJours);
        const prev = previousWindow(nbJours);
        const [agregat, agregatPrev, requetes, requetesPrev, pages, daily] = await Promise.all([
          searchAnalytics(site, cur.startDate, cur.endDate),
          searchAnalytics(site, prev.startDate, prev.endDate),
          searchAnalytics(site, cur.startDate, cur.endDate, ["query"], 5000),
          searchAnalytics(site, prev.startDate, prev.endDate, ["query"], 5000),
          searchAnalytics(site, cur.startDate, cur.endDate, ["page"], 25),
          searchAnalytics(site, cur.startDate, cur.endDate, ["date"], 100),
        ]);

        // Bruit "phrase exacte" ecarte des tops et des buckets (regle PV).
        const reelles = requetes.filter((r) => !isExactPhraseQuery(r.keys?.[0]));
        const reellesPrev = requetesPrev.filter((r) => !isExactPhraseQuery(r.keys?.[0]));

        // Distribution des impressions par bucket de position ; "hidden" =
        // impressions totales moins celles des requetes detaillees (Google
        // masque les recherches trop rares) + le bruit ecarte.
        const buckets = { top3: 0, top10: 0, top20: 0, beyond: 0, hidden: 0 };
        let imprDetaillees = 0;
        for (const r of reelles) {
          imprDetaillees += r.impressions;
          if (r.position <= 3) buckets.top3 += r.impressions;
          else if (r.position <= 10) buckets.top10 += r.impressions;
          else if (r.position <= 20) buckets.top20 += r.impressions;
          else buckets.beyond += r.impressions;
        }
        const totaux = totals(agregat);
        buckets.hidden = Math.max(0, totaux.impressions - imprDetaillees);

        // Position moyenne : methode PV — ponderee par impressions sur les
        // requetes DETAILLEES (bruit ecarte), pas la ligne agregee Google qui
        // inclut les recherches masquees. Clics/impressions/CTR restent ceux
        // de l'agregat (totaux reels du site).
        const totauxPrecedents = totals(agregatPrev);
        totaux.position = totals(reelles).position;
        totauxPrecedents.position = totals(reellesPrev).position;

        return json({
          data: {
            fenetre: cur,
            fenetrePrecedente: prev,
            totaux,
            totauxPrecedents,
            buckets,
            topRequetes: reelles.slice(0, 50).map(versLigne),
            topPages: pages.map(versLigne),
            parJour: daily.map((r) => ({
              date: r.keys?.[0],
              clicks: r.clicks,
              impressions: r.impressions,
            })),
          },
          error: null,
        });
      }

      case "compare": {
        exigerSite(sites, appId);
        const fenetre = [7, 28].includes(days) ? days : 28;
        const site = await proprieteDe(appId);
        const cur = windowAnchored(fenetre);
        const prev = previousWindow(fenetre);
        const [curRows, prevRows] = await Promise.all([
          searchAnalytics(site, cur.startDate, cur.endDate, ["query"], 5000),
          searchAnalytics(site, prev.startDate, prev.endDate, ["query"], 5000),
        ]);
        const curReelles = curRows.filter((r) => !isExactPhraseQuery(r.keys?.[0]));
        const prevReelles = prevRows.filter((r) => !isExactPhraseQuery(r.keys?.[0]));

        const parRequeteCur = new Map(curReelles.map((r) => [r.keys![0], r]));
        const parRequetePrev = new Map(prevReelles.map((r) => [r.keys![0], r]));
        const toutes = new Set([...parRequeteCur.keys(), ...parRequetePrev.keys()]);

        type Statut = "regression" | "lost" | "stable" | "new" | "progress";
        const requetes: Array<Record<string, unknown> & { statut: Statut }> = [];
        const resume = { regressions: 0, disparues: 0, nouvelles: 0, progressions: 0, stables: 0 };

        for (const q of toutes) {
          const c = parRequeteCur.get(q);
          const p = parRequetePrev.get(q);
          // Filtre de bruit : seuil minimum d'impressions cumulees (regle PV).
          if ((c?.impressions ?? 0) + (p?.impressions ?? 0) < 10) continue;

          const posCur = c ? Number(c.position.toFixed(2)) : null;
          const posPrev = p ? Number(p.position.toFixed(2)) : null;
          const posDelta = posCur !== null && posPrev !== null
            ? Number((posCur - posPrev).toFixed(2))
            : null;

          let statut: Statut;
          if (!p) { statut = "new"; resume.nouvelles++; }
          else if (!c) { statut = "lost"; resume.disparues++; }
          else if (posDelta !== null && posDelta >= 1) { statut = "regression"; resume.regressions++; }
          else if (posDelta !== null && posDelta <= -1) { statut = "progress"; resume.progressions++; }
          else { statut = "stable"; resume.stables++; }

          requetes.push({
            requete: q,
            clicksCur: c?.clicks ?? 0,
            clicksPrev: p?.clicks ?? 0,
            clicksDelta: (c?.clicks ?? 0) - (p?.clicks ?? 0),
            imprCur: c?.impressions ?? 0,
            imprPrev: p?.impressions ?? 0,
            posCur,
            posPrev,
            posDelta,
            statut,
          });
        }

        // Tri PV : regressions (pires en tete), puis disparues, stables,
        // nouvelles, progressions ; a statut egal, posDelta desc puis volume.
        const ordre: Record<Statut, number> = { regression: 0, lost: 1, stable: 2, new: 3, progress: 4 };
        requetes.sort((a, b) => {
          if (ordre[a.statut] !== ordre[b.statut]) return ordre[a.statut] - ordre[b.statut];
          const da = a.posDelta as number | null;
          const db = b.posDelta as number | null;
          if (da !== null && db !== null && da !== db) return db - da;
          return ((b.imprCur as number) + (b.imprPrev as number)) -
            ((a.imprCur as number) + (a.imprPrev as number));
        });

        const tc = totals(curReelles);
        const tp = totals(prevReelles);
        return json({
          data: {
            fenetre: cur,
            fenetrePrecedente: prev,
            totauxDelta: {
              clicks: tc.clicks - tp.clicks,
              clicksPct: tp.clicks > 0
                ? Number((((tc.clicks - tp.clicks) / tp.clicks) * 100).toFixed(1))
                : null,
              impressions: tc.impressions - tp.impressions,
              impressionsPct: tp.impressions > 0
                ? Number((((tc.impressions - tp.impressions) / tp.impressions) * 100).toFixed(1))
                : null,
              ctrPct: Number(((tc.ctr - tp.ctr) * 100).toFixed(2)),
              position: Number((tc.position - tp.position).toFixed(1)),
            },
            resume,
            requetes,
          },
          error: null,
        });
      }

      case "bing-vs-google": {
        exigerSite(sites, appId);
        // Serie mensuelle : Google = somme des requetes archivees (mois,
        // is_noise=false) ; Bing = somme de la serie quotidienne (dimension
        // site). Mois sans mesure Bing = null, JAMAIS 0 (Bing n'a pas
        // d'historique : les mois d'avant le cron sont definitivement vides).
        const [gRes, bRes, obsRes] = await Promise.all([
          admin.schema("admin").from("seo_snapshots")
            .select("period_start, clicks")
            .eq("app_id", appId).eq("source", "google")
            .eq("dimension", "query").eq("granularity", "month")
            .eq("is_noise", false),
          admin.schema("admin").from("seo_snapshots")
            .select("period_start, clicks")
            .eq("app_id", appId).eq("source", "bing")
            .eq("dimension", "site").eq("granularity", "day"),
          admin.schema("admin").from("seo_snapshots")
            .select("period_start, key, clicks, impressions, position")
            .eq("app_id", appId).eq("source", "bing")
            .eq("dimension", "query").eq("granularity", "observation")
            .order("period_start", { ascending: false })
            .limit(1000),
        ]);
        if (gRes.error) throw gRes.error;
        if (bRes.error) throw bRes.error;
        if (obsRes.error) throw obsRes.error;

        const mois = (d: string) => d.slice(0, 7);
        const google = new Map<string, number>();
        for (const r of gRes.data ?? []) {
          google.set(mois(r.period_start), (google.get(mois(r.period_start)) ?? 0) + r.clicks);
        }
        const bing = new Map<string, number>();
        for (const r of bRes.data ?? []) {
          bing.set(mois(r.period_start), (bing.get(mois(r.period_start)) ?? 0) + r.clicks);
        }
        const tousMois = [...new Set([...google.keys(), ...bing.keys()])].sort();
        const mensuel = tousMois.map((m) => ({
          mois: `${m}-01`,
          google: google.get(m) ?? 0,
          bing: bing.has(m) ? bing.get(m)! : null,
        }));

        // Ecarts de position : dernier releve Bing vs dernier mois Google —
        // requetes ou Bing classe nettement mieux (>= 5 rangs).
        const obs = obsRes.data ?? [];
        const dernierReleve = obs[0]?.period_start ?? null;
        const bingDernier = obs.filter((r) => r.period_start === dernierReleve);

        const { data: gDernierMoisRows, error: gmErr } = await admin
          .schema("admin").from("seo_snapshots")
          .select("period_start, key, position, clicks")
          .eq("app_id", appId).eq("source", "google")
          .eq("dimension", "query").eq("granularity", "month")
          .eq("is_noise", false)
          .order("period_start", { ascending: false })
          .limit(2000);
        if (gmErr) throw gmErr;
        const gDernierMois = gDernierMoisRows?.[0]?.period_start ?? null;
        const googleParRequete = new Map(
          (gDernierMoisRows ?? [])
            .filter((r) => r.period_start === gDernierMois && r.position !== null)
            .map((r) => [r.key, r]),
        );

        const ecarts = bingDernier
          .filter((b) => b.position !== null && googleParRequete.has(b.key))
          .map((b) => {
            const g = googleParRequete.get(b.key)!;
            return {
              requete: b.key,
              positionBing: Number(b.position),
              positionGoogle: Number(g.position),
              delta: Number((Number(g.position) - Number(b.position)).toFixed(1)),
              clicksBing: b.clicks,
              clicksGoogle: g.clicks,
            };
          })
          .filter((e) => e.delta >= 5)
          .sort((a, b) => b.delta - a.delta)
          .slice(0, 15);

        const disponible = mensuel.length > 0 || bingDernier.length > 0;
        return json({
          data: { disponible, mensuel, ecarts, dernierReleve },
          error: null,
        });
      }

      case "all-sites": {
        // Restreint aux sites autorises (super_admin = toutes les apps actives).
        const { data: apps, error } = await admin
          .schema("config").from("apps")
          .select("id, name, gsc_propriete")
          .not("gsc_propriete", "is", null)
          .in("id", sites);
        if (error) throw error;
        const w = windowAnchored(nbJours);
        const resultats = await Promise.all((apps ?? []).map(async (a) => {
          try {
            const rows = await searchAnalytics(a.gsc_propriete, w.startDate, w.endDate);
            return { appId: a.id, nom: a.name, ...totals(rows), erreur: null };
          } catch (e) {
            return {
              appId: a.id,
              nom: a.name,
              clicks: 0,
              impressions: 0,
              ctr: 0,
              position: 0,
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
