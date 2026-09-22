// admin-comptes-pro : liste des entreprises qui achètent à un site du
// registre, lue dans la vue contractuelle baikal_comptes_pro de son projet
// (canal lecture seule _shared/sites.ts, contrat docs/contrats/comptes-pro-v1.sql).
//
// Deux populations, jamais mélangées : Clients liste l'acte commercial, le
// dossier ; Comptes pro liste le compte, qui vit dans le temps. Un compte pro
// est l'agence immobilière de Pré-état-daté, le diagnostiqueur abonné de
// MonsieurDPE, l'installateur de Conseil Solaire.
//
// La capacité se lit à la présence : pas de vue, pas de module
// (disponible=false, jamais une erreur) ; pas de colonne pivot, pas de bloc.
// Les agrégats ne sont PAS ici, ils viennent de baikal_mesures (chapitre
// comptes_pro) : une vue de liste ne porte pas de total, sinon deux écrans
// finissent par annoncer deux nombres.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chargerSite, ErreurSite, lecteurSite } from "../_shared/sites.ts";
import {
  droitsModules,
  ErreurAcces,
  exigerModule,
  exigerSite,
  sitesAutorises,
} from "../_shared/droits.ts";
import { blocsPresents, normaliserCriteres, triEffectif } from "./filtres.ts";

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
    const sites = await sitesAutorises(caller);
    if (sites.length === 0) return json({ data: null, error: "Acces refuse" }, 403);

    const body = await req.json();
    const { action, appId } = body;
    if (action !== "liste") {
      return json({ data: null, error: `Action inconnue: ${action}` }, 400);
    }
    if (!appId) return json({ data: null, error: "appId requis" }, 400);
    exigerSite(sites, appId);
    exigerModule(await droitsModules(caller), appId, "comptes_pro", "lecture");

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const site = await chargerSite(admin, appId);
    if (!site.db_schema) {
      return json({ data: null, error: "Site sans base configuree (db_schema)" }, 400);
    }

    const c = normaliserCriteres(body);
    const sql = lecteurSite(site, 5000);
    try {
      // Résolution propre à ce contrat : un site peut publier ses comptes pro
      // sans publier ses dossiers, et l'inverse.
      const candidats = [site.db_schema, "public"]
        .filter((s): s is string => Boolean(s));
      let schemaVues: string | null = null;
      for (const s of candidats) {
        const [r] = await sql`
          SELECT to_regclass(${s + ".baikal_comptes_pro"}) IS NOT NULL AS ok`;
        if (r.ok) {
          schemaVues = s;
          break;
        }
      }
      if (!schemaVues) return json({ data: { disponible: false }, error: null });

      const colonnes = new Set<string>(
        (await sql`
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = ${schemaVues} AND table_name = 'baikal_comptes_pro'`)
          .map((col: { column_name: string }) => col.column_name),
      );
      const blocs = blocsPresents(colonnes);
      const tri = triEffectif(c.tri, colonnes);
      const motif = `%${c.recherche}%`;

      const filtres = sql`
        WHERE true
          ${c.exclureTests && colonnes.has("est_test") ? sql`AND est_test IS NOT TRUE` : sql``}
          ${!c.inclureSupprimes && colonnes.has("supprime_le") ? sql`AND supprime_le IS NULL` : sql``}
          ${c.actifsSeuls && colonnes.has("actif") ? sql`AND actif IS TRUE` : sql``}
          ${c.recherche
            ? sql`AND (raison_sociale ILIKE ${motif}
                  ${colonnes.has("email") ? sql`OR email ILIKE ${motif}` : sql``}
                  ${colonnes.has("contact_nom") ? sql`OR contact_nom ILIKE ${motif}` : sql``})`
            : sql``}`;

      const lignes = await sql`
        SELECT *, count(*) OVER() AS total_lignes
        FROM ${sql(schemaVues)}.baikal_comptes_pro
        ${filtres}
        ORDER BY ${sql(tri)} ${c.ordre === "asc" ? sql`ASC NULLS LAST` : sql`DESC NULLS LAST`}
        LIMIT ${c.parPage} OFFSET ${(c.page - 1) * c.parPage}`;

      const total = lignes.length > 0 ? Number(lignes[0].total_lignes) : 0;
      return json({
        data: {
          disponible: true,
          blocs,
          tri,
          total,
          // deno-lint-ignore no-explicit-any
          comptes: lignes.map(({ total_lignes: _t, ...reste }: any) => reste),
        },
        error: null,
      });
    } finally {
      await sql.end();
    }
  } catch (e) {
    console.error("[admin-comptes-pro]", e);
    if (e instanceof ErreurAcces) return json({ data: null, error: e.message }, 403);
    if (e instanceof ErreurSite) return json({ data: null, error: e.message }, 400);
    const message = e instanceof Error ? e.message : String(e);
    return json({ data: null, error: message }, 500);
  }
});
