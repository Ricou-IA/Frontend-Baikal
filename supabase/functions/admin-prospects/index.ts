// admin-prospects : la base adressable d'un site du registre, lue dans sa vue
// contractuelle baikal_prospects (canal lecture seule _shared/sites.ts).
// La capacite d'un site se lit a la presence de la vue et des colonnes : un
// site sans vue n'a pas le module (disponible=false, pas une erreur).
// Les ecritures ne passent JAMAIS par ce canal : voir l'action "action".
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chargerSite, ErreurSite, lecteurSite } from "../_shared/sites.ts";
import { ErreurAcces, exigerSite, sitesAutorises } from "../_shared/droits.ts";
import { normaliserCriteres } from "./filtres.ts";

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

  let sql: ReturnType<typeof lecteurSite> | null = null;
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
    if (!appId) return json({ data: null, error: "appId requis" }, 400);
    exigerSite(sites, appId);

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const site = await chargerSite(admin, appId);

    // La taxonomie vit dans Baikal : c'est le seul objet du module que la
    // console possede, et le seul vocabulaire commun a tous les sites.
    const { data: metiers } = await admin.schema("admin").from("metier")
      .select("slug, libelle, couleur, ordre").order("ordre");

    sql = lecteurSite(site);

    // Bases partagees : un schema par produit. Projets dedies : public.
    // Premier trouve gagne, comme pour baikal_dossiers.
    const candidats = [site.db_schema, "public"].filter((s): s is string => Boolean(s));
    let schemaVues: string | null = null;
    for (const s of candidats) {
      const [r] = await sql`
        SELECT to_regclass(${s + ".baikal_prospects"}) IS NOT NULL AS ok`;
      if (r.ok) { schemaVues = s; break; }
    }
    if (!schemaVues) return json({ data: { disponible: false }, error: null });

    const colonnes = new Set(
      (await sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = ${schemaVues} AND table_name = 'baikal_prospects'`)
        .map((c) => c.column_name as string),
    );

    // Ecriture possible ? UNIQUEMENT quand lecture et ecriture tombent sur
    // LA MEME base. Le dispatch reel (action "action" plus bas) appelle
    // admin.rpc(...) sur la base BAIKAL -- jamais sur `sql`, qui est la base
    // DU SITE (lecteurSite ci-dessus). Pour un site sur base dediee
    // (db_ro_secret_ref non nul : pack-vendeur, majordhome), `sql` peut tres
    // bien y voir une fonction prospect_action -- mais admin.rpc ne peut pas
    // l'atteindre, puisqu'il ne parle qu'a la base Baikal. Sans cette garde,
    // actionsDispo mentirait des la publication de la vue du site : des
    // boutons visibles qui echouent tous, pas juste un module absent.
    //
    // TODO(relais HTTP) : `env_prospects_fn` (relais vers l'Edge Function du
    // site, decrit dans la spec) n'est PAS implemente dans cette branche --
    // l'action "action" plus bas n'appelle que admin.rpc. Ne PAS l'ajouter
    // seul a la condition ci-dessous tant que ce relais n'existe pas
    // reellement : ce serait rouvrir le meme mensonge pour les sites qui le
    // renseignent. C'est ici qu'ouvrir l'interrupteur une fois le relais
    // ecrit (et l'action "action" plus bas mise a jour pour l'appeler).
    const partageBaseBaikal = !site.db_ro_secret_ref;
    let actionsDispo = false;
    if (partageBaseBaikal) {
      const [ecriture] = await sql`
        SELECT to_regprocedure(${schemaVues + ".prospect_action(text,text,text,text)"})
               IS NOT NULL AS rpc`;
      actionsDispo = Boolean(ecriture.rpc);
    }

    if (action === "liste") {
      const c = normaliserCriteres(body);
      const motif = `%${c.recherche}%`;
      // Corse : aucun code postal ne commence par "2A"/"2B" (l'INSEE encode
      // le departement sur "20" pour les deux) -- filtrer sur la valeur
      // saisie renverrait toujours zero ligne. On accepte 2A/2B en entree
      // (un operateur les tape naturellement, voir filtres.ts) mais on
      // filtre sur "20" ; scinder correctement demanderait la table de
      // decoupage complete (2A = Corse-du-Sud, 2B = Haute-Corse), hors
      // perimetre ici. Toute la Corse plutot qu'aucun resultat.
      const departementFiltre = /^2[AB]$/.test(c.departement) ? "20" : c.departement;

      // Figee en const : `sql` reste `ReturnType<...> | null` pour le
      // compilateur, qui perd le narrowing "non nul" des lors qu'on entre
      // dans la fermeture ci-dessous. `requete` capture la valeur (non
      // nulle a ce point du flux) une fois pour toutes.
      const requete = sql;

      // Fragment de filtres, compose deux fois : avec le metier (liste et
      // total affiches) et sans (compteurs des chips, voir plus bas). Une
      // seule fonction pour ne jamais laisser les deux usages diverger.
      const fragmentFiltres = (avecMetier: boolean) => requete`
        WHERE true
          ${c.exclureTests && colonnes.has("est_test") ? requete`AND est_test IS NOT TRUE` : requete``}
          ${c.exclureClients && colonnes.has("client_depuis") ? requete`AND client_depuis IS NULL` : requete``}
          ${avecMetier && c.metiers.length > 0 ? requete`AND metier = ANY(${c.metiers})` : requete``}
          ${c.statuts.length > 0 ? requete`AND statut = ANY(${c.statuts})` : requete``}
          ${c.provenances.length > 0 ? requete`AND provenance = ANY(${c.provenances})` : requete``}
          ${departementFiltre
            ? requete`AND left(code_postal, ${departementFiltre.length}) = ${departementFiltre}`
            : requete``}
          ${c.avecTelephone && colonnes.has("telephone")
            ? requete`AND telephone IS NOT NULL AND telephone <> ''`
            : requete``}
          ${c.recherche
            ? requete`AND (email ILIKE ${motif} OR nom_affiche ILIKE ${motif}
                       OR commune ILIKE ${motif})`
            : requete``}`;
      const filtres = fragmentFiltres(true);

      // Tri : cree_le/dernier_contact_le seuls ne departagent pas les
      // egalites -- mesure sur ce site, 64 913 lignes tiennent sur ~118
      // valeurs distinctes de cree_le, jusqu'a 2093 lignes sur la meme.
      // Postgres ne garantit alors aucun ordre stable entre deux executions
      // du LIMIT/OFFSET, et deux pages consecutives se recouvrent ou
      // sautent des lignes. `email` est unique dans la vue : il tranche.
      const colonneTri = c.tri === "dernier_contact_le" ? requete`dernier_contact_le` : requete`cree_le`;
      const directionTri = c.ordre === "asc" ? requete`ASC` : requete`DESC`;

      const rows = await requete`
        SELECT *, count(*) OVER() AS total_lignes
        FROM ${requete(schemaVues)}.baikal_prospects
        ${filtres}
        ORDER BY ${colonneTri} ${directionTri} NULLS LAST, email ${directionTri}
        LIMIT ${c.parPage} OFFSET ${(c.page - 1) * c.parPage}`;

      let total = rows.length > 0 ? Number(rows[0].total_lignes) : 0;
      if (rows.length === 0 && c.page > 1) {
        // count(*) OVER() n'existe que sur les lignes renvoyees : une page
        // au-dela du dernier resultat perdrait le total sans ce repli.
        const [compte] = await requete`
          SELECT count(*) AS total FROM ${requete(schemaVues)}.baikal_prospects ${filtres}`;
        total = Number(compte.total);
      }

      // Compteurs des chips metier : semantique de facette -- chaque chip
      // affiche combien de lignes il ramenerait compte tenu des AUTRES
      // filtres actifs (statut, provenance, departement...), jamais du
      // metier lui-meme. Avec le predicat metier applique, cliquer un chip
      // ecrase tous les autres a zero (ils ne matchent plus le seul metier
      // alors filtre) : exactement le "deux ecrans, deux nombres" que ce
      // lot existe pour supprimer, reproduit des le premier clic.
      const compteurs = await requete`
        SELECT metier, count(*)::int AS n
        FROM ${requete(schemaVues)}.baikal_prospects
        ${fragmentFiltres(false)}
        GROUP BY metier`;

      const [kpi] = await sql`
        SELECT count(*)::int AS adressables,
               count(*) FILTER (WHERE statut = 'nouveau')::int AS nouveaux,
               count(*) FILTER (WHERE dernier_contact_le IS NOT NULL)::int AS contactes,
               count(*) FILTER (WHERE statut = 'desinscrit')::int AS desinscrits
        FROM ${sql(schemaVues)}.baikal_prospects
        ${c.exclureTests && colonnes.has("est_test") ? sql`WHERE est_test IS NOT TRUE` : sql`WHERE true`}`;

      // Le KPI "convertis" doit exclure les tests comme les quatre autres :
      // deux tuiles voisines sur des perimetres differents, c'est le defaut
      // "deux ecrans, deux nombres" que ce lot existe pour supprimer.
      const [convertis] = colonnes.has("client_depuis")
        ? await sql`
          SELECT count(*)::int AS n FROM ${sql(schemaVues)}.baikal_prospects
          WHERE client_depuis IS NOT NULL
            ${c.exclureTests && colonnes.has("est_test") ? sql`AND est_test IS NOT TRUE` : sql``}`
        : [{ n: 0 }];

      return json({
        data: {
          disponible: true,
          prospects: rows.map(({ total_lignes: _t, ...p }) => p),
          total,
          page: c.page,
          parPage: c.parPage,
          metiers: metiers ?? [],
          compteurs: Object.fromEntries(compteurs.map((r) => [r.metier, r.n])),
          kpi: { ...kpi, convertis: convertis.n },
          colonnes: [...colonnes],
          actions: actionsDispo,
        },
        error: null,
      });
    }

    if (action === "fiche") {
      const email = typeof body.email === "string" ? body.email.toLowerCase().trim() : "";
      if (!email) return json({ data: null, error: "email requis" }, 400);
      const [prospect] = await sql`
        SELECT * FROM ${sql(schemaVues)}.baikal_prospects WHERE email = ${email}`;
      if (!prospect) return json({ data: null, error: "Prospect introuvable" }, 404);
      return json({
        data: { disponible: true, prospect, actions: actionsDispo },
        error: null,
      });
    }

    if (action === "action") {
      const ACTIONS = new Set(["statut", "note", "desinscrire", "creer", "supprimer"]);
      const actionSite = typeof body.actionSite === "string" ? body.actionSite : "";
      if (!ACTIONS.has(actionSite)) {
        return json({ data: null, error: `Action inconnue: ${actionSite}` }, 400);
      }
      if (!actionsDispo) {
        return json({ data: null, error: "Site sans interface d'ecriture des prospects" }, 400);
      }
      const email = typeof body.email === "string" ? body.email : "";
      if (!email) return json({ data: null, error: "email requis" }, 400);

      // "creer" est un import d'une seule ligne : meme fonction, donc meme
      // regle de non-ecrasement. Deux chemins d'ecriture pour un meme geste
      // finiraient par diverger.
      if (actionSite === "creer") {
        const { data, error } = await admin.rpc("baikal_prospect_importer", {
          p_app_id: appId,
          p_lignes: [{
            email,
            metier: typeof body.metier === "string" ? body.metier : "autre",
            provenance: "import",
            nom_affiche: typeof body.nomAffiche === "string" ? body.nomAffiche : email,
            commune: body.commune ?? null,
            code_postal: body.codePostal ?? null,
            telephone: body.telephone ?? null,
            site_web: body.siteWeb ?? null,
          }],
          p_acteur: user.email ?? user.id,
        });
        if (error) return json({ data: null, error: error.message }, 400);
        return json({ data, error: null });
      }

      const { data, error } = await admin.rpc("baikal_prospect_action", {
        p_app_id: appId,
        p_action: actionSite,
        p_email: email,
        p_valeur: typeof body.valeur === "string" ? body.valeur : null,
        p_acteur: user.email ?? user.id,
      });
      if (error) return json({ data: null, error: error.message }, 400);
      return json({ data, error: null });
    }

    if (action === "importer") {
      if (!actionsDispo) {
        return json({ data: null, error: "Site sans interface d'ecriture des prospects" }, 400);
      }
      const lignes = Array.isArray(body.lignes) ? body.lignes : [];
      if (lignes.length === 0) return json({ data: null, error: "Aucune ligne" }, 400);
      // Borne dure : au-dela, le client decoupe. Un import de 50 000 lignes
      // en un appel depasserait le temps d'execution de la fonction.
      if (lignes.length > 2000) {
        return json({ data: null, error: "2000 lignes maximum par lot" }, 400);
      }
      const { data, error } = await admin.rpc("baikal_prospect_importer", {
        p_app_id: appId,
        p_lignes: lignes,
        p_acteur: user.email ?? user.id,
      });
      if (error) return json({ data: null, error: error.message }, 400);
      return json({ data, error: null });
    }

    return json({ data: null, error: `Action inconnue: ${action}` }, 400);
  } catch (e) {
    if (e instanceof ErreurAcces) return json({ data: null, error: e.message }, 403);
    if (e instanceof ErreurSite) return json({ data: null, error: e.message }, 400);
    console.error("[admin-prospects]", e);
    return json({ data: null, error: (e as Error).message }, 500);
  } finally {
    if (sql) await sql.end();
  }
});
