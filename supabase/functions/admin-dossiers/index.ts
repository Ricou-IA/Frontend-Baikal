// admin-dossiers : liste et fiche des dossiers clients d'un site du registre,
// lues dans les vues contractuelles baikal_dossiers / baikal_dossier_emails /
// baikal_dossier_events du projet du site (canal lecture seule _shared/sites.ts).
// La capacite d'un site se lit a la presence des vues et des colonnes : un
// site sans vue baikal_dossiers n'a pas le module (disponible=false, pas une
// erreur), un site sans colonnes abo_* n'affiche pas d'abonnement.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chargerSite, ErreurSite, lecteurSite } from "../_shared/sites.ts";
import { ErreurAcces, exigerSite, sitesAutorises } from "../_shared/droits.ts";
import { normaliserCriteres } from "./filtres.ts";
import { canalVente } from "./canal.ts";

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

interface EtapeFunnel {
  slug: string;
  libelle: string;
  couleur: string;
  masquee_par_defaut?: boolean;
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
    // super_admin recoit toutes les apps actives via mes_droits_sites() ;
    // un delegue recoit ses sites ; les autres un tableau vide.
    const sites = await sitesAutorises(caller);
    if (sites.length === 0) return json({ data: null, error: "Acces refuse" }, 403);

    const body = await req.json();
    const { action, appId } = body;
    if (!appId) return json({ data: null, error: "appId requis" }, 400);
    exigerSite(sites, appId);

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const site = await chargerSite(admin, appId);

    // Etapes du funnel : donnee du registre. NULL = site sans funnel.
    const { data: appConfig } = await admin.schema("config").from("apps")
      .select("funnel_etapes").eq("id", appId).maybeSingle();
    const funnel = (appConfig?.funnel_etapes ?? null) as EtapeFunnel[] | null;

    const sql = lecteurSite(site);
    try {
      const [vues] = await sql`
        SELECT to_regclass('public.baikal_dossiers')::text        AS dossiers,
               to_regclass('public.baikal_dossier_emails')::text  AS emails,
               to_regclass('public.baikal_dossier_events')::text  AS events`;
      if (!vues.dossiers) {
        return json({ data: { disponible: false }, error: null });
      }
      const colonnes = new Set(
        (await sql`
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'baikal_dossiers'`)
          .map((c) => c.column_name as string),
      );

      if (action === "liste") {
        const c = normaliserCriteres(body);
        const masquees = (funnel ?? [])
          .filter((e) => e.masquee_par_defaut === true)
          .map((e) => e.slug);
        const motif = `%${c.recherche}%`;
        const rows = await sql`
          SELECT *, count(*) OVER() AS total_lignes
          FROM public.baikal_dossiers
          WHERE true
            ${c.exclureTests ? sql`AND est_test IS NOT TRUE` : sql``}
            ${c.inclureSupprimes ? sql`` : sql`AND supprime_le IS NULL`}
            ${c.perimetre ? sql`AND perimetre = ${c.perimetre}` : sql``}
            ${c.periodeJours
              ? sql`AND cree_le >= now() - make_interval(days => ${c.periodeJours})`
              : sql``}
            ${c.statuts.length > 0
              ? sql`AND statut = ANY(${c.statuts})`
              : (!c.inclureMasquees && masquees.length > 0
                ? sql`AND (statut IS NULL OR statut <> ALL(${masquees}))`
                : sql``)}
            ${c.recherche
              ? sql`AND (email ILIKE ${motif}
                    OR contact_nom ILIKE ${motif}
                    ${colonnes.has("libelle") ? sql`OR libelle ILIKE ${motif}` : sql``})`
              : sql``}
          ORDER BY ${c.tri === "paye_le" ? sql`paye_le` : sql`cree_le`}
            ${c.ordre === "asc" ? sql`ASC NULLS LAST` : sql`DESC NULLS LAST`}
          LIMIT ${c.parPage} OFFSET ${(c.page - 1) * c.parPage}`;
        const total = rows.length > 0 ? Number(rows[0].total_lignes) : 0;
        const dossiers = rows.map(({ total_lignes: _t, ...d }) => ({
          ...d,
          canal: canalVente(d.attribution as Record<string, unknown> | null),
        }));
        return json({
          data: { disponible: true, dossiers, total, page: c.page, parPage: c.parPage, funnel },
          error: null,
        });
      }

      if (action === "fiche") {
        const dossierId = typeof body.dossierId === "string" ? body.dossierId : "";
        if (!dossierId) return json({ data: null, error: "dossierId requis" }, 400);
        const [dossier] = await sql`
          SELECT * FROM public.baikal_dossiers WHERE dossier_id = ${dossierId}`;
        if (!dossier) return json({ data: null, error: "Dossier introuvable" }, 404);
        const emails = vues.emails
          ? await sql`
            SELECT * FROM public.baikal_dossier_emails
            WHERE dossier_id = ${dossierId} ORDER BY envoye_le DESC LIMIT 200`
          : null;
        const events = vues.events
          ? await sql`
            SELECT * FROM public.baikal_dossier_events
            WHERE dossier_id = ${dossierId} ORDER BY survenu_le DESC LIMIT 100`
          : null;
        return json({
          data: {
            disponible: true,
            dossier: {
              ...dossier,
              canal: canalVente(dossier.attribution as Record<string, unknown> | null),
            },
            emails,
            events,
            funnel,
          },
          error: null,
        });
      }

      return json({ data: null, error: `Action inconnue: ${action}` }, 400);
    } finally {
      await sql.end();
    }
  } catch (e) {
    console.error("[admin-dossiers]", e);
    if (e instanceof ErreurAcces) return json({ data: null, error: e.message }, 403);
    if (e instanceof ErreurSite) return json({ data: null, error: e.message }, 400);
    const message = e instanceof Error ? e.message : String(e);
    return json({ data: null, error: message }, 500);
  }
});
