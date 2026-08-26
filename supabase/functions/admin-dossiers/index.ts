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
import { ErreurRelais, preparerRelais, relaisConfigure } from "./relais.ts";

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

    // Chemin relais : actions et fiche etendue via l'EF d'administration du
    // site (spec, section 7). Pas de connexion SQL ici : tout part en HTTP.
    if (action === "site-detail" || action === "site-action") {
      const dossierId = typeof body.dossierId === "string" ? body.dossierId : "";
      if (!dossierId) return json({ data: null, error: "dossierId requis" }, 400);
      const ACTIONS_SITE: Record<string, { superAdminSeul: boolean }> = {
        "detail": { superAdminSeul: false },
        "re-extract": { superAdminSeul: false },
        "resend-email": { superAdminSeul: false },
        "reset-extractions": { superAdminSeul: false },
        "add-pro-credits": { superAdminSeul: true },
        "purge-documents": { superAdminSeul: true },
      };
      const actionSite = action === "site-detail" ? "detail" : String(body.actionSite ?? "");
      const def = ACTIONS_SITE[actionSite];
      if (!def || (action === "site-action" && actionSite === "detail")) {
        return json({ data: null, error: `Action site inconnue: ${actionSite}` }, 400);
      }
      if (def.superAdminSeul) {
        const { data: profil } = await caller
          .from("profiles").select("app_role").eq("id", user.id).single();
        if (profil?.app_role !== "super_admin") {
          return json({ data: null, error: "Action reservee au super_admin" }, 403);
        }
      }
      const cible = preparerRelais(site);
      if (!cible) {
        return json({ data: null, error: "Site sans canal d'administration configure" }, 400);
      }
      const corps: Record<string, unknown> = { action: actionSite, dossier_id: dossierId };
      if (actionSite === "resend-email") {
        corps.email_action = typeof body.emailAction === "string" ? body.emailAction : "";
      }
      if (actionSite === "add-pro-credits") {
        const brut = Number(body.credits);
        corps.credits = Number.isFinite(brut) && brut > 0 ? Math.min(100, Math.floor(brut)) : 1;
      }
      const reponse = await fetch(cible.url, {
        method: "POST",
        headers: cible.headers,
        body: JSON.stringify(corps),
      });
      const texte = await reponse.text();
      let charge: unknown;
      try {
        charge = JSON.parse(texte);
      } catch {
        charge = { brut: texte.slice(0, 500) };
      }
      if (!reponse.ok) {
        return json(
          { data: null, error: `Site ${site.id}: HTTP ${reponse.status}`, detail: charge },
          502,
        );
      }
      return json({ data: charge, error: null });
    }

    // Etapes du funnel : donnee du registre. NULL = site sans funnel.
    const { data: appConfig } = await admin.schema("config").from("apps")
      .select("funnel_etapes").eq("id", appId).maybeSingle();
    const funnel = (appConfig?.funnel_etapes ?? null) as EtapeFunnel[] | null;

    const sql = lecteurSite(site);
    try {
      // La vue contractuelle vit dans le schema du site (bases partagees :
      // un schema par produit, sinon collision de noms dans public) ou dans
      // public (projets dedies, modele Pre-etat-date). Premier trouve gagne.
      const candidats = [site.db_schema, "public"]
        .filter((s): s is string => Boolean(s));
      let schemaVues: string | null = null;
      for (const s of candidats) {
        const [r] = await sql`
          SELECT to_regclass(${s + ".baikal_dossiers"}) IS NOT NULL AS ok`;
        if (r.ok) {
          schemaVues = s;
          break;
        }
      }
      if (!schemaVues) {
        return json({ data: { disponible: false }, error: null });
      }
      const [vues] = await sql`
        SELECT to_regclass(${schemaVues + ".baikal_dossier_emails"})::text  AS emails,
               to_regclass(${schemaVues + ".baikal_dossier_events"})::text  AS events`;
      const colonnes = new Set(
        (await sql`
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = ${schemaVues} AND table_name = 'baikal_dossiers'`)
          .map((c) => c.column_name as string),
      );

      if (action === "liste") {
        const c = normaliserCriteres(body);
        const masquees = (funnel ?? [])
          .filter((e) => e.masquee_par_defaut === true)
          .map((e) => e.slug);
        const motif = `%${c.recherche}%`;
        const filtresSql = sql`
          WHERE true
            ${c.exclureTests ? sql`AND est_test IS NOT TRUE` : sql``}
            ${c.inclureSupprimes ? sql`` : sql`AND supprime_le IS NULL`}
            ${c.payesSeuls ? sql`AND paye_le IS NOT NULL` : sql``}
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
              : sql``}`;
        const rows = await sql`
          SELECT *, count(*) OVER() AS total_lignes
          FROM ${sql(schemaVues)}.baikal_dossiers
          ${filtresSql}
          ORDER BY ${c.tri === "paye_le" ? sql`paye_le` : sql`cree_le`}
            ${c.ordre === "asc" ? sql`ASC NULLS LAST` : sql`DESC NULLS LAST`}
          LIMIT ${c.parPage} OFFSET ${(c.page - 1) * c.parPage}`;
        let total = rows.length > 0 ? Number(rows[0].total_lignes) : 0;
        if (rows.length === 0 && c.page > 1) {
          // count(*) OVER() n'existe que sur les lignes renvoyees : une page
          // au-dela du dernier resultat perdrait le total reel sans ce repli.
          const [compte] = await sql`
            SELECT count(*) AS total FROM ${sql(schemaVues)}.baikal_dossiers ${filtresSql}`;
          total = Number(compte.total);
        }
        const dossiers = rows.map(({ total_lignes: _t, ...d }) => ({
          ...d,
          canal: canalVente(d.attribution as Record<string, unknown> | null),
        }));
        return json({
          data: {
            disponible: true,
            dossiers,
            total,
            page: c.page,
            parPage: c.parPage,
            funnel,
            actions: relaisConfigure(site),
          },
          error: null,
        });
      }

      if (action === "fiche") {
        const dossierId = typeof body.dossierId === "string" ? body.dossierId : "";
        if (!dossierId) return json({ data: null, error: "dossierId requis" }, 400);
        const [dossier] = await sql`
          SELECT * FROM ${sql(schemaVues)}.baikal_dossiers WHERE dossier_id = ${dossierId}`;
        if (!dossier) return json({ data: null, error: "Dossier introuvable" }, 404);
        const emails = vues.emails
          ? await sql`
            SELECT * FROM ${sql(schemaVues)}.baikal_dossier_emails
            WHERE dossier_id = ${dossierId} ORDER BY envoye_le DESC LIMIT 200`
          : null;
        const events = vues.events
          ? await sql`
            SELECT * FROM ${sql(schemaVues)}.baikal_dossier_events
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
            actions: relaisConfigure(site),
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
    if (e instanceof ErreurRelais) return json({ data: null, error: e.message }, 500);
    const message = e instanceof Error ? e.message : String(e);
    return json({ data: null, error: message }, 500);
  }
});
