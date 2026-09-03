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
import { ONGLETS, paginationOnglet, resoudreOnglet, triEffectif } from "./onglets.ts";
import { grouperChamps } from "./champs.ts";
import { type ActionFiche, normaliserManifeste, trouverAction } from "./manifeste.ts";

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

// Un seul point d'appel du relais : toutes les actions inter-projets passent
// ici. Renvoie la charge JSON du site ou leve une ErreurRelais.
async function appelerRelais(
  site: Awaited<ReturnType<typeof chargerSite>>,
  corps: Record<string, unknown>,
  timeoutMs = 30000,
): Promise<unknown> {
  const cible = preparerRelais(site);
  if (!cible) throw new ErreurRelais("Site sans canal d'administration configure");
  let reponse: Response;
  try {
    reponse = await fetch(cible.url, {
      method: "POST",
      headers: cible.headers,
      body: JSON.stringify(corps),
      // Deno n'impose aucun delai a fetch : sans ce signal, un site injoignable
      // ferait pendre la fiche entiere jusqu'au delai de l'Edge Function.
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      throw new ErreurRelais(
        `Site ${site.id}: pas de reponse en ${Math.round(timeoutMs / 1000)}s`,
      );
    }
    throw e;
  }
  const texte = await reponse.text();
  let charge: unknown;
  try {
    charge = JSON.parse(texte);
  } catch {
    charge = { brut: texte.slice(0, 500) };
  }
  if (!reponse.ok) {
    throw new ErreurRelais(
      `Site ${site.id}: HTTP ${reponse.status}`,
      reponse.status,
      charge,
    );
  }
  return charge;
}

// Le manifeste est demande POUR CE DOSSIER : c'est ainsi qu'un site n'expose
// une action que quand elle a un sens (credits pro sur un dossier b2b).
// Un relais en panne ne doit pas rendre la fiche illisible : on renvoie une
// liste vide et le motif.
async function chargerManifeste(
  site: Awaited<ReturnType<typeof chargerSite>>,
  dossierId: string,
): Promise<{ actions: ActionFiche[]; erreur: string | null }> {
  if (!relaisConfigure(site)) return { actions: [], erreur: null };
  try {
    // Lecture courte sur le chemin de l'affichage de la fiche : budget reduit
    // par rapport au defaut des actions (30s), une re-extraction pouvant etre
    // synchrone cote site.
    const charge = await appelerRelais(
      site,
      { action: "manifeste", dossier_id: dossierId },
      8000,
    );
    return { actions: normaliserManifeste(charge), erreur: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[admin-dossiers] manifeste", message);
    return { actions: [], erreur: message };
  }
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

    // Chemin relais : plus que deux usages, l'ouverture d'un fichier et
    // l'execution d'une action declaree par le site. La liste des actions
    // n'est plus connue de Baikal : elle vient du manifeste du site.
    if (action === "fichier" || action === "site-action") {
      const dossierId = typeof body.dossierId === "string" ? body.dossierId : "";
      if (!dossierId) return json({ data: null, error: "dossierId requis" }, 400);
      if (!relaisConfigure(site)) {
        return json({ data: null, error: "Site sans canal d'administration configure" }, 400);
      }

      if (action === "fichier") {
        const cible = body.cible === "resultat" ? "resultat" : "document";
        const id = typeof body.id === "string" ? body.id : "";
        if (!id) return json({ data: null, error: "id requis" }, 400);
        const charge = await appelerRelais(site, {
          action: "fichier",
          dossier_id: dossierId,
          cible,
          id,
        });
        return json({ data: charge, error: null });
      }

      // site-action : on redemande le manifeste pour ce dossier, ce qui
      // remplace exactement l'ancienne liste en dur -- une action absente du
      // manifeste n'est pas relayee.
      const manifeste = await chargerManifeste(site, dossierId);
      if (manifeste.erreur) {
        return json({ data: null, error: `Manifeste indisponible: ${manifeste.erreur}` }, 502);
      }
      const def = trouverAction(manifeste.actions, body.actionSite);
      if (!def) {
        return json({ data: null, error: `Action site inconnue: ${body.actionSite}` }, 400);
      }
      if (def.superAdmin) {
        const { data: profil } = await caller
          .from("profiles").select("app_role").eq("id", user.id).single();
        if (profil?.app_role !== "super_admin") {
          return json({ data: null, error: "Action reservee au super_admin" }, 403);
        }
      }

      // Les parametres sont relayes tels quels : c'est l'EF du site qui les
      // valide, elle seule connait ses bornes metier.
      const parametres: Record<string, unknown> = {};
      for (const p of def.parametres) {
        if (body.parametres && typeof body.parametres === "object") {
          const fourni = (body.parametres as Record<string, unknown>)[p.id];
          if (fourni !== undefined) parametres[p.id] = fourni;
        }
      }
      const charge = await appelerRelais(site, {
        action: def.id,
        dossier_id: dossierId,
        ...parametres,
      });
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
      // Les onglets reellement disponibles (action fiche) se lisent desormais
      // via ONGLETS + to_regclass, generique sur les sept vues -- l'ancienne
      // detection ad hoc emails/events n'a plus de lecteur.
      const colonnes = new Set(
        (await sql`
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = ${schemaVues} AND table_name = 'baikal_dossiers'`)
          .map((c: { column_name: string }) => c.column_name as string),
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
        const rows: Record<string, unknown>[] = await sql`
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

        // Onglets reellement disponibles chez ce site : une vue absente n'est
        // pas une erreur, c'est un onglet qui ne s'affiche pas. unnest sur
        // deux tableaux parametres = une seule requete, sans un seul nom
        // d'objet concatene dans du SQL brut.
        const cles = Object.keys(ONGLETS);
        const nomsVues = cles.map((cle) => ONGLETS[cle].vue);
        const presentes: { cle: string; ok: boolean }[] = await sql`
          SELECT cle, to_regclass(${schemaVues} || '.' || vue) IS NOT NULL AS ok
          FROM unnest(${cles}::text[], ${nomsVues}::text[]) AS t(cle, vue)`;
        const vues = presentes.filter((v) => v.ok).map((v) => v.cle as string);

        // Compteurs : les libelles d'onglets ("Documents (3)") et le grisage
        // des onglets vides en dependent. Une requete par vue plutot qu'un
        // UNION ALL compose : la connexion est en max:1 de toute facon, et
        // sept count indexes sur dossier_id ne se discutent pas.
        const compteurs: Record<string, number> = {};
        for (const cle of vues) {
          const [c] = await sql`
            SELECT count(*) AS n FROM ${sql(schemaVues)}.${sql(ONGLETS[cle].vue)}
            WHERE dossier_id = ${dossierId}`;
          compteurs[cle] = Number(c.n);
        }

        // Champs declares : la vue est optionnelle, comme tout le reste.
        const [champsVue] = await sql`
          SELECT to_regclass(${schemaVues + ".baikal_dossier_champs"}) IS NOT NULL AS ok`;
        const sections = champsVue.ok
          ? grouperChamps(
            await sql`
              SELECT * FROM ${sql(schemaVues)}.baikal_dossier_champs
              WHERE dossier_id = ${dossierId}`,
          )
          : [];

        const manifeste = await chargerManifeste(site, dossierId);

        return json({
          data: {
            disponible: true,
            dossier: {
              ...dossier,
              canal: canalVente(dossier.attribution as Record<string, unknown> | null),
            },
            sections,
            compteurs,
            vues,
            funnel,
            actions: manifeste.actions,
            actionsErreur: manifeste.erreur,
          },
          error: null,
        });
      }

      if (action === "onglet") {
        const dossierId = typeof body.dossierId === "string" ? body.dossierId : "";
        if (!dossierId) return json({ data: null, error: "dossierId requis" }, 400);
        const def = resoudreOnglet(body.onglet);
        if (!def) return json({ data: null, error: `Onglet inconnu: ${body.onglet}` }, 400);

        const [presente] = await sql`
          SELECT to_regclass(${schemaVues + "." + def.vue}) IS NOT NULL AS ok`;
        if (!presente.ok) return json({ data: { disponible: false }, error: null });

        const colsOnglet: { column_name: string }[] = await sql`
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = ${schemaVues} AND table_name = ${def.vue}`;
        const colonnesOnglet = new Set(colsOnglet.map((c) => c.column_name));
        const tri = triEffectif(def, colonnesOnglet);
        const { page, parPage } = paginationOnglet(body);

        const lignes: Record<string, unknown>[] = await sql`
          SELECT *, count(*) OVER() AS total_lignes
          FROM ${sql(schemaVues)}.${sql(def.vue)}
          WHERE dossier_id = ${dossierId}
          ${tri ? sql`ORDER BY ${sql.unsafe(tri)}` : sql``}
          LIMIT ${parPage} OFFSET ${(page - 1) * parPage}`;

        let total = lignes.length > 0 ? Number(lignes[0].total_lignes) : 0;
        if (lignes.length === 0 && page > 1) {
          // count(*) OVER() ne survit pas a une page vide : meme repli que la
          // liste des dossiers, sinon le total disparait au-dela du dernier
          // resultat.
          const [compte] = await sql`
            SELECT count(*) AS total FROM ${sql(schemaVues)}.${sql(def.vue)}
            WHERE dossier_id = ${dossierId}`;
          total = Number(compte.total);
        }

        return json({
          data: {
            disponible: true,
            lignes: lignes.map(({ total_lignes: _t, ...l }) => l),
            total,
            page,
            parPage,
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
    if (e instanceof ErreurRelais) {
      return json(
        { data: null, error: e.message, detail: e.detail ?? null },
        e.statut ? 502 : 500,
      );
    }
    const message = e instanceof Error ? e.message : String(e);
    return json({ data: null, error: message }, 500);
  }
});
