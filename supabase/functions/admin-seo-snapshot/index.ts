// admin-seo-snapshot — archive les donnees SEO (Google + Bing) de chaque site
// du registre dans admin.seo_snapshots. Porte de pv-seo-snapshot (Pack
// Vendeur), generalise multi-sites.
//
// Auth : header `X-Cron-Secret` = secret ADMIN_SEO_CRON_SECRET (fail-closed).
// Appelee par pg_cron (verify_jwt = false), jamais par le front.
//
// TROIS RYTHMES :
//   - corps vide (cron mensuel, le 4 a 05h00 UTC) → capture le MOIS CIVIL
//     PRECEDENT cote Google (query + page, is_noise marque) et releve les tops
//     Bing (query + page, granularity 'observation' : l'API n'est pas datee).
//   - { "scope": "daily" } (cron quotidien 04h15 UTC) → serie quotidienne Bing
//     (dimension 'site', seule source datee) et refresh du MOIS EN COURS
//     Google (period_end fige a la fin du mois : chaque passage reecrit les
//     memes lignes, auto-reparateur).
//   - { "start": "2026-05-01", "end": "2026-05-31" } → backfill Google d'une
//     periode arbitraire (Bing n'a aucun historique interrogeable).
//
// Idempotent : upsert sur (app_id, source, period_start, period_end,
// dimension, key).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isExactPhraseQuery, searchAnalytics } from "../_shared/gsc.ts";
import {
  bingPageStats,
  bingQueryStats,
  bingRankAndTrafficStats,
  loadBingApiKey,
  parseDotNetDate,
} from "../_shared/bing-webmaster.ts";

// Google plafonne a 25 000 lignes par appel ; 5 000 couvre largement nos sites.
const ROW_LIMIT = 5000;
const ON_CONFLICT = "app_id,source,period_start,period_end,dimension,key";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Premier et dernier jour du mois civil precedent (UTC). */
function moisPrecedent(): { start: string; end: string } {
  const now = new Date();
  const premierDuMois = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const end = new Date(premierDuMois - 24 * 3600 * 1000);
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  return { start: fmtDate(start), end: fmtDate(end) };
}

/** Mois civil EN COURS — end volontairement dans le futur (cle d'upsert figee). */
function moisEnCours(): { start: string; end: string; dataEnd: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  const hier = new Date(Date.now() - 24 * 3600 * 1000);
  return { start: fmtDate(start), end: fmtDate(end), dataEnd: fmtDate(hier) };
}

interface SiteRegistre {
  id: string;
  domaine: string | null;
  gsc_propriete: string | null;
}

type Ligne = {
  app_id: string;
  source: "google" | "bing";
  period_start: string;
  period_end: string;
  granularity: "month" | "day" | "observation";
  dimension: "query" | "page" | "site" | "device" | "country" | "appearance";
  key: string;
  clicks: number;
  impressions: number;
  ctr: number | null;
  position: number | null;
  is_noise: boolean;
  captured_at: string;
};

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST attendu" }, 405);

  const secretAttendu = Deno.env.get("ADMIN_SEO_CRON_SECRET");
  const secretRecu = req.headers.get("X-Cron-Secret") ?? "";
  if (!secretAttendu || !constantTimeEqual(secretRecu, secretAttendu)) {
    return json({ error: "Non autorise" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: { scope?: string; start?: string; end?: string } = {};
  try {
    body = await req.json();
  } catch { /* corps vide = cron mensuel */ }

  const maintenant = new Date().toISOString();
  const bingKey = loadBingApiKey();

  const { data: sites, error: sitesErr } = await admin
    .schema("config").from("apps")
    .select("id, domaine, gsc_propriete")
    .eq("is_active", true)
    .not("gsc_propriete", "is", null);
  if (sitesErr) return json({ error: sitesErr.message }, 500);

  const resume: Record<string, Record<string, unknown>> = {};

  // L'API Bing peut renvoyer la meme cle deux fois dans un meme releve :
  // Postgres refuse alors l'upsert ("cannot affect row a second time").
  // Dedoublonnage par cle d'unicite, en agregeant clics/impressions et en
  // ponderant la position.
  function dedupliquer(lignes: Ligne[]): Ligne[] {
    const parCle = new Map<string, Ligne>();
    for (const l of lignes) {
      const cle = `${l.source}|${l.period_start}|${l.period_end}|${l.dimension}|${l.key}`;
      const existant = parCle.get(cle);
      if (!existant) {
        parCle.set(cle, { ...l });
        continue;
      }
      const impressions = existant.impressions + l.impressions;
      existant.position = impressions > 0
        ? Number(
          (((existant.position ?? 0) * existant.impressions +
            (l.position ?? 0) * l.impressions) / impressions).toFixed(2),
        )
        : existant.position;
      existant.clicks += l.clicks;
      existant.impressions = impressions;
      existant.ctr = impressions > 0
        ? Number((existant.clicks / impressions).toFixed(5))
        : null;
    }
    return [...parCle.values()];
  }

  async function upsert(lignes: Ligne[]): Promise<number> {
    const uniques = dedupliquer(lignes);
    if (uniques.length === 0) return 0;
    const { error } = await admin.schema("admin").from("seo_snapshots")
      .upsert(uniques, { onConflict: ON_CONFLICT });
    if (error) throw new Error(error.message);
    return uniques.length;
  }

  function lignesGoogle(
    site: SiteRegistre,
    rows: Array<{ keys?: string[]; clicks: number; impressions: number; ctr: number; position: number }>,
    dimension: "query" | "page" | "device" | "country" | "appearance",
    periode: { start: string; end: string },
  ): Ligne[] {
    return rows
      .filter((r) => (r.keys?.[0] ?? "") !== "")
      .map((r) => ({
        app_id: site.id,
        source: "google" as const,
        period_start: periode.start,
        period_end: periode.end,
        granularity: "month" as const,
        dimension,
        key: r.keys![0],
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: Number(r.ctr.toFixed(5)),
        position: Number(r.position.toFixed(2)),
        is_noise: dimension === "query" && isExactPhraseQuery(r.keys![0]),
        captured_at: maintenant,
      }));
  }

  async function captureGoogle(site: SiteRegistre, periode: { start: string; end: string }, dataEnd?: string) {
    const finDonnees = dataEnd && dataEnd < periode.end ? dataEnd : periode.end;
    const prop = site.gsc_propriete!;
    // L'ensemble des dimensions des exports GSC : requetes, pages, appareils,
    // pays, apparence dans les resultats — tout vit en base.
    const [requetes, pages, appareils, pays, apparences] = await Promise.all([
      searchAnalytics(prop, periode.start, finDonnees, ["query"], ROW_LIMIT),
      searchAnalytics(prop, periode.start, finDonnees, ["page"], ROW_LIMIT),
      searchAnalytics(prop, periode.start, finDonnees, ["device"], 10),
      searchAnalytics(prop, periode.start, finDonnees, ["country"], 250),
      searchAnalytics(prop, periode.start, finDonnees, ["searchAppearance"], 25),
    ]);
    const n = await upsert([
      ...lignesGoogle(site, requetes, "query", periode),
      ...lignesGoogle(site, pages, "page", periode),
      ...lignesGoogle(site, appareils, "device", periode),
      ...lignesGoogle(site, pays, "country", periode),
      ...lignesGoogle(site, apparences, "appearance", periode),
    ]);
    return { periode: `${periode.start}..${periode.end}`, lignes: n };
  }

  async function captureBingTops(site: SiteRegistre) {
    if (!bingKey) return "BING_WEBMASTER_API_KEY absente — Bing ignore";
    if (!site.domaine) return "domaine absent du registre — Bing ignore";
    const siteUrl = `https://${site.domaine}/`;
    const aujourdHui = fmtDate(new Date());
    const [requetes, pages] = await Promise.all([
      bingQueryStats(bingKey, siteUrl),
      bingPageStats(bingKey, siteUrl),
    ]);
    if (requetes.status === "error") return `Bing: ${requetes.error}`;
    const lignes: Ligne[] = [];
    for (const r of requetes.rows) {
      const cle = (r.Query ?? "").trim();
      if (!cle) continue;
      const impressions = r.Impressions ?? 0;
      lignes.push({
        app_id: site.id, source: "bing",
        period_start: aujourdHui, period_end: aujourdHui,
        granularity: "observation", dimension: "query", key: cle,
        clicks: r.Clicks ?? 0, impressions,
        ctr: impressions > 0 ? Number(((r.Clicks ?? 0) / impressions).toFixed(5)) : null,
        position: r.AvgImpressionPosition != null ? Number(Number(r.AvgImpressionPosition).toFixed(2)) : null,
        is_noise: false, captured_at: maintenant,
      });
    }
    if (pages.status === "success") {
      for (const r of pages.rows) {
        const cle = (r.Query ?? "").trim();
        if (!cle) continue;
        const impressions = r.Impressions ?? 0;
        lignes.push({
          app_id: site.id, source: "bing",
          period_start: aujourdHui, period_end: aujourdHui,
          granularity: "observation", dimension: "page", key: cle,
          clicks: r.Clicks ?? 0, impressions,
          ctr: impressions > 0 ? Number(((r.Clicks ?? 0) / impressions).toFixed(5)) : null,
          position: r.AvgImpressionPosition != null ? Number(Number(r.AvgImpressionPosition).toFixed(2)) : null,
          is_noise: false, captured_at: maintenant,
        });
      }
    }
    const n = await upsert(lignes);
    return { lignes: n };
  }

  // Serie quotidienne Google (dimension date) : une ligne par jour, site
  // entier — alimente le graphe Performances et l'analyse SQL directe.
  async function captureGoogleSerie(
    site: SiteRegistre,
    start: string,
    end: string,
  ) {
    const rows = await searchAnalytics(site.gsc_propriete!, start, end, ["date"], 5000);
    const lignes: Ligne[] = rows
      .filter((r) => (r.keys?.[0] ?? "") !== "")
      .map((r) => ({
        app_id: site.id,
        source: "google" as const,
        period_start: r.keys![0],
        period_end: r.keys![0],
        granularity: "day" as const,
        dimension: "site" as const,
        key: "site",
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: Number(r.ctr.toFixed(5)),
        position: Number(r.position.toFixed(2)),
        is_noise: false,
        captured_at: maintenant,
      }));
    const n = await upsert(lignes);
    return { periode: `${start}..${end}`, jours: n };
  }

  async function captureBingQuotidien(site: SiteRegistre) {
    if (!bingKey) return "BING_WEBMASTER_API_KEY absente — Bing ignore";
    if (!site.domaine) return "domaine absent du registre — Bing ignore";
    const siteUrl = `https://${site.domaine}/`;
    const serie = await bingRankAndTrafficStats(bingKey, siteUrl);
    if (serie.status === "error") return `Bing: ${serie.error}`;
    const lignes: Ligne[] = [];
    for (const r of serie.rows) {
      const jour = parseDotNetDate(r.Date);
      if (!jour) continue;
      lignes.push({
        app_id: site.id, source: "bing",
        period_start: jour, period_end: jour,
        granularity: "day", dimension: "site", key: "site",
        clicks: r.Clicks ?? 0, impressions: r.Impressions ?? 0,
        ctr: (r.Impressions ?? 0) > 0
          ? Number(((r.Clicks ?? 0) / (r.Impressions ?? 1)).toFixed(5))
          : null,
        position: null, is_noise: false, captured_at: maintenant,
      });
    }
    const n = await upsert(lignes);
    return { jours: n };
  }

  try {
    for (const site of (sites ?? []) as SiteRegistre[]) {
      const r: Record<string, unknown> = {};
      try {
        if (body.scope === "serie" && body.start && body.end) {
          // Backfill de la serie quotidienne Google (16 mois max cote GSC).
          r.google = await captureGoogleSerie(site, body.start, body.end);
        } else if (body.start && body.end) {
          r.google = await captureGoogle(site, { start: body.start, end: body.end });
        } else if (body.scope === "daily") {
          const mois = moisEnCours();
          r.google = await captureGoogle(site, { start: mois.start, end: mois.end }, mois.dataEnd);
          // Rafraichit aussi les 10 derniers jours de la serie quotidienne
          // (les 2-3 derniers se consolident encore).
          const fin = fmtDate(new Date(Date.now() - 24 * 3600 * 1000));
          const debut = fmtDate(new Date(Date.now() - 10 * 24 * 3600 * 1000));
          r.googleSerie = await captureGoogleSerie(site, debut, fin);
          r.bing = await captureBingQuotidien(site);
        } else {
          r.google = await captureGoogle(site, moisPrecedent());
          r.bing = await captureBingTops(site);
        }
      } catch (e) {
        r.erreur = e instanceof Error ? e.message : String(e);
      }
      resume[site.id] = r;
    }
    return json({ resume, error: null });
  } catch (e) {
    console.error("[admin-seo-snapshot]", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
